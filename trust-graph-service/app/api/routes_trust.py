from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from app.engine.graph_manager import GraphManager
from app.engine.scoring import TrustScorer
from app.models.cytoscape import (
    CytoscapeGraph,
    NodeDetailResponse,
    RingDetailResponse,
)
from app.models.schemas import (
    ScoreRequest,
    ScoreResponse,
    SignalRequest,
    SignalResponse,
)

router = APIRouter(prefix="/trust", tags=["Trust Graph Engine"])


def get_graph_manager(request: Request) -> GraphManager:
    """Extracts the GraphManager singleton from application state."""
    gm = getattr(request.app.state, "graph_manager", None)
    if gm is None:
        raise HTTPException(
            status_code=503,
            detail="Trust Graph Engine is not initialized",
        )
    return gm


@router.post("/score", response_model=ScoreResponse)
async def calculate_trust_score(
    payload: ScoreRequest,
    gm: GraphManager = Depends(get_graph_manager),
) -> ScoreResponse:
    """
    Evaluates real-time trust score (0-100) and gating decision (ALLOW/REVIEW/DENY)
    for a buyer fingerprint within the sub-5ms SLA.
    Acquires read lock to permit high concurrent query throughput.
    """
    async with gm.lock.read():
        score_dict = TrustScorer.score_fingerprint(
            graph_manager=gm,
            fingerprint=payload.buyer_fingerprint,
            merchant_id=str(payload.merchant_id),
            request_id=payload.request_id,
        )
    return ScoreResponse.model_validate(score_dict)


@router.post("/signal", response_model=SignalResponse)
async def ingest_transaction_signal(
    payload: SignalRequest,
    gm: GraphManager = Depends(get_graph_manager),
) -> SignalResponse:
    """
    Ingests post-transaction or webhook outcome into the in-memory graph (D-04).
    Acquires exclusive write lock and executes synchronous 2-hop local ego ring check (D-10).
    """
    async with gm.lock.write():
        nodes_up, edges_up, rings_det = gm.ingest_signal(
            fingerprint=payload.buyer_fingerprint,
            merchant_id=str(payload.merchant_id),
            transaction_id=str(payload.transaction_id),
            outcome=payload.outcome,
            amount_paise=payload.amount_paise,
            timestamp=payload.timestamp,
        )

    return SignalResponse(
        status="INGESTED",
        nodes_updated=nodes_up,
        edges_updated=edges_up,
        rings_detected=rings_det,
    )


@router.get("/rings", response_model=list[RingDetailResponse])
async def list_fraud_rings(
    gm: GraphManager = Depends(get_graph_manager),
) -> list[RingDetailResponse]:
    """
    Returns all detected fraud ring clusters with dual-layer telemetry
    (business aggregates + embedded Cytoscape graph elements, D-13).
    """
    async with gm.lock.read():
        rings = [RingDetailResponse.model_validate(r) for r in gm.rings.values()]
    return rings


@router.get("/node/{node_id:path}", response_model=NodeDetailResponse)
async def get_node_details(
    node_id: str,
    gm: GraphManager = Depends(get_graph_manager),
) -> NodeDetailResponse:
    """
    Returns full node inspection profile, transaction counters, 1-hop neighbor summary,
    and ego subgraph for the dashboard slide-out drawer (D-14).
    """
    async with gm.lock.read():
        profile = gm.get_node_profile(node_id)

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail=f"Node '{node_id}' not found in Trust Graph",
        )

    return NodeDetailResponse.model_validate(profile)


@router.get("/graph", response_model=CytoscapeGraph)
async def get_graph_visualization(
    merchant_id: UUID | None = Query(
        default=None,
        description="Optional merchant filter scoping visualizer nodes",
    ),
    limit: int = Query(
        default=200,
        ge=1,
        le=200,
        description="Maximum node count (capped at 200 for 60fps Cytoscape rendering, D-15)",
    ),
    gm: GraphManager = Depends(get_graph_manager),
) -> CytoscapeGraph:
    """
    Returns induced subgraph elements (nodes and edges) formatted for Cytoscape.js.
    Supports optional merchant scoping and strict node limits (D-15, D-16).
    """
    async with gm.lock.read():
        graph_data = gm.get_merchant_subgraph(
            merchant_id=str(merchant_id) if merchant_id else None,
            limit=limit,
        )
    return CytoscapeGraph.model_validate(graph_data)
