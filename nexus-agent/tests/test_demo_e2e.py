"""Unit and integration tests for 3-Act End-to-End demo script (EVAL-04, T-06-06)."""

from pathlib import Path
from unittest.mock import AsyncMock, patch
import sys

AGENT_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = AGENT_DIR.parent
TRUST_DIR = ROOT_DIR / "trust-graph-service"
DB_DIR = ROOT_DIR / "db" / "py"
SCRIPTS_DIR = ROOT_DIR / "scripts"

for p in [str(AGENT_DIR), str(ROOT_DIR), str(TRUST_DIR), str(DB_DIR), str(SCRIPTS_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import httpx
import pytest
from demo_e2e import (
    build_synthetic_audit_chain,
    check_nextjs_health,
    check_postgres_health,
    check_trust_graph_health,
    normalize_audit_entry,
    run_demo,
    run_preflight_health_checks,
)
from nexus_db.audit import verify_audit_chain


@pytest.mark.asyncio
async def test_preflight_checks_mock() -> None:
    """Test health check parser across mocked microservice responses (D-16)."""
    # 1. Test success reporting when endpoints return 200
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = httpx.Response(
            200,
            json={"status": "ok"},
            request=httpx.Request("GET", "http://localhost:3000/api/health"),
        )

        async with httpx.AsyncClient() as client:
            next_ok, next_msg = await check_nextjs_health("http://mock-nexus.local", client=client)
            assert next_ok is True
            assert "online" in next_msg

            trust_ok, trust_msg = await check_trust_graph_health("http://mock-trust.local", client=client)
            assert trust_ok is True
            assert "online" in trust_msg

    # 2. Test failure reporting on connection error / timeout
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_fail_get:
        mock_fail_get.side_effect = httpx.ConnectError("Connection refused")

        async with httpx.AsyncClient() as client:
            f_next_ok, f_next_msg = await check_nextjs_health("http://offline-nexus.local", client=client)
            assert f_next_ok is False
            assert "offline" in f_next_msg

            f_trust_ok, f_trust_msg = await check_trust_graph_health("http://offline-trust.local", client=client)
            assert f_trust_ok is False
            assert "offline" in f_trust_msg


def test_audit_hash_chain_validation() -> None:
    """Test parent hash linking on mock 6-step audit records (D-15)."""
    tx_id = "test_tx_allow_12345"

    # 1. Valid ALLOW chain (6 steps)
    allow_chain = build_synthetic_audit_chain(tx_id, path="ALLOW", tamper=False)
    assert len(allow_chain) == 6
    assert allow_chain[0]["prev_entry_hash"] == "GENESIS"

    norm_allow = [normalize_audit_entry(e, tx_id=tx_id) for e in allow_chain]
    assert verify_audit_chain(norm_allow) is True

    # 2. Valid DENY chain (4 steps)
    deny_chain = build_synthetic_audit_chain(tx_id, path="DENIED", tamper=False)
    assert len(deny_chain) == 4
    assert deny_chain[0]["prev_entry_hash"] == "GENESIS"

    norm_deny = [normalize_audit_entry(e, tx_id=tx_id) for e in deny_chain]
    assert verify_audit_chain(norm_deny) is True

    # 3. Tampered chain detection (fails SHA-256 parent hash verification)
    tampered_chain = build_synthetic_audit_chain(tx_id, path="ALLOW", tamper=True)
    norm_tampered = [normalize_audit_entry(e, tx_id=tx_id) for e in tampered_chain]
    assert verify_audit_chain(norm_tampered) is False


@pytest.mark.asyncio
async def test_demo_e2e_auto_flow() -> None:
    """Executes demo_e2e.py in mock non-interactive --auto mode and asserts code 0."""
    exit_code = await run_demo(
        auto=True,
        base_url="http://localhost:3000",
        trust_url="http://localhost:8001",
        db_url="postgresql://nexus:nexus_dev_password@localhost:5432/nexus",
        mock_run=True,
    )
    assert exit_code == 0
