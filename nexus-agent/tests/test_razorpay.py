"""Tests for Razorpay order creation and payment capture tools (RZP-01, RZP-02)."""

from unittest.mock import MagicMock
from uuid import uuid4
import pytest
from nexus_agent.razorpay_adapter import RazorpayClientAdapter
from nexus_agent.tools.razorpay import capture_razorpay_payment, create_razorpay_order


@pytest.fixture
def mock_adapter():
    """Provides a functional mock adapter for test-mode operations."""
    return RazorpayClientAdapter(
        key_id="rzp_test_mock_secret",
        key_secret="mock_secret_key",
        mock_mode=True,
    )


@pytest.mark.asyncio
async def test_create_order_integer_paise_and_notes(mock_adapter):
    """Verify order creation passes integer paise 499900 and notes contains all required metadata (RZP-01)."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())
    trust_score = 78.5
    amount_paise = 499900
    quantity = 1

    order = await create_razorpay_order(
        amount_paise=amount_paise,
        currency="INR",
        merchant_id=merchant_id,
        nexus_transaction_id=tx_id,
        trust_score=trust_score,
        product_id=product_id,
        quantity=quantity,
        adapter=mock_adapter,
    )

    assert order["order_id"].startswith("order_test_")
    assert order["amount_paise"] == amount_paise
    assert order["currency"] == "INR"
    assert order["status"] == "created"

    # Verify notes in adapter client
    created_order = mock_adapter.client.orders[order["order_id"]]
    assert created_order["amount"] == 499900
    assert created_order["notes"]["nexus_transaction_id"] == tx_id
    assert created_order["notes"]["trust_score"] == str(trust_score)
    assert created_order["notes"]["product_id"] == product_id
    assert created_order["notes"]["quantity"] == str(quantity)


@pytest.mark.asyncio
async def test_capture_payment_test_mode(mock_adapter):
    """Verify payment capture against order returns pay_test_<hex> and status captured (RZP-02)."""
    tx_id = str(uuid4())
    merchant_id = str(uuid4())
    product_id = str(uuid4())
    amount_paise = 499900

    # 1. Create order
    order = await create_razorpay_order(
        amount_paise=amount_paise,
        currency="INR",
        merchant_id=merchant_id,
        nexus_transaction_id=tx_id,
        trust_score=75.0,
        product_id=product_id,
        quantity=1,
        adapter=mock_adapter,
    )

    # 2. Capture payment
    payment = await capture_razorpay_payment(
        order_id=order["order_id"],
        amount_paise=amount_paise,
        merchant_id=merchant_id,
        nexus_transaction_id=tx_id,
        adapter=mock_adapter,
    )

    assert payment["payment_id"].startswith("pay_test_")
    assert payment["order_id"] == order["order_id"]
    assert payment["amount_paise"] == amount_paise
    assert payment["status"] == "captured"
    assert "captured_at" in payment


@pytest.mark.asyncio
async def test_create_order_with_db_credentials_lookup(test_merchant_data, test_settings):
    """Verify order creation retrieves credentials from database and decrypts secret when adapter is None."""
    merchant_id = test_merchant_data["id"]
    tx_id = str(uuid4())
    product_id = str(uuid4())

    class SimulatedMerchantPool:
        def acquire(self):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

        async def fetchrow(self, query: str, *args):
            if "SELECT razorpay_key_id, razorpay_key_secret FROM merchants" in query:
                return {
                    "razorpay_key_id": test_merchant_data["razorpay_key_id"],
                    "razorpay_key_secret": test_merchant_data["razorpay_key_secret"],
                }
            return None

    pool = SimulatedMerchantPool()

    order = await create_razorpay_order(
        amount_paise=299900,
        currency="INR",
        merchant_id=str(merchant_id),
        nexus_transaction_id=tx_id,
        trust_score=65.0,
        product_id=product_id,
        quantity=1,
        pool=pool,
        encryption_key=test_settings.encryption_key,
    )

    assert order["order_id"].startswith("order_test_")
    assert order["amount_paise"] == 299900
    assert order["status"] == "created"
