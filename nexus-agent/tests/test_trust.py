"""Tests for Trust Graph client integration with soft-fail fallback (ORCH-05 Client, PRD §16)."""

from unittest.mock import patch
from uuid import uuid4
import httpx
import pytest
from nexus_agent.tools.trust import check_trust_graph


@pytest.fixture
def sample_fingerprint():
    return {
        "email_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "ip_subnet": "192.168.1.0/24",
        "device_hash": "a1b2c3d4e5f67890",
        "upi_handle": "buyer@upi",
        "user_agent_hash": "b855e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852",
    }


@pytest.mark.asyncio
async def test_check_trust_graph_allow_response(sample_fingerprint):
    """Verify HTTP 200 response with score 88.0 ALLOW is correctly parsed and returned."""
    mock_payload = {
        "score": 88.0,
        "decision": "ALLOW",
        "risk_factors": [],
        "graph_metrics": {
            "nodes_matched": 1,
            "known_fraud_neighbors_1hop": 0,
            "known_fraud_neighbors_2hop": 0,
            "cross_merchant_count": 1,
            "velocity_last_60min": 1,
        },
        "score_breakdown": {
            "base_score": 100.0,
            "reputation_bonus": 5.0,
            "final_score": 88.0,
        },
    }

    mock_resp = httpx.Response(200, json=mock_payload)

    with patch.object(httpx.AsyncClient, "post", return_value=mock_resp) as mock_post:
        res = await check_trust_graph(
            email_hash=sample_fingerprint["email_hash"],
            ip_subnet=sample_fingerprint["ip_subnet"],
            device_hash=sample_fingerprint["device_hash"],
            upi_handle=sample_fingerprint["upi_handle"],
            user_agent_hash=sample_fingerprint["user_agent_hash"],
            merchant_id=str(uuid4()),
            amount_paise=499900,
        )

        mock_post.assert_called_once()
        assert res["score"] == 88.0
        assert res["decision"] == "ALLOW"
        assert res["risk_factors"] == []
        assert res["graph_metrics"]["nodes_matched"] == 1


@pytest.mark.asyncio
async def test_check_trust_graph_deny_response(sample_fingerprint):
    """Verify HTTP 200 response with score 22.0 DENY is correctly parsed and returned."""
    mock_payload = {
        "score": 22.0,
        "decision": "DENY",
        "risk_factors": ["known_fraud_neighbors_1hop", "high_velocity"],
        "graph_metrics": {
            "nodes_matched": 4,
            "known_fraud_neighbors_1hop": 2,
            "known_fraud_neighbors_2hop": 5,
            "cross_merchant_count": 6,
            "velocity_last_60min": 15,
        },
        "score_breakdown": {
            "base_score": 100.0,
            "fraud_neighbor_penalty": -50.0,
            "velocity_penalty": -28.0,
            "final_score": 22.0,
        },
    }

    mock_resp = httpx.Response(200, json=mock_payload)

    with patch.object(httpx.AsyncClient, "post", return_value=mock_resp) as mock_post:
        res = await check_trust_graph(
            email_hash=sample_fingerprint["email_hash"],
            ip_subnet=sample_fingerprint["ip_subnet"],
            device_hash=sample_fingerprint["device_hash"],
            upi_handle=sample_fingerprint["upi_handle"],
            user_agent_hash=sample_fingerprint["user_agent_hash"],
            merchant_id=str(uuid4()),
            amount_paise=499900,
        )

        mock_post.assert_called_once()
        assert res["score"] == 22.0
        assert res["decision"] == "DENY"
        assert "known_fraud_neighbors_1hop" in res["risk_factors"]
        assert res["graph_metrics"]["known_fraud_neighbors_1hop"] == 2


@pytest.mark.asyncio
async def test_check_trust_graph_timeout_soft_fail(sample_fingerprint):
    """Verify request timing out after 500ms triggers graceful soft-fail to score 50.0 (REVIEW)."""
    with patch.object(
        httpx.AsyncClient, "post", side_effect=httpx.TimeoutException("Read timed out")
    ):
        res = await check_trust_graph(
            email_hash=sample_fingerprint["email_hash"],
            ip_subnet=sample_fingerprint["ip_subnet"],
            device_hash=sample_fingerprint["device_hash"],
            upi_handle=sample_fingerprint["upi_handle"],
            user_agent_hash=sample_fingerprint["user_agent_hash"],
            merchant_id=str(uuid4()),
            amount_paise=499900,
        )

        assert res["score"] == 50.0
        assert res["decision"] == "REVIEW"
        assert "trust_service_unavailable" in res["risk_factors"]
        assert res["graph_metrics"]["nodes_matched"] == 0
        assert res["score_breakdown"]["final_score"] == 50.0


@pytest.mark.asyncio
async def test_check_trust_graph_connection_error_soft_fail(sample_fingerprint):
    """Verify microservice connection refusal triggers graceful soft-fail to score 50.0."""
    with patch.object(
        httpx.AsyncClient, "post", side_effect=httpx.ConnectError("Connection refused")
    ):
        res = await check_trust_graph(
            email_hash=sample_fingerprint["email_hash"],
            ip_subnet=sample_fingerprint["ip_subnet"],
            device_hash=sample_fingerprint["device_hash"],
            upi_handle=sample_fingerprint["upi_handle"],
            user_agent_hash=sample_fingerprint["user_agent_hash"],
            merchant_id=str(uuid4()),
            amount_paise=499900,
        )

        assert res["score"] == 50.0
        assert res["decision"] == "REVIEW"
        assert "trust_service_unavailable" in res["risk_factors"]


@pytest.mark.asyncio
async def test_check_trust_graph_server_error_soft_fail(sample_fingerprint):
    """Verify HTTP 500 internal server error triggers graceful soft-fail to score 50.0."""
    mock_resp = httpx.Response(500, text="Internal Server Error")
    with patch.object(httpx.AsyncClient, "post", return_value=mock_resp):
        res = await check_trust_graph(
            email_hash=sample_fingerprint["email_hash"],
            ip_subnet=sample_fingerprint["ip_subnet"],
            device_hash=sample_fingerprint["device_hash"],
            upi_handle=sample_fingerprint["upi_handle"],
            user_agent_hash=sample_fingerprint["user_agent_hash"],
            merchant_id=str(uuid4()),
            amount_paise=499900,
        )

        assert res["score"] == 50.0
        assert res["decision"] == "REVIEW"
        assert "trust_service_unavailable" in res["risk_factors"]
