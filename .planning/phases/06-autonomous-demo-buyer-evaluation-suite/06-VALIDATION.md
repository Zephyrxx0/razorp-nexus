---
phase: 6
slug: autonomous-demo-buyer-evaluation-suite
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio |
| **Config file** | `nexus-agent/pyproject.toml` |
| **Quick run command** | `cd nexus-agent && pytest tests/test_demo_buyer.py tests/test_eval.py -q` |
| **Full suite command** | `cd nexus-agent && pytest tests/ -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | EVAL-03 | T-06-01 | Bearer token auth in MaaS client | unit | `cd nexus-agent && pytest tests/test_demo_buyer.py -k test_tools` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | EVAL-03 | T-06-02 | Dual-mode LLM fallback without credential leak | integration | `cd nexus-agent && pytest tests/test_demo_buyer.py -k test_agent` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | EVAL-01 | T-06-03 | Seeded deterministic dataset generation | unit | `cd nexus-agent && pytest tests/test_eval.py -k test_dataset_generation` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | EVAL-02 | T-06-04 | Integer paise ₹ False-Positive Cost accuracy | integration | `cd nexus-agent && pytest tests/test_eval.py -k test_eval_metrics` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | EVAL-04 | T-06-05 | 12-member ring detection and score degradation | integration | `cd nexus-agent && pytest tests/test_simulate_ring_attack.py` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | EVAL-04 | T-06-06 | SHA-256 sealed audit hash chain validation | e2e | `cd nexus-agent && pytest tests/test_demo_e2e.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `nexus-agent/tests/test_demo_buyer.py` — unit tests for DemoBuyerAgent and MaaS tools
- [ ] `nexus-agent/tests/test_eval.py` — unit tests for benchmark generator and evaluation runner
- [ ] `nexus-agent/tests/test_simulate_ring_attack.py` — unit tests for ring attack simulation
- [ ] `nexus-agent/tests/test_demo_e2e.py` — tests for 3-Act end-to-end demo runner

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Cytoscape Graph Clustering during Paced Ring Attack | EVAL-04 | Visual rendering validation | Start Next.js dashboard, open `/dashboard/trust-graph`, run `python scripts/simulate_ring_attack.py`, verify nodes turn red and cluster visually in real time. |
| Stage Demo Walkthrough with Presenter Pauses | EVAL-04 | Presentation flow verification | Run `python scripts/demo_e2e.py` without `--auto`, press Enter at each act prompt, verify terminal formatting and instructions. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-04
