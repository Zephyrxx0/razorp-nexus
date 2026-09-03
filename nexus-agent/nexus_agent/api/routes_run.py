"""ADK-compatible POST /run endpoint routing through DeterministicPipelineRunner (ORCH-01, D-04)."""

import json
import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from google.adk import Event
from pydantic import BaseModel, ConfigDict, Field

from nexus_agent.pipeline.runner import DeterministicPipelineRunner
from nexus_agent.pipeline.state import PipelineContext

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_MERCHANT_ID = "00000000-0000-0000-0000-000000000001"


class RunAgentRequest(BaseModel):
    """ADK standard RunAgentRequest payload with commerce context extensions."""

    model_config = ConfigDict(extra="allow")

    app_name: str | None = None
    user_id: str = "nexus_buyer"
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    new_message: Any = None
    streaming: bool = False
    state_delta: dict[str, Any] | None = None
    invocation_id: str | None = None
    custom_metadata: dict[str, Any] | None = None
    merchant_id: str | None = None
    intent: str | None = None
    buyer_email: str | None = None
    buyer_fingerprint: dict[str, Any] | None = None


def _extract_intent_and_metadata(
    req: RunAgentRequest,
) -> tuple[str, str, str, dict[str, Any]]:
    """Extract intent_string, merchant_id, buyer_email, and buyer_fingerprint from flexible request formats."""
    intent_string = req.intent or ""
    merchant_id = req.merchant_id or ""
    buyer_email = req.buyer_email or ""
    buyer_fingerprint = req.buyer_fingerprint or {}

    # Extract from custom_metadata
    if req.custom_metadata:
        if not intent_string and "intent" in req.custom_metadata:
            intent_string = str(req.custom_metadata["intent"])
        if not merchant_id and "merchant_id" in req.custom_metadata:
            merchant_id = str(req.custom_metadata["merchant_id"])
        if not buyer_email and "buyer_email" in req.custom_metadata:
            buyer_email = str(req.custom_metadata["buyer_email"])
        if not buyer_fingerprint and "buyer_fingerprint" in req.custom_metadata:
            buyer_fingerprint = req.custom_metadata["buyer_fingerprint"]

    # Extract from new_message if not already found
    if req.new_message:
        raw_text = ""
        if isinstance(req.new_message, str):
            raw_text = req.new_message
        elif isinstance(req.new_message, dict):
            parts = req.new_message.get("parts")
            if isinstance(parts, list) and parts:
                p0 = parts[0]
                raw_text = p0.get("text", "") if isinstance(p0, dict) else str(p0)
            elif "text" in req.new_message:
                raw_text = str(req.new_message["text"])
            elif "intent" in req.new_message:
                intent_string = str(req.new_message["intent"])
        elif hasattr(req.new_message, "parts"):
            parts = getattr(req.new_message, "parts", [])
            if parts:
                p0 = parts[0]
                raw_text = getattr(p0, "text", "") or str(p0)

        # Attempt JSON parsing if raw_text contains structured JSON
        if raw_text:
            trimmed = raw_text.strip()
            if trimmed.startswith("{") and trimmed.endswith("}"):
                try:
                    data = json.loads(trimmed)
                    if isinstance(data, dict):
                        if not intent_string and "intent" in data:
                            intent_string = str(data["intent"])
                        if not merchant_id and "merchant_id" in data:
                            merchant_id = str(data["merchant_id"])
                        if not buyer_email and "buyer_email" in data:
                            buyer_email = str(data["buyer_email"])
                        if not buyer_fingerprint and "buyer_fingerprint" in data:
                            buyer_fingerprint = data["buyer_fingerprint"]
                except Exception:
                    pass
            if not intent_string:
                intent_string = raw_text

    # Provide safe fallbacks
    if not merchant_id:
        merchant_id = DEFAULT_MERCHANT_ID
    if not buyer_email:
        buyer_email = (
            req.user_id
            if "@" in req.user_id
            else f"{req.user_id}@nexus.local"
        )
    if not buyer_fingerprint:
        buyer_fingerprint = {"ip": "127.0.0.1"}

    return intent_string, merchant_id, buyer_email, buyer_fingerprint


@router.post("/run", response_model=list[Event])
async def run_agent(run_req: RunAgentRequest, request: Request) -> list[Event]:
    """ADK endpoint executing commerce intents through DeterministicPipelineRunner and returning Event list."""
    intent_string, merchant_id_str, buyer_email, buyer_fingerprint = (
        _extract_intent_and_metadata(run_req)
    )

    try:
        merchant_uuid = UUID(merchant_id_str)
    except (ValueError, TypeError):
        merchant_uuid = UUID(DEFAULT_MERCHANT_ID)

    # Resolve runner from app state if available
    runner: DeterministicPipelineRunner = getattr(
        request.app.state, "runner", None
    )
    if runner is None:
        runner = DeterministicPipelineRunner()

    context = PipelineContext(
        merchant_id=merchant_uuid,
        intent_string=intent_string,
        buyer_email=buyer_email,
        buyer_fingerprint=buyer_fingerprint,
        db_pool=runner.db_pool,
        trust_url=runner.trust_url or "http://localhost:8001",
        razorpay_adapter=runner.razorpay_adapter,
        encryption_key=runner.encryption_key,
    )

    # Execute deterministic 6-step state machine
    executed_ctx = await runner.execute(context)

    # Format pipeline output into standard ADK Event sequence
    events: list[Event] = []
    for step in executed_ctx.steps:
        events.append(
            Event(
                author="nexus_orchestrator",
                content={
                    "parts": [{"text": f"[{step.step_name}] {step.output_summary}"}]
                },
                custom_metadata={
                    "step_name": step.step_name,
                    "step_number": step.step_number,
                    "is_error": step.is_error,
                    "reason": step.reason,
                    "duration_ms": step.duration_ms,
                    "raw_data": step.raw_data,
                    "entry_hash": step.entry_hash,
                    "prev_entry_hash": step.prev_entry_hash,
                },
            )
        )

    # Terminal agent summary message
    summary_text = (
        f"Transaction {executed_ctx.final_status}: "
        + (
            executed_ctx.failure_reason
            if executed_ctx.final_status != "SUCCESS"
            else f"Order {executed_ctx.order_id} captured as payment {executed_ctx.payment_id}."
        )
    )
    events.append(
        Event(
            author="nexus_orchestrator",
            content={"parts": [{"text": summary_text}]},
            turn_complete=True,
            custom_metadata={
                "status": executed_ctx.final_status,
                "transaction_id": str(executed_ctx.transaction_id),
                "trust_score": executed_ctx.trust_score,
                "trust_decision": executed_ctx.trust_decision,
                "order_id": executed_ctx.order_id,
                "payment_id": executed_ctx.payment_id,
                "failure_reason": executed_ctx.failure_reason,
            },
        )
    )

    return events
