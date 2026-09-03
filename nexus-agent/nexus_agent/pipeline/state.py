"""Pipeline state machine models and execution contexts (ORCH-02, D-04)."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class StepName(str, Enum):
    """Names of the 6 tools comprising the deterministic pipeline."""

    PARSE_INTENT = "PARSE_INTENT"
    RESOLVE_CATALOG = "RESOLVE_CATALOG"
    CHECK_TRUST_GRAPH = "CHECK_TRUST_GRAPH"
    CREATE_RAZORPAY_ORDER = "CREATE_RAZORPAY_ORDER"
    CAPTURE_RAZORPAY_PAYMENT = "CAPTURE_RAZORPAY_PAYMENT"
    LOG_AUDIT_ENTRY = "LOG_AUDIT_ENTRY"


@dataclass
class StepResult:
    """Outcome and cryptographic metadata for an executed pipeline step."""

    step_number: int
    step_name: str
    input_summary: str
    output_summary: str
    reason: str
    raw_data: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0
    is_error: bool = False
    entry_hash: str = ""
    prev_entry_hash: str = ""
    transaction_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_number": self.step_number,
            "step_name": self.step_name,
            "input_summary": self.input_summary,
            "output_summary": self.output_summary,
            "reason": self.reason,
            "raw_data": self.raw_data,
            "duration_ms": self.duration_ms,
            "is_error": self.is_error,
            "entry_hash": self.entry_hash,
            "prev_entry_hash": self.prev_entry_hash,
            "transaction_id": self.transaction_id,
        }


@dataclass
class PipelineContext:
    """State carrier passed sequentially through the 6-step deterministic pipeline."""

    transaction_id: UUID = field(default_factory=uuid4)
    merchant_id: UUID = field(default_factory=uuid4)
    intent_string: str = ""
    buyer_email: str = ""
    buyer_fingerprint: dict[str, Any] = field(default_factory=dict)
    steps: list[StepResult] = field(default_factory=list)
    inventory_reserved: bool = False
    product_id: UUID | str | None = None
    product_name: str | None = None
    quantity: int = 1
    amount_paise: int = 0
    currency: str = "INR"
    trust_score: float | None = None
    trust_decision: str | None = None
    trust_risk_factors: list[str] = field(default_factory=list)
    order_id: str | None = None
    payment_id: str | None = None
    final_status: str = "PENDING"
    failure_reason: str | None = None
    db_pool: Any = None
    trust_url: str = "http://localhost:8001"
    razorpay_adapter: Any = None
    encryption_key: str = ""

    def __post_init__(self):
        if isinstance(self.transaction_id, str):
            try:
                self.transaction_id = UUID(self.transaction_id)
            except ValueError:
                pass
        if isinstance(self.merchant_id, str):
            try:
                self.merchant_id = UUID(self.merchant_id)
            except ValueError:
                pass
