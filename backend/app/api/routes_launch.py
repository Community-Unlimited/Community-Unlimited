"""Launch Control endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import CurrentStaff, DbSession
from app.schemas import LaunchControlOut
from app.services import launch_control

router = APIRouter(prefix="/api/launch-control", tags=["launch-control"])


@router.get("", response_model=LaunchControlOut)
def get_launch_control(db: DbSession, _user: CurrentStaff) -> LaunchControlOut:
    report = launch_control.run(db)
    return LaunchControlOut(**report.as_dict)  # type: ignore[arg-type]
