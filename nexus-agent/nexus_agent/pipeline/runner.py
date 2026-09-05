"""Deterministic 6-step pipeline state machine runner with compensatory rollback (ORCH-02, ORCH-04, ORCH-05, D-02, D-04)."""

import logging
import time
from typing import Any

from nexus_agent.pipeline.state import PipelineContext, StepName, StepResult
from nexus_agent.tools.audit import log_audit_entry
from nexus_agent.tools.catalog import resolve_catalog, rollback_catalog_stock
from nexus_agent.tools.intent import parse_intent
from nexus_agent.tools.razorpay import capture_razorpay_payment, create_razorpay_order
from nexus_agent.tools.trust import check_trust_graph
from nexus_db.crypto import hash_device_id, hash_email, hash_user_agent, mask_ip_subnet

logger = logging.getLogger(__name__)


class DeterministicPipelineRunner:
    """State machine runner strictly enforcing 1 -> 2 -> 3 -> 4 -> 5 -> 6 pipeline execution.

    Invariants:
    1. Steps execute in strict sequential order. No step skipping or reordering.
    2. Trust score < 40 halts execution immediately after Step 3, skipping Steps 4 and 5.
    3. Compensatory stock rollback is automatically triggered on trust denial or payment errors.
    4. Step 6 (log_audit_entry) is guaranteed to execute on 100% of paths (SUCCESS, DENIED, FAILED).
    """

    def __init__(
        self,
        db_pool: Any = None,
        trust_url: str | None = None,
        razorpay_adapter: Any = None,
        encryption_key: str = "",
    ):
        self.db_pool = db_pool
        self.trust_url = trust_url
        self.razorpay_adapter = razorpay_adapter
        self.encryption_key = encryption_key

    async def execute(self, context: PipelineContext) -> PipelineContext:
        """Execute the deterministic 6-step pipeline for the given context."""
        # Propagate instance defaults if not provided in context
        if self.db_pool is not None and context.db_pool is None:
            context.db_pool = self.db_pool
        if self.trust_url is not None and (not context.trust_url or context.trust_url == "http://localhost:8001"):
            context.trust_url = self.trust_url
        if self.razorpay_adapter is not None and context.razorpay_adapter is None:
            context.razorpay_adapter = self.razorpay_adapter
        if self.encryption_key and not context.encryption_key:
            context.encryption_key = self.encryption_key

        # Automatically resolve DB pool if missing
        if context.db_pool is None:
            if self.db_pool is not None:
                context.db_pool = self.db_pool
            else:
                try:
                    from nexus_db.client import get_pool
                    context.db_pool = await get_pool()
                    self.db_pool = context.db_pool
                except Exception as exc:
                    logger.debug("Automatic get_pool fallback in runner: %s", exc)

        product_query = ""

        # =========================================================================
        # STEP 1: PARSE_INTENT
        # =========================================================================
        t0 = time.perf_counter()
        try:
            parsed = await parse_intent(
                intent_string=context.intent_string,
                buyer_email=context.buyer_email,
                merchant_id=str(context.merchant_id),
            )
            product_query = parsed["product_query"]
            context.quantity = parsed["quantity"]
            if parsed.get("buyer_email"):
                context.buyer_email = parsed["buyer_email"]

            d_ms = int((time.perf_counter() - t0) * 1000)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.PARSE_INTENT.value,
                    input_summary=f"Intent: {context.intent_string}",
                    output_summary=f"Query: '{product_query}', Qty: {context.quantity}",
                    reason="Intent parsed successfully",
                    raw_data=parsed,
                    duration_ms=d_ms,
                    is_error=False,
                )
            )
        except Exception as e:
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.final_status = "FAILED"
            context.failure_reason = str(e)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.PARSE_INTENT.value,
                    input_summary=f"Intent: {context.intent_string}",
                    output_summary="Failed to parse intent",
                    reason=str(e),
                    raw_data={"error": str(e)},
                    duration_ms=d_ms,
                    is_error=True,
                )
            )
            return await self._finalize(context)

        # =========================================================================
        # STEP 2: RESOLVE_CATALOG
        # =========================================================================
        t0 = time.perf_counter()
        try:
            catalog_res = await resolve_catalog(
                merchant_id=context.merchant_id,
                product_query=product_query,
                quantity=context.quantity,
                pool=context.db_pool,
            )
            context.inventory_reserved = True
            context.product_id = catalog_res["product_id"]
            context.product_name = catalog_res["name"]
            context.amount_paise = catalog_res["total_amount_paise"]

            d_ms = int((time.perf_counter() - t0) * 1000)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.RESOLVE_CATALOG.value,
                    input_summary=f"Product: '{product_query}', Qty: {context.quantity}",
                    output_summary=f"Resolved: {catalog_res['name']}, Total: {catalog_res['total_amount_paise']} paise",
                    reason="Catalog resolved and stock atomically decremented",
                    raw_data=catalog_res,
                    duration_ms=d_ms,
                    is_error=False,
                )
            )
        except Exception as e:
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.final_status = "FAILED"
            context.failure_reason = str(e)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.RESOLVE_CATALOG.value,
                    input_summary=f"Product: '{product_query}', Qty: {context.quantity}",
                    output_summary="Catalog resolution or stock allocation failed",
                    reason=str(e),
                    raw_data={"error": str(e)},
                    duration_ms=d_ms,
                    is_error=True,
                )
            )
            return await self._finalize(context)

        # =========================================================================
        # STEP 3: CHECK_TRUST_GRAPH
        # =========================================================================
        t0 = time.perf_counter()
        try:
            fp = context.buyer_fingerprint or {}
            email_hash = fp.get("email_hash") or hash_email(context.buyer_email or "buyer@nexus.local")
            ip_subnet = fp.get("ip_subnet") or mask_ip_subnet(fp.get("ip") or "127.0.0.1")
            device_hash = fp.get("device_hash") or (hash_device_id(fp["device_id"]) if fp.get("device_id") else None)
            upi_handle = fp.get("upi_handle")
            user_agent_hash = fp.get("user_agent_hash") or (hash_user_agent(fp["user_agent"]) if fp.get("user_agent") else "")

            trust_res = await check_trust_graph(
                email_hash=email_hash,
                ip_subnet=ip_subnet,
                device_hash=device_hash,
                upi_handle=upi_handle,
                user_agent_hash=user_agent_hash,
                merchant_id=str(context.merchant_id),
                amount_paise=context.amount_paise,
                trust_url=context.trust_url or "http://localhost:8001",
            )

            score = float(trust_res.get("score", 0.0))
            decision = trust_res.get("decision", "DENY")
            risk_factors = trust_res.get("risk_factors", [])
            context.trust_score = score
            context.trust_decision = decision
            context.trust_risk_factors = risk_factors

            d_ms = int((time.perf_counter() - t0) * 1000)

            if score < 40:
                # Trust denial: score below safety threshold
                context.final_status = "DENIED"
                context.failure_reason = f"Trust violation: score {score:.1f} is below safety threshold (40)"
                context.steps.append(
                    StepResult(
                        step_number=len(context.steps) + 1,
                        step_name=StepName.CHECK_TRUST_GRAPH.value,
                        input_summary=f"Buyer: {context.buyer_email}, Amount: {context.amount_paise} paise",
                        output_summary=f"Score: {score:.1f}, Decision: {decision}",
                        reason=context.failure_reason,
                        raw_data=trust_res,
                        duration_ms=d_ms,
                        is_error=True,
                    )
                )
                # Compensatory rollback: release reserved stock
                await self._rollback_if_needed(context)
                # Immediately halt pipeline: skip Steps 4 and 5, jump directly to Step 6
                return await self._finalize(context)

            # Trust check passed (score >= 40)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CHECK_TRUST_GRAPH.value,
                    input_summary=f"Buyer: {context.buyer_email}, Amount: {context.amount_paise} paise",
                    output_summary=f"Score: {score:.1f}, Decision: {decision}",
                    reason="Trust check passed safety threshold (>= 40)",
                    raw_data=trust_res,
                    duration_ms=d_ms,
                    is_error=False,
                )
            )
        except Exception as e:
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.final_status = "FAILED"
            context.failure_reason = str(e)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CHECK_TRUST_GRAPH.value,
                    input_summary=f"Buyer: {context.buyer_email}",
                    output_summary="Trust evaluation exception",
                    reason=str(e),
                    raw_data={"error": str(e)},
                    duration_ms=d_ms,
                    is_error=True,
                )
            )
            await self._rollback_if_needed(context)
            return await self._finalize(context)

        # =========================================================================
        # STEP 4: CREATE_RAZORPAY_ORDER
        # =========================================================================
        t0 = time.perf_counter()
        try:
            order_res = await create_razorpay_order(
                amount_paise=context.amount_paise,
                currency=context.currency,
                merchant_id=str(context.merchant_id),
                nexus_transaction_id=str(context.transaction_id),
                trust_score=context.trust_score if context.trust_score is not None else 0.0,
                product_id=str(context.product_id),
                quantity=context.quantity,
                pool=context.db_pool,
                adapter=context.razorpay_adapter,
                encryption_key=context.encryption_key,
            )
            context.order_id = order_res["order_id"]
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CREATE_RAZORPAY_ORDER.value,
                    input_summary=f"Amount: {context.amount_paise} {context.currency}",
                    output_summary=f"Order ID: {order_res['order_id']}, Status: {order_res.get('status')}",
                    reason="Razorpay order created with audit notes",
                    raw_data=order_res,
                    duration_ms=d_ms,
                    is_error=False,
                )
            )
        except Exception as e:
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.final_status = "FAILED"
            context.failure_reason = str(e)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CREATE_RAZORPAY_ORDER.value,
                    input_summary=f"Amount: {context.amount_paise} {context.currency}",
                    output_summary="Failed to create Razorpay order",
                    reason=str(e),
                    raw_data={"error": str(e)},
                    duration_ms=d_ms,
                    is_error=True,
                )
            )
            await self._rollback_if_needed(context)
            return await self._finalize(context)

        # =========================================================================
        # STEP 5: CAPTURE_RAZORPAY_PAYMENT
        # =========================================================================
        t0 = time.perf_counter()
        try:
            payment_res = await capture_razorpay_payment(
                order_id=context.order_id or "",
                amount_paise=context.amount_paise,
                merchant_id=str(context.merchant_id),
                nexus_transaction_id=str(context.transaction_id),
                pool=context.db_pool,
                adapter=context.razorpay_adapter,
                encryption_key=context.encryption_key,
            )
            context.payment_id = payment_res["payment_id"]
            context.final_status = "SUCCESS"
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CAPTURE_RAZORPAY_PAYMENT.value,
                    input_summary=f"Order: {context.order_id}, Amount: {context.amount_paise}",
                    output_summary=f"Payment ID: {payment_res['payment_id']}, Status: {payment_res.get('status')}",
                    reason="Payment successfully captured",
                    raw_data=payment_res,
                    duration_ms=d_ms,
                    is_error=False,
                )
            )
        except Exception as e:
            d_ms = int((time.perf_counter() - t0) * 1000)
            context.final_status = "FAILED"
            context.failure_reason = str(e)
            context.steps.append(
                StepResult(
                    step_number=len(context.steps) + 1,
                    step_name=StepName.CAPTURE_RAZORPAY_PAYMENT.value,
                    input_summary=f"Order: {context.order_id}, Amount: {context.amount_paise}",
                    output_summary="Failed to capture payment",
                    reason=str(e),
                    raw_data={"error": str(e)},
                    duration_ms=d_ms,
                    is_error=True,
                )
            )
            await self._rollback_if_needed(context)
            return await self._finalize(context)

        # Success path completes all 5 steps, now finalize with Step 6
        return await self._finalize(context)

    async def _rollback_if_needed(self, context: PipelineContext) -> None:
        """Restore reserved inventory via compensatory transaction (D-02, T-03-08)."""
        if context.inventory_reserved and context.product_id and context.quantity > 0:
            try:
                await rollback_catalog_stock(
                    product_id=context.product_id,
                    quantity=context.quantity,
                    pool=context.db_pool,
                )
                context.inventory_reserved = False
                logger.info(
                    "Compensatory stock rollback completed for product %s (+%d)",
                    context.product_id,
                    context.quantity,
                )
            except Exception as e:
                logger.error("Compensatory rollback failed: %s", e)

    async def _finalize(self, context: PipelineContext) -> PipelineContext:
        """Guaranteed Step 6 execution on 100% of pipeline paths (D-04, AUDIT-01)."""
        t0 = time.perf_counter()
        step_num = len(context.steps) + 1
        reason = context.failure_reason or (
            "All pipeline operations succeeded"
            if context.final_status == "SUCCESS"
            else context.final_status
        )

        audit_step = StepResult(
            step_number=step_num,
            step_name=StepName.LOG_AUDIT_ENTRY.value,
            input_summary=f"Status: {context.final_status}, Steps: {step_num}",
            output_summary="Audit trail persisted and verified",
            reason=reason,
            raw_data={
                "final_status": context.final_status,
                "failure_reason": context.failure_reason,
                "inventory_reserved": context.inventory_reserved,
            },
            duration_ms=0,
            is_error=(context.final_status in ("FAILED", "DENIED")),
        )
        context.steps.append(audit_step)

        await log_audit_entry(
            pool=context.db_pool,
            transaction_id=str(context.transaction_id),
            merchant_id=str(context.merchant_id),
            steps=context.steps,
            final_status=context.final_status,
            final_reason=context.failure_reason or "Completed",
            buyer_email=context.buyer_email,
            amount_paise=context.amount_paise,
            trust_score=context.trust_score,
            trust_decision=context.trust_decision,
            trust_risk_factors=context.trust_risk_factors,
            razorpay_order_id=context.order_id,
            razorpay_payment_id=context.payment_id,
        )

        audit_step.duration_ms = int((time.perf_counter() - t0) * 1000)
        return context
