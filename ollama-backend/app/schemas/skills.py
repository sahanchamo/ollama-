from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SkillSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    instructions: str = Field(min_length=1, max_length=12_000)
    is_published: bool = False


class SkillSetUpdate(SkillSetCreate):
    enabled: bool = True


class SkillSetResponse(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    description: str | None
    instructions: str
    is_published: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class SecurityToolResponse(BaseModel):
    id: UUID
    name: str
    package: str
    description: str
    installed: bool
    updated_at: datetime
    model_config = {"from_attributes": True}
