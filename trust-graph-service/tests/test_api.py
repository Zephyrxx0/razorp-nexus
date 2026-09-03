from datetime import datetime, timezone
import uuid
import pytest
from fastapi.testclient import TestClient
from app.engine.graph_manager import GraphManager
from app.main import create_app
from app.models.cytoscape import CytoscapeGraph, NodeDetailResponse, RingDetailResponse
from app.models.schemas import ScoreResponse, SignalResponse


@pytest.fixture
def api_client():
    """Provides a TestClient with an isolated GraphManager instance and no background DB rehydration."""
    gm = GraphManager()
    app = create_app(graph_manager=gm, skip_rehydration=True)
    with TestClient(app) as client:
        yield client, gm


def test_health_endpoint(api_client):
    """Verifies that GET /health and GET / return 200 and expected service status metadata."""
    client, gm = api_client

    # Test root endpoint
    root_res = client.get("/")
    assert root_res.status_code == 200
    root_data = root_res.json()
    assert root_data["service"] == "nexus-trust-graph-service"
    assert root_data["version"] == "0.1.0"

    # Test health endpoint
    health_res = client.get("/health")
    assert health_res.status_code == 200
    health_data = health_res.json()
    assert health_data["status"] == "healthy"
    assert health_data["node_count"] == 0
    assert health_data["edge_count"] == 0
    assert health_data["ring_count"] == 0


def test_post_trust_score_allow(api_client, sample_fingerprint_clean):
    """Verifies that POST /trust/score evaluates a clean fingerprint and returns ALLOW."""
    client, gm = api_client
    merchant_id = str(uuid.uuid4())

    payload = {
        "merchant_id": merchant_id,
        "amount_paise": 250000,
        "buyer_fingerprint": sample_fingerprint_clean,
        "request_id": "req-allow-test-01",
    }

    res = client.post("/trust/score", json=payload)
    assert res.status_code == 200
    data = res.json()

    # Validate against ScoreResponse schema
    score_resp = ScoreResponse.model_validate(data)
    assert score_resp.decision == "ALLOW"
    assert score_resp.score >= 70.0
    assert score_resp.score_breakdown.final_score == score_resp.score
    assert score_resp.graph_metrics.nodes_matched == 0  # brand new entity


def test_post_trust_score_deny(api_client, sample_fingerprint_fraud):
    """Verifies that POST /trust/score evaluates a known fraudulent node and returns DENY."""
    client, gm = api_client
    merchant_id = str(uuid.uuid4())

    # Ingest a prior fraudulent signal into the graph and mark node as fraud
    gm.ingest_signal(
        fingerprint=sample_fingerprint_fraud,
        merchant_id=merchant_id,
        transaction_id=str(uuid.uuid4()),
        outcome="FAILED",
        amount_paise=99999,
    )
    email_key = f"email:{sample_fingerprint_fraud['email_hash']}"
    gm.graph.nodes[email_key]["is_known_fraud"] = True

    payload = {
        "merchant_id": merchant_id,
        "amount_paise": 150000,
        "buyer_fingerprint": sample_fingerprint_fraud,
        "request_id": "req-deny-test-01",
    }

    res = client.post("/trust/score", json=payload)
    assert res.status_code == 200
    data = res.json()

    score_resp = ScoreResponse.model_validate(data)
    assert score_resp.decision == "DENY"
    assert score_resp.score < 40.0
    assert any("known_fraud" in rf for rf in score_resp.risk_factors)


def test_post_trust_signal_ingestion(api_client, sample_fingerprint_clean):
    """Verifies that POST /trust/signal ingests transaction outcomes into in-memory graph (D-04)."""
    client, gm = api_client
    merchant_id = str(uuid.uuid4())
    tx_id = str(uuid.uuid4())

    payload = {
        "merchant_id": merchant_id,
        "transaction_id": tx_id,
        "buyer_fingerprint": sample_fingerprint_clean,
        "amount_paise": 199900,
        "outcome": "SUCCESS",
    }

    res = client.post("/trust/signal", json=payload)
    assert res.status_code == 200
    data = res.json()

    sig_resp = SignalResponse.model_validate(data)
    assert sig_resp.status == "INGESTED"
    assert sig_resp.nodes_updated == 5
    assert sig_resp.edges_updated == 10  # 5-node complete clique

    # Confirm graph state updated
    assert gm.graph.number_of_nodes() == 5
    assert gm.graph.number_of_edges() == 10


def test_get_trust_rings_endpoint(api_client):
    """Verifies that GET /trust/rings returns detected fraud rings matching RingDetailResponse (D-13)."""
    client, gm = api_client
    m1 = str(uuid.uuid4())
    m2 = str(uuid.uuid4())

    # Triangle ring with failure across 2 merchants
    fp = {
        "email_hash": "ring_user",
        "ip_subnet": "198.51.100.0/24",
        "device_hash": "ring_device",
    }
    client.post(
        "/trust/signal",
        json={
            "merchant_id": m1,
            "transaction_id": str(uuid.uuid4()),
            "buyer_fingerprint": fp,
            "amount_paise": 10000,
            "outcome": "FAILED",
        },
    )
    client.post(
        "/trust/signal",
        json={
            "merchant_id": m2,
            "transaction_id": str(uuid.uuid4()),
            "buyer_fingerprint": fp,
            "amount_paise": 15000,
            "outcome": "SUCCESS",
        },
    )

    res = client.get("/trust/rings")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    ring_detail = RingDetailResponse.model_validate(data[0])
    assert ring_detail.risk_level == "HIGH"
    assert ring_detail.member_nodes_count == 3
    assert len(ring_detail.affected_merchants) == 2
    assert len(ring_detail.graph.nodes) == 3


def test_get_trust_node_profile(api_client, sample_fingerprint_clean):
    """Verifies that GET /trust/node/{node_id} returns node profile and 404 for missing (D-14)."""
    client, gm = api_client
    merchant_id = str(uuid.uuid4())

    client.post(
        "/trust/signal",
        json={
            "merchant_id": merchant_id,
            "transaction_id": str(uuid.uuid4()),
            "buyer_fingerprint": sample_fingerprint_clean,
            "amount_paise": 50000,
            "outcome": "SUCCESS",
        },
    )

    # Valid node
    email_key = f"email:{sample_fingerprint_clean['email_hash']}"
    res = client.get(f"/trust/node/{email_key}")
    assert res.status_code == 200
    data = res.json()

    profile = NodeDetailResponse.model_validate(data)
    assert profile.node_id == email_key
    assert profile.transaction_count == 1
    assert profile.successful_transaction_count == 1
    assert profile.failed_transaction_count == 0
    assert len(profile.neighbors_summary) == 4
    assert len(profile.ego_graph.nodes) == 5

    # Path with slashes (e.g. IP subnet /24)
    ip_key = f"ip:{sample_fingerprint_clean['ip_subnet']}"
    res_ip = client.get(f"/trust/node/{ip_key}")
    assert res_ip.status_code == 200
    profile_ip = NodeDetailResponse.model_validate(res_ip.json())
    assert profile_ip.node_id == ip_key

    # Non-existent node
    res_404 = client.get("/trust/node/email:nonexistent_hash_val")
    assert res_404.status_code == 404


def test_get_trust_graph_merchant_filter_and_limit(api_client, sample_fingerprint_clean):
    """Verifies that GET /trust/graph supports merchant filtering and caps at limit (D-15)."""
    client, gm = api_client
    m1 = str(uuid.uuid4())
    m2 = str(uuid.uuid4())

    # Ingest for m1 (5 signals)
    client.post(
        "/trust/signal",
        json={
            "merchant_id": m1,
            "transaction_id": str(uuid.uuid4()),
            "buyer_fingerprint": sample_fingerprint_clean,
            "amount_paise": 10000,
            "outcome": "SUCCESS",
        },
    )

    # Ingest for m2 (2 signals)
    client.post(
        "/trust/signal",
        json={
            "merchant_id": m2,
            "transaction_id": str(uuid.uuid4()),
            "buyer_fingerprint": {
                "email_hash": "other_hash_abc",
                "device_hash": "other_device_def",
            },
            "amount_paise": 20000,
            "outcome": "SUCCESS",
        },
    )

    # Scoped to m1
    res_m1 = client.get(f"/trust/graph?merchant_id={m1}")
    assert res_m1.status_code == 200
    graph_m1 = CytoscapeGraph.model_validate(res_m1.json())
    assert len(graph_m1.nodes) == 5

    # Scoped to m2
    res_m2 = client.get(f"/trust/graph?merchant_id={m2}")
    assert res_m2.status_code == 200
    graph_m2 = CytoscapeGraph.model_validate(res_m2.json())
    assert len(graph_m2.nodes) == 2

    # Limit parameter
    res_limit = client.get("/trust/graph?limit=3")
    assert res_limit.status_code == 200
    graph_limit = CytoscapeGraph.model_validate(res_limit.json())
    assert len(graph_limit.nodes) == 3
