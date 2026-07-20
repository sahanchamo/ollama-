from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select, update

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_api_key
from app.db.models import ApiKey
from app.schemas.account import PersonalApiKeyCreate, PersonalApiKeyCreated, PersonalApiKeyResponse

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/api-keys", response_model=list[PersonalApiKeyResponse])
async def list_personal_api_keys(user: CurrentUser, db: DbSession) -> list[ApiKey]:
    keys = await db.scalars(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc()).limit(100)
    )
    return list(keys)


@router.post("/api-keys", response_model=PersonalApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_personal_api_key(
    payload: PersonalApiKeyCreate, user: CurrentUser, db: DbSession
) -> PersonalApiKeyCreated:
    secret, prefix, key_hash = create_api_key()
    key = ApiKey(
        user_id=user.id,
        name=payload.name.strip(),
        key_prefix=prefix,
        key_hash=key_hash,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return PersonalApiKeyCreated(**PersonalApiKeyResponse.model_validate(key).model_dump(), api_key=secret)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_personal_api_key(key_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    result = await db.execute(
        update(ApiKey)
        .where(ApiKey.id == key_id, ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Active API key not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
