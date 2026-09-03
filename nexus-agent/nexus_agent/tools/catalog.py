"""Merchant catalog resolution and inventory management tools (ORCH-04, D-02)."""

import logging
from typing import Any
from uuid import UUID

from nexus_agent.exceptions import ProductNotFoundError, StockError

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


async def resolve_catalog(
    merchant_id: str | UUID,
    product_query: str,
    quantity: int,
    pool: Any,
) -> dict[str, Any]:
    """Resolve merchant product from catalog and atomically decrement inventory.

    Executes a single-statement conditional SQL update (stock = stock - N WHERE stock >= N)
    to guarantee zero inventory leaks or overselling under concurrent requests (T-03-03).
    """
    if quantity < 1:
        raise StockError(f"Quantity must be at least 1, got {quantity}.")

    merchant_uuid = _to_uuid(merchant_id)
    search_pattern = f"%{product_query.strip()}%"

    async with _AcquireHelper(pool) as conn:
        # 1. Query matching product for this merchant
        select_sql = (
            "SELECT id, name, price_paise, stock FROM products "
            "WHERE merchant_id = $1 AND (name ILIKE $2 OR description ILIKE $2) "
            "LIMIT 1"
        )
        product_row = await conn.fetchrow(select_sql, merchant_uuid, search_pattern)
        if not product_row:
            raise ProductNotFoundError(
                f"No product matching '{product_query}' found for merchant {merchant_id}."
            )

        product_id = product_row["id"]
        product_name = product_row["name"]

        # 2. Atomic conditional decrement directly in PostgreSQL
        decrement_sql = """
        UPDATE products
        SET stock = stock - $1, updated_at = clock_timestamp()
        WHERE id = $2 AND merchant_id = $3 AND stock >= $1
        RETURNING id, name, price_paise, stock + $1 AS stock_before, stock AS stock_after;
        """
        updated_row = await conn.fetchrow(
            decrement_sql, quantity, product_id, merchant_uuid
        )

        if not updated_row:
            # Shortage: retrieve current stock level for clear diagnostic error message
            stock_sql = "SELECT stock FROM products WHERE id = $1 AND merchant_id = $2"
            current_row = await conn.fetchrow(stock_sql, product_id, merchant_uuid)
            available_stock = current_row["stock"] if current_row else 0
            raise StockError(
                f"Insufficient stock for product '{product_name}'. "
                f"Requested {quantity}, available {available_stock}."
            )

        price_paise = int(updated_row["price_paise"])
        total_amount_paise = price_paise * quantity

        return {
            "product_id": str(updated_row["id"]),
            "name": updated_row["name"],
            "price_per_unit_paise": price_paise,
            "total_amount_paise": total_amount_paise,
            "quantity": quantity,
            "stock_before": int(updated_row["stock_before"]),
            "stock_after": int(updated_row["stock_after"]),
        }


async def rollback_catalog_stock(
    product_id: str | UUID,
    quantity: int,
    pool: Any,
) -> int:
    """Compensatory increment rollback for failed or aborted downstream transactions (D-02).

    Restores inventory reserved by resolve_catalog if payment fails or trust gate denies.
    """
    if quantity < 1:
        raise StockError(f"Rollback quantity must be at least 1, got {quantity}.")

    product_uuid = _to_uuid(product_id)
    rollback_sql = """
    UPDATE products
    SET stock = stock + $1, updated_at = clock_timestamp()
    WHERE id = $2
    RETURNING stock;
    """

    async with _AcquireHelper(pool) as conn:
        row = await conn.fetchrow(rollback_sql, quantity, product_uuid)
        if not row:
            raise ProductNotFoundError(
                f"Product {product_id} not found for stock rollback."
            )

        stock_val = row["stock"] if hasattr(row, "__getitem__") else row
        return int(stock_val)
