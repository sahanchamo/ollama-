from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelAccess, User, UserModelAccess


async def model_allowed_for_user(db: AsyncSession, user: User, model: str) -> bool:
    """Apply a user override first, then the global model policy."""
    if user.is_admin:
        return True
    override = await db.get(UserModelAccess, {"user_id": user.id, "model": model})
    if override is not None:
        return override.enabled
    global_access = await db.get(ModelAccess, model)
    return global_access.enabled if global_access is not None else True


async def model_enabled_for_guests(db: AsyncSession, model: str) -> bool:
    global_access = await db.get(ModelAccess, model)
    return global_access.enabled if global_access is not None else True
