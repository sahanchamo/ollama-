import asyncio
import shutil
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession, require_permission
from app.db.models import SecurityTool, SkillSet, User
from app.schemas.skills import SecurityToolResponse, SkillSetCreate, SkillSetResponse, SkillSetUpdate

router = APIRouter(prefix="/skills", tags=["skills"])
AdminToolManager = Annotated[User, Depends(require_permission("security.tools.manage"))]


async def visible_skill(db: DbSession, user: User, skill_id: UUID) -> SkillSet:
    skill = await db.scalar(select(SkillSet).where(SkillSet.id == skill_id))
    if skill is None or not skill.enabled or (skill.owner_id != user.id and not skill.is_published):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill set not found")
    return skill


@router.get("", response_model=list[SkillSetResponse])
async def list_skills(user: CurrentUser, db: DbSession) -> list[SkillSet]:
    return list(await db.scalars(select(SkillSet).where(or_(SkillSet.owner_id == user.id, SkillSet.is_published.is_(True))).order_by(SkillSet.name)))


@router.post("", response_model=SkillSetResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillSetCreate, user: CurrentUser, db: DbSession) -> SkillSet:
    # Publishing changes the workspace-wide prompt surface, so only administrators may do it.
    if payload.is_published and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can publish a skill set")
    skill = SkillSet(owner_id=user.id, **payload.model_dump())
    db.add(skill)
    await db.commit(); await db.refresh(skill)
    return skill


@router.put("/sets/{skill_id}", response_model=SkillSetResponse)
async def update_skill(skill_id: UUID, payload: SkillSetUpdate, user: CurrentUser, db: DbSession) -> SkillSet:
    skill = await db.get(SkillSet, skill_id)
    if skill is None or skill.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill set not found")
    if payload.is_published and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can publish a skill set")
    for field, value in payload.model_dump().items(): setattr(skill, field, value)
    await db.commit(); await db.refresh(skill)
    return skill


@router.delete("/sets/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(skill_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    skill = await db.get(SkillSet, skill_id)
    if skill is None or skill.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill set not found")
    await db.delete(skill); await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/security-tools", response_model=list[SecurityToolResponse])
async def list_security_tools(_: AdminToolManager, db: DbSession) -> list[SecurityTool]:
    return list(await db.scalars(select(SecurityTool).order_by(SecurityTool.name)))


@router.put("/admin/security-tools/{tool_id}/installed", response_model=SecurityToolResponse)
async def set_tool_installed(tool_id: UUID, installed: bool, _: AdminToolManager, db: DbSession) -> SecurityTool:
    tool = await db.get(SecurityTool, tool_id)
    if tool is None: raise HTTPException(status.HTTP_404_NOT_FOUND, "Approved tool not found")
    tool.installed = installed
    await db.commit(); await db.refresh(tool)
    return tool


@router.post("/admin/security-tools/{tool_id}/install", response_model=SecurityToolResponse)
async def install_security_tool(tool_id: UUID, _: AdminToolManager, db: DbSession) -> SecurityTool:
    """Install only a pre-approved package; never accept a shell command from the client."""
    tool = await db.get(SecurityTool, tool_id)
    if tool is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approved tool not found")
    apt = shutil.which("apt-get")
    if apt is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tool installation is available only on Debian/Ubuntu VPS hosts")
    process = await asyncio.create_subprocess_exec(
        apt, "install", "--yes", "--no-install-recommends", tool.package,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        result = await asyncio.wait_for(process.wait(), timeout=300)
    except TimeoutError:
        process.kill(); await process.wait()
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Tool installation timed out")
    if result != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Tool installation failed on the VPS")
    tool.installed = True
    await db.commit(); await db.refresh(tool)
    return tool
