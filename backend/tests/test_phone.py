"""Phone normalisation - the WhatsApp identity key."""

from __future__ import annotations

import pytest

from app.utils.phone import InvalidPhoneNumber, normalize_sg_phone, to_wa_id


@pytest.mark.parametrize(
    "raw",
    [
        "91234567",
        "9123 4567",
        "9123-4567",
        "+6591234567",
        "+65 9123 4567",
        "6591234567",
        "006591234567",
        "  91234567  ",
    ],
)
def test_all_common_shapes_normalise_identically(raw: str) -> None:
    assert normalize_sg_phone(raw) == "+6591234567"


@pytest.mark.parametrize("prefix", ["6", "8", "9"])
def test_valid_sg_prefixes(prefix: str) -> None:
    assert normalize_sg_phone(f"{prefix}1234567") == f"+65{prefix}1234567"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "1234567",       # too short
        "912345678",     # too long
        "31234567",      # VoIP prefix, cannot receive WhatsApp
        "71234567",      # unassigned prefix
        "+14155552671",  # not Singapore
        "abcdefgh",
    ],
)
def test_rejects_unusable_numbers(raw: str) -> None:
    with pytest.raises(InvalidPhoneNumber):
        normalize_sg_phone(raw)


def test_none_is_rejected() -> None:
    with pytest.raises(InvalidPhoneNumber):
        normalize_sg_phone(None)  # type: ignore[arg-type]


def test_wa_id_drops_the_plus() -> None:
    assert to_wa_id("+6591234567") == "6591234567"
