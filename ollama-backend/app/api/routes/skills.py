from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import and_, or_, select

from app.api.deps import CurrentUser, DbSession
from app.db.models import SkillSet
from app.schemas.skills import SkillSetCreate, SkillSetResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillSetResponse])
async def list_skills(user: CurrentUser, db: DbSession) -> list[SkillSet]:
    shared = SkillSet.is_published.is_(True) if user.is_admin else and_(SkillSet.is_published.is_(True), SkillSet.admin_only.is_(False))
    result = await db.scalars(select(SkillSet).where(or_(SkillSet.owner_id == user.id, shared)).order_by(SkillSet.name))
    return list(result)


@router.post("", response_model=SkillSetResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillSetCreate, user: CurrentUser, db: DbSession) -> SkillSet:
    if (payload.is_published or payload.admin_only) and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can create shared or administrator-only skill sets")
    if payload.admin_only and not payload.is_published:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Administrator-only skill sets must be published")
    skill = SkillSet(owner_id=user.id, **payload.model_dump())
    db.add(skill); await db.commit(); await db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(skill_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    skill = await db.get(SkillSet, skill_id)
    if skill is None or skill.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill set not found")
    await db.delete(skill); await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
