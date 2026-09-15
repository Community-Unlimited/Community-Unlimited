"""Send one real WhatsApp message through the app's own provider stack.

    python scripts/whatsapp_smoke_test.py --to +6592700407
    python scripts/whatsapp_smoke_test.py --to +6592700407 --text "ping"

Run from the ``backend`` directory so ``.env`` is picked up.

Why this exists rather than a standalone twilio-sdk snippet: a snippet proves
Twilio works, which was never in doubt. This goes through
:func:`app.whatsapp.provider.get_provider` and :mod:`app.whatsapp.templates`,
so a green run proves the *app's* path works - settings load, the provider
selects, the Meta-shaped body translates to Twilio form fields, the ContentSid
resolves by name, and the sender is one the account owns. Those are the five
things that actually break, and none of them are exercised by a snippet that
hardcodes its own SID.

Nothing here touches the database. No Person, no consent row, no outbox row -
so this is safe to run against a production database, and it needs no seeding
to run against an empty one. The trade-off is that it does not cover the
queue/dedupe/flush path; ``POST /api/events/{id}/invite`` is what covers that.
"""

from __future__ import annotations

import argparse
import sys

from app.config import get_settings
from app.utils.phone import InvalidPhoneNumber, normalize_sg_phone, to_wa_id
from app.whatsapp import templates
from app.whatsapp.provider import TwilioProvider, get_provider

# Twilio error codes worth translating, because the raw message either names
# the wrong cause or names no cause at all. Anything not listed is printed as
# Twilio worded it.
ERROR_HINTS = {
    "63015": (
        "The sandbox only delivers to numbers that have joined it. From that "
        "phone, WhatsApp the join code to the sandbox number. The join lapses "
        "after 72 hours of inactivity and has to be repeated."
    ),
    "63016": (
        "Outside the 24-hour customer-service window, so a freeform message is "
        "refused and only an *approved* template will send. The sandbox cannot "
        "get templates approved - have the recipient message the sandbox first "
        "to reopen the window, then retry."
    ),
    "63007": (
        "Twilio has no WhatsApp channel for CU_TWILIO_WHATSAPP_FROM. Check it "
        "matches the sender in the console exactly, including the 'whatsapp:' "
        "prefix."
    ),
    "21910": (
        "From and To are on different channels - one of them is missing the "
        "'whatsapp:' prefix."
    ),
    "20003": (
        "Authentication failed. Check CU_TWILIO_ACCOUNT_SID against the auth "
        "token or API key pair in .env; a rotated token is the usual cause."
    ),
    "20404": (
        "Twilio could not find the resource - usually a stale pinned "
        "CU_TWILIO_CONTENT_SID_EVENT_INVITE. Clear it and let the SID resolve "
        "by name instead."
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--to", required=True, help="recipient, e.g. +6592700407")
    parser.add_argument(
        "--text",
        help=(
            "send this as a plain session message instead of the invite "
            "template - isolates credentials and sender from template problems"
        ),
    )
    parser.add_argument("--name", default="Smoke Test", help="template {{1}}")
    parser.add_argument("--event", default="CU-OS smoke test", help="template {{2}}")
    parser.add_argument(
        "--when", default="Mon 05 Oct 2026, 9:00am-11:00am", help="template {{3}}"
    )
    parser.add_argument("--venue", default="Blk 209 Boon Lay", help="template {{4}}")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the request the provider would send, then stop",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = get_settings()

    # Refuse the fake provider outright. It would report ok=True with a
    # deterministic wamid.fake id and no network call, which reads exactly like
    # a successful send - the one failure mode a smoke test must never have.
    if settings.whatsapp_provider == "fake":
        sys.exit(
            "CU_WHATSAPP_PROVIDER=fake - this would report success without "
            "sending anything. Set CU_WHATSAPP_PROVIDER=twilio in backend/.env."
        )

    try:
        wa_id = to_wa_id(normalize_sg_phone(args.to))
    except InvalidPhoneNumber as exc:
        sys.exit(f"--to {args.to!r}: {exc}")

    if args.text:
        payload = templates.free_text(wa_id, args.text)
    else:
        payload = templates.event_invite(
            wa_id,
            preferred_name=args.name,
            event_title=args.event,
            when_text=args.when,
            venue=args.venue,
        )

    provider = get_provider()
    lines = [("provider", provider.name), ("to", wa_id)]

    # Show the translated request before sending. Resolving the ContentSid is
    # itself a network call against the Content API, so this doubles as the
    # check that the template exists - the most common first-run failure, and
    # one that otherwise surfaces as an opaque send error.
    if isinstance(provider, TwilioProvider):
        try:
            request = provider.build_request(payload)
        except Exception as exc:  # noqa: BLE001 - reported, not swallowed
            sys.exit(f"could not build the Twilio request: {exc}")
        lines += [
            (field, request[field])
            for field in ("From", "To", "ContentSid", "ContentVariables", "Body")
            if field in request
        ]

    width = max(len(label) for label, _ in lines)
    for label, value in lines:
        print(f"{label:<{width}}: {value}")

    if args.dry_run:
        print("\ndry run - nothing sent")
        return

    result = provider.send(payload)

    if result.ok:
        print(f"\nsent, provider message id: {result.provider_message_id}")
        if not settings.twilio_status_callback_url:
            # Twilio returning a SID means it accepted the message, not that
            # WhatsApp delivered it. Without the callback nothing ever learns
            # the difference, which is how a silently-undelivered send looks
            # identical to a working one.
            print(
                "note: CU_TWILIO_STATUS_CALLBACK_URL is unset, so this only "
                "confirms Twilio accepted the message, not that it arrived."
            )
        return

    print(f"\nfailed: {result.error}", file=sys.stderr)
    for code, hint in ERROR_HINTS.items():
        if code in (result.error or ""):
            print(f"\n{code}: {hint}", file=sys.stderr)
            break
    sys.exit(1)


if __name__ == "__main__":
    main()
