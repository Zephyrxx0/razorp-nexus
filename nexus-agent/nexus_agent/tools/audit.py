"""Hash-chained append-only audit logging and database synchronization tool (AUDIT-01, AUDIT-02, PRD §15)."""

from datetime import datetime, timezone
import json
import logging
from typing import Any
from uuid import UUID
import uuid

from nexus_db.audit import (
    compute_canonical_preimage,
    compute_entry_hash,
    verify_audit_chain,
)
from nexus_db.sanitize import sanitize_audit_data

logger = logging.getLogger(__name__)


def _to_uuid(val: Any) -> Any:
    """Safely convert string to UUID if valid format, otherwise return unchanged."""
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except (ValueError, TypeError, AttributeError):
        return val


class _AcquireHelper:
    """Context manager helper supporting both asyncpg Pool and connection objects."""

    def __init__(self, pool_or_conn: Any):
        self.pool_or_conn = pool_or_conn
        self._ctx = None

    async def __aenter__(self):
        if self.pool_or_conn is None:
            try:
                from nexus_db.client import get_pool
                self.pool_or_conn = await get_pool()
            except Exception:
                pass
        if hasattr(self.pool_or_conn, "acquire"):
            self._ctx = self.pool_or_conn.acquire()
            if hasattr(self._ctx, "__aenter__"):
                return await self._ctx.__aenter__()
            return self._ctx
        return self.pool_or_conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._ctx and hasattr(self._ctx, "__aexit__"):
            return await self._ctx.__aexit__(exc_type, exc_val, exc_tb)
        return None


async def log_audit_entry(
    pool: Any = None,
    transaction_id: str | UUID | None = None,
    merchant_id: str | UUID | None = None,
    steps: list[Any] | None = None,
    final_status: str = "PENDING",
    final_reason: str = "",
    buyer_email: str | None = None,
    amount_paise: int = 0,
    trust_score: float | None = None,
    trust_decision: str | None = None,
    trust_risk_factors: list[str] | None = None,
    razorpay_order_id: str | None = None,
    razorpay_payment_id: str | None = None,
    *,
    nexus_transaction_id: str | None = None,
) -> dict[str, Any]:
    """Persist cryptographic SHA-256 hash-chained audit trails into audit_entries and sync transactions (AUDIT-01, AUDIT-02).

    Maintains sequential chain:
    - Step index 0: prev_entry_hash = "GENESIS"
    - Step index i > 0: prev_entry_hash = steps[i-1].entry_hash
    - Canonical preimage: prev_entry_hash|transaction_id|step_number|step_name|input_summary|output_summary|reason|is_error
    - Hash: SHA-256 digest of canonical preimage
    - Sanitizes PII and secrets prior to persistence
    - Verifies audit chain continuity via verify_audit_chain
    """
    # Normalize flexible parameter signatures
    if pool is not None and not hasattr(pool, "acquire") and not hasattr(pool, "execute") and not hasattr(pool, "fetchrow"):
        if isinstance(transaction_id, list):
            actual_tx_id = pool
            actual_steps = transaction_id
            actual_status = merchant_id if isinstance(merchant_id, str) else "PENDING"
            actual_reason = steps if isinstance(steps, str) else ""
            pool = None
            transaction_id = actual_tx_id
            steps = actual_steps
            final_status = actual_status
            final_reason = actual_reason
        elif transaction_id is None:
            transaction_id = pool
            pool = None

    if nexus_transaction_id and not transaction_id:
        transaction_id = nexus_transaction_id

    tx_id_str = str(transaction_id) if transaction_id else str(uuid.uuid4())
    steps_list = steps or []

    persisted_entries: list[dict[str, Any]] = []
    prev_hash = "GENESIS"

    for idx, step in enumerate(steps_list):
        step_number = idx + 1
        if isinstance(step, dict):
            step_dict = dict(step)
        else:
            step_dict = {
                "step_number": getattr(step, "step_number", step_number),
                "step_name": getattr(step, "step_name", ""),
                "input_summary": getattr(step, "input_summary", ""),
                "output_summary": getattr(step, "output_summary", ""),
                "reason": getattr(step, "reason", ""),
                "raw_data": getattr(step, "raw_data", {}),
                "duration_ms": getattr(step, "duration_ms", 0),
                "is_error": getattr(step, "is_error", False),
            }

        step_dict["transaction_id"] = tx_id_str
        step_dict["step_number"] = step_number
        step_dict["prev_entry_hash"] = prev_hash

        # Sanitize sensitive fields in raw_data (secrets, credit cards, PII)
        raw_data = step_dict.get("raw_data") or {}
        sanitized_raw = sanitize_audit_data(raw_data)
        step_dict["raw_data"] = sanitized_raw

        # Compute deterministic entry_hash using canonical preimage
        entry_hash = compute_entry_hash(step_dict)
        step_dict["entry_hash"] = entry_hash

        # Propagate hashes and transaction_id back to input step objects/dicts
        if hasattr(step, "prev_entry_hash"):
            step.prev_entry_hash = prev_hash
        if hasattr(step, "entry_hash"):
            step.entry_hash = entry_hash
        if hasattr(step, "transaction_id"):
            step.transaction_id = tx_id_str
        if hasattr(step, "raw_data"):
            step.raw_data = sanitized_raw
        if isinstance(step, dict):
            step["prev_entry_hash"] = prev_hash
            step["entry_hash"] = entry_hash
            step["transaction_id"] = tx_id_str
            step["raw_data"] = sanitized_raw

        prev_hash = entry_hash
        persisted_entries.append(step_dict)

    # Cryptographically verify the chain
    is_valid_chain = verify_audit_chain(persisted_entries)
    if not is_valid_chain and persisted_entries:
        logger.error("Audit chain integrity check failed for transaction %s", tx_id_str)

    # Persist to database if pool is provided
    if pool is not None:
        async with _AcquireHelper(pool) as conn:
            # 1. Insert audit entries
            insert_sql = """
            INSERT INTO audit_entries (
                id, transaction_id, step_name, step_number, timestamp, duration_ms,
                input_summary, output_summary, reason, raw_data, is_error,
                prev_entry_hash, entry_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13);
            """
            for entry in persisted_entries:
                entry_id = _to_uuid(entry.get("id")) or uuid.uuid4()
                raw_json = json.dumps(entry.get("raw_data") or {})
                ts = entry.get("timestamp") or datetime.now(timezone.utc)
                duration_ms = int(entry.get("duration_ms", 0))
                is_error = bool(entry.get("is_error", False))

                try:
                    await conn.execute(
                        insert_sql,
                        entry_id,
                        _to_uuid(tx_id_str),
                        entry.get("step_name", ""),
                        entry.get("step_number", 1),
                        ts,
                        duration_ms,
                        entry.get("input_summary", ""),
                        entry.get("output_summary", ""),
                        entry.get("reason", ""),
                        raw_json,
                        is_error,
                        entry.get("prev_entry_hash", "GENESIS"),
                        entry.get("entry_hash", ""),
                    )
                except Exception as exc:
                    if "ForeignKeyViolationError" in type(exc).__name__ or "foreign key" in str(exc).lower():
                        ensure_sql = """
                        INSERT INTO transactions (
                            id, merchant_id, intent_raw, quantity, amount_paise, currency, buyer_fingerprint, status
                        ) VALUES ($1, $2, $3, 1, $4, 'INR', $5::jsonb, 'PENDING')
                        ON CONFLICT (id) DO NOTHING;
                        """
                        fp_json = json.dumps({"email": buyer_email} if buyer_email else {})
                        safe_amt = max(1, int(amount_paise or 1))
                        m_id = _to_uuid(merchant_id) if merchant_id else _to_uuid("00000000-0000-0000-0000-000000000001")
                        await conn.execute(
                            ensure_sql,
                            _to_uuid(tx_id_str),
                            m_id,
                            final_reason or f"Tx {tx_id_str}",
                            safe_amt,
                            fp_json,
                        )
                        await conn.execute(
                            insert_sql,
                            entry_id,
                            _to_uuid(tx_id_str),
                            entry.get("step_name", ""),
                            entry.get("step_number", 1),
                            ts,
                            duration_ms,
                            entry.get("input_summary", ""),
                            entry.get("output_summary", ""),
                            entry.get("reason", ""),
                            raw_json,
                            is_error,
                            entry.get("prev_entry_hash", "GENESIS"),
                            entry.get("entry_hash", ""),
                        )
                    else:
                        raise

            # 2. Update transactions table
            update_sql = """
            UPDATE transactions
            SET status = $1,
                trust_score = $2,
                trust_decision = $3,
                trust_risk_factors = $4,
                razorpay_order_id = $5,
                razorpay_payment_id = $6,
                resolved_at = clock_timestamp(),
                failure_reason = $7
            WHERE id = $8;
            """
            await conn.execute(
                update_sql,
                final_status,
                trust_score,
                trust_decision,
                trust_risk_factors or [],
                razorpay_order_id,
                razorpay_payment_id,
                final_reason or None,
                _to_uuid(tx_id_str),
            )

    return {
        "transaction_id": tx_id_str,
        "entries_logged": len(persisted_entries),
        "final_status": final_status,
        "is_valid_chain": is_valid_chain,
        "entries": persisted_entries,
    }
