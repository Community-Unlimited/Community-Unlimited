"""The locked training calendar.

Every parameter here is marked LOCKED in section 5 of the handoff, so they live
in one place as named constants rather than being scattered through the code.

Nothing in this module hard-codes a *result*. The seat supply that Launch
Control reports is generated from these rules, so when the project changes a
rule - adds a venue, runs parallel classes, opens Sundays - the numbers move on
their own. That is the whole point: 5.3 says the capacity shortfall must be
detected automatically, not asserted.
"""

from __future__ import annotations

from calendar import day_name
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

# Singapore is UTC+8 year-round and has no DST, so a fixed offset is exact.
# Using it avoids depending on the IANA database, which Windows does not ship.
SGT = timezone(timedelta(hours=8), "SGT")

# 5.1 LOCKED
TRAINING_WINDOW_START = date(2026, 10, 1)
TRAINING_WINDOW_END = date(2027, 1, 31)
TRAINING_VENUE = "BLCC Culinary Studio"

# 5.2 LOCKED - max 10 participants per session.
MAX_CLASS_SIZE = 10

# 5.2 LOCKED recurring slots. Monday=0 .. Sunday=6.
WEEKDAY_SLOTS: dict[int, tuple[time, time]] = {
    0: (time(9, 0), time(12, 0)),   # Monday
    1: (time(9, 0), time(12, 0)),   # Tuesday
    2: (time(9, 0), time(12, 0)),   # Wednesday
    3: (time(14, 0), time(17, 0)),  # Thursday
}
SATURDAY = 5
SATURDAY_SLOT = (time(9, 0), time(12, 0))
SATURDAYS_PER_MONTH = 1

# 5.1 LOCKED - no training on public holidays.
# Only holidays inside the training window are listed. Christmas Day
# (25 Dec 2026) and New Year's Day (1 Jan 2027) both fall on a Friday, which is
# not a training day, so they remove no slots - but they are listed so the rule
# stays true if the schedule ever gains a Friday.
SG_PUBLIC_HOLIDAYS: frozenset[date] = frozenset(
    {
        date(2026, 11, 9),   # Deepavali observed (Mon) - 5.2 names this explicitly
        date(2026, 12, 25),  # Christmas Day (Fri)
        date(2027, 1, 1),    # New Year's Day (Fri)
    }
)

# 4.1 LOCKED - the deployment gate is four modules.
MODULES_REQUIRED_FOR_DEPLOYMENT = 4

# 21 LOCKED targets.
TARGET_DEPLOYABLE_PEOPLE = 300
TARGET_ASSET_COUNT = 17
CNY_2027 = date(2027, 2, 6)
FULL_ROLLOUT_TARGET = date(2027, 3, 31)


@dataclass(frozen=True, slots=True)
class TrainingSlot:
    """One bookable time slot on the calendar."""

    slot_date: date
    start: time
    end: time

    @property
    def weekday_name(self) -> str:
        return day_name[self.slot_date.weekday()]

    @property
    def is_saturday(self) -> bool:
        return self.slot_date.weekday() == SATURDAY

    def start_utc(self) -> datetime:
        return datetime.combine(self.slot_date, self.start, tzinfo=SGT).astimezone(
            timezone.utc
        )

    def end_utc(self) -> datetime:
        return datetime.combine(self.slot_date, self.end, tzinfo=SGT).astimezone(
            timezone.utc
        )


def _daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def generate_training_slots(
    start: date = TRAINING_WINDOW_START,
    end: date = TRAINING_WINDOW_END,
    holidays: frozenset[date] = SG_PUBLIC_HOLIDAYS,
    saturdays_per_month: int = SATURDAYS_PER_MONTH,
) -> list[TrainingSlot]:
    """Every training slot in the window, in date order.

    Saturdays are limited to the first ``saturdays_per_month`` in each calendar
    month. A holiday removes the slot entirely - it is not moved.
    """
    slots: list[TrainingSlot] = []
    saturdays_used: dict[tuple[int, int], int] = {}

    for day in _daterange(start, end):
        if day in holidays:
            continue

        weekday = day.weekday()

        if weekday in WEEKDAY_SLOTS:
            begin, finish = WEEKDAY_SLOTS[weekday]
            slots.append(TrainingSlot(day, begin, finish))
        elif weekday == SATURDAY:
            key = (day.year, day.month)
            if saturdays_used.get(key, 0) < saturdays_per_month:
                saturdays_used[key] = saturdays_used.get(key, 0) + 1
                slots.append(TrainingSlot(day, *SATURDAY_SLOT))

    return slots


@dataclass(frozen=True, slots=True)
class CalendarCapacity:
    """Derived seat supply. Every field is computed, none is asserted."""

    weekday_slots: int
    saturday_slots: int
    total_slots: int
    seats_per_slot: int
    total_learner_seats: int
    modules_per_person: int
    max_people_completing_pathway: int

    @property
    def as_dict(self) -> dict[str, int]:
        return {
            "weekday_slots": self.weekday_slots,
            "saturday_slots": self.saturday_slots,
            "total_slots": self.total_slots,
            "seats_per_slot": self.seats_per_slot,
            "total_learner_seats": self.total_learner_seats,
            "modules_per_person": self.modules_per_person,
            "max_people_completing_pathway": self.max_people_completing_pathway,
        }


def calendar_capacity(
    slots: list[TrainingSlot] | None = None,
    seats_per_slot: int = MAX_CLASS_SIZE,
    modules_per_person: int = MODULES_REQUIRED_FOR_DEPLOYMENT,
) -> CalendarCapacity:
    """Turn a slot list into learner-seat supply.

    5.3: under one class of ten per slot, the ceiling on people who can finish
    the whole pathway is ``total_seats // modules_per_person``.
    """
    if slots is None:
        slots = generate_training_slots()

    saturday_slots = sum(1 for s in slots if s.is_saturday)
    weekday_slots = len(slots) - saturday_slots
    total_seats = len(slots) * seats_per_slot

    return CalendarCapacity(
        weekday_slots=weekday_slots,
        saturday_slots=saturday_slots,
        total_slots=len(slots),
        seats_per_slot=seats_per_slot,
        total_learner_seats=total_seats,
        modules_per_person=modules_per_person,
        max_people_completing_pathway=total_seats // modules_per_person,
    )
