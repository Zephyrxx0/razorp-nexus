from fastapi import APIRouter, Request

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check(request: Request) -> dict:
    """
    Returns the operational status of the Trust Graph microservice and
    live in-memory topology metrics.
    """
    gm = getattr(request.app.state, "graph_manager", None)
    if gm is not None:
        stats = gm.stats()
    else:
        stats = {"node_count": 0, "edge_count": 0, "ring_count": 0}

    return {
        "status": "healthy",
        "node_count": stats["node_count"],
        "edge_count": stats["edge_count"],
        "ring_count": stats["ring_count"],
        "nodes_count": stats["node_count"],
        "edges_count": stats["edge_count"],
        "rings_count": stats["ring_count"],
    }


@router.get("/")
async def root() -> dict:
    """Service identification metadata."""
    return {
        "service": "nexus-trust-graph-service",
        "version": "0.1.0",
    }
