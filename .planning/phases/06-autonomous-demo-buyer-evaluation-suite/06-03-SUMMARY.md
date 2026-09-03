# Phase 06 Plan 03: Ring Attack Simulation & 3-Act End-to-End Demo Script Summary

**Plan:** 06-03  
**Phase:** 06-autonomous-demo-buyer-evaluation-suite  
**Requirements Covered:** EVAL-04  
**Status:** Completed  
**Execution Date:** 2026-09-04  

---

## 1. Executive Summary

Plan 06-03 delivered the coordinated multi-merchant fraud ring attack simulator (`scripts/simulate_ring_attack.py`) and the comprehensive 3-Act end-to-end demonstration CLI script (`scripts/demo_e2e.py`) conforming to PRD §14, PRD §18.3, and Phase 6 decisions (D-09 through D-16).

The ring simulator demonstrates cross-merchant risk contagion as a 12-member syndicate sharing 3 hardware devices and 2 `/24` subnets attacks 3+ merchants across 50 transactions. It models live trust score degradation ($85 \rightarrow 50 \rightarrow 10 \rightarrow 0$) and triggers synchronous 2-hop local ego ring quarantine at Transaction 15, rejecting all subsequent transactions with HTTP 403 Forbidden (`status: DENIED`, `trust_score: 0.0`).

The 3-Act demonstration CLI script provides automated pre-flight health checks (PostgreSQL port 5432, Next.js port 3000, Trust Graph port 8001), executes Act 1 (Merchant Onboarding & Catalog Verification), Act 2 (Autonomous AI Buyer purchase with full Razorpay captured proof card and SHA-256 parent hash verification with ASCII timeline), and Act 3 (Coordinated Ring Attack interception with HTTP 403 gating, zero Razorpay fund movement, atomic stock rollback, and verified DENY audit trail). Both interactive presenter mode and non-interactive CI automation (`--auto`) are supported.

---

## 2. Multi-Source Coverage Audit

| Requirement / Spec | Description | Status | Verification Evidence |
|--------------------|-------------|--------|-----------------------|
| **PRD §14 & §18.3** | 3-Act walkthrough (Act 1 Merchant onboarding, Act 2 Autonomous AI buyer, Act 3 Ring attack & live degradation); 12 identities, 50 txs across 3+ merchants | **Achieved** | `scripts/demo_e2e.py` and `scripts/simulate_ring_attack.py` implement all acts and parameters |
| **06-CONTEXT D-09** | 12-member syndicate across 3+ merchants sharing 3 device IDs and 2 `/24` subnets | **Achieved** | `dev_syndicate_a1..a3`, subnets `198.51.100.0/24`, `203.0.113.0/24` across 50 txs |
| **06-CONTEXT D-10** | Paced progression (200-500ms) with terminal progress bar and trust score transitions ($85 \rightarrow 50 \rightarrow 10 \rightarrow 0$) | **Achieved** | Paced async dispatch with Rich table/progress formatting and real-time score degradation |
| **06-CONTEXT D-11** | Hybrid target flag `--target [maas\|trust-service]` defaulting to `maas` with automatic fallback to port 8001 | **Achieved** | Dispatches to Next.js MaaS API gateway and syncs signals with FastAPI Trust Graph |
| **06-CONTEXT D-12** | Auto-detect and auto-seed $\ge 3$ test merchants (Apex, Zenith, Urban Threads) | **Achieved** | `auto_seed_merchants_if_needed` inspects PostgreSQL and seeds missing merchants with Bearer tokens |
| **06-CONTEXT D-13** | 3-Act interactive CLI with presenter pauses and `--auto` non-interactive CI flag | **Achieved** | `demo_e2e.py` supports both interactive `[Enter]` pauses and non-interactive `--auto` mode |
| **06-CONTEXT D-14** | Full proof card: Razorpay Order ID (`order_*`), Payment ID (`pay_*`), captured status, ₹ amount, Nexus tx ID | **Achieved** | Act 2 logs formatted Rich proof card with all required attributes |
| **06-CONTEXT D-15** | Cryptographic hash-chain validation & ASCII timeline for 100% steps in ALLOW and DENY | **Achieved** | Validates SHA-256 parent links via `verify_audit_chain`, displays ASCII timelines and `"SEALED INTEGRITY: VALID"` badges |
| **06-CONTEXT D-16** | Automated pre-flight infrastructure health checks for 5432, 3000, 8001 | **Achieved** | `run_preflight_health_checks` checks PostgreSQL, Next.js, and Trust Graph with actionable startup commands |

---

## 3. Tasks Completed

### Task 1: Multi-Merchant Ring Attack Simulator (06-03-01)
- Implemented `scripts/simulate_ring_attack.py` enforcing CLI flags: `--target`, `--ring-size 12`, `--transactions 50`, `--pace-ms 300`, `--auto-seed`, `--base-url`, `--trust-url`, `--db-url`.
- Built syndicate topology generator (`generate_syndicate_identities`) creating 12 synthetic fraudsters (`attacker_01@darkweb.org` .. `attacker_12@darkweb.org`) sharing 3 devices and 2 subnets.
- Implemented 4-stage progression (`build_attack_transactions`):
  - Stage 1 (Txs 1–5): Probing on Merchant 1 with clean scores (~85.0–90.0) and a deliberate payment failure on Tx 3.
  - Stage 2 (Txs 6–14): Cross-merchant clustering on Merchants 2 & 3 with velocity and spread penalties.
  - Stage 3 (Tx 15): Bridge transaction connecting the failure into the cross-merchant cluster, satisfying all 4 ring criteria.
  - Stage 4 (Txs 16–50): Quarantined barrage; all 35 remaining transactions blocked with score 0.0 and HTTP 403 Forbidden.
- Added dual target support: Next.js MaaS (`POST /api/maas/{id}/transact`) and FastAPI Trust Graph (`POST /trust/score` & `POST /trust/signal`).
- Created unit and simulation tests in `nexus-agent/tests/test_simulate_ring_attack.py`:
  - `test_syndicate_topology_generation`: asserts 12 identities, shared devices, shared subnets.
  - `test_attack_transactions_structure`: asserts 50 transactions, multi-merchant spread, bridge at Tx 15.
  - `test_in_memory_ring_attack_progression`: asserts score degradation, detection at Tx 15, and 100% denial of txs 16–50.
- **Commit:** `709a319` (`feat(eval): add multi-merchant ring attack simulator and tests (06-03-01)`).

### Task 2: 3-Act End-to-End Demo Script & Cryptographic Audit Inspection (06-03-02)
- Implemented `scripts/demo_e2e.py` supporting CLI flags: `--auto`, `--base-url`, `--trust-url`, `--db-url`, `--mock`.
- Built automated pre-flight health checks for PostgreSQL (5432), Next.js (3000), and FastAPI Trust Graph (8001).
- Implemented Act 1 (Merchant Onboarding & Catalog Verification) verifying merchant credentials and catalog products with integer paise pricing.
- Implemented Act 2 (Autonomous AI Buyer Transacts — ALLOW Path) executing purchase via `DemoBuyerAgent`, rendering Razorpay proof card, verifying SHA-256 audit hash-chain integrity with `verify_audit_chain`, and rendering an ASCII step execution timeline table.
- Implemented Act 3 (Coordinated Ring Attack & Real-Time Contagion Interception — DENY Path) executing the ring attack, demonstrating score collapse to 0.0, validating HTTP 403 gating, confirming ₹0 Razorpay movement, verifying compensatory rollback, and rendering the DENY ASCII timeline and sealed badge.
- Created unit and integration tests in `nexus-agent/tests/test_demo_e2e.py`:
  - `test_preflight_checks_mock`: tests health check parser with mock services.
  - `test_audit_hash_chain_validation`: tests parent hash linking on intact and tampered audit records.
  - `test_demo_e2e_auto_flow`: executes end-to-end demo in non-interactive `--auto --mock` mode, asserting exit code 0.
- **Commit:** `f1742d9` (`feat(eval): add 3-act end-to-end demo presentation script and tests (06-03-02)`).

---

## 4. Verification Evidence

### 1. Test Suite Execution
Command: `cd nexus-agent && pytest tests/test_simulate_ring_attack.py tests/test_demo_e2e.py -v`
```
============================= test session starts ==============================
platform linux -- Python 3.14.7, pytest-9.1.1, pluggy-1.6.0 -- /usr/bin/python
rootdir: /home/zeph/Code/nexus/nexus-agent
configfile: pyproject.toml
plugins: anyio-4.14.1, cov-7.1.0, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False

tests/test_simulate_ring_attack.py::test_syndicate_topology_generation PASSED [ 16%]
tests/test_simulate_ring_attack.py::test_attack_transactions_structure PASSED [ 33%]
tests/test_simulate_ring_attack.py::test_in_memory_ring_attack_progression PASSED [ 50%]
tests/test_demo_e2e.py::test_preflight_checks_mock PASSED                [ 66%]
tests/test_demo_e2e.py::test_audit_hash_chain_validation PASSED          [ 83%]
tests/test_demo_e2e.py::test_demo_e2e_auto_flow PASSED                   [100%]

======================== 6 passed, 2 warnings in 2.80s =========================
```

### 2. Full Agent Suite Regression Check
Command: `cd nexus-agent && pytest tests/ -q`
```
............................................................             [100%]
60 passed, 2 warnings in 3.50s
```

### 3. CLI Interface Help Verification
Command: `python scripts/simulate_ring_attack.py --help && python scripts/demo_e2e.py --help`
Both scripts returned exit code 0 with complete argument descriptions.

---

## 5. Threat Model Sign-off

| Threat | Description | ASVS Reference | Mitigation Verification | Status |
|--------|-------------|----------------|-------------------------|--------|
| **T-06-05** | Simulation failing due to missing test merchants or uninitialized database tables | V14.4.1 (Resilience) | `auto_seed_merchants_if_needed` automatically queries and seeds missing test merchants (`Apex Electronics`, `Zenith Apparel`, `Urban Threads`) with valid Bearer tokens. Fallback default configurations ensure frictionless execution even when database is offline. | **Mitigated** |
| **T-06-06** | Fraud ring bypassing trust gate and moving unauthorized funds via Razorpay | V5.1.1 (Defense-in-Depth Trust Gate) | On trust score $< 40$, gateway returns HTTP 403 Forbidden with `razorpay_order_id: null` and `razorpay_payment_id: null`. The demo script rigorously asserts zero unauthorized Razorpay movements and atomic rollback of reserved stock. | **Mitigated** |

---

## 6. Commit References

| Task | Commit Hash | Summary |
|------|-------------|---------|
| **06-03-01** | `709a319` | feat(eval): add multi-merchant ring attack simulator and tests (06-03-01) |
| **06-03-02** | `f1742d9` | feat(eval): add 3-act end-to-end demo presentation script and tests (06-03-02) |
