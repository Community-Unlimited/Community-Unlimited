"""Asset registry and the 12-point Site Ready Gate."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import CurrentStaff, DbSession
from app.models import Asset
from app.models.asset import READINESS_GATES
from app.schemas import AssetGateUpdate, AssetOut
from app.services import audit

router = APIRouter(prefix="/api/assets", tags=["assets"])

_GATE_NAMES = {name for name, _ in READINESS_GATES}


def _asset_out(asset: Asset) -> AssetOut:
    out = AssetOut.model_validate(asset)
    out.gates_met = asset.gates_met
    out.blockers = asset.blockers
    out.is_ready_to_launch = asset.is_ready_to_launch
    return out


@router.get("", response_model=list[AssetOut])
def list_assets(db: DbSession, _user: CurrentStaff) -> list[AssetOut]:
    return [_asset_out(a) for a in db.scalars(select(Asset).order_by(Asset.code))]


@router.get("/gates")
def list_gates(_user: CurrentStaff) -> list[dict[str, str]]:
    """6.3 checklist, in order, with the blocker wording the UI shows."""
    return [{"gate": name, "blocker_label": label} for name, label in READINESS_GATES]


@router.patch("/{asset_id}/gate", response_model=AssetOut)
def set_gate(
    asset_id: int, payload: AssetGateUpdate, db: DbSession, user: CurrentStaff
) -> AssetOut:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    if payload.gate not in _GATE_NAMES:
        raise HTTPException(
            status_code=422,
            detail=f"unknown gate {payload.gate!r}; see GET /api/assets/gates",
        )

    setattr(asset, payload.gate, payload.value)

    # Status follows the gates, but a launched site is never auto-demoted -
    # taking a live cafe offline is a human decision.
    if asset.status not in ("live", "paused", "retired"):
        if asset.is_ready_to_launch:
            asset.status = "ready"
        elif asset.gates_met:
            asset.status = "preparing"
        else:
            asset.status = "not_started"

    audit.record(
        db,
        action="asset.gate_changed",
        entity_type="asset",
        entity_id=asset.id,
        actor=user,
        summary=f"{asset.code}: {payload.gate} -> {payload.value}",
    )
    db.commit()
    db.refresh(asset)
    return _asset_out(asset)
