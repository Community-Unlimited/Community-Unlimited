"""Logical PostgreSQL backup utility for CU-OS.

Runs ``pg_dump --format=custom --no-owner --no-acl`` against Neon's direct
(non-pooled) endpoint, applies local retention pruning, and optionally uploads
the dump archive to S3-compatible object storage (e.g., Cloudflare R2 / AWS S3).

Usage:
    python scripts/backup_db.py
    python scripts/backup_db.py --output-dir backups --keep 8
    python scripts/backup_db.py --dry-run
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings, to_libpq_url  # noqa: E402


def mask_database_url(url: str) -> str:
    """Return a log-safe connection string with credentials redacted."""
    parts = urlsplit(url.strip())
    if not parts.netloc:
        return "<unconfigured>"
    hostname = parts.hostname or ""
    port = f":{parts.port}" if parts.port else ""
    if parts.username is not None or parts.password is not None:
        auth = "***:***" if parts.password is not None else "***"
        netloc = f"{auth}@{hostname}{port}"
    else:
        netloc = f"{hostname}{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def prune_old_dumps(output_dir: Path, keep: int) -> list[Path]:
    """Delete oldest ``cuos-*.dump`` files beyond ``keep`` and return removed paths."""
    dumps = sorted(
        output_dir.glob("cuos-*.dump"),
        key=lambda path: (path.stat().st_mtime, path.name),
        reverse=True,
    )
    removed: list[Path] = []
    for stale in dumps[keep:]:
        stale.unlink(missing_ok=True)
        removed.append(stale)
    return removed


def _s3_key(prefix: str, filename: str) -> str:
    cleaned = prefix.strip("/")
    return f"{cleaned}/{filename}" if cleaned else filename


def upload_to_s3(dump_path: Path, *, bucket: str, prefix: str, endpoint: str) -> str:
    """Upload ``dump_path`` to an S3-compatible bucket via boto3."""
    try:
        import boto3  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "CU_BACKUP_S3_BUCKET is set but 'boto3' is not installed; "
            "install boto3 or unset CU_BACKUP_S3_BUCKET"
        ) from exc

    client_kwargs: dict[str, str] = {}
    if endpoint:
        client_kwargs["endpoint_url"] = endpoint
    region = os.getenv("CU_BACKUP_S3_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if region:
        client_kwargs["region_name"] = region
    elif endpoint:
        client_kwargs["region_name"] = "auto"

    key = _s3_key(prefix, dump_path.name)
    client = boto3.client("s3", **client_kwargs)
    client.upload_file(str(dump_path), bucket, key)
    return f"s3://{bucket}/{key}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Back up CU-OS PostgreSQL database")
    parser.add_argument(
        "--output-dir",
        default="backups",
        help="Directory to write timestamped .dump files (default: backups)",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=8,
        help="Number of recent local .dump files to retain (default: 8)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned backup command and targets without executing pg_dump",
    )
    args = parser.parse_args(argv)

    if args.keep < 1:
        print("ERROR: --keep must be at least 1", file=sys.stderr)
        return 2

    settings = get_settings()
    libpq_url = to_libpq_url(settings.effective_direct_database_url)
    masked_url = mask_database_url(libpq_url)

    if not libpq_url.startswith("postgresql://"):
        print(
            f"ERROR: pg_dump requires a PostgreSQL URL (resolved: {masked_url})",
            file=sys.stderr,
        )
        return 1

    host = urlsplit(libpq_url).hostname or ""
    if "-pooler." in host:
        print(
            "WARNING: direct URL points to a '-pooler' host; configure "
            "CU_DIRECT_DATABASE_URL or DATABASE_URL_UNPOOLED for pg_dump.",
            file=sys.stderr,
        )

    output_dir = Path(args.output_dir)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dump_path = output_dir / f"cuos-{timestamp}.dump"

    s3_bucket = os.getenv("CU_BACKUP_S3_BUCKET", "").strip()
    s3_endpoint = os.getenv("CU_BACKUP_S3_ENDPOINT", "").strip()
    s3_prefix = os.getenv("CU_BACKUP_S3_PREFIX", "cuos-backups/").strip()

    if args.dry_run:
        print("[backup] dry-run mode (no files written)")
        print(f"  source     {masked_url}")
        print(f"  output     {dump_path}")
        print(f"  keep       {args.keep}")
        if s3_bucket:
            endpoint_note = f" (endpoint: {s3_endpoint})" if s3_endpoint else ""
            print(f"  s3_target  s3://{s3_bucket}/{_s3_key(s3_prefix, dump_path.name)}{endpoint_note}")
        else:
            print("  s3_target  disabled (CU_BACKUP_S3_BUCKET unset)")
        return 0

    pg_dump_bin = shutil.which("pg_dump")
    if pg_dump_bin is None:
        print(
            "ERROR: 'pg_dump' binary not found on PATH. Install postgresql-client "
            "and retry.",
            file=sys.stderr,
        )
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        pg_dump_bin,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        f"--file={dump_path}",
        libpq_url,
    ]
    print(f"[backup] running pg_dump from {masked_url} -> {dump_path}")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        dump_path.unlink(missing_ok=True)
        print(
            f"ERROR: pg_dump failed with exit code {result.returncode}",
            file=sys.stderr,
        )
        return result.returncode or 1

    removed = prune_old_dumps(output_dir, args.keep)
    size_kb = dump_path.stat().st_size / 1024
    print(
        f"[backup] wrote {dump_path} ({size_kb:.1f} KiB); pruned {len(removed)} old dump(s)"
    )

    if s3_bucket:
        try:
            remote_uri = upload_to_s3(
                dump_path,
                bucket=s3_bucket,
                prefix=s3_prefix,
                endpoint=s3_endpoint,
            )
        except Exception as exc:
            print(f"ERROR: remote backup upload failed: {exc}", file=sys.stderr)
            return 1
        print(f"[backup] uploaded to {remote_uri}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
