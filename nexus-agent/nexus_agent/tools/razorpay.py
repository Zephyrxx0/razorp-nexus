"""Razorpay Order Creation and Payment Capture tools with Defense-in-Depth Trust Gate (RING-03, RZP-01, RZP-02)."""

from datetime import datetime, timezone
import logging
import os
from typing import Any
from uuid import UUID

from nexus_agent.exceptions import TrustViolationError
from nexus_agent.razorpay_adapter import RazorpayClientAdapter
from nexus_db.crypto import decrypt_secret

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
        if self.pool_or_conn is None:
            raise RuntimeError(
                "Database pool is not initialized or PostgreSQL is unreachable. "
                "Ensure PostgreSQL is running on port 5432."
            )
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


async def _resolve_adapter(
    merchant_id: str | UUID,
    pool: Any,
    adapter: RazorpayClientAdapter | None = None,
    encryption_key: str = "",
) -> RazorpayClientAdapter:
    """Resolve or instantiate RazorpayClientAdapter from merchant DB credentials."""
    if adapter is not None:
        return adapter

    if pool is None:
        try:
            from nexus_db.client import get_pool
            pool = await get_pool()
        except Exception:
            pass

    if pool is None:
        raise ValueError("Either adapter or pool must be provided.")

    merchant_uuid = _to_uuid(merchant_id)
    async with _AcquireHelper(pool) as conn:
        row = await conn.fetchrow(
            "SELECT razorpay_key_id, razorpay_key_secret FROM merchants WHERE id = $1",
            merchant_uuid,
        )
        if not row:
            raise ValueError(f"Merchant {merchant_id} not found.")
        key_id = row["razorpay_key_id"]
        enc_secret = row["razorpay_key_secret"]

    enc_key = encryption_key or os.environ.get("ENCRYPTION_KEY", "")
    try:
        decrypted_secret = decrypt_secret(enc_secret, enc_key) if enc_key else enc_secret
    except Exception:
        decrypted_secret = enc_secret

    return RazorpayClientAdapter(key_id=key_id, key_secret=decrypted_secret)


async def create_razorpay_order(
    amount_paise: int,
    currency: str,
    merchant_id: str,
    nexus_transaction_id: str,
    trust_score: float | int,
    product_id: str,
    quantity: int,
    pool: Any = None,
    adapter: RazorpayClientAdapter | None = None,
    encryption_key: str = "",
) -> dict[str, Any]:
    """Create a Razorpay order in integer paise guarded by the RING-03 defense-in-depth gate.

    RING-03 Defense-in-Depth Gate:
    Evaluated programmatically before any network or gateway calls.
    Unconditionally raises TrustViolationError if trust_score < 40.
    """
    # 1. Programmatic Defense-in-Depth Gate (RING-03)
    if trust_score < 40:
        logger.warning(
            "RING-03 Defense-in-Depth gate triggered: trust_score %s < 40. Order blocked.",
            trust_score,
        )
        raise TrustViolationError(
            f"Trust violation: score {trust_score} is below safety threshold (40). "
            "Razorpay order creation blocked."
        )

    # 2. Resolve adapter & credentials
    active_adapter = await _resolve_adapter(
        merchant_id=merchant_id,
        pool=pool,
        adapter=adapter,
        encryption_key=encryption_key,
    )

    # 3. Create order with attached audit notes (RZP-01)
    receipt_tag = str(nexus_transaction_id).replace("-", "")[:16]
    notes = {
        "nexus_transaction_id": str(nexus_transaction_id),
        "trust_score": str(trust_score),
        "product_id": str(product_id),
        "quantity": str(quantity),
    }

    order = active_adapter.create_order(
        amount_paise=amount_paise,
        currency=currency or "INR",
        receipt=f"rcpt_{receipt_tag}",
        notes=notes,
    )

    return {
        "order_id": order["id"],
        "amount_paise": order["amount"],
        "currency": order["currency"],
        "status": order["status"],
        "receipt": order.get("receipt"),
    }


async def capture_razorpay_payment(
    order_id: str,
    amount_paise: int,
    merchant_id: str,
    nexus_transaction_id: str,
    pool: Any = None,
    adapter: RazorpayClientAdapter | None = None,
    encryption_key: str = "",
    payment_id: str | None = None,
) -> dict[str, Any]:
    """Capture payment against an authorized order (RZP-02).

    Returns payment capture record with payment ID, order ID, captured amount, and ISO UTC timestamp.
    """
    active_adapter = await _resolve_adapter(
        merchant_id=merchant_id,
        pool=pool,
        adapter=adapter,
        encryption_key=encryption_key,
    )

    res = active_adapter.capture_payment(
        order_id=order_id,
        amount_paise=amount_paise,
        payment_id=payment_id,
    )

    return {
        "payment_id": res["id"],
        "order_id": order_id,
        "amount_paise": res["amount"],
        "status": res["status"],
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
