from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UsageEventResponse(BaseModel):
    id: UUID
    conversation_id: UUID | None
    model: str
    input_tokens: int
    output_tokens: int
    total_duration_ns: int
    load_duration_ns: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummary(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    request_count: int
    monthly_token_limit: int | None
    monthly_tokens_used: int
    remaining_tokens: int | None
    events: list[UsageEventResponse]
