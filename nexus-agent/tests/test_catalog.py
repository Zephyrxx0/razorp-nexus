"""Tests for merchant catalog resolution and atomic inventory decrement (ORCH-04, D-02)."""

from uuid import UUID
import pytest
from nexus_agent.exceptions import ProductNotFoundError, StockError
from nexus_agent.tools.catalog import resolve_catalog, rollback_catalog_stock


class SimulatedCatalogPool:
    """In-memory asyncpg pool simulator modeling PostgreSQL row locking and atomic conditionals."""

    def __init__(self, initial_products: list[dict]):
        self.products = {str(p["id"]): dict(p) for p in initial_products}

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None

    async def fetchrow(self, query: str, *args):
        # 1. Product resolution query
        if "SELECT id, name, price_paise, stock FROM products" in query:
            merchant_id, pattern = args
            clean_pattern = pattern.replace("%", "").lower()
            for p in self.products.values():
                if str(p["merchant_id"]) == str(merchant_id):
                    if (
                        clean_pattern in p["name"].lower()
                        or clean_pattern in p.get("description", "").lower()
                    ):
                        return {
                            "id": p["id"],
                            "name": p["name"],
                            "price_paise": p["price_paise"],
                            "stock": p["stock"],
                        }
            return None

        # 2. Atomic conditional decrement
        if "SET stock = stock - $1" in query:
            qty, prod_id, merchant_id = args
            p = self.products.get(str(prod_id))
            if p and str(p["merchant_id"]) == str(merchant_id) and p["stock"] >= qty:
                stock_before = p["stock"]
                p["stock"] -= qty
                return {
                    "id": p["id"],
                    "name": p["name"],
                    "price_paise": p["price_paise"],
                    "stock_before": stock_before,
                    "stock_after": p["stock"],
                }
            return None

        # 3. Stock inspection on failure
        if "SELECT stock FROM products WHERE id = $1" in query:
            prod_id, merchant_id = args
            p = self.products.get(str(prod_id))
            if p and str(p["merchant_id"]) == str(merchant_id):
                return {"stock": p["stock"]}
            return None

        # 4. Compensatory rollback
        if "SET stock = stock + $1" in query:
            qty, prod_id = args
            p = self.products.get(str(prod_id))
            if p:
                p["stock"] += qty
                return {"stock": p["stock"]}
            return None

        raise NotImplementedError(f"Unhandled query in SimulatedCatalogPool: {query}")


@pytest.fixture
def catalog_pool(test_product_data):
    """Provides a fresh simulated catalog database pool with test_product_data seeded."""
    return SimulatedCatalogPool([test_product_data])


@pytest.mark.asyncio
async def test_resolve_catalog_exact_match_decrements_stock(catalog_pool, test_merchant_data, test_product_data):
    """Verify exact match decrements stock atomically and returns formatted dictionary."""
    merchant_id = test_merchant_data["id"]
    quantity = 2
    initial_stock = test_product_data["stock"]

    result = await resolve_catalog(
        merchant_id=merchant_id,
        product_query="Nexus Secure Router",
        quantity=quantity,
        pool=catalog_pool,
    )

    assert result["product_id"] == str(test_product_data["id"])
    assert result["name"] == "Nexus Secure Router"
    assert result["price_per_unit_paise"] == test_product_data["price_paise"]
    assert result["total_amount_paise"] == test_product_data["price_paise"] * quantity
    assert result["quantity"] == quantity
    assert result["stock_before"] == initial_stock
    assert result["stock_after"] == initial_stock - quantity

    # Verify inventory state in simulator is updated
    assert catalog_pool.products[str(test_product_data["id"])]["stock"] == initial_stock - quantity


@pytest.mark.asyncio
async def test_resolve_catalog_insufficient_stock_raises_stock_error(catalog_pool, test_merchant_data, test_product_data):
    """Verify requesting more stock than available triggers StockError without decrementing."""
    merchant_id = test_merchant_data["id"]
    available_stock = test_product_data["stock"]
    excessive_quantity = available_stock + 5

    with pytest.raises(StockError) as exc_info:
        await resolve_catalog(
            merchant_id=merchant_id,
            product_query="Nexus Secure Router",
            quantity=excessive_quantity,
            pool=catalog_pool,
        )

    err_msg = str(exc_info.value)
    assert "Insufficient stock" in err_msg
    assert f"Requested {excessive_quantity}" in err_msg
    assert f"available {available_stock}" in err_msg

    # Verify inventory remained untouched
    assert catalog_pool.products[str(test_product_data["id"])]["stock"] == available_stock


@pytest.mark.asyncio
async def test_resolve_catalog_unknown_product_raises_not_found(catalog_pool, test_merchant_data):
    """Verify searching for a nonexistent product raises ProductNotFoundError."""
    merchant_id = test_merchant_data["id"]

    with pytest.raises(ProductNotFoundError) as exc_info:
        await resolve_catalog(
            merchant_id=merchant_id,
            product_query="Nonexistent Quantum Supercomputer",
            quantity=1,
            pool=catalog_pool,
        )

    assert "No product matching 'Nonexistent Quantum Supercomputer'" in str(exc_info.value)


@pytest.mark.asyncio
async def test_compensatory_rollback_restores_inventory(catalog_pool, test_merchant_data, test_product_data):
    """Verify rollback_catalog_stock increments inventory by the rolled-back quantity (D-02)."""
    merchant_id = test_merchant_data["id"]
    product_id = test_product_data["id"]
    quantity = 3
    initial_stock = test_product_data["stock"]

    # 1. Decrement via resolve_catalog
    res = await resolve_catalog(
        merchant_id=merchant_id,
        product_query="Router",
        quantity=quantity,
        pool=catalog_pool,
    )
    assert res["stock_after"] == initial_stock - quantity
    assert catalog_pool.products[str(product_id)]["stock"] == initial_stock - quantity

    # 2. Compensatory rollback on downstream failure
    restored_stock = await rollback_catalog_stock(
        product_id=product_id,
        quantity=quantity,
        pool=catalog_pool,
    )

    assert restored_stock == initial_stock
    assert catalog_pool.products[str(product_id)]["stock"] == initial_stock


@pytest.mark.asyncio
async def test_resolve_catalog_invalid_quantity(catalog_pool, test_merchant_data):
    """Verify quantity < 1 raises StockError."""
    merchant_id = test_merchant_data["id"]
    with pytest.raises(StockError):
        await resolve_catalog(
            merchant_id=merchant_id,
            product_query="Router",
            quantity=0,
            pool=catalog_pool,
        )
