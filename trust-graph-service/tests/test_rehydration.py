import asyncio
from datetime import datetime, timezone
import json
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.engine.graph_manager import GraphManager
from app.engine.rehydration import rehydrate_from_db, soft_start_rehydration_loop


@pytest.mark.asyncio
async def test_rehydrate_from_db_success():
    """Verifies that rehydrate_from_db correctly queries transactions and populates in-memory graph."""
    gm = GraphManager()
    ts = datetime.now(timezone.utc)

    # Mock transaction records: one with dict fingerprint, one with JSON string fingerprint
    mock_rows = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "merchant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "buyer_fingerprint": {
                "email_hash": "email_user1",
                "ip_subnet": "192.168.1.0/24",
                "device_hash": "device_dev1",
            },
            "amount_paise": 10000,
            "status": "SUCCESS",
            "created_at": ts,
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "merchant_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "buyer_fingerprint": json.dumps({
                "email_hash": "email_user2",
                "ip_subnet": "192.168.1.0/24",
                "device_hash": "device_dev2",
            }),
            "amount_paise": 25000,
            "status": "FAILED",
            "created_at": ts,
        },
    ]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = mock_rows

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value.__aexit__.return_value = None

    count = await rehydrate_from_db(gm, mock_pool, days=30)
    assert count == 2

    # Verify nodes exist in graph
    assert gm.graph.has_node("ip:192.168.1.0/24")
    assert gm.graph.has_node("email:email_user1")
    assert gm.graph.has_node("email:email_user2")

    ip_node = gm.graph.nodes["ip:192.168.1.0/24"]
    assert ip_node["transaction_count"] == 2
    assert ip_node["failed_transaction_count"] == 1
    assert ip_node["successful_transaction_count"] == 1
    assert len(ip_node["merchant_ids_seen"]) == 2


@pytest.mark.asyncio
async def test_rehydrate_detects_qualifying_rings():
    """Verifies that rehydrate_from_db executes ring detection and classifies multi-merchant clusters."""
    gm = GraphManager()
    ts = datetime.now(timezone.utc)

    # 3 nodes: n1, n2, n3 forming triangle, spanning 2 merchants with a failed transaction
    mock_rows = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "merchant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "buyer_fingerprint": {
                "email_hash": "user_a",
                "ip_subnet": "10.0.0.0/24",
                "device_hash": "dev_x",
            },
            "amount_paise": 15000,
            "status": "FAILED",
            "created_at": ts,
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "merchant_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "buyer_fingerprint": {
                "email_hash": "user_a",
                "ip_subnet": "10.0.0.0/24",
                "device_hash": "dev_x",
            },
            "amount_paise": 20000,
            "status": "SUCCESS",
            "created_at": ts,
        },
    ]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = mock_rows

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value.__aexit__.return_value = None

    count = await rehydrate_from_db(gm, mock_pool, days=30)
    assert count == 2
    assert len(gm.rings) >= 1
    ring = list(gm.rings.values())[0]
    assert ring["risk_level"] == "HIGH"
    assert ring["member_nodes_count"] == 3


@pytest.mark.asyncio
async def test_soft_start_rehydration_loop_immediate_success():
    """Verifies that soft_start_rehydration_loop returns immediately if pool is healthy."""
    gm = GraphManager()
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value.__aexit__.return_value = None

    get_pool_mock = AsyncMock(return_value=mock_pool)

    await soft_start_rehydration_loop(gm, get_pool_mock, retry_interval=0.01, days=30)
    assert get_pool_mock.call_count == 1


@pytest.mark.asyncio
async def test_soft_start_rehydration_loop_retries_on_failure():
    """Verifies that soft_start_rehydration_loop retries after an initial connection error."""
    gm = GraphManager()
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value.__aexit__.return_value = None

    attempts = 0

    async def get_pool_flaky():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise ConnectionRefusedError("PostgreSQL connection refused")
        return mock_pool

    await soft_start_rehydration_loop(gm, get_pool_flaky, retry_interval=0.02, days=30)
    assert attempts == 2
