---
phase: 3
slug: google-adk-orchestrator-tool-suite
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.3.3, pytest-asyncio 0.24.0 |
| **Config file** | `nexus-agent/pyproject.toml` |
| **Quick run command** | `pytest nexus-agent/tests/test_intent.py nexus-agent/tests/test_defense_in_depth.py -v` |
| **Full suite command** | `pytest nexus-agent/tests/ -v` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest nexus-agent/tests/test_intent.py nexus-agent/tests/test_defense_in_depth.py -v`
- **After every plan wave:** Run `pytest nexus-agent/tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ORCH-01 | T-03-01 | Port 8000 ADK endpoint responds with event schema in <2s | integration | `pytest nexus-agent/tests/test_api.py -v` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | ORCH-02 | T-03-02 | Strict sequential 6-step deterministic pipeline without skip/reorder | unit | `pytest nexus-agent/tests/test_pipeline.py -v` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | ORCH-03 | T-03-03 | Structured intent extraction with bounds check rejecting <=0 and >100 | unit | `pytest nexus-agent/tests/test_intent.py -v` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | ORCH-04 | T-03-04 | Atomic stock decrement in Postgres; compensatory rollback on downstream failure | integration | `pytest nexus-agent/tests/test_catalog.py -v` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | ORCH-05 | T-03-05 | Trust score < 40 halts immediately without invoking Razorpay | unit | `pytest nexus-agent/tests/test_pipeline.py::test_trust_denial_halts_before_razorpay -v` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | RING-03 | T-03-06 | Programmatic gate in create_razorpay_order raises TrustViolationError if score < 40 | unit | `pytest nexus-agent/tests/test_defense_in_depth.py -v` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | RZP-01 | T-03-07 | Razorpay test order creation with integer paise and metadata notes attached | unit | `pytest nexus-agent/tests/test_razorpay.py::test_create_order_integer_paise_and_notes -v` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | RZP-02 | T-03-08 | Razorpay payment capture against order in test mode with payment ID record | unit | `pytest nexus-agent/tests/test_razorpay.py::test_capture_payment_test_mode -v` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 3 | AUDIT-01 | T-03-09 | Cryptographic SHA-256 hash-chained immutable audit log verified via verify_audit_chain | integration | `pytest nexus-agent/tests/test_audit.py -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `nexus-agent/pyproject.toml` — project definition with dependencies (`google-adk`, `google-generativeai`, `razorpay`, `asyncpg`, `httpx`, `pydantic`, `pytest`, `pytest-asyncio`)
- [ ] `nexus-agent/tests/conftest.py` — mock fixtures for DB, Trust Graph service, Razorpay adapter, and Gemini
- [ ] Test stub files: `tests/test_intent.py`, `tests/test_catalog.py`, `tests/test_trust.py`, `tests/test_razorpay.py`, `tests/test_defense_in_depth.py`, `tests/test_audit.py`, `tests/test_pipeline.py`, `tests/test_api.py`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | All phase behaviors have automated verification via pytest. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-03
