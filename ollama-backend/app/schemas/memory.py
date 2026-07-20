from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2_000)


class MemoryResponse(BaseModel):
    id: UUID
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
