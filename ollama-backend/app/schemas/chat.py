from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    model: str = Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    temperature: float | None = Field(default=None, ge=0, le=2)
    # Qwen3 thinks by default. Starlen is a conversational UI, so return the answer
    # directly rather than leaving CPU-only VPS users waiting for a hidden reasoning trace.
    think: bool = False
    stream: bool = True

    @field_validator("messages")
    @classmethod
    def only_one_system_message(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if sum(m.role == "system" for m in messages) > 1:
            raise ValueError("at most one system message is permitted")
        return messages


class GuestChatRequest(ChatRequest):
    """An intentionally short-lived, unauthenticated chat request."""

    session_id: str = Field(min_length=24, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")


class ConversationCreate(BaseModel):
    model: str = Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")
    title: str | None = Field(default=None, max_length=200)


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    model: str | None = Field(default=None, min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    temperature: float | None = Field(default=None, ge=0, le=2)


class MessageResponse(BaseModel):
    id: UUID
    role: Literal["system", "user", "assistant"]
    content: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    id: UUID
    title: str
    model: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationSummary):
    messages: list[MessageResponse]
