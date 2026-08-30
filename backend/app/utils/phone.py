"""Singapore phone-number normalisation.

Every person is reached over WhatsApp, so the phone number is the de-facto
identity key. It has to be stored in exactly one shape (E.164) or the same
person registers twice and the WhatsApp send silently goes nowhere.
"""

from __future__ import annotations

import re

SG_COUNTRY_CODE = "65"
# Singapore mobile/landline subscriber numbers are 8 digits and start with
# 6 (landline), 8 or 9 (mobile). 3-prefix numbers are VoIP and cannot receive
# WhatsApp, so they are rejected rather than stored and silently un-messageable.
_SG_LOCAL = re.compile(r"^[689]\d{7}$")


class InvalidPhoneNumber(ValueError):
    """Raised when a number cannot be normalised to an SG E.164 number."""


def normalize_sg_phone(raw: str) -> str:
    """Return ``+65XXXXXXXX`` for any reasonable Singapore input.

    Accepts ``91234567``, ``9123 4567``, ``+65 9123-4567``, ``6591234567``,
    ``006591234567``. Raises :class:`InvalidPhoneNumber` for anything else.
    """
    if raw is None:
        raise InvalidPhoneNumber("phone number is required")

    digits = re.sub(r"[^\d+]", "", str(raw).strip())
    if not digits:
        raise InvalidPhoneNumber("phone number is required")

    if digits.startswith("+"):
        digits = digits[1:]
    elif digits.startswith("00"):
        digits = digits[2:]

    if digits.startswith(SG_COUNTRY_CODE) and len(digits) == 10:
        digits = digits[len(SG_COUNTRY_CODE) :]

    if not _SG_LOCAL.match(digits):
        raise InvalidPhoneNumber(
            f"{raw!r} is not a valid Singapore number "
            "(expected 8 digits starting with 6, 8 or 9)"
        )

    return f"+{SG_COUNTRY_CODE}{digits}"


def to_wa_id(e164: str) -> str:
    """WhatsApp addresses numbers without the leading ``+``."""
    return e164.lstrip("+")
