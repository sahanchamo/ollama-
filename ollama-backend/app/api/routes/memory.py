from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import UserMemory
from app.schemas.memory import MemoryCreate, MemoryResponse

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=list[MemoryResponse])
async def list_memories(user: CurrentUser, db: DbSession) -> list[UserMemory]:
    result = await db.scalars(
        select(UserMemory).where(UserMemory.user_id == user.id).order_by(UserMemory.created_at.desc())
    )
    return list(result)


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(payload: MemoryCreate, user: CurrentUser, db: DbSession) -> UserMemory:
    memory = UserMemory(user_id=user.id, content=payload.content.strip())
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(memory_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    memory = await db.scalar(select(UserMemory).where(UserMemory.id == memory_id, UserMemory.user_id == user.id))
    if memory is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Memory not found")
    await db.delete(memory)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
