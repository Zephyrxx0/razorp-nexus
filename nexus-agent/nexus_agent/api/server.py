"""FastAPI application server for Nexus Agent on port 8000 (ORCH-01, PRD §11.1)."""

import logging
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI

from nexus_agent.api.routes_run import router as run_router
from nexus_agent.pipeline.runner import DeterministicPipelineRunner

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager initializing defaults."""
    if not hasattr(app.state, "runner") or app.state.runner is None:
        app.state.runner = DeterministicPipelineRunner()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    application = FastAPI(
        title="Nexus Agent API Server",
        description="Google ADK Agent Server exposing deterministic commerce orchestration on port 8000.",
        version="1.0.0",
        lifespan=lifespan,
    )

    @application.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "nexus-agent",
            "port": 8000,
        }

    application.include_router(run_router)
    return application


app = create_app()
