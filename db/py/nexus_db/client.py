import os
from typing import Any
import asyncpg

_pool: asyncpg.Pool | None = None


async def init_db_pool(
    dsn: str | None = None,
    min_size: int = 2,
    max_size: int = 10,
) -> asyncpg.Pool:
    """Initialize the global asyncpg connection pool."""
    global _pool
    if _pool is None:
        db_url = dsn or os.getenv(
            "DATABASE_URL",
            "postgresql://nexus:nexus_dev_password@localhost:5432/nexus",
        )
        _pool = await asyncpg.create_pool(
            dsn=db_url,
            min_size=min_size,
            max_size=max_size,
        )
    return _pool


async def get_pool() -> asyncpg.Pool:
    """Get the active asyncpg connection pool singleton."""
    global _pool
    if _pool is None:
        _pool = await init_db_pool()
    return _pool


async def close_db_pool() -> None:
    """Close the global connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
