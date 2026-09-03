"""MaaS client tools for autonomous buyer agents (EVAL-03, PRD §9.2, D-03)."""

from __future__ import annotations

import logging
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)


async def query_merchant_catalog(
    merchant_id: str,
    query: str = "",
    max_price_paise: Optional[int] = None,
    in_stock: bool = True,
    base_url: str = "http://localhost:3000",
    token: str = "",
) -> dict[str, Any]:
    """Query a merchant's product catalog via the Nexus MaaS API.

    Args:
        merchant_id: UUID or identifier of the merchant.
        query: Natural language product search string or keyword.
        max_price_paise: Maximum price filter in integer paise.
        in_stock: Filter only in-stock items (default True).
        base_url: Root URL for the Next.js MaaS API gateway.
        token: MaaS Bearer authentication token.

    Returns:
        Structured dictionary containing query results and products list,
        or error details on failure.
    """
    endpoint = f"{base_url.rstrip('/')}/api/maas/{merchant_id}/catalog"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    params: dict[str, Any] = {
        "in_stock": "true" if in_stock else "false",
    }
    if query:
        params["q"] = query
    if max_price_paise is not None:
        params["max_price_paise"] = max_price_paise

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(endpoint, params=params, headers=headers)

            try:
                data = response.json()
            except Exception:
                data = {}

            if response.status_code == 200:
                products = data.get("products", [])
                result_count = data.get("result_count", len(products))
                return {
                    "status": "SUCCESS",
                    "merchant_id": data.get("merchant_id", merchant_id),
                    "merchant_name": data.get("merchant_name", ""),
                    "query": data.get("query", query),
                    "result_count": result_count,
                    "count": result_count,
                    "products": products,
                }
            else:
                error_code = data.get("error", f"HTTP_{response.status_code}")
                message = data.get("message", response.text)
                logger.warning(
                    "MaaS catalog query failed [%d]: %s - %s",
                    response.status_code,
                    error_code,
                    message,
                )
                return {
                    "status": "ERROR",
                    "error_code": error_code,
                    "message": message,
                    "http_status": response.status_code,
                    "products": [],
                    "result_count": 0,
                    "count": 0,
                }
    except httpx.RequestError as exc:
        logger.error("MaaS catalog connection failed: %s", exc)
        return {
            "status": "ERROR",
            "error_code": "CONNECTION_ERROR",
            "message": f"Connection to {endpoint} failed: {exc}",
            "products": [],
            "result_count": 0,
            "count": 0,
        }


async def transact_with_merchant(
    merchant_id: str,
    intent: str,
    buyer_email: str,
    ip: str = "127.0.0.1",
    device_id: str = "nexus_buyer_device_01",
    user_agent: str = "NexusDemoBuyer/1.0",
    upi_handle: Optional[str] = None,
    base_url: str = "http://localhost:3000",
    token: str = "",
) -> dict[str, Any]:
    """Execute a purchase transaction against a merchant via the Nexus MaaS API.

    Args:
        merchant_id: UUID or identifier of the merchant.
        intent: Natural language purchase intent string (e.g. 'Buy 1 Noise-Cancelling Headphones Pro').
        buyer_email: Buyer's contact email address.
        ip: Buyer client IP address for risk scoring and telemetry.
        device_id: Buyer device fingerprint or identifier.
        user_agent: Buyer client User-Agent header string.
        upi_handle: Optional UPI Virtual Payment Address (VPA).
        base_url: Root URL for the Next.js MaaS API gateway.
        token: MaaS Bearer authentication token.

    Returns:
        Structured outcome dictionary containing transaction ID, payment status,
        trust decision, and audit trail.
    """
    endpoint = f"{base_url.rstrip('/')}/api/maas/{merchant_id}/transact"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "intent": intent,
        "buyer": {
            "email": buyer_email,
            "ip": ip,
            "device_id": device_id,
            "user_agent": user_agent,
            "upi_handle": upi_handle,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(endpoint, json=payload, headers=headers)

            try:
                data = response.json()
            except Exception:
                data = {"raw_text": response.text}

            if response.status_code == 200:
                if "status" not in data:
                    data["status"] = "SUCCESS"
                return data

            if response.status_code == 403:
                if "status" not in data:
                    data["status"] = "DENIED"
                return data

            if response.status_code == 409:
                if "status" not in data:
                    data["status"] = "INSUFFICIENT_STOCK"
                return data

            if response.status_code == 422:
                if "status" not in data:
                    data["status"] = "INTENT_PARSE_FAILED"
                return data

            # 401, 500, 502, 504 or other errors
            if "status" not in data:
                data["status"] = "FAILED"
            if "error" not in data and "error_code" not in data:
                data["error_code"] = f"HTTP_{response.status_code}"
            return data
    except httpx.RequestError as exc:
        logger.error("MaaS transact connection failed: %s", exc)
        return {
            "status": "FAILED",
            "error": "CONNECTION_ERROR",
            "error_code": "CONNECTION_ERROR",
            "message": f"Connection to {endpoint} failed: {exc}",
            "audit_trail": [],
        }
