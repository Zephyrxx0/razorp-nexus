"""Tests for the RING-03 Defense-in-Depth programmatic trust gate in Razorpay order creation."""

from unittest.mock import MagicMock
from uuid import uuid4
import pytest
from nexus_agent.exceptions import TrustViolationError
from nexus_agent.razorpay_adapter import RazorpayClientAdapter
from nexus_agent.tools.razorpay import create_razorpay_order


@pytest.fixture
def mock_adapter():
    """Provides a mocked RazorpayClientAdapter to verify zero invocation on gate violation."""
    adapter = MagicMock(spec=RazorpayClientAdapter)
    return adapter


@pytest.fixture
def real_mock_adapter():
    """Provides an in-memory RazorpayClientAdapter in mock mode for successful order tests."""
    return RazorpayClientAdapter(
        key_id="rzp_test_mock_secret",
        key_secret="mock_secret_key",
        mock_mode=True,
    )


@pytest.mark.asyncio
async def test_create_order_blocks_score_below_40(mock_adapter):
    """Verify trust_score 39.9 triggers TrustViolationError and adapter is never touched (RING-03)."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())

    with pytest.raises(TrustViolationError) as exc_info:
        await create_razorpay_order(
            amount_paise=499900,
            currency="INR",
            merchant_id=merchant_id,
            nexus_transaction_id=tx_id,
            trust_score=39.9,
            product_id=product_id,
            quantity=1,
            adapter=mock_adapter,
        )

    assert "Trust violation: score 39.9 is below safety threshold (40)" in str(exc_info.value)
    mock_adapter.create_order.assert_not_called()


@pytest.mark.asyncio
async def test_create_order_blocks_score_zero(mock_adapter):
    """Verify trust_score 0.0 unconditionally halts and raises TrustViolationError."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())

    with pytest.raises(TrustViolationError) as exc_info:
        await create_razorpay_order(
            amount_paise=499900,
            currency="INR",
            merchant_id=merchant_id,
            nexus_transaction_id=tx_id,
            trust_score=0.0,
            product_id=product_id,
            quantity=1,
            adapter=mock_adapter,
        )

    assert "Trust violation: score 0.0 is below safety threshold (40)" in str(exc_info.value)
    mock_adapter.create_order.assert_not_called()


@pytest.mark.asyncio
async def test_create_order_permits_score_40_boundary(real_mock_adapter):
    """Verify boundary condition trust_score 40.0 permits order creation without exception."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())

    order = await create_razorpay_order(
        amount_paise=499900,
        currency="INR",
        merchant_id=merchant_id,
        nexus_transaction_id=tx_id,
        trust_score=40.0,
        product_id=product_id,
        quantity=1,
        adapter=real_mock_adapter,
    )

    assert order is not None
    assert order["order_id"].startswith("order_test_")
    assert order["amount_paise"] == 499900
    assert order["currency"] == "INR"
    assert order["status"] == "created"


@pytest.mark.asyncio
async def test_create_order_permits_score_85(real_mock_adapter):
    """Verify high trust score (85.0) proceeds smoothly through the gate."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())

    order = await create_razorpay_order(
        amount_paise=129900,
        currency="INR",
        merchant_id=merchant_id,
        nexus_transaction_id=tx_id,
        trust_score=85.0,
        product_id=product_id,
        quantity=2,
        adapter=real_mock_adapter,
    )

    assert order is not None
    assert order["order_id"].startswith("order_test_")
    assert order["amount_paise"] == 129900
    assert order["status"] == "created"
