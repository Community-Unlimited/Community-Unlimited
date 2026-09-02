"""Resolve a template name to a Twilio ContentSid.

Meta addresses a template by *name*; Twilio addresses it by an opaque
``HX...`` ContentSid. Everything above the provider speaks Meta's language
(see :mod:`app.whatsapp.templates`), so the translation has to happen here.

Why look the SID up instead of pinning it in config: a template that WhatsApp
rejects cannot be edited, only re-created, and re-creating mints a **new**
ContentSid. Pinning the SID in the environment means every approval iteration
needs a config change in three places, and a stale pin fails at send time with
a 404 that reads like a credentials problem. Looking it up by name makes the
name the contract, which is what the rest of the code already assumes.

``CU_TWILIO_CONTENT_SID_EVENT_INVITE`` still pins it when that is wanted.
"""

from __future__ import annotations

import httpx

CONTENT_AND_APPROVALS_URL = "https://content.twilio.com/v1/ContentAndApprovals"

# Only *approved* lookups are memoised. An unapproved template is a moving
# target - it may be approved or re-created minutes later - and caching a
# pending SID would pin the process to a template that can never send.
_approved: dict[str, str] = {}


class TemplateNotFound(RuntimeError):
    """No Content template on the account carries this friendly_name."""


def clear_cache() -> None:
    _approved.clear()


def _approval_status(entry: dict) -> str:
    approval = entry.get("approval_requests") or {}
    return str(approval.get("status") or "").lower()


def resolve_content_sid(
    name: str,
    *,
    auth: tuple[str, str],
    pinned: str = "",
    timeout: float = 20.0,
) -> str:
    """Return the ContentSid for ``name``, preferring an approved template.

    Raises :class:`TemplateNotFound` when the account has no template by that
    name, which is a far clearer failure than letting Twilio reject an empty
    ContentSid.
    """
    if pinned:
        return pinned
    cached = _approved.get(name)
    if cached:
        return cached

    candidates: list[dict] = []
    url: str | None = f"{CONTENT_AND_APPROVALS_URL}?PageSize=100"
    with httpx.Client(timeout=timeout) as client:
        while url:
            response = client.get(url, auth=auth)
            response.raise_for_status()
            body = response.json()
            candidates.extend(
                entry
                for entry in body.get("contents") or []
                if entry.get("friendly_name") == name
            )
            url = (body.get("meta") or {}).get("next_page_url")

    if not candidates:
        raise TemplateNotFound(
            f"no Twilio Content template named {name!r} on this account - "
            "run scripts/twilio_setup.py to create it"
        )

    approved = [c for c in candidates if _approval_status(c) == "approved"]
    if approved:
        # Newest approved wins, so a re-approved replacement takes over from
        # an older one without needing the old template deleted first.
        chosen = max(approved, key=lambda c: c.get("date_created") or "")
        sid = str(chosen["sid"])
        _approved[name] = sid
        return sid

    # Nothing approved yet. Hand back the newest anyway: inside the 24-hour
    # customer-service window WhatsApp accepts an interactive message without
    # template approval, which is exactly how the sandbox is tested.
    chosen = max(candidates, key=lambda c: c.get("date_created") or "")
    return str(chosen["sid"])
