"""Trust Graph HTTP client tool with soft-fail fallback (ORCH-05 Client, PRD §16)."""

import logging
from typing import Any
import httpx

logger = logging.getLogger(__name__)

DEFAULT_TRUST_URL = "http://localhost:8001"


def _fallback_soft_fail() -> dict[str, Any]:
    """Provide conservative soft-fail response on network disruption or timeout (PRD §16)."""
    return {
        "score": 50.0,
        "decision": "REVIEW",
        "risk_factors": ["trust_service_unavailable"],
        "graph_metrics": {
            "nodes_matched": 0,
            "known_fraud_neighbors_1hop": 0,
            "known_fraud_neighbors_2hop": 0,
            "cross_merchant_count": 0,
            "velocity_last_60min": 0,
        },
        "score_breakdown": {
            "base_score": 50.0,
            "final_score": 50.0,
        },
    }


async def check_trust_graph(
    email_hash: str,
    ip_subnet: str,
    device_hash: str | None,
    upi_handle: str | None,
    user_agent_hash: str,
    merchant_id: str,
    amount_paise: int,
    trust_url: str = DEFAULT_TRUST_URL,
    timeout_seconds: float = 0.5,
) -> dict[str, Any]:
    """Query Trust Graph microservice on port 8001 to compute buyer reputation score.

    Applies a strict 500ms SLA timeout. On timeout, connection refusal, or internal server error,
    soft-fails gracefully to score 50.0 (REVIEW) per PRD §16 so transactions are not
    spuriously aborted, but high-value privileges (ALLOW) are withheld.
    """
    payload = {
        "merchant_id": str(merchant_id),
        "amount_paise": amount_paise,
        "buyer_fingerprint": {
            "email_hash": email_hash,
            "ip_subnet": ip_subnet,
            "device_hash": device_hash,
            "upi_handle": upi_handle,
            "user_agent_hash": user_agent_hash,
        },
    }

    endpoint = f"{trust_url.rstrip('/')}/trust/score"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, json=payload)
            if response.status_code == 200:
                data = response.json()
                return data
            else:
                logger.warning(
                    "Trust Graph returned unexpected HTTP %d: %s. Initiating soft-fail.",
                    response.status_code,
                    response.text,
                )
                return _fallback_soft_fail()
    except (httpx.TimeoutException, httpx.ConnectError, httpx.RequestError) as exc:
        logger.warning(
            "Trust Graph communication failed (%s: %s). Soft-failing to score 50 (REVIEW).",
            type(exc).__name__,
            exc,
        )
        return _fallback_soft_fail()
    except Exception as exc:
        logger.error(
            "Unexpected error during trust evaluation: %s. Soft-failing to REVIEW.",
            exc,
        )
        return _fallback_soft_fail()
