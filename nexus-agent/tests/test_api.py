"""Tests for FastAPI port 8000 server and ADK POST /run endpoint (ORCH-01, PRD §11.1)."""

import time
from unittest.mock import patch
from uuid import UUID
import httpx
import pytest

from nexus_agent.api.server import create_app
from nexus_agent.pipeline.runner import DeterministicPipelineRunner
from nexus_agent.razorpay_adapter import RazorpayClientAdapter
from tests.test_pipeline import SimulatedPipelinePool


@pytest.fixture
def api_test_client():
    merchant_id = UUID("00000000-0000-0000-0000-000000000001")
    product_id = UUID("00000000-0000-0000-0000-000000000002")
    products = [
        {
            "id": product_id,
            "merchant_id": merchant_id,
            "name": "Nexus Secure Router",
            "description": "Hardware-encrypted zero-trust secure edge router",
            "price_paise": 499900,
            "stock": 20,
        }
    ]
    pool = SimulatedPipelinePool(products)
    adapter = RazorpayClientAdapter(
        key_id="rzp_test_mock_12345",
        key_secret="sct_test_mock_secret_key_12345",
    )
    runner = DeterministicPipelineRunner(db_pool=pool, razorpay_adapter=adapter)

    app = create_app()
    app.state.runner = runner

    return {
        "app": app,
        "merchant_id": str(merchant_id),
        "product_id": str(product_id),
        "pool": pool,
    }


def _get_field(data: dict, *keys):
    """Retrieve field value checking multiple alias names (e.g. camelCase vs snake_case)."""
    for k in keys:
        if k in data:
            return data[k]
    return None


@pytest.mark.asyncio
async def test_health_endpoint(api_test_client):
    """Assert GET /health returns 200 within 10ms with port 8000 metadata."""
    app = api_test_client["app"]
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
        t0 = time.perf_counter()
        resp = await client.get("/health")
        duration_ms = (time.perf_counter() - t0) * 1000

    assert resp.status_code == 200
    assert duration_ms < 50.0  # Well within test boundary
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "nexus-agent"
    assert data["port"] == 8000


@pytest.mark.asyncio
async def test_adk_run_endpoint_success(api_test_client):
    """Send POST /run with valid purchase intent; verify 200 OK, event stream structure, and status SUCCESS."""
    app = api_test_client["app"]
    merchant_id = api_test_client["merchant_id"]
    transport = httpx.ASGITransport(app=app)

    mock_trust_data = {
        "score": 85.0,
        "decision": "ALLOW",
        "risk_factors": [],
        "graph_metrics": {"nodes_matched": 1},
    }

    payload = {
        "user_id": "buyer@example.com",
        "session_id": "sess_12345",
        "new_message": {
            "parts": [{"text": "Buy 1 Nexus Secure Router"}],
            "role": "user",
        },
        "merchant_id": merchant_id,
        "buyer_fingerprint": {"ip": "192.168.1.10"},
    }

    with patch("nexus_agent.pipeline.runner.check_trust_graph", return_value=mock_trust_data):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
            resp = await client.post("/run", json=payload)

    assert resp.status_code == 200
    events = resp.json()
    assert isinstance(events, list)
    # 6 pipeline step events + 1 final summary event = 7 events
    assert len(events) == 7

    # Check terminal event
    terminal_event = events[-1]
    turn_complete = _get_field(terminal_event, "turnComplete", "turn_complete")
    assert turn_complete is True

    metadata = _get_field(terminal_event, "customMetadata", "custom_metadata")
    assert metadata is not None
    assert metadata["status"] == "SUCCESS"
    assert metadata["trust_score"] == 85.0
    assert metadata["order_id"] is not None
    assert metadata["payment_id"] is not None


@pytest.mark.asyncio
async def test_adk_run_endpoint_denied(api_test_client):
    """Send POST /run with fraudulent fingerprint; verify 200 OK, status DENIED, and reason populated."""
    app = api_test_client["app"]
    merchant_id = api_test_client["merchant_id"]
    transport = httpx.ASGITransport(app=app)

    mock_trust_data = {
        "score": 25.0,
        "decision": "DENY",
        "risk_factors": ["known_fraud_network"],
        "graph_metrics": {"nodes_matched": 3},
    }

    payload = {
        "user_id": "fraudster@nexus.local",
        "session_id": "sess_fraud_123",
        "new_message": {
            "parts": [{"text": "Buy 1 Nexus Secure Router"}],
            "role": "user",
        },
        "merchant_id": merchant_id,
        "buyer_fingerprint": {"ip": "10.0.0.99"},
    }

    with patch("nexus_agent.pipeline.runner.check_trust_graph", return_value=mock_trust_data):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
            resp = await client.post("/run", json=payload)

    assert resp.status_code == 200
    events = resp.json()
    # 4 step events (1, 2, 3, 6) + 1 final summary event = 5 events
    assert len(events) == 5

    terminal_event = events[-1]
    turn_complete = _get_field(terminal_event, "turnComplete", "turn_complete")
    assert turn_complete is True

    metadata = _get_field(terminal_event, "customMetadata", "custom_metadata")
    assert metadata is not None
    assert metadata["status"] == "DENIED"
    assert metadata["order_id"] is None
    assert metadata["payment_id"] is None
    assert "Trust violation" in metadata["failure_reason"]


@pytest.mark.asyncio
async def test_adk_run_endpoint_latency_sub_2s(api_test_client):
    """Benchmark POST /run with mock tools; assert total execution completes well under the 2000ms SLA budget (ORCH-01)."""
    app = api_test_client["app"]
    merchant_id = api_test_client["merchant_id"]
    transport = httpx.ASGITransport(app=app)

    mock_trust_data = {
        "score": 90.0,
        "decision": "ALLOW",
        "risk_factors": [],
        "graph_metrics": {"nodes_matched": 1},
    }

    payload = {
        "user_id": "speedy_buyer@nexus.local",
        "session_id": "sess_speed_benchmark",
        "new_message": {
            "parts": [{"text": "Buy 1 Nexus Secure Router"}],
            "role": "user",
        },
        "merchant_id": merchant_id,
    }

    with patch("nexus_agent.pipeline.runner.check_trust_graph", return_value=mock_trust_data):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
            t0 = time.perf_counter()
            resp = await client.post("/run", json=payload)
            elapsed_seconds = time.perf_counter() - t0

    assert resp.status_code == 200
    assert elapsed_seconds < 2.0, f"Execution latency was {elapsed_seconds:.3f}s (exceeded 2.0s SLA)"
    events = resp.json()
    terminal_event = events[-1]
    metadata = _get_field(terminal_event, "customMetadata", "custom_metadata")
    assert metadata is not None
    assert metadata["status"] == "SUCCESS"
