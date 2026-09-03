"""Tests for the dual-mode Razorpay client adapter and mock implementation."""

import pytest
from nexus_agent.exceptions import RazorpayAdapterError
from nexus_agent.razorpay_adapter import MockRazorpayClient, RazorpayClientAdapter


def test_mock_client_order_creation():
    """Verify mock client generates conforming order objects in integer paise."""
    client = MockRazorpayClient()
    notes = {
        "nexus_transaction_id": "00000000-0000-0000-0000-000000000001",
        "trust_score": "85.0",
        "product_id": "00000000-0000-0000-0000-000000000002",
        "quantity": "2",
    }
    order = client.order.create({
        "amount": 999800,
        "currency": "INR",
        "receipt": "rcpt_test_12345",
        "notes": notes,
    })

    assert order["id"].startswith("order_test_")
    assert len(order["id"]) == len("order_test_") + 16
    assert order["amount"] == 999800
    assert order["currency"] == "INR"
    assert order["status"] == "created"
    assert order["notes"] == notes

    # Verify fetch
    fetched = client.order.fetch(order["id"])
    assert fetched["id"] == order["id"]
    assert fetched["amount"] == 999800


def test_mock_client_payment_capture():
    """Verify synthetic and explicit payment capture in MockRazorpayClient."""
    client = MockRazorpayClient()
    order = client.order.create({
        "amount": 499900,
        "currency": "INR",
        "receipt": "rcpt_capture_test",
        "notes": {"tx_id": "test"},
    })

    # Synthetic capture without external payment_id
    synthetic = client.payment.create_synthetic_capture(order["id"], 499900)
    assert synthetic["id"].startswith("pay_test_")
    assert len(synthetic["id"]) == len("pay_test_") + 16
    assert synthetic["status"] == "captured"
    assert synthetic["amount"] == 499900
    assert synthetic["currency"] == "INR"
    assert synthetic["order_id"] == order["id"]

    # Verify order status was updated
    updated_order = client.order.fetch(order["id"])
    assert updated_order["status"] == "paid"
    assert updated_order["amount_paid"] == 499900

    # Explicit capture with existing payment ID
    explicit = client.payment.capture("pay_explicit_123", 499900)
    assert explicit["id"] == "pay_explicit_123"
    assert explicit["status"] == "captured"


def test_adapter_mode_switching():
    """Verify RazorpayClientAdapter switches modes and isolates network in mock mode."""
    # Instantiation with mock_mode=True
    adapter = RazorpayClientAdapter(
        key_id="rzp_test_arbitrary",
        key_secret="secret_arbitrary",
        mock_mode=True,
    )
    assert adapter.mock_mode is True
    assert isinstance(adapter.client, MockRazorpayClient)

    # Automatic mock mode via rzp_test_mock_ prefix
    auto_adapter = RazorpayClientAdapter(
        key_id="rzp_test_mock_12345",
        key_secret="secret_arbitrary",
        mock_mode=False,
    )
    assert auto_adapter.mock_mode is True
    assert isinstance(auto_adapter.client, MockRazorpayClient)

    # Perform full order and payment capture lifecycle through adapter
    order = adapter.create_order(
        amount_paise=250000,
        currency="INR",
        receipt="rcpt_adapter_test",
        notes={"product": "Router"},
    )
    assert order["id"].startswith("order_test_")
    assert order["amount"] == 250000

    payment = adapter.capture_payment(order_id=order["id"], amount_paise=250000)
    assert payment["id"].startswith("pay_test_")
    assert payment["status"] == "captured"
    assert payment["amount"] == 250000


def test_invalid_amount_rejection():
    """Verify rejection of non-positive or non-integer amounts."""
    adapter = RazorpayClientAdapter(
        key_id="rzp_test_mock_123",
        key_secret="secret",
        mock_mode=True,
    )

    with pytest.raises((ValueError, RazorpayAdapterError)):
        adapter.create_order(amount_paise=0)

    with pytest.raises((ValueError, RazorpayAdapterError)):
        adapter.create_order(amount_paise=-500)

    with pytest.raises((ValueError, RazorpayAdapterError)):
        adapter.capture_payment(order_id="order_test_123", amount_paise=0)

    with pytest.raises((ValueError, RazorpayAdapterError)):
        adapter.capture_payment(order_id="order_test_123", amount_paise=-100)


def test_order_fetch_nonexistent():
    """Verify fetching nonexistent order raises RazorpayAdapterError."""
    client = MockRazorpayClient()
    with pytest.raises(RazorpayAdapterError) as exc_info:
        client.order.fetch("order_test_nonexistent")
    assert "Order not found" in str(exc_info.value)
