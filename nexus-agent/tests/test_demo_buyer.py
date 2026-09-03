"""Tests for DemoBuyerAgent and MaaS client tools (EVAL-03)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch
import httpx
import pytest

from nexus_agent.agents.demo_buyer import (
    BuyerExecutionReceipt,
    DemoBuyerAgent,
    extract_query_and_constraints,
    parse_cli_args,
)
from nexus_agent.tools.maas_client import (
    query_merchant_catalog,
    transact_with_merchant,
)


@pytest.mark.asyncio
async def test_query_merchant_catalog_success():
    """Test successful catalog query with bearer auth and params."""
    mock_payload = {
        "merchant_id": "test-merchant-01",
        "merchant_name": "Apex Electronics",
        "query": "headphones",
        "result_count": 2,
        "products": [
            {
                "id": "prod-1",
                "name": "Wireless Headphones Pro",
                "price_paise": 499900,
                "stock": 10,
                "agent_purchase_url": "http://localhost:3000/api/maas/test-merchant-01/transact",
            },
            {
                "id": "prod-2",
                "name": "Basic Wireless Headphones",
                "price_paise": 199900,
                "stock": 5,
                "agent_purchase_url": "http://localhost:3000/api/maas/test-merchant-01/transact",
            },
        ],
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = httpx.Response(
            200,
            json=mock_payload,
            request=httpx.Request("GET", "http://localhost:3000/api/maas/test-merchant-01/catalog"),
        )

        res = await query_merchant_catalog(
            merchant_id="test-merchant-01",
            query="headphones",
            max_price_paise=500000,
            in_stock=True,
            base_url="http://localhost:3000",
            token="maas_live_secret_token_123",
        )

        assert res["status"] == "SUCCESS"
        assert len(res["products"]) == 2
        assert res["merchant_id"] == "test-merchant-01"
        assert res["result_count"] == 2

        # Verify call arguments
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer maas_live_secret_token_123"
        assert kwargs["params"]["q"] == "headphones"
        assert kwargs["params"]["max_price_paise"] == 500000
        assert kwargs["params"]["in_stock"] == "true"


@pytest.mark.asyncio
async def test_query_merchant_catalog_auth_failure():
    """Test catalog query handling 401 unauthorized response."""
    error_payload = {
        "error": "UNAUTHORIZED",
        "message": "Invalid or missing MaaS Bearer token",
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = httpx.Response(
            401,
            json=error_payload,
            request=httpx.Request("GET", "http://localhost:3000/api/maas/test-merchant-01/catalog"),
        )

        res = await query_merchant_catalog(
            merchant_id="test-merchant-01",
            query="phone",
            token="invalid_token",
        )

        assert res["status"] == "ERROR"
        assert res["error_code"] == "UNAUTHORIZED"
        assert "Invalid or missing" in res["message"]
        assert res["http_status"] == 401
        assert res["products"] == []


@pytest.mark.asyncio
async def test_transact_with_merchant_success():
    """Test successful transaction execution returning captured receipt."""
    success_payload = {
        "transaction_id": "tx-success-12345",
        "status": "SUCCESS",
        "trust_score": 92.5,
        "trust_decision": "ALLOW",
        "product": {
            "id": "prod-1",
            "name": "Wireless Headphones Pro",
            "quantity": 1,
            "unit_price_paise": 499900,
            "total_amount_paise": 499900,
            "total_amount_display": "₹4,999.00",
        },
        "razorpay_order_id": "order_test_123",
        "razorpay_payment_id": "pay_test_456",
        "payment_status": "captured",
        "captured_at": "2026-09-04T02:00:00Z",
        "audit_trail": [
            {"step": "parse_intent", "decision": "VALID"},
            {"step": "resolve_catalog", "decision": "RESERVED"},
            {"step": "check_trust_graph", "decision": "ALLOW"},
            {"step": "create_razorpay_order", "decision": "CREATED"},
            {"step": "capture_razorpay_payment", "decision": "CAPTURED"},
            {"step": "log_audit_entry", "decision": "SEALED"},
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = httpx.Response(
            200,
            json=success_payload,
            request=httpx.Request("POST", "http://localhost:3000/api/maas/test-merchant-01/transact"),
        )

        res = await transact_with_merchant(
            merchant_id="test-merchant-01",
            intent="Buy 1 unit of Wireless Headphones Pro",
            buyer_email="buyer@example.com",
            ip="103.21.44.132",
            device_id="device_clean_99",
            user_agent="NexusDemoBuyer/1.0",
            upi_handle="buyer@oksbi",
            base_url="http://localhost:3000",
            token="maas_live_token_abc",
        )

        assert res["status"] == "SUCCESS"
        assert res["transaction_id"] == "tx-success-12345"
        assert res["razorpay_order_id"] == "order_test_123"
        assert res["razorpay_payment_id"] == "pay_test_456"
        assert res["trust_decision"] == "ALLOW"
        assert len(res["audit_trail"]) == 6

        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer maas_live_token_abc"
        assert kwargs["json"]["intent"] == "Buy 1 unit of Wireless Headphones Pro"
        assert kwargs["json"]["buyer"]["email"] == "buyer@example.com"
        assert kwargs["json"]["buyer"]["upi_handle"] == "buyer@oksbi"


@pytest.mark.asyncio
async def test_transact_with_merchant_denied():
    """Test transaction blocked by trust graph returning 403 DENIED."""
    denied_payload = {
        "transaction_id": "tx-denied-67890",
        "status": "DENIED",
        "trust_score": 12.0,
        "trust_decision": "DENY",
        "risk_factors": [
            "ring_member: node is confirmed member of fraud ring dev_syndicate_a1",
            "cross_merchant_penalty: 4 distinct merchants contacted in 10 minutes",
        ],
        "razorpay_order_id": None,
        "razorpay_payment_id": None,
        "message": "Transaction denied. Buyer fingerprint is associated with a known fraud ring.",
        "audit_trail": [
            {"step": "parse_intent", "decision": "VALID"},
            {"step": "resolve_catalog", "decision": "RESERVED"},
            {"step": "check_trust_graph", "decision": "DENY"},
            {"step": "rollback_catalog_stock", "decision": "ROLLED_BACK"},
            {"step": "log_audit_entry", "decision": "SEALED"},
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = httpx.Response(
            403,
            json=denied_payload,
            request=httpx.Request("POST", "http://localhost:3000/api/maas/test-merchant-01/transact"),
        )

        res = await transact_with_merchant(
            merchant_id="test-merchant-01",
            intent="Buy 1 unit of Wireless Headphones Pro",
            buyer_email="attacker@fraud.net",
            ip="198.51.100.4",
            device_id="dev_syndicate_a1",
            base_url="http://localhost:3000",
            token="maas_live_token_abc",
        )

        assert res["status"] == "DENIED"
        assert res["trust_decision"] == "DENY"
        assert res["trust_score"] == 12.0
        assert res["razorpay_order_id"] is None
        assert len(res["risk_factors"]) == 2


@pytest.mark.asyncio
async def test_demo_buyer_heuristic_cheapest():
    """Test DemoBuyerAgent heuristic shopping selecting the cheapest candidate."""
    catalog_response = {
        "merchant_id": "merchant-apex",
        "result_count": 2,
        "products": [
            {
                "id": "prod-expensive",
                "name": "Noise-Cancelling Headphones Pro",
                "price_paise": 499900,
                "price_display": "₹4,999.00",
                "stock": 10,
            },
            {
                "id": "prod-cheap",
                "name": "Budget Wireless Earbuds",
                "price_paise": 149900,
                "price_display": "₹1,499.00",
                "stock": 25,
            },
        ],
    }

    transact_response = {
        "transaction_id": "tx-cheap-success",
        "status": "SUCCESS",
        "trust_score": 95.0,
        "trust_decision": "ALLOW",
        "razorpay_order_id": "order_cheap_001",
        "razorpay_payment_id": "pay_cheap_001",
        "audit_trail": [{"step": "parse_intent"}, {"step": "log_audit_entry"}],
    }

    with patch("nexus_agent.agents.demo_buyer.query_merchant_catalog", new_callable=AsyncMock) as mock_cat:
        mock_cat.return_value = {
            "status": "SUCCESS",
            "products": catalog_response["products"],
            "result_count": 2,
        }

        with patch("nexus_agent.agents.demo_buyer.transact_with_merchant", new_callable=AsyncMock) as mock_tx:
            mock_tx.return_value = transact_response

            agent = DemoBuyerAgent(
                merchant_id="merchant-apex",
                token="maas_live_token_demo",
                verbose=False,
            )

            receipt = await agent.run("Buy the cheapest wireless headphones")

            assert receipt.success is True
            assert receipt.status == "SUCCESS"
            assert receipt.selected_product is not None
            assert receipt.selected_product["id"] == "prod-cheap"
            assert receipt.amount_paise == 149900
            assert receipt.razorpay_order_id == "order_cheap_001"
            assert receipt.razorpay_payment_id == "pay_cheap_001"
            assert receipt.trust_score == 95.0
            assert len(receipt.timeline) >= 3

            mock_tx.assert_called_once()
            _, kwargs = mock_tx.call_args
            assert "Budget Wireless Earbuds" in kwargs["intent"]


@pytest.mark.asyncio
async def test_demo_buyer_heuristic_denied():
    """Test DemoBuyerAgent handling trust gate 403 DENIED response."""
    catalog_response = {
        "status": "SUCCESS",
        "products": [
            {
                "id": "prod-1",
                "name": "Apex Pro Phone",
                "price_paise": 2999900,
                "price_display": "₹29,999.00",
                "stock": 5,
            }
        ],
    }

    transact_response = {
        "status": "DENIED",
        "transaction_id": "tx-denied-777",
        "trust_score": 15.0,
        "trust_decision": "DENY",
        "risk_factors": ["ring_member: device shared with known fraud cluster"],
        "message": "Transaction denied due to risk detection",
        "audit_trail": [{"step": "check_trust_graph", "decision": "DENY"}],
    }

    with patch("nexus_agent.agents.demo_buyer.query_merchant_catalog", new_callable=AsyncMock) as mock_cat:
        mock_cat.return_value = catalog_response

        with patch("nexus_agent.agents.demo_buyer.transact_with_merchant", new_callable=AsyncMock) as mock_tx:
            mock_tx.return_value = transact_response

            agent = DemoBuyerAgent(
                merchant_id="merchant-apex",
                token="maas_live_token_demo",
                verbose=False,
            )

            receipt = await agent.run("Buy 1 Apex Pro Phone")

            assert receipt.success is False
            assert receipt.status == "DENIED"
            assert receipt.trust_score == 15.0
            assert receipt.razorpay_order_id is None
            assert receipt.razorpay_payment_id is None
            assert "Transaction denied" in str(receipt.error_message)


def test_demo_buyer_cli_args():
    """Test CLI argument parsing with default and overridden flags."""
    # Custom args
    args = parse_cli_args([
        "--merchant", "custom-merchant-uuid",
        "--token", "custom-token-123",
        "--goal", "Buy running shoes under 3000",
        "--base-url", "http://localhost:8080",
        "--json",
    ])
    assert args.merchant_id == "custom-merchant-uuid"
    assert args.token == "custom-token-123"
    assert args.goal == "Buy running shoes under 3000"
    assert args.base_url == "http://localhost:8080"
    assert args.output_json is True

    # Default args
    defaults = parse_cli_args([])
    assert defaults.goal == "Buy the cheapest wireless headphones"
    assert defaults.base_url == "http://localhost:3000"
    assert defaults.output_json is False


def test_demo_buyer_receipt_serialization():
    """Test BuyerExecutionReceipt JSON serialization and schema validity."""
    receipt = BuyerExecutionReceipt(
        success=True,
        merchant_id="merchant-123",
        goal="Buy headphones",
        selected_product={"id": "p1", "name": "Headphones", "price_paise": 200000},
        transaction_id="tx-999",
        razorpay_order_id="order_999",
        razorpay_payment_id="pay_999",
        amount_paise=200000,
        amount_inr="₹2,000.00",
        status="SUCCESS",
        trust_score=88.5,
        audit_steps_count=6,
        timeline=["Discover: OK", "Transact: OK"],
        error_message=None,
    )

    json_str = receipt.model_dump_json(indent=2)
    parsed = json.loads(json_str)

    assert parsed["success"] is True
    assert parsed["merchant_id"] == "merchant-123"
    assert parsed["transaction_id"] == "tx-999"
    assert parsed["amount_paise"] == 200000
    assert parsed["amount_inr"] == "₹2,000.00"
    assert parsed["status"] == "SUCCESS"
    assert parsed["trust_score"] == 88.5
    assert parsed["audit_steps_count"] == 6
    assert len(parsed["timeline"]) == 2


def test_extract_query_and_constraints():
    """Test natural language goal keyword and constraint extraction."""
    q1, c1 = extract_query_and_constraints("Buy the cheapest wireless headphones from Apex Electronics")
    assert "wireless headphones" in q1.lower()
    assert c1["sort_by"] == "cheapest"

    q2, c2 = extract_query_and_constraints("Purchase premium shoes under 5000")
    assert "shoes" in q2.lower()
    assert c2["sort_by"] == "expensive"
    assert c2["max_price_paise"] == 500000
