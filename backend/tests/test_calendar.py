"""The locked training calendar and the capacity it implies.

These assertions pin the handoff's own arithmetic (5.3). If a locked rule
changes, these fail loudly rather than the dashboard quietly reporting a
different gap.
"""

from __future__ import annotations

from datetime import date

from app.services.calendar import (
    MODULES_REQUIRED_FOR_DEPLOYMENT,
    SG_PUBLIC_HOLIDAYS,
    TARGET_DEPLOYABLE_PEOPLE,
    calendar_capacity,
    generate_training_slots,
)


def test_slot_counts_match_the_handoff() -> None:
    capacity = calendar_capacity(generate_training_slots())
    assert capacity.weekday_slots == 68
    assert capacity.saturday_slots == 4
    assert capacity.total_slots == 72


def test_seat_supply_and_the_480_gap_are_derived() -> None:
    capacity = calendar_capacity()
    demand = TARGET_DEPLOYABLE_PEOPLE * MODULES_REQUIRED_FOR_DEPLOYMENT

    assert capacity.total_learner_seats == 720
    assert demand == 1200
    assert demand - capacity.total_learner_seats == 480
    assert capacity.max_people_completing_pathway == 180


def test_deepavali_is_excluded() -> None:
    slots = {s.slot_date for s in generate_training_slots()}
    assert date(2026, 11, 9) not in slots
    assert date(2026, 11, 9) in SG_PUBLIC_HOLIDAYS


def test_no_slot_falls_on_a_public_holiday() -> None:
    slots = {s.slot_date for s in generate_training_slots()}
    assert not (slots & SG_PUBLIC_HOLIDAYS)


def test_only_training_weekdays_appear() -> None:
    # Monday-Thursday (0-3) and Saturday (5). Never Friday or Sunday.
    weekdays = {s.slot_date.weekday() for s in generate_training_slots()}
    assert weekdays <= {0, 1, 2, 3, 5}
    assert 4 not in weekdays
    assert 6 not in weekdays


def test_thursday_is_the_afternoon_slot() -> None:
    thursdays = [s for s in generate_training_slots() if s.slot_date.weekday() == 3]
    assert thursdays
    assert all(s.start.hour == 14 and s.end.hour == 17 for s in thursdays)


def test_mon_to_wed_are_morning_slots() -> None:
    mornings = [s for s in generate_training_slots() if s.slot_date.weekday() in (0, 1, 2)]
    assert mornings
    assert all(s.start.hour == 9 and s.end.hour == 12 for s in mornings)


def test_one_saturday_per_calendar_month() -> None:
    saturdays = [s for s in generate_training_slots() if s.is_saturday]
    months = [(s.slot_date.year, s.slot_date.month) for s in saturdays]
    assert len(months) == len(set(months)), "more than one Saturday in a month"
    assert len(saturdays) == 4


def test_slots_stay_inside_the_locked_window() -> None:
    slots = generate_training_slots()
    assert min(s.slot_date for s in slots) >= date(2026, 10, 1)
    assert max(s.slot_date for s in slots) <= date(2027, 1, 31)


def test_local_time_converts_to_utc_correctly() -> None:
    # 0900 Singapore is 0100 UTC.
    monday = next(s for s in generate_training_slots() if s.slot_date.weekday() == 0)
    assert monday.start_utc().hour == 1


def test_capacity_responds_to_a_rule_change() -> None:
    """5.3 says the fix must be modelled, not assumed. Two parallel classes."""
    doubled = calendar_capacity(seats_per_slot=20)
    assert doubled.total_learner_seats == 1440
    assert doubled.max_people_completing_pathway == 360
    # Which would clear the 300 target.
    assert doubled.total_learner_seats >= TARGET_DEPLOYABLE_PEOPLE * 4
