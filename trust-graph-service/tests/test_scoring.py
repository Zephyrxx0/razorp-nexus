from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytest
from app.engine.graph_manager import GraphManager
from app.engine.scoring import TrustScorer


def test_score_brand_new_entity_penalty():
    gm = GraphManager()
    fp = {
        "email_hash": "email123",
        "ip_subnet": "192.168.1.0/24",
        "device_hash": "dev123",
    }
    result = TrustScorer.score_fingerprint(gm, fp, merchant_id=str(uuid4()))
    assert result["score"] == 90.0
    assert result["decision"] == "ALLOW"
    assert result["score_breakdown"]["new_entity_penalty"] == -10.0
    assert any("new_entity" in rf for rf in result["risk_factors"])


def test_score_progressive_trust_recovery():
    gm = GraphManager()
    fp = {
        "email_hash": "email_good",
        "ip_subnet": "10.0.0.0/24",
        "device_hash": "dev_good",
    }
    m_id = str(uuid4())

    # 1 clean transaction: still has new entity penalty
    gm.ingest_signal(fp, m_id, str(uuid4()), "SUCCESS", 1000)
    res1 = TrustScorer.score_fingerprint(gm, fp, m_id)
    assert res1["score"] == 90.0
    assert res1["score_breakdown"]["new_entity_penalty"] == -10.0

    # 2 clean transactions: new entity penalty dropped (100.0)
    gm.ingest_signal(fp, m_id, str(uuid4()), "SUCCESS", 1000)
    res2 = TrustScorer.score_fingerprint(gm, fp, m_id)
    assert res2["score"] == 100.0
    assert res2["score_breakdown"]["new_entity_penalty"] == 0.0

    # 5 clean transactions with 0 failures: progressive trust bonus (+5 capped at 100.0)
    for _ in range(3):
        gm.ingest_signal(fp, m_id, str(uuid4()), "SUCCESS", 1000)

    res5 = TrustScorer.score_fingerprint(gm, fp, m_id)
    assert res5["score"] == 100.0
    assert res5["score_breakdown"]["reputation_bonus"] == 5.0


def test_score_missing_signals_partial_evaluation():
    gm = GraphManager()
    # Only 2 signals: 1 missing -> -5.0 penalty; no history -> -10.0 new entity; score = 85.0
    fp2 = {
        "email_hash": "email_partial",
        "ip_subnet": "10.0.1.0/24",
    }
    res2 = TrustScorer.score_fingerprint(gm, fp2, str(uuid4()))
    assert res2["score"] == 85.0
    assert res2["score_breakdown"]["missing_signals_penalty"] == -5.0
    assert res2["decision"] == "ALLOW"

    # Only 1 signal: 2 missing -> -10.0 penalty; no history -> -10.0 new entity; score = 80.0
    fp1 = {
        "email_hash": "email_lone",
    }
    res1 = TrustScorer.score_fingerprint(gm, fp1, str(uuid4()))
    assert res1["score"] == 80.0
    assert res1["score_breakdown"]["missing_signals_penalty"] == -10.0


def test_score_known_fraud_direct_node():
    gm = GraphManager()
    fp = {
        "email_hash": "email_fraudster",
        "ip_subnet": "172.16.0.0/24",
        "device_hash": "dev_fraudster",
    }
    m_id = str(uuid4())
    gm.ingest_signal(fp, m_id, str(uuid4()), "FAILED", 5000)

    # Directly mark email node as known fraud
    email_key = gm.get_node_key("email", "email_fraudster")
    gm.graph.nodes[email_key]["is_known_fraud"] = True

    res = TrustScorer.score_fingerprint(gm, fp, m_id)
    assert res["score_breakdown"]["fraud_neighbor_penalty"] <= -80.0
    assert res["decision"] == "DENY"
    assert res["score"] <= 20.0
    assert any("known_fraud_node" in rf for rf in res["risk_factors"])


def test_score_fraud_neighbor_tiered_subnet_weight():
    # Setup graph with fraud node
    gm = GraphManager()
    m_id = str(uuid4())

    fraud_fp = {
        "email_hash": "fraud_ring_boss",
        "ip_subnet": "198.51.100.0/24",
        "device_hash": "dev_shared",
    }
    gm.ingest_signal(fraud_fp, m_id, str(uuid4()), "FAILED", 1000)
    gm.graph.nodes[gm.get_node_key("email", "fraud_ring_boss")]["is_known_fraud"] = True

    # Case A: Benign buyer connected to fraud node via DEVICE (direct identifier => tier_weight 1.0)
    buyer_device_fp = {
        "email_hash": "buyer_a@email",
        "ip_subnet": "203.0.113.0/24",
        "device_hash": "dev_shared",  # connects to fraud_ring_boss
    }
    # Ingest 2 clean txns so new entity penalty is 0
    gm.ingest_signal(buyer_device_fp, m_id, str(uuid4()), "SUCCESS", 1000)
    gm.ingest_signal(buyer_device_fp, m_id, str(uuid4()), "SUCCESS", 1000)

    res_device = TrustScorer.score_fingerprint(gm, buyer_device_fp, m_id)
    assert res_device["score_breakdown"]["fraud_neighbor_penalty"] == -40.0
    assert res_device["score"] == 60.0  # 100 - 40 = 60 (REVIEW)
    assert res_device["decision"] == "REVIEW"

    # Case B: Benign buyer connected ONLY via IP SUBNET (subnet => tier_weight 0.5)
    gm_ip = GraphManager()
    gm_ip.ingest_signal(fraud_fp, m_id, str(uuid4()), "FAILED", 1000)
    gm_ip.graph.nodes[gm_ip.get_node_key("email", "fraud_ring_boss")]["is_known_fraud"] = True

    buyer_ip_fp = {
        "email_hash": "buyer_b@email",
        "ip_subnet": "198.51.100.0/24",  # shared subnet
        "device_hash": "dev_distinct_b",
    }
    # Ingest 2 clean txns so new entity penalty is 0
    gm_ip.ingest_signal(buyer_ip_fp, m_id, str(uuid4()), "SUCCESS", 1000)
    gm_ip.ingest_signal(buyer_ip_fp, m_id, str(uuid4()), "SUCCESS", 1000)

    res_ip = TrustScorer.score_fingerprint(gm_ip, buyer_ip_fp, m_id)
    # Tier weight 0.5 * -40.0 = -20.0
    assert res_ip["score_breakdown"]["fraud_neighbor_penalty"] == -20.0
    assert res_ip["score"] == 80.0  # 100 - 20 = 80 (ALLOW)
    assert res_ip["decision"] == "ALLOW"


def test_score_sliding_velocity_windows():
    gm = GraphManager()
    m_id = str(uuid4())
    fp = {
        "email_hash": "velocity_user",
        "ip_subnet": "1.2.3.0/24",
        "device_hash": "velocity_dev",
    }
    now = datetime.now(timezone.utc)

    # Ingest 6 transactions in past 30 minutes (also triggers reputation bonus +5 for >= 5 clean txns)
    # 100 + 5 (bonus) - 10 (velocity) = 95.0
    for i in range(6):
        ts = now - timedelta(minutes=i * 5)
        gm.ingest_signal(fp, m_id, f"tx_{i}", "SUCCESS", 1000, timestamp=ts)

    res6 = TrustScorer.score_fingerprint(gm, fp, m_id)
    # 6 txns in 60m => elevated velocity penalty -10.0
    assert res6["score_breakdown"]["velocity_penalty"] == -10.0
    assert res6["score_breakdown"]["reputation_bonus"] == 5.0
    assert res6["score"] == 95.0

    # Ingest 6 more transactions (total 12 in past 60m)
    for i in range(6, 12):
        ts = now - timedelta(minutes=i * 3)
        gm.ingest_signal(fp, m_id, f"tx_{i}", "SUCCESS", 1000, timestamp=ts)

    res12 = TrustScorer.score_fingerprint(gm, fp, m_id)
    # 12 txns in 60m => high velocity penalty -25.0
    # 100 + 5 (bonus) - 25 (velocity) = 80.0
    assert res12["score_breakdown"]["velocity_penalty"] == -25.0
    assert res12["score"] == 80.0


def test_score_cross_merchant_spread():
    gm = GraphManager()
    fp = {
        "email_hash": "multi_merchant_user",
        "ip_subnet": "5.6.7.0/24",
        "device_hash": "multi_dev",
    }
    now = datetime.now(timezone.utc)

    # Transactions across 4 distinct merchants in 24h
    merchants = [str(uuid4()) for _ in range(4)]
    for i, m in enumerate(merchants):
        gm.ingest_signal(fp, m, f"tx_m_{i}", "SUCCESS", 1000, timestamp=now - timedelta(hours=i))

    res4 = TrustScorer.score_fingerprint(gm, fp, merchants[0])
    # 4 merchants in 24h => -15.0 penalty
    assert res4["score_breakdown"]["cross_merchant_penalty"] == -15.0

    # Expand to 6 merchants
    more_merchants = [str(uuid4()) for _ in range(2)]
    for i, m in enumerate(more_merchants):
        gm.ingest_signal(fp, m, f"tx_extra_{i}", "SUCCESS", 1000, timestamp=now - timedelta(hours=5 + i))

    res6 = TrustScorer.score_fingerprint(gm, fp, merchants[0])
    # 6 merchants in 24h => -35.0 penalty
    assert res6["score_breakdown"]["cross_merchant_penalty"] == -35.0


def test_score_ring_membership_forces_zero():
    gm = GraphManager()
    fp = {
        "email_hash": "ring_puppet",
        "ip_subnet": "9.9.9.0/24",
        "device_hash": "ring_dev",
    }
    m_id = str(uuid4())
    gm.ingest_signal(fp, m_id, str(uuid4()), "SUCCESS", 1000)

    # Attach ring_id to one of the nodes
    node_key = gm.get_node_key("email", "ring_puppet")
    gm.graph.nodes[node_key]["ring_id"] = "ring-uuid-1234"

    res = TrustScorer.score_fingerprint(gm, fp, m_id)
    assert res["score"] == 0.0
    assert res["decision"] == "DENY"
    assert res["score_breakdown"]["ring_penalty"] == -100.0
    assert any("ring_member" in rf for rf in res["risk_factors"])


def test_score_exponential_decay():
    gm_old = GraphManager()
    gm_recent = GraphManager()
    m_id = str(uuid4())
    now = datetime.now(timezone.utc)

    fp = {
        "email_hash": "decay_test_user",
        "ip_subnet": "11.22.33.0/24",
        "device_hash": "decay_dev",
    }

    # Old failure: 28 days ago (4 half-lives => 2^-4 = 0.0625 decay weight, < 1.0)
    # plus 2 clean transactions to drop new entity penalty
    t_old = now - timedelta(days=28)
    gm_old.ingest_signal(fp, m_id, "tx_old_fail", "FAILED", 1000, timestamp=t_old)
    gm_old.ingest_signal(fp, m_id, "tx_c1", "SUCCESS", 1000, timestamp=now - timedelta(days=2))
    gm_old.ingest_signal(fp, m_id, "tx_c2", "SUCCESS", 1000, timestamp=now - timedelta(days=1))

    res_old = TrustScorer.score_fingerprint(gm_old, fp, m_id)

    # Recent failure: 1 hour ago (decay weight ~1.0)
    # Ingest 2 failures 1 hour ago so decay weight >= 1.0
    t_recent = now - timedelta(hours=1)
    gm_recent.ingest_signal(fp, m_id, "tx_recent_fail1", "FAILED", 1000, timestamp=t_recent)
    gm_recent.ingest_signal(fp, m_id, "tx_recent_fail2", "FAILED", 1000, timestamp=t_recent)
    gm_recent.ingest_signal(fp, m_id, "tx_r1", "SUCCESS", 1000, timestamp=now - timedelta(hours=2))
    gm_recent.ingest_signal(fp, m_id, "tx_r2", "SUCCESS", 1000, timestamp=now - timedelta(hours=2))

    res_recent = TrustScorer.score_fingerprint(gm_recent, fp, m_id)

    # Verify old failure has no penalty while recent failure has decayed penalty applied
    assert res_old["score"] == 100.0
    assert res_recent["score"] < 100.0
    assert res_recent["score_breakdown"]["fraud_neighbor_penalty"] < 0.0
