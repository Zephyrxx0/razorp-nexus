---
phase: 2
slug: trust-graph-engine-microservice
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio 1.4.0 |
| **Config file** | `trust-graph-service/pyproject.toml` |
| **Quick run command** | `pytest trust-graph-service/tests/test_graph_manager.py -v` |
| **Full suite command** | `pytest trust-graph-service/tests/ -v` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest trust-graph-service/tests/test_graph_manager.py -v` (or task-specific test module)
- **After every plan wave:** Run `pytest trust-graph-service/tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TRUST-01 | T-02-01 | NetworkX in-memory graph models `{type}:{val}` nodes & weighted clique edges | unit | `pytest trust-graph-service/tests/test_graph_manager.py -v` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | TRUST-04 | T-02-02 | AsyncRWLock protects graph mutations during `POST /trust/signal` | unit | `pytest trust-graph-service/tests/test_graph_manager.py -k test_lock -v` | ✅ | ✅ green |
| 02-02-01 | 02 | 1 | TRUST-02 | T-02-03 | Scoring engine evaluates 0-100 base score, ALLOW/REVIEW/DENY thresholds | unit | `pytest trust-graph-service/tests/test_scoring.py -v` | ✅ | ✅ green |
| 02-02-02 | 02 | 1 | TRUST-03 | T-02-04 | Tiered subnet weighting (50%) and half-life decay applied to fraud penalties | unit | `pytest trust-graph-service/tests/test_scoring.py -k test_penalties -v` | ✅ | ✅ green |
| 02-02-03 | 02 | 1 | RING-01 | T-02-05 | Connected components detects rings (>=3 nodes, >=2 merchants, deg >=1.5, >=1 fail) | unit | `pytest trust-graph-service/tests/test_ring_detector.py -v` | ✅ | ✅ green |
| 02-02-04 | 02 | 1 | RING-02 | T-02-06 | Ring metadata exposes merchants, nodes, blocked txns & blocked paise | unit | `pytest trust-graph-service/tests/test_ring_detector.py -k test_metadata -v` | ✅ | ✅ green |
| 02-03-01 | 03 | 2 | TRUST-05 | T-02-07 | Rehydrates rolling 30-day window from PostgreSQL; soft-start on DB failure | integration | `pytest trust-graph-service/tests/test_rehydration.py -v` | ✅ | ✅ green |
| 02-03-02 | 03 | 2 | RING-04 | T-02-08 | Passive defense-only operations; Cytoscape JSON schemas on `/trust/*` endpoints | integration | `pytest trust-graph-service/tests/test_api.py -v` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `trust-graph-service/pyproject.toml` — project metadata and pytest configuration
- [x] `trust-graph-service/tests/conftest.py` — shared fixtures, mock DB pool, sample buyer fingerprints
- [x] `trust-graph-service/tests/test_graph_manager.py` — unit tests for graph manager and locking
- [x] `trust-graph-service/tests/test_scoring.py` — unit tests for scoring algorithm and penalties
- [x] `trust-graph-service/tests/test_ring_detector.py` — unit tests for ring detection and clustering
- [x] `trust-graph-service/tests/test_rehydration.py` — integration tests for DB rehydration and soft-start
- [x] `trust-graph-service/tests/test_api.py` — integration tests for FastAPI endpoints and Cytoscape schemas

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visualizer graph rendering performance | DASH-04 (preview) | UI Canvas rendering in browser | Open dashboard Cytoscape view and verify 60fps layout stability with 200 nodes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-09-03

---

## Validation Audit 2026-09-03
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

