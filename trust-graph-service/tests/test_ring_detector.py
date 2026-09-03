from datetime import datetime, timezone
from uuid import uuid4
import pytest
from app.engine.graph_manager import GraphManager
from app.engine.ring_detector import detect_rings_in_subgraph, detect_all_rings


def test_ring_rejection_single_merchant():
    gm = GraphManager()
    m_id = str(uuid4())

    # Create 4-node clique with failures, but all at a single merchant
    fp = {
        "email_hash": "user_sm",
        "ip_subnet": "1.1.1.0/24",
        "device_hash": "dev_sm",
        "upi_handle": "user_sm@upi",
    }
    gm.ingest_signal(fp, m_id, "tx_fail", "FAILED", 5000)

    rings = detect_all_rings(gm.graph)
    # PRD §12.3 Criterion 2 requires >= 2 distinct merchants
    assert len(rings) == 0


def test_ring_rejection_insufficient_degree():
    gm = GraphManager()
    m1 = str(uuid4())
    m2 = str(uuid4())

    # Create 4 nodes in a line: n1 - n2 - n3 - n4
    # Total edges = 3, sum(degree) = 1 + 2 + 2 + 1 = 6, avg degree = 6 / 4 = 1.5
    # Let's create a star or tree with 5 nodes: n1 connected to n2, n3, n4, n5
    # Total edges = 4, sum(degree) = 8, avg degree = 8 / 5 = 1.6
    # Let's create a line of 5 nodes: n1 - n2 - n3 - n4 - n5
    # 5 nodes, 4 edges, degrees: 1, 2, 2, 2, 1 -> sum = 8, avg degree = 8/5 = 1.6
    # To test < 1.5, let's create 6 nodes in a line:
    # 6 nodes, 5 edges, sum(degree) = 10, avg degree = 10 / 6 = 1.666
    # What has avg degree < 1.5? A disconnected or tree of 3 nodes:
    # 3 nodes in a line: n1 - n2 - n3 -> 2 edges, sum(degree) = 4, avg degree = 4 / 3 = 1.333 < 1.5!
    now = datetime.now(timezone.utc)
    # Transaction 1: touches n1 and n2 at m1
    gm.ingest_signal({"email_hash": "n1", "ip_subnet": "n2"}, m1, "tx_1", "SUCCESS", 1000, timestamp=now)
    # Transaction 2: touches n2 and n3 at m2 with failure
    gm.ingest_signal({"ip_subnet": "n2", "device_hash": "n3"}, m2, "tx_2", "FAILED", 1000, timestamp=now)

    # 3 nodes: email:n1, ip:n2, device:n3. Edges: (n1, n2), (n2, n3).
    # Degree of n1=1, n2=2, n3=1 -> avg degree = 4 / 3 = 1.333 < 1.5!
    # Spans 2 merchants (m1, m2) and has 1 failure.
    rings = detect_all_rings(gm.graph)
    assert len(rings) == 0


def test_ring_rejection_no_failures():
    gm = GraphManager()
    m1 = str(uuid4())
    m2 = str(uuid4())

    # 3-node clique across 2 merchants, but 0 failures
    fp = {"email_hash": "clean1", "ip_subnet": "10.0.0.0/24", "device_hash": "clean_dev"}
    gm.ingest_signal(fp, m1, "tx_clean1", "SUCCESS", 1000)
    gm.ingest_signal(fp, m2, "tx_clean2", "SUCCESS", 1000)

    rings = detect_all_rings(gm.graph)
    # PRD §12.3 Criterion 4 requires >= 1 failed transaction
    assert len(rings) == 0


def test_ring_qualification_success():
    gm = GraphManager()
    m1 = str(uuid4())
    m2 = str(uuid4())

    # 3-node clique across 2 merchants with 1 failure
    fp = {"email_hash": "ring_boss", "ip_subnet": "10.10.10.0/24", "device_hash": "dev_boss"}
    gm.ingest_signal(fp, m1, "tx_boss1", "SUCCESS", 1000)
    gm.ingest_signal(fp, m2, "tx_boss_fail", "FAILED", 2500)

    rings = detect_all_rings(gm.graph)
    assert len(rings) == 1
    ring = rings[0]
    assert ring["risk_level"] == "HIGH"
    assert ring["member_nodes_count"] == 3
    assert ring["blocked_txn_count"] == 1
    assert ring["blocked_amount_paise"] == 2500
    assert set(ring["affected_merchants"]) == {m1, m2}
    assert ring["detection_algorithm"] == "connected_components"

    # All nodes in ring should be marked as known fraud with score 0.0
    for node in ring["graph"]["nodes"]:
        data = node["data"]
        assert data["is_known_fraud"] is True
        assert data["trust_score"] == 0.0
        assert data["ring_id"] == ring["ring_id"]

    # Graph elements should include edges
    assert len(ring["graph"]["edges"]) == 3


def test_ring_critical_risk_level_five_merchants():
    gm = GraphManager()
    fp = {"email_hash": "syndicate_boss", "ip_subnet": "77.88.99.0/24", "device_hash": "syndicate_dev"}
    merchants = [str(uuid4()) for _ in range(5)]

    for i, m in enumerate(merchants):
        outcome = "FAILED" if i == 0 else "SUCCESS"
        gm.ingest_signal(fp, m, f"tx_{i}", outcome, 3000)

    rings = detect_all_rings(gm.graph)
    assert len(rings) == 1
    assert rings[0]["risk_level"] == "CRITICAL"
    assert len(rings[0]["affected_merchants"]) == 5


def test_ring_stable_uuid_merging():
    gm = GraphManager()
    m1 = str(uuid4())
    m2 = str(uuid4())

    # Cluster A: nodes A1, A2, A3
    fp_a = {"email_hash": "cluster_a_email", "ip_subnet": "1.1.1.0/24", "device_hash": "dev_a"}
    gm.ingest_signal(fp_a, m1, "tx_a1", "SUCCESS", 1000)
    gm.ingest_signal(fp_a, m2, "tx_a_fail", "FAILED", 1500)

    rings_a = detect_all_rings(gm.graph)
    assert len(rings_a) == 1
    old_ring_id = "00000000-0000-0000-0000-000000000001"
    # Assign specific stable ID to Cluster A
    for n in rings_a[0]["graph"]["nodes"]:
        gm.graph.nodes[n["data"]["id"]]["ring_id"] = old_ring_id

    # Cluster B: nodes B1, B2, B3
    m3 = str(uuid4())
    m4 = str(uuid4())
    fp_b = {"email_hash": "cluster_b_email", "ip_subnet": "2.2.2.0/24", "device_hash": "dev_b"}
    gm.ingest_signal(fp_b, m3, "tx_b1", "SUCCESS", 1000)
    gm.ingest_signal(fp_b, m4, "tx_b_fail", "FAILED", 2000)

    rings_b = detect_rings_in_subgraph(gm.graph, gm.extract_node_keys(fp_b))
    assert len(rings_b) == 1
    new_ring_id = "99999999-9999-9999-9999-999999999999"
    for n in rings_b[0]["graph"]["nodes"]:
        gm.graph.nodes[n["data"]["id"]]["ring_id"] = new_ring_id

    # Now bridge Cluster A and Cluster B with a transaction sharing A1 and B1
    bridge_fp = {"email_hash": "cluster_a_email", "device_hash": "dev_b", "upi_handle": "bridge@upi"}
    gm.ingest_signal(bridge_fp, m1, "tx_bridge", "SUCCESS", 500)

    # Detect rings across the merged graph
    merged_rings = detect_all_rings(gm.graph)
    assert len(merged_rings) == 1
    merged = merged_rings[0]
    # Oldest canonical ID wins (lexically first)
    assert merged["ring_id"] == old_ring_id
    # All member nodes have old_ring_id
    for n in merged["graph"]["nodes"]:
        assert n["data"]["ring_id"] == old_ring_id


def test_ring_blocked_amount_deduplication():
    gm = GraphManager()
    m1 = str(uuid4())
    m2 = str(uuid4())

    # Ingest single failed transaction with 4 signals
    fp = {
        "email_hash": "dedup_email",
        "ip_subnet": "33.44.55.0/24",
        "device_hash": "dedup_dev",
        "upi_handle": "dedup@upi",
    }
    # One clean txn at m1, one failed txn of ₹500.00 (50000 paise) at m2
    gm.ingest_signal(fp, m1, "tx_ok", "SUCCESS", 1000)
    gm.ingest_signal(fp, m2, "tx_shared_failure", "FAILED", 50000)

    rings = detect_all_rings(gm.graph)
    assert len(rings) == 1
    ring = rings[0]
    # Blocked amount must be exactly 50000, NOT 4 * 50000 = 200000
    assert ring["blocked_txn_count"] == 1
    assert ring["blocked_amount_paise"] == 50000
