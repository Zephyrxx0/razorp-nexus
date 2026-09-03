"""Hybrid natural language intent parser tool (parse_intent) with Gemini 2.0 Flash and regex fallback."""

import json
import logging
import os
import re
from typing import Any
from pydantic import BaseModel, Field
from nexus_agent.exceptions import IntentValidationError
from nexus_db.crypto import normalize_email

logger = logging.getLogger(__name__)

BUY_PATTERN = re.compile(
    r"^(?:buy|purchase|order|get|need)\s+(?:(-?\d+)\s+)?(.+?)(?:\s+for\s+([\w\.-]+@[\w\.-]+\.\w+))?$",
    re.IGNORECASE,
)
FALLBACK_PATTERN = re.compile(
    r"^(?:(-?\d+)\s+)?(.+?)(?:\s+for\s+([\w\.-]+@[\w\.-]+\.\w+))?$",
    re.IGNORECASE,
)


class ParsedIntentResponse(BaseModel):
    """Structured extraction schema for commerce intent parsing."""

    product_query: str = Field(description="Name or description of product to purchase")
    quantity: int = Field(default=1, description="Number of units requested (1 to 100)")
    buyer_email: str = Field(default="", description="Buyer email address if provided")
    confidence: float = Field(default=1.0, description="Extraction confidence score")


def _parse_intent_regex(intent_string: str, fallback_email: str = "") -> dict[str, Any]:
    """Deterministic regex extraction fallback for standard commerce patterns."""
    text = intent_string.strip()
    if not text:
        raise IntentValidationError("Intent string cannot be empty.")

    match = BUY_PATTERN.match(text)
    if not match:
        match = FALLBACK_PATTERN.match(text)

    if match:
        qty_str, product, email_str = match.groups()
        quantity = int(qty_str) if qty_str is not None else 1
        product_query = product.strip() if product else ""
        raw_email = email_str or fallback_email or ""
    else:
        quantity = 1
        product_query = text
        raw_email = fallback_email or ""

    if not product_query:
        raise IntentValidationError("Could not extract product query from intent.")

    if quantity <= 0 or quantity > 100:
        raise IntentValidationError(
            f"Invalid quantity {quantity}. Must be between 1 and 100."
        )

    normalized_email = normalize_email(raw_email) if raw_email else ""
    return {
        "product_query": product_query,
        "quantity": quantity,
        "buyer_email": normalized_email,
        "confidence": 0.95,
    }


def _parse_intent_gemini(
    intent_string: str, buyer_email: str = "", google_api_key: str = ""
) -> dict[str, Any]:
    """Extract structured intent using Gemini 2.0 Flash."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=google_api_key)
        prompt = (
            f"Extract target product, quantity, and buyer email from this user request: "
            f"'{intent_string}'. Fallback buyer email is '{buyer_email}'."
        )
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ParsedIntentResponse,
                system_instruction=(
                    "You are an e-commerce intent parser. Extract product_query, numeric quantity "
                    "(default to 1 if not specified), and buyer_email. Set confidence between 0.0 and 1.0."
                ),
            ),
        )
        data = json.loads(response.text)
        return data
    except Exception as e:
        logger.warning("Gemini intent extraction failed, falling back to regex: %s", e)
        raise


async def parse_intent(
    intent_string: str,
    buyer_email: str = "",
    merchant_id: str = "",
    google_api_key: str = "",
) -> dict[str, Any]:
    """Parse natural language intent into structured product query, quantity, and buyer email.

    Uses Gemini 2.0 Flash when API key is present and offline mode is disabled;
    falls back seamlessly to deterministic regex parsing.
    Strictly validates quantity bounds [1, 100] and normalizes buyer email.
    """
    result: dict[str, Any] | None = None
    offline = os.environ.get("NEXUS_OFFLINE_TEST", "").lower() in ("1", "true", "yes")

    if google_api_key and not offline:
        try:
            result = _parse_intent_gemini(
                intent_string, buyer_email=buyer_email, google_api_key=google_api_key
            )
        except Exception:
            result = None

    if result is None:
        result = _parse_intent_regex(intent_string, fallback_email=buyer_email)

    try:
        qty = int(result.get("quantity", 1))
    except (TypeError, ValueError):
        raise IntentValidationError(
            f"Invalid quantity {result.get('quantity')}. Must be an integer between 1 and 100."
        )

    if qty <= 0 or qty > 100:
        raise IntentValidationError(
            f"Invalid quantity {qty}. Must be between 1 and 100."
        )

    product_query = str(result.get("product_query", "")).strip()
    if not product_query:
        raise IntentValidationError("Extracted product query is empty.")

    email = result.get("buyer_email") or buyer_email or ""
    normalized_email = normalize_email(str(email)) if email else ""
    confidence = float(result.get("confidence", 1.0))

    return {
        "product_query": product_query,
        "quantity": qty,
        "buyer_email": normalized_email,
        "confidence": confidence,
    }
