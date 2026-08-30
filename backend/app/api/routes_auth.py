"""Staff authentication."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentStaff, DbSession
from app.models import StaffUser
from app.schemas import LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(
        select(StaffUser).where(StaffUser.email == payload.email.strip().lower())
    )
    # Same message either way - do not reveal whether the address exists.
    if user is None or not user.active or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="incorrect email or password",
        )
    return TokenResponse(
        access_token=create_access_token(user.email, user.role),
        role=user.role,
        full_name=user.full_name,
    )


@router.get("/me")
def me(user: CurrentStaff) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }
