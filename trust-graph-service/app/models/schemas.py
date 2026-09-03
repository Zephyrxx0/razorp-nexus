from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    merchant_id: UUID
    amount_paise: int = Field(gt=0)
    buyer_fingerprint: dict[str, Any]
    request_id: str | None = None


class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="ignore")

    base_score: float = 100.0
    new_entity_penalty: float = 0.0
    fraud_neighbor_penalty: float = 0.0
    velocity_penalty: float = 0.0
    cross_merchant_penalty: float = 0.0
    ring_penalty: float = 0.0
    missing_signals_penalty: float = 0.0
    reputation_bonus: float = 0.0
    final_score: float = 100.0


class GraphMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nodes_matched: int
    known_fraud_neighbors_1hop: int
    known_fraud_neighbors_2hop: int
    cross_merchant_count: int
    velocity_last_60min: int
    ring_membership: str | None = None


class ScoreResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    score: float = Field(ge=0.0, le=100.0)
    decision: Literal["ALLOW", "REVIEW", "DENY"]
    risk_factors: list[str]
    graph_metrics: GraphMetrics
    score_breakdown: ScoreBreakdown


class SignalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    merchant_id: UUID
    transaction_id: UUID
    buyer_fingerprint: dict[str, Any]
    amount_paise: int = Field(gt=0)
    outcome: Literal["SUCCESS", "DENIED", "FAILED", "PENDING"]
    timestamp: datetime | None = None


class SignalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: Literal["INGESTED"] = "INGESTED"
    nodes_updated: int
    edges_updated: int
    rings_detected: int = 0


class NodeTransactionRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tx_id: str
    merchant_id: str
    outcome: str
    amount_paise: int
    timestamp: datetime
