from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class BuyerFingerprintModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email_hash: str
    ip_subnet: str
    device_hash: str | None = None
    upi_handle: str | None = None
    user_agent_hash: str


class IntentParsedModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    product_query: str
    quantity: int
    buyer_email: str
    confidence: float


class MerchantModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    name: str
    email: str
    razorpay_key_id: str
    razorpay_key_secret: str
    razorpay_webhook_secret: str
    maas_token_hash: str
    token_preview: str
    maas_endpoint: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ProductModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    merchant_id: UUID
    name: str
    description: str
    price_paise: int = Field(gt=0)
    currency: str = "INR"
    stock: int = Field(ge=0)
    category: str
    tags: list[str] = Field(default_factory=list)
    embedding: list[float]
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class TransactionModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    merchant_id: UUID
    intent_raw: str
    intent_parsed: IntentParsedModel | dict[str, Any]
    product_id: UUID | None = None
    quantity: int = Field(gt=0)
    amount_paise: int = Field(gt=0)
    currency: str = "INR"
    buyer_fingerprint: BuyerFingerprintModel | dict[str, Any]
    trust_score: float | None = None
    trust_decision: Literal["ALLOW", "REVIEW", "DENY"] | None = None
    trust_risk_factors: list[str] = Field(default_factory=list)
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    status: Literal["PENDING", "SUCCESS", "DENIED", "FAILED", "PARTIAL"] = "PENDING"
    failure_reason: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class AuditEntryModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    transaction_id: UUID
    step_name: str
    step_number: int = Field(ge=1)
    timestamp: datetime
    duration_ms: int = Field(ge=0, default=0)
    input_summary: str
    output_summary: str
    reason: str
    raw_data: dict[str, Any] = Field(default_factory=dict)
    is_error: bool = False
    prev_entry_hash: str
    entry_hash: str
