from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class CytoscapeNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    label: str
    signal_type: str
    signal_value: str
    is_known_fraud: bool
    trust_score: float
    ring_id: str | None = None
    merchants_count: int
    transaction_count: int
    failed_transaction_count: int


class CytoscapeNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: CytoscapeNodeData


CytoscapeNodeElement = CytoscapeNode


class CytoscapeEdgeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    source: str
    target: str
    weight: float
    edge_type: Literal["SHARED_TRANSACTION", "SUBNET_OVERLAP"] = "SHARED_TRANSACTION"
    merchants_shared: list[str] = Field(default_factory=list)


class CytoscapeEdge(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: CytoscapeEdgeData


CytoscapeEdgeElement = CytoscapeEdge


class CytoscapeGraph(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nodes: list[CytoscapeNode] = Field(default_factory=list)
    edges: list[CytoscapeEdge] = Field(default_factory=list)


class RingDetailResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ring_id: str
    risk_level: Literal["HIGH", "CRITICAL"]
    affected_merchants: list[str]
    member_nodes_count: int
    blocked_txn_count: int
    blocked_amount_paise: int
    detection_timestamp: datetime
    detection_algorithm: str = "connected_components"
    graph: CytoscapeGraph


class NodeNeighborSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    signal_type: str
    is_known_fraud: bool
    edge_weight: float


class NodeDetailResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    node_id: str
    signal_type: str
    signal_value: str
    is_known_fraud: bool
    trust_score: float
    ring_id: str | None = None
    first_seen: datetime
    last_seen: datetime
    transaction_count: int
    successful_transaction_count: int
    failed_transaction_count: int
    merchants_seen: list[str]
    degree: int
    neighbors_summary: list[NodeNeighborSummary]
    ego_graph: CytoscapeGraph
