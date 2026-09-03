"""Unit and in-memory simulation tests for multi-merchant ring attack simulator (EVAL-04, T-06-05)."""

from pathlib import Path
import sys

AGENT_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = AGENT_DIR.parent
TRUST_DIR = ROOT_DIR / "trust-graph-service"
SCRIPTS_DIR = ROOT_DIR / "scripts"

for p in [str(AGENT_DIR), str(ROOT_DIR), str(TRUST_DIR), str(SCRIPTS_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from app.engine.graph_manager import GraphManager
from simulate_ring_attack import (
    DEFAULT_TEST_MERCHANTS,
    SYNDICATE_DEVICES,
    SYNDICATE_SUBNETS,
    build_attack_transactions,
    generate_syndicate_identities,
    run_ring_attack_simulation,
)


def test_syndicate_topology_generation() -> None:
    """Asserts 12 identities, shared devices, and shared /24 subnets (D-09)."""
    identities = generate_syndicate_identities(ring_size=12)

    assert len(identities) == 12, "Expected exactly 12 syndicate identities"

    emails = [ident["email"] for ident in identities]
    assert len(set(emails)) == 12, "Every attacker must have a unique email identifier"
    assert emails[0] == "attacker_01@darkweb.org"
    assert emails[-1] == "attacker_12@darkweb.org"

    devices = {ident["device_id"] for ident in identities}
    assert devices.issubset(set(SYNDICATE_DEVICES)), "Devices must draw from known syndicate device pool"
    assert len(devices) == 3, "Expected all 3 syndicate devices to be actively shared"

    subnets = {ident["ip_subnet"] for ident in identities}
    assert subnets.issubset(set(SYNDICATE_SUBNETS)), "Subnets must draw from syndicate /24 subnets"
    assert len(subnets) == 2, "Expected 2 shared /24 subnets"

    for ident in identities:
        assert ident["ip_subnet"] in ("198.51.100.0/24", "203.0.113.0/24")
        assert ident["upi_handle"].endswith(("@okaxis", "@okhdfcbank", "@oksbi"))


def test_attack_transactions_structure() -> None:
    """Asserts that 50 transactions are distributed across merchants with bridge at tx 15."""
    identities = generate_syndicate_identities(ring_size=12)
    merchants = DEFAULT_TEST_MERCHANTS[:3]
    txs = build_attack_transactions(merchants, identities, total_txs=50)

    assert len(txs) == 50

    # Early failure injected at tx 3
    assert txs[2]["simulated_failure"] is True
    assert txs[0]["simulated_failure"] is False
    assert txs[4]["simulated_failure"] is False

    # Detection bridge at tx 15
    assert txs[14]["phase"] == "DETECTION_TRIGGER"
    assert txs[14]["tx_number"] == 15

    # Multi-merchant distribution
    merchants_targeted = {t["merchant_id"] for t in txs}
    assert len(merchants_targeted) >= 3, "Must target at least 3 distinct merchants"


@pytest.mark.asyncio
async def test_in_memory_ring_attack_progression() -> None:
    """
    Runs ring attack against in-memory GraphManager and asserts that:
    1. Initial transactions have high trust scores (~85.0-100.0).
    2. At tx 15, ring detection triggers.
    3. Transactions past threshold (txs 16-50) collapse to score 0.0 and are DENIED.
    4. Legitimate users affected is 0.
    """
    gm = GraphManager()

    summary = await run_ring_attack_simulation(
        target="trust-service",
        ring_size=12,
        total_txs=50,
        pace_ms=0,
        auto_seed=False,
        in_memory_gm=gm,
        verbose=False,
    )

    assert summary["total_sent"] == 50
    assert summary["first_detection_tx"] == 15
    assert summary["legitimate_users_affected"] == 0
    assert summary["false_positive_cost_paise"] == 0

    results = summary["results"]
    assert len(results) == 50

    # Initial transactions (1-5) should pass gating (ALLOW or deliberate failure)
    for r in results[:2]:
        assert r["trust_score"] >= 80.0
        assert r["decision"] == "ALLOW"

    # Transactions 16-50 should ALL be DENIED with score 0.0
    for r in results[15:]:
        assert r["trust_score"] == 0.0, f"Tx {r['tx_number']} score was {r['trust_score']}, expected 0.0"
        assert r["outcome"] == "DENIED"
        assert r["decision"] == "DENY"

    assert summary["total_blocked"] >= 35
