"""Tests for deterministic 6-step pipeline state machine runner with halting and rollback (ORCH-02, ORCH-04, ORCH-05)."""

from unittest.mock import patch, MagicMock
from uuid import UUID, uuid4
import httpx
import pytest

from nexus_agent.exceptions import RazorpayAdapterError
from nexus_agent.pipeline.runner import DeterministicPipelineRunner
from nexus_agent.pipeline.state import PipelineContext, StepName
from nexus_agent.razorpay_adapter import RazorpayClientAdapter
from nexus_db.audit import verify_audit_chain


class SimulatedPipelinePool:
    """In-memory asyncpg pool simulator modeling product stock and audit persistence."""

    def __init__(self, initial_products: list[dict]):
        self.products = {str(p["id"]): dict(p) for p in initial_products}
        self.audit_entries: list[tuple] = []
        self.transaction_updates: list[tuple] = []

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
                        return dict(p)
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

        # 3. Stock check on shortfall
        if "SELECT stock FROM products WHERE id = $1" in query:
            prod_id, merchant_id = args
            p = self.products.get(str(prod_id))
            return {"stock": p["stock"] if p else 0}

        # 4. Compensatory rollback increment
        if "SET stock = stock + $1" in query:
            qty, prod_id = args
            p = self.products.get(str(prod_id))
            if p:
                p["stock"] += qty
                return {"stock": p["stock"]}
            return None

        return None

    async def execute(self, query: str, *args):
        if "INSERT INTO audit_entries" in query:
            self.audit_entries.append(args)
        elif "UPDATE transactions" in query:
            self.transaction_updates.append(args)
        return "UPDATE 1"


@pytest.fixture
def test_setup():
    merchant_id = UUID("00000000-0000-0000-0000-000000000001")
    product_id = UUID("00000000-0000-0000-0000-000000000002")
    products = [
        {
            "id": product_id,
            "merchant_id": merchant_id,
            "name": "Nexus Secure Router",
            "description": "Hardware-encrypted zero-trust secure edge router",
            "price_paise": 499900,
            "stock": 10,
        }
    ]
    pool = SimulatedPipelinePool(products)
    adapter = RazorpayClientAdapter(
        key_id="rzp_test_mock_12345",
        key_secret="sct_test_mock_secret_key_12345",
    )
    return {
        "merchant_id": merchant_id,
        "product_id": product_id,
        "pool": pool,
        "adapter": adapter,
    }


@pytest.mark.asyncio
async def test_strict_6_step_execution_success(test_setup):
    """Execute full pipeline with clean buyer (score 85); assert exactly 6 steps executed in order (1..6) and status is SUCCESS."""
    pool = test_setup["pool"]
    adapter = test_setup["adapter"]
    merchant_id = test_setup["merchant_id"]
    product_id = test_setup["product_id"]

    mock_trust_resp = httpx.Response(
        200,
        json={
            "score": 85.0,
            "decision": "ALLOW",
            "risk_factors": [],
            "graph_metrics": {"nodes_matched": 1},
        },
    )

    context = PipelineContext(
        merchant_id=merchant_id,
        intent_string="Buy 1 Nexus Secure Router",
        buyer_email="buyer@example.com",
        buyer_fingerprint={"ip": "192.168.1.50"},
        db_pool=pool,
        razorpay_adapter=adapter,
    )

    runner = DeterministicPipelineRunner()

    with patch.object(httpx.AsyncClient, "post", return_value=mock_trust_resp):
        result = await runner.execute(context)

    assert result.final_status == "SUCCESS"
    assert len(result.steps) == 6
    expected_steps = [
        StepName.PARSE_INTENT.value,
        StepName.RESOLVE_CATALOG.value,
        StepName.CHECK_TRUST_GRAPH.value,
        StepName.CREATE_RAZORPAY_ORDER.value,
        StepName.CAPTURE_RAZORPAY_PAYMENT.value,
        StepName.LOG_AUDIT_ENTRY.value,
    ]
    assert [s.step_name for s in result.steps] == expected_steps
    assert [s.step_number for s in result.steps] == [1, 2, 3, 4, 5, 6]

    # Inventory reserved and atomically decremented from 10 to 9
    assert pool.products[str(product_id)]["stock"] == 9

    # Order and payment IDs populated
    assert result.order_id is not None
    assert result.payment_id is not None
    assert result.trust_score == 85.0

    # Cryptographic SHA-256 chain is valid
    assert verify_audit_chain(result.steps) is True
    assert len(pool.audit_entries) == 6


@pytest.mark.asyncio
async def test_trust_denial_halts_before_razorpay(test_setup):
    """Execute with high-risk buyer (score 25); assert exactly 4 steps recorded (1, 2, 3, 6), zero Razorpay calls made, inventory restored, and status is DENIED."""
    pool = test_setup["pool"]
    adapter = test_setup["adapter"]
    merchant_id = test_setup["merchant_id"]
    product_id = test_setup["product_id"]

    mock_trust_resp = httpx.Response(
        200,
        json={
            "score": 25.0,
            "decision": "DENY",
            "risk_factors": ["known_fraud_network"],
            "graph_metrics": {"nodes_matched": 3},
        },
    )

    # Spy on adapter to verify zero Razorpay calls
    adapter.create_order = MagicMock(side_effect=adapter.create_order)
    adapter.capture_payment = MagicMock(side_effect=adapter.capture_payment)

    context = PipelineContext(
        merchant_id=merchant_id,
        intent_string="Buy 1 Nexus Secure Router",
        buyer_email="fraudster@darkweb.net",
        buyer_fingerprint={"ip": "10.0.0.1"},
        db_pool=pool,
        razorpay_adapter=adapter,
    )

    runner = DeterministicPipelineRunner()

    with patch.object(httpx.AsyncClient, "post", return_value=mock_trust_resp):
        result = await runner.execute(context)

    assert result.final_status == "DENIED"
    assert len(result.steps) == 4
    expected_steps = [
        StepName.PARSE_INTENT.value,
        StepName.RESOLVE_CATALOG.value,
        StepName.CHECK_TRUST_GRAPH.value,
        StepName.LOG_AUDIT_ENTRY.value,
    ]
    assert [s.step_name for s in result.steps] == expected_steps

    # Verify zero Razorpay operations occurred
    adapter.create_order.assert_not_called()
    adapter.capture_payment.assert_not_called()
    assert result.order_id is None
    assert result.payment_id is None

    # Compensatory rollback restored stock back to 10
    assert pool.products[str(product_id)]["stock"] == 10
    assert result.inventory_reserved is False

    # Audit chain verified
    assert verify_audit_chain(result.steps) is True
    assert len(pool.audit_entries) == 4


@pytest.mark.asyncio
async def test_compensatory_stock_rollback_on_payment_failure(test_setup):
    """Simulate payment capture failure at step 5; assert inventory is rolled back and status is FAILED."""
    pool = test_setup["pool"]
    adapter = test_setup["adapter"]
    merchant_id = test_setup["merchant_id"]
    product_id = test_setup["product_id"]

    mock_trust_resp = httpx.Response(
        200,
        json={
            "score": 75.0,
            "decision": "ALLOW",
            "risk_factors": [],
            "graph_metrics": {"nodes_matched": 1},
        },
    )

    # Force step 5 payment capture to fail
    adapter.capture_payment = MagicMock(
        side_effect=RazorpayAdapterError("Payment capture gateway timeout")
    )

    context = PipelineContext(
        merchant_id=merchant_id,
        intent_string="Buy 1 Nexus Secure Router",
        buyer_email="buyer@example.com",
        buyer_fingerprint={"ip": "192.168.1.50"},
        db_pool=pool,
        razorpay_adapter=adapter,
    )

    runner = DeterministicPipelineRunner()

    with patch.object(httpx.AsyncClient, "post", return_value=mock_trust_resp):
        result = await runner.execute(context)

    assert result.final_status == "FAILED"
    assert "Payment capture gateway timeout" in (result.failure_reason or "")
    assert result.order_id is not None
    assert result.payment_id is None

    # Stock was decremented at Step 2 to 9, then compensatory rollback restored to 10
    assert pool.products[str(product_id)]["stock"] == 10
    assert result.inventory_reserved is False

    # Steps executed: 1, 2, 3, 4, 5, 6
    assert len(result.steps) == 6
    assert result.steps[4].is_error is True
    assert verify_audit_chain(result.steps) is True


@pytest.mark.asyncio
async def test_insufficient_stock_halts_at_step_2(test_setup):
    """Assert insufficient inventory halts at step 2, jumps to step 6, and status is FAILED."""
    pool = test_setup["pool"]
    adapter = test_setup["adapter"]
    merchant_id = test_setup["merchant_id"]
    product_id = test_setup["product_id"]

    context = PipelineContext(
        merchant_id=merchant_id,
        intent_string="Buy 50 Nexus Secure Router",  # Available stock is only 10
        buyer_email="buyer@example.com",
        db_pool=pool,
        razorpay_adapter=adapter,
    )

    runner = DeterministicPipelineRunner()

    with patch.object(httpx.AsyncClient, "post") as mock_trust_post:
        result = await runner.execute(context)
        # Trust graph must not even be contacted
        mock_trust_post.assert_not_called()

    assert result.final_status == "FAILED"
    assert len(result.steps) == 3
    assert [s.step_name for s in result.steps] == [
        StepName.PARSE_INTENT.value,
        StepName.RESOLVE_CATALOG.value,
        StepName.LOG_AUDIT_ENTRY.value,
    ]
    assert pool.products[str(product_id)]["stock"] == 10
    assert result.inventory_reserved is False
    assert verify_audit_chain(result.steps) is True
