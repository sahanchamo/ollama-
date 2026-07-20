import json
import base64
import binascii
from collections.abc import AsyncIterator
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, desc, func, select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.db.models import Conversation, Message, ModelAccess, UsageEvent, UserMemory
from app.db.session import SessionLocal
from app.schemas.chat import (
    ChatMessage,
    ChatRequest,
    ConversationCreate,
    ConversationDetail,
    ConversationUpdate,
    ConversationSummary,
    MessageResponse,
    SendMessageRequest,
)
from app.services.rate_limit import limit_request
from app.services.rag import build_rag_instruction, retrieve_context
from app.services.quota import enforce_quota
from app.services.domain_lookup import live_domain_context

router = APIRouter(prefix="/conversations", tags=["conversations"])
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_BYTES = 8 * 1024 * 1024


def chat_title(content: str) -> str:
    """Fast, predictable first title; clients can rename it later."""
    compact = " ".join(content.split())
    return f"{compact[:57].rstrip()}..." if len(compact) > 60 else compact


def validate_images(images: list[str]) -> list[str]:
    total = 0
    for image in images:
        try:
            decoded = base64.b64decode(image, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "An attached image is not valid base64") from exc
        if not decoded or len(decoded) > MAX_IMAGE_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Each screenshot must be 5 MB or smaller")
        total += len(decoded)
    if total > MAX_IMAGES_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Attached screenshots must total 8 MB or smaller")
    return images


async def memory_instruction(db: DbSession, user_id: UUID) -> str | None:
    memories = await db.scalars(
        select(UserMemory)
        .where(UserMemory.user_id == user_id)
        .order_by(UserMemory.created_at.desc())
        .limit(30)
    )
    items = [memory.content.strip() for memory in memories if memory.content.strip()]
    if not items:
        return None
    context = "\n".join(f"- {item}" for item in reversed(items))[:12_000]
    return (
        "LONG-TERM USER MEMORY (private user-provided preferences and facts):\n"
        f"{context}\n\nUse this only when relevant. Do not claim to remember anything not listed here."
    )


async def owned_conversation(db: DbSession, conversation_id: UUID, user_id: UUID) -> Conversation:
    conversation = await db.scalar(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


async def assert_model_available(db: DbSession, model: str, is_admin: bool) -> None:
    access = await db.get(ModelAccess, model)
    if access is not None and not access.enabled and not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This model is disabled by the administrator")


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(user: CurrentUser, db: DbSession) -> list[Conversation]:
    result = await db.scalars(
        select(Conversation).where(Conversation.user_id == user.id).order_by(desc(Conversation.updated_at))
    )
    return list(result)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_my_conversations(user: CurrentUser, db: DbSession) -> Response:
    await db.execute(delete(Conversation).where(Conversation.user_id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(payload: ConversationCreate, user: CurrentUser, db: DbSession) -> Conversation:
    await assert_model_available(db, payload.model, user.is_admin)
    conversation = Conversation(user_id=user.id, model=payload.model, title=payload.title or "New chat")
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID, user: CurrentUser, db: DbSession) -> ConversationDetail:
    conversation = await owned_conversation(db, conversation_id, user.id)
    messages = await db.scalars(
        select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)
    )
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        model=conversation.model,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[MessageResponse.model_validate(message) for message in messages],
    )


@router.patch("/{conversation_id}", response_model=ConversationSummary)
async def update_conversation(
    conversation_id: UUID, payload: ConversationUpdate, user: CurrentUser, db: DbSession
) -> Conversation:
    conversation = await owned_conversation(db, conversation_id, user.id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide a title or model to update")
    if "title" in changes:
        conversation.title = changes["title"].strip()
    if "model" in changes:
        await assert_model_available(db, changes["model"], user.is_admin)
        conversation.model = changes["model"]
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    conversation = await owned_conversation(db, conversation_id, user.id)
    await db.delete(conversation)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def persist_assistant_message(
    conversation_id: UUID, user_id: UUID, model: str, content: str, message_status: str, metrics: dict[str, int]
) -> None:
    """The streaming response outlives the request dependency, so use a fresh DB session."""
    async with SessionLocal() as db:
        db.add(Message(conversation_id=conversation_id, role="assistant", content=content, status=message_status))
        conversation = await db.get(Conversation, conversation_id)
        if conversation:
            conversation.updated_at = func.now()
        db.add(
            UsageEvent(
                user_id=user_id,
                conversation_id=conversation_id,
                model=model,
                input_tokens=metrics.get("prompt_eval_count", 0),
                output_tokens=metrics.get("eval_count", 0),
                total_duration_ns=metrics.get("total_duration", 0),
                load_duration_ns=metrics.get("load_duration", 0),
                status=message_status,
            )
        )
        await db.commit()


async def persist_stream(
    request: Request, ollama_request: ChatRequest, conversation_id: UUID, user_id: UUID
) -> AsyncIterator[bytes]:
    answer: list[str] = []
    completed = False
    metrics: dict[str, int] = {}
    buffered = bytearray()
    try:
        async for chunk in request.app.state.ollama.stream_chat(ollama_request):
            buffered.extend(chunk)
            while b"\n" in buffered:
                line, _, remainder = buffered.partition(b"\n")
                buffered = bytearray(remainder)
                try:
                    event = json.loads(line)
                    answer.append(event.get("message", {}).get("content", ""))
                    completed = completed or bool(event.get("done"))
                    if event.get("done"):
                        metrics = {
                            key: int(event.get(key, 0))
                            for key in ("prompt_eval_count", "eval_count", "total_duration", "load_duration")
                        }
                except json.JSONDecodeError:
                    pass
            yield chunk
    except httpx.HTTPError:
        # The frontend receives a final stream event instead of an opaque proxy failure.
        yield b'{"error":"Model service unavailable","done":true}\n'
    finally:
        await persist_assistant_message(
            conversation_id, user_id, ollama_request.model, "".join(answer), "complete" if completed else "interrupted", metrics
        )


@router.post("/{conversation_id}/messages", response_class=StreamingResponse)
async def send_message(
    conversation_id: UUID,
    payload: SendMessageRequest,
    request: Request,
    user: CurrentUser,
    db: DbSession,
    _: None = Depends(limit_request),
):
    if len(payload.content) > get_settings().max_prompt_chars:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message exceeds configured limit")
    await enforce_quota(db, user.id)
    conversation = await owned_conversation(db, conversation_id, user.id)
    await assert_model_available(db, conversation.model, user.is_admin)
    images = validate_images(payload.images)
    if images and "vl" not in conversation.model.lower():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Screenshots require a vision model. Select qwen3-vl:2b or qwen3-vl:4b, then retry.",
        )
    user_message = Message(conversation_id=conversation.id, role="user", content=payload.content)
    db.add(user_message)
    if conversation.title == "New chat":
        conversation.title = chat_title(payload.content)
    else:
        conversation.updated_at = func.now()
    await db.commit()

    previous = await db.scalars(
        select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)
    )
    messages = [ChatMessage(role=message.role, content=message.content) for message in previous]
    if images:
        messages[-1].images = images
    try:
        context = await retrieve_context(db, request.app.state.ollama, user.id, payload.content)
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Knowledge retrieval unavailable: {exc}") from exc
    rag_instruction = build_rag_instruction(context)
    saved_memory = await memory_instruction(db, user.id)
    tool_instruction = await live_domain_context(payload.content)
    system_context = "\n\n".join(item for item in (saved_memory, rag_instruction, tool_instruction) if item)
    if system_context:
        messages.insert(0, ChatMessage(role="system", content=system_context))
    ollama_request = ChatRequest(
        model=conversation.model, messages=messages, temperature=payload.temperature, stream=True
    )
    return StreamingResponse(
        persist_stream(request, ollama_request, conversation.id, user.id),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-ID": str(conversation.id),
        },
    )
