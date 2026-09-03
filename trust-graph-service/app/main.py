import asyncio
from contextlib import asynccontextmanager
import logging
from typing import AsyncIterator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes_health import router as health_router
from app.api.routes_trust import router as trust_router
from app.config import settings
from app.core.lock import AsyncRWLock
from app.core.scheduler import periodic_ring_detection_sweep
from app.engine.graph_manager import GraphManager
from app.engine.rehydration import soft_start_rehydration_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manages startup and shutdown lifecycle: initializes the in-memory graph,
    launches background rolling rehydration with soft-start resilience,
    and runs the 5-minute periodic ring detection sweep (D-01, D-02, D-10).
    """
    if not hasattr(app.state, "graph_manager") or app.state.graph_manager is None:
        lock = getattr(app.state, "lock", None)
        app.state.graph_manager = GraphManager(lock=lock)

    skip_rehydration = getattr(app.state, "skip_rehydration", False)
    bg_tasks = []

    if not skip_rehydration:
        try:
            from nexus_db.client import close_db_pool, get_pool
            get_pool_func = get_pool
        except ImportError:
            get_pool_func = None
            close_db_pool = None

        if get_pool_func is not None:
            rehydrate_task = asyncio.create_task(
                soft_start_rehydration_loop(
                    graph_manager=app.state.graph_manager,
                    get_pool_func=get_pool_func,
                    days=settings.rehydrate_days,
                )
            )
            bg_tasks.append(rehydrate_task)

        sweep_task = asyncio.create_task(
            periodic_ring_detection_sweep(
                graph_manager=app.state.graph_manager,
                interval_seconds=settings.periodic_sweep_interval_sec,
            )
        )
        bg_tasks.append(sweep_task)

    try:
        yield
    finally:
        for task in bg_tasks:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        if not skip_rehydration:
            try:
                from nexus_db.client import close_db_pool
                await close_db_pool()
            except Exception as e:
                logger.debug("Error closing DB pool on shutdown: %s", e)


def create_app(
    graph_manager: GraphManager | None = None,
    lock: AsyncRWLock | None = None,
    skip_rehydration: bool = False,
) -> FastAPI:
    """Application factory for Nexus Trust Graph Service."""
    app = FastAPI(
        title="Nexus Trust Graph Microservice",
        version="0.1.0",
        description="Dual-layered fraud ring defense and real-time trust scoring engine",
        lifespan=lifespan,
    )

    app.state.graph_manager = graph_manager
    app.state.lock = lock
    app.state.skip_rehydration = skip_rehydration

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(trust_router)

    return app


app = create_app()
