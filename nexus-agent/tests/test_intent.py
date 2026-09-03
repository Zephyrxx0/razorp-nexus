"""Tests for the hybrid natural language intent parser tool (ORCH-03, D-01)."""

import time
from unittest.mock import patch
import pytest
from nexus_agent.exceptions import IntentValidationError
from nexus_agent.tools.intent import parse_intent, _parse_intent_regex


@pytest.mark.asyncio
async def test_parse_intent_regex_standard_patterns():
    """Verify regex extraction parses standard commerce intent patterns and defaults quantity to 1."""
    # Pattern 1: Buy <N> <Product>
    res1 = await parse_intent("Buy 2 Nitro Cold Brew")
    assert res1["product_query"] == "Nitro Cold Brew"
    assert res1["quantity"] == 2
    assert res1["buyer_email"] == ""

    # Pattern 2: Purchase 1 <Product>
    res2 = await parse_intent("Purchase 1 Quantum Keyboard")
    assert res2["product_query"] == "Quantum Keyboard"
    assert res2["quantity"] == 1

    # Pattern 3: Order <Product> (quantity omitted defaults to 1)
    res3 = await parse_intent("Order Nexus Router")
    assert res3["product_query"] == "Nexus Router"
    assert res3["quantity"] == 1

    # Pattern 4: Get <Product> with fallback buyer email
    res4 = await parse_intent("Get YubiKey 5C", buyer_email="user@example.com")
    assert res4["product_query"] == "YubiKey 5C"
    assert res4["quantity"] == 1
    assert res4["buyer_email"] == "user@example.com"


@pytest.mark.asyncio
async def test_parse_intent_bounds_rejection():
    """Verify out-of-bounds quantities (<= 0 or > 100) raise IntentValidationError (T-03-01)."""
    # Boundary: 0
    with pytest.raises(IntentValidationError) as exc:
        await parse_intent("Buy 0 Nitro Cold Brew")
    assert "between 1 and 100" in str(exc.value)

    # Boundary: negative
    with pytest.raises(IntentValidationError) as exc:
        await parse_intent("Buy -5 Nitro Cold Brew")
    assert "between 1 and 100" in str(exc.value)

    # Boundary: 101
    with pytest.raises(IntentValidationError) as exc:
        await parse_intent("Buy 101 Nitro Cold Brew")
    assert "between 1 and 100" in str(exc.value)

    # Extreme: 500
    with pytest.raises(IntentValidationError) as exc:
        await parse_intent("Order 500 Quantum Keyboards")
    assert "between 1 and 100" in str(exc.value)


@pytest.mark.asyncio
async def test_parse_intent_email_normalization():
    """Verify email normalization (lowercased and whitespace trimmed) per D-14."""
    res = await parse_intent("BUY 1 item FOR Buyer@Example.COM  ")
    assert res["product_query"] == "item"
    assert res["quantity"] == 1
    assert res["buyer_email"] == "buyer@example.com"

    # Also test with separate buyer_email argument
    res2 = await parse_intent("Purchase 3 Cables", buyer_email="  Alice.Smith@Domain.ORG\n")
    assert res2["buyer_email"] == "alice.smith@domain.org"


@pytest.mark.asyncio
async def test_parse_intent_gemini_fallback():
    """Verify graceful fallback to regex parser when Gemini inference fails."""
    with patch("nexus_agent.tools.intent._parse_intent_gemini") as mock_gemini:
        mock_gemini.side_effect = RuntimeError("Gemini API network timeout")

        res = await parse_intent(
            intent_string="Purchase 2 Security Tokens for test@example.com",
            google_api_key="mock_api_key",
        )

        mock_gemini.assert_called_once()
        assert res["product_query"] == "Security Tokens"
        assert res["quantity"] == 2
        assert res["buyer_email"] == "test@example.com"


@pytest.mark.asyncio
async def test_parse_intent_gemini_success():
    """Verify Gemini structured output parsing when API returns valid response."""
    mock_response = {
        "product_query": "AI Accelerator Board",
        "quantity": 4,
        "buyer_email": "engineer@ai.corp",
        "confidence": 0.98,
    }
    with patch("nexus_agent.tools.intent._parse_intent_gemini", return_value=mock_response):
        res = await parse_intent(
            intent_string="I need 4 AI Accelerator Boards for engineer@ai.corp",
            google_api_key="valid_api_key",
        )
        assert res["product_query"] == "AI Accelerator Board"
        assert res["quantity"] == 4
        assert res["buyer_email"] == "engineer@ai.corp"
        assert res["confidence"] == 0.98


def test_parse_intent_latency_budget():
    """Verify regex fallback parser execution completes well within the 5ms budget."""
    start = time.perf_counter()
    for _ in range(100):
        _parse_intent_regex("Buy 2 Nitro Cold Brew for test@nexus.local")
    total_time = time.perf_counter() - start
    avg_latency_ms = (total_time / 100) * 1000

    # Must complete in < 5ms per parse (typically < 0.1ms)
    assert avg_latency_ms < 5.0, f"Average latency {avg_latency_ms:.2f}ms exceeded 5ms budget"


@pytest.mark.asyncio
async def test_parse_intent_empty_string_rejection():
    """Verify empty or whitespace-only intent strings are rejected."""
    with pytest.raises(IntentValidationError):
        await parse_intent("")

    with pytest.raises(IntentValidationError):
        await parse_intent("   \n\t  ")
