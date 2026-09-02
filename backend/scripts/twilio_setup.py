"""Create and inspect the Twilio Content templates this app sends.

    python scripts/twilio_setup.py --status     # what exists, and its approval
    python scripts/twilio_setup.py --create     # create + submit for approval
    python scripts/twilio_setup.py --recreate   # after a rejection

Run from the ``backend`` directory so ``.env`` is picked up.

WhatsApp templates cannot be edited once submitted - a rejected template is
replaced, and the replacement gets a **new** ContentSid. That is why nothing
pins the SID: :mod:`app.whatsapp.twilio_content` resolves it by name at send
time, so re-running ``--recreate`` needs no config change anywhere.

The button ids and labels are imported, never retyped. They have to match
``ACK_PAYLOADS`` exactly or a tapped button arrives as an unrecognised payload
and the acknowledgment is silently dropped.
"""

from __future__ import annotations

import argparse
import json
import sys

import httpx

from app.config import get_settings
from app.models.messaging import ACK_MAYBE, ACK_NO, ACK_YES
from app.whatsapp.templates import ACK_BUTTON_LABELS, EVENT_INVITE_TEMPLATE

CONTENT_URL = "https://content.twilio.com/v1/Content"
CONTENT_AND_APPROVALS_URL = "https://content.twilio.com/v1/ContentAndApprovals"

# Non-ASCII written as escapes on purpose: this file gets edited by scripts on
# a Windows box where an implicit cp1252 write silently mangles literal emoji.
_WAVE = "\U0001f44b"
_CALENDAR = "\U0001f4c5"
_PIN = "\U0001f4cd"

# {{1}} name, {{2}} event title, {{3}} when, {{4}} venue - the same order and
# meaning as the body parameters in app/whatsapp/templates.py:event_invite.
INVITE_BODY = (
    f"Hi {{{{1}}}} {_WAVE}\n\n"
    "You are invited to *{{2}}*.\n\n"
    f"{_CALENDAR} {{{{3}}}}\n"
    f"{_PIN} {{{{4}}}}\n\n"
    "Can you make it?"
)

INVITE_DEFINITION = {
    "friendly_name": EVENT_INVITE_TEMPLATE,
    "language": "en",
    # Placeholder values, shown to the WhatsApp reviewer as a worked example.
    # A template submitted with empty samples is a common rejection reason.
    "variables": {
        "1": "Ah Huat",
        "2": "Community coffee morning",
        "3": "Mon 05 Oct 2026, 9:00am-11:00am",
        "4": "Blk 209 Boon Lay",
    },
    "types": {
        "twilio/quick-reply": {
            "body": INVITE_BODY,
            "actions": [
                {"title": ACK_BUTTON_LABELS[ACK_YES], "id": ACK_YES},
                {"title": ACK_BUTTON_LABELS[ACK_NO], "id": ACK_NO},
                {"title": ACK_BUTTON_LABELS[ACK_MAYBE], "id": ACK_MAYBE},
            ],
        },
        # Fallback for any channel without interactive buttons.
        "twilio/text": {"body": INVITE_BODY},
    },
}

# UTILITY, not MARKETING: this is a transactional message about something the
# recipient already signed up for. MARKETING costs more and is rejected more.
APPROVAL_CATEGORY = "UTILITY"


def _auth() -> tuple[str, str]:
    settings = get_settings()
    if settings.twilio_api_key_sid and settings.twilio_api_key_secret:
        return settings.twilio_api_key_sid, settings.twilio_api_key_secret
    if settings.twilio_account_sid and settings.twilio_auth_token:
        return settings.twilio_account_sid, settings.twilio_auth_token
    sys.exit("No Twilio credentials in the environment. Check backend/.env.")


def fetch_all(client: httpx.Client, auth: tuple[str, str]) -> list[dict]:
    url: str | None = f"{CONTENT_AND_APPROVALS_URL}?PageSize=100"
    found: list[dict] = []
    while url:
        response = client.get(url, auth=auth)
        response.raise_for_status()
        body = response.json()
        found.extend(body.get("contents") or [])
        url = (body.get("meta") or {}).get("next_page_url")
    return found


def show_status(client: httpx.Client, auth: tuple[str, str]) -> None:
    matches = [
        entry
        for entry in fetch_all(client, auth)
        if entry.get("friendly_name") == EVENT_INVITE_TEMPLATE
    ]
    if not matches:
        print(f"{EVENT_INVITE_TEMPLATE}: not created yet (run --create)")
        return
    for entry in matches:
        approval = entry.get("approval_requests") or {}
        print(
            f"{entry['friendly_name']}  {entry['sid']}  "
            f"created={entry.get('date_created')}  "
            f"approval={approval.get('status') or 'not submitted'}  "
            f"category={approval.get('category') or '-'}"
        )
        if approval.get("rejection_reason"):
            print(f"    rejected: {approval['rejection_reason']}")


def create(client: httpx.Client, auth: tuple[str, str], *, recreate: bool) -> str | None:
    existing = [
        entry
        for entry in fetch_all(client, auth)
        if entry.get("friendly_name") == EVENT_INVITE_TEMPLATE
    ]
    if existing and not recreate:
        print(
            f"{EVENT_INVITE_TEMPLATE} already exists ({existing[0]['sid']}). "
            "Use --recreate to submit a fresh one."
        )
        return existing[0]["sid"]

    response = client.post(
        CONTENT_URL,
        auth=auth,
        json=INVITE_DEFINITION,
        headers={"Content-Type": "application/json"},
    )
    if response.status_code >= 400:
        sys.exit(f"create failed {response.status_code}: {response.text}")
    content_sid = response.json()["sid"]
    print(f"created {EVENT_INVITE_TEMPLATE} -> {content_sid}")

    approval = client.post(
        f"{CONTENT_URL}/{content_sid}/ApprovalRequests/whatsapp",
        auth=auth,
        json={"name": EVENT_INVITE_TEMPLATE, "category": APPROVAL_CATEGORY},
        headers={"Content-Type": "application/json"},
    )
    if approval.status_code >= 400:
        # The template still exists and is usable inside a 24-hour session
        # window; only business-initiated sends need the approval.
        print(
            f"  approval request failed {approval.status_code}: "
            f"{approval.text[:400]}"
        )
    else:
        print(f"  submitted for {APPROVAL_CATEGORY} approval: "
              f"{json.dumps(approval.json().get('status', approval.json()))}")
    return content_sid


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", action="store_true", help="show what exists")
    parser.add_argument("--create", action="store_true", help="create if missing")
    parser.add_argument("--recreate", action="store_true", help="always create a new one")
    args = parser.parse_args()

    auth = _auth()
    with httpx.Client(timeout=30.0) as client:
        if args.create or args.recreate:
            create(client, auth, recreate=args.recreate)
            print()
        show_status(client, auth)


if __name__ == "__main__":
    main()
