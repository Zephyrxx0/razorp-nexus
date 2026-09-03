"""Tests for hash-chained append-only audit logging and verification (AUDIT-01, AUDIT-02)."""

import uuid
import pytest
from nexus_agent.tools.audit import log_audit_entry
from nexus_db.audit import verify_audit_chain


@pytest.mark.asyncio
async def test_log_audit_entry_computes_genesis_and_subsequent_hashes(mock_db_pool):
    """Verify step 1 has prev_entry_hash='GENESIS', and step 2 links to step 1 entry_hash."""
    tx_id = str(uuid.uuid4())
    merchant_id = str(uuid.uuid4())
    steps = [
        {
            "step_name": "PARSE_INTENT",
            "input_summary": "Buy 1 Nexus Router",
            "output_summary": "query='Nexus Router', qty=1",
            "reason": "Successfully parsed intent",
            "raw_data": {"query": "Nexus Router", "qty": 1},
            "duration_ms": 15,
            "is_error": False,
        },
        {
            "step_name": "RESOLVE_CATALOG",
            "input_summary": "query='Nexus Router', qty=1",
            "output_summary": "product_id=prod-123, stock_after=24",
            "reason": "Stock reserved",
            "raw_data": {"product_id": "prod-123"},
            "duration_ms": 25,
            "is_error": False,
        },
    ]

    res = await log_audit_entry(
        pool=mock_db_pool,
        transaction_id=tx_id,
        merchant_id=merchant_id,
        steps=steps,
        final_status="SUCCESS",
        final_reason="All steps completed",
    )

    assert res["transaction_id"] == tx_id
    assert res["entries_logged"] == 2
    assert res["is_valid_chain"] is True

    entries = res["entries"]
    assert entries[0]["prev_entry_hash"] == "GENESIS"
    assert len(entries[0]["entry_hash"]) == 64
    assert entries[1]["prev_entry_hash"] == entries[0]["entry_hash"]
    assert len(entries[1]["entry_hash"]) == 64

    # Verify DB execution occurred
    assert len(mock_db_pool.conn.queries) == 3  # 2 inserts + 1 update


@pytest.mark.asyncio
async def test_log_audit_entry_sanitizes_pii_and_secrets():
    """Verify credit card / secret keys in raw_data are redacted and PII hashed."""
    tx_id = str(uuid.uuid4())
    steps = [
        {
            "step_name": "PARSE_INTENT",
            "input_summary": "User purchase request",
            "output_summary": "Intent parsed",
            "reason": "OK",
            "raw_data": {
                "razorpay_key_secret": "sec_super_secret_merchant_key",
                "password": "super_secret_password",
                "credit_card": "4111 2222 3333 4444",
                "buyer_email": "buyer@example.com",
                "ip": "192.168.1.100",
            },
            "duration_ms": 10,
            "is_error": False,
        }
    ]

    res = await log_audit_entry(
        transaction_id=tx_id,
        steps=steps,
        final_status="SUCCESS",
        final_reason="OK",
    )

    assert res["is_valid_chain"] is True
    sanitized = res["entries"][0]["raw_data"]
    assert sanitized["razorpay_key_secret"] == "[REDACTED]"
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["credit_card"] == "[REDACTED]"
    assert sanitized["buyer_email"] != "buyer@example.com"
    assert sanitized["ip"] == "192.168.1.0/24"


@pytest.mark.asyncio
async def test_audit_chain_verification_passes():
    """Assert verify_audit_chain returns True for complete 6-step chain and 3-step denied chain."""
    tx_id_6 = str(uuid.uuid4())
    steps_6 = [
        {"step_name": f"STEP_{i}", "input_summary": f"in_{i}", "output_summary": f"out_{i}", "reason": f"reason_{i}", "duration_ms": 10, "is_error": False}
        for i in range(1, 7)
    ]
    res_6 = await log_audit_entry(
        transaction_id=tx_id_6,
        steps=steps_6,
        final_status="SUCCESS",
        final_reason="Completed",
    )
    assert res_6["entries_logged"] == 6
    assert res_6["is_valid_chain"] is True
    assert verify_audit_chain(res_6["entries"]) is True

    # 3-step denied chain (Parse -> Catalog -> Trust -> Denied/Rollback -> Step 6)
    tx_id_3 = str(uuid.uuid4())
    steps_3 = [
        {"step_name": "PARSE_INTENT", "input_summary": "in_1", "output_summary": "out_1", "reason": "ok", "duration_ms": 10, "is_error": False},
        {"step_name": "RESOLVE_CATALOG", "input_summary": "in_2", "output_summary": "out_2", "reason": "ok", "duration_ms": 15, "is_error": False},
        {"step_name": "CHECK_TRUST_GRAPH", "input_summary": "in_3", "output_summary": "score=25.0", "reason": "DENIED", "duration_ms": 20, "is_error": True},
    ]
    res_3 = await log_audit_entry(
        transaction_id=tx_id_3,
        steps=steps_3,
        final_status="DENIED",
        final_reason="Trust score below threshold",
    )
    assert res_3["entries_logged"] == 3
    assert res_3["is_valid_chain"] is True
    assert verify_audit_chain(res_3["entries"]) is True


@pytest.mark.asyncio
async def test_audit_chain_tamper_detection():
    """Deliberately alter one character of input_summary in an entry; assert verify_audit_chain returns False."""
    tx_id = str(uuid.uuid4())
    steps = [
        {"step_name": "STEP_1", "input_summary": "original input 1", "output_summary": "out_1", "reason": "ok", "duration_ms": 10, "is_error": False},
        {"step_name": "STEP_2", "input_summary": "original input 2", "output_summary": "out_2", "reason": "ok", "duration_ms": 10, "is_error": False},
        {"step_name": "STEP_3", "input_summary": "original input 3", "output_summary": "out_3", "reason": "ok", "duration_ms": 10, "is_error": False},
    ]
    res = await log_audit_entry(
        transaction_id=tx_id,
        steps=steps,
        final_status="SUCCESS",
        final_reason="Completed",
    )
    assert res["is_valid_chain"] is True
    entries = res["entries"]

    # Tamper with entry 1 input_summary
    entries[1]["input_summary"] = "tampered input 2"
    assert verify_audit_chain(entries) is False

    # Tamper with prev_entry_hash
    entries[1]["input_summary"] = "original input 2"
    entries[2]["prev_entry_hash"] = "0" * 64
    assert verify_audit_chain(entries) is False
