from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PersonalApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class PersonalApiKeyResponse(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PersonalApiKeyCreated(PersonalApiKeyResponse):
    api_key: str
