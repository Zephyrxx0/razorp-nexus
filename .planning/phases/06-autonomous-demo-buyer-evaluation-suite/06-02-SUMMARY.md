# Phase 06 Plan 02: Benchmark Dataset Generator & Evaluation Suite Summary

**Plan:** 06-02  
**Phase:** 06-autonomous-demo-buyer-evaluation-suite  
**Requirements Covered:** EVAL-01, EVAL-02  
**Status:** Completed  
**Execution Date:** 2026-09-04  

---

## 1. Executive Summary

Plan 06-02 delivered the complete synthetic benchmark dataset generator and dual-mode evaluation harness for the Nexus Trust Graph Engine. The generator deterministically constructs a 500-transaction benchmark dataset (`datasets/synthetic_500.json`) containing exactly 300 Legitimate transactions and 200 Fraudulent transactions across 4 synthetic merchants, injecting 3 coordinated fraud ring typologies. The evaluation runner (`scripts/run_eval.py`) executes in-memory (`--mode fast` in <1 second) and over HTTP (`--mode live`), computing exact confusion matrix parameters, Precision, Recall, F1 score, False-Positive Rate, and exact integer paise direct GMV loss ₹ False-Positive Cost, exporting results to `results/eval_report.json`.

---

## 2. Multi-Source Coverage Audit

| Requirement / Spec | Description | Status | Verification Evidence |
|--------------------|-------------|--------|-----------------------|
| **PRD §18.3 & §18.4** | 500 txs, 4 merchants, 3 rings, Precision $\ge 80\%$, Recall $\ge 75\%$, False-Positive Cost in ₹ | **Achieved** | Precision 96.9%, Recall 95.0%, F1 0.960, FP Cost ₹11,940.00 (1,194,000 paise) |
| **06-CONTEXT D-05** | Deterministic generator script `scripts/generate_benchmark_dataset.py` with seeded RNG saving `datasets/synthetic_500.json` | **Achieved** | Seed 42 produces identical SHA-256 hash across repeated runs |
| **06-CONTEXT D-06** | 300 Legit / 200 Fraud txs across $\ge 4$ merchants with 3 distinct fraud ring topologies | **Achieved** | Ring Alpha (80 txs), Ring Beta (70 txs), Ring Gamma (50 txs) across 4 merchants |
| **06-CONTEXT D-07** | Dual-mode runner `scripts/run_eval.py` supporting `--mode fast` in <15s and `--mode live` via FastAPI | **Achieved** | Fast mode in-memory executes in 0.69s (< 15s SLA); live mode calls `/trust/score` & `/trust/signal` |
| **06-CONTEXT D-08** | Direct GMV loss ₹ False-Positive Cost calculation summing `amount_paise` of falsely blocked legit txs | **Achieved** | Exact integer paise summation: 1,194,000 paise = ₹11,940.00 in `results/eval_report.json` |

---

## 3. Tasks Completed

### Task 1: Synthetic Benchmark Dataset Generator (06-02-01)
- Implemented `scripts/generate_benchmark_dataset.py` with deterministic RNG (`seed=42`).
- Defined 4 synthetic test merchants: Apex Electronics, Urban Threads, Gourmet Direct, Nova Techwear.
- Injected 3 coordinated fraud rings across 200 fraudulent transactions:
  - **Ring Alpha (80 txs):** 8 synthetic identities sharing 2 unique hardware devices (`hw_fingerprint_ring_alpha_1`, `hw_fingerprint_ring_alpha_2`) across all 4 merchants, with early payment failure triggering 2-hop local ego ring detection.
  - **Ring Beta (70 txs):** 12 identities operating from shared `/24` subnet `198.51.100.0/24`, invoking velocity and fraud neighbor penalties.
  - **Ring Gamma (50 txs):** 6 identities sharing common UPI handles (`syndicate_pay@okaxis`, `quickcash@ybl`) and user-agents hopping across stores.
- Generated 300 legitimate transactions with integer paise pricing (₹499 to ₹29,990), with 6 borderline transactions sharing a flagged public terminal device to model realistic false positives.
- Emitted canonical fixture `datasets/synthetic_500.json`.
- Added unit tests in `nexus-agent/tests/test_eval.py` verifying distribution and reproducibility.

### Task 2: Dual-Mode Evaluation Harness & ₹ False-Positive Cost Reporting (06-02-02)
- Implemented `scripts/run_eval.py` supporting CLI flags `--dataset`, `--mode [fast|live]`, `--trust-url`, `--output`, and `--verbose`.
- Implemented in-memory fast mode evaluation sequentially scoring against `GraphManager` and `TrustScorer` in < 1 second.
- Implemented live HTTP mode evaluation against FastAPI `/trust/score` and `/trust/signal`.
- Implemented exact financial accounting: summing 64-bit integer `amount_paise` for false positives and formatting to Indian Rupee string (`f"₹{paise / 100:,.2f}"`).
- Output evaluation report to `results/eval_report.json`.
- Added comprehensive unit and integration tests in `nexus-agent/tests/test_eval.py`.

---

## 4. Evaluation Benchmark Results

From `results/eval_report.json` (evaluated against `datasets/synthetic_500.json`):

```json
{
  "total_transactions": 500,
  "legitimate_count": 300,
  "fraudulent_count": 200,
  "blocked_by_nexus": 196,
  "true_positives": 190,
  "false_positives": 6,
  "true_negatives": 294,
  "false_negatives": 10,
  "precision": 0.9694,
  "recall": 0.95,
  "f1_score": 0.9596,
  "false_positive_rate": 0.02,
  "false_positive_cost_paise": 1194000,
  "false_positive_cost_inr": "₹11,940.00",
  "mode": "fast",
  "evaluated_at": "2026-09-03T20:50:28.013925+00:00"
}
```

```
═════════════════════════════════════════════════════════════════════
                NEXUS TRUST GRAPH BENCHMARK EVALUATION                
═════════════════════════════════════════════════════════════════════
 Total transactions:             500
 Legitimate (ground truth):      300
 Fraudulent (ground truth):      200
 Blocked by Nexus:               196
 True positives (fraud blocked): 190
 False positives (legit blocked):6
 False negatives (fraud passed): 10
 True negatives (legit passed):  294
─────────────────────────────────────────────────────────────────────
 Precision:                      0.969 (96.9%)  [Target: >= 80.0%]
 Recall:                         0.950 (95.0%)  [Target: >= 75.0%]
 F1 Score:                       0.960
 False-positive rate:            0.020 (2.0%)  [Target: <= 5.0%]
 False-positive cost:            ₹11,940.00 (1194000 paise)
 Execution Mode:                 FAST
═════════════════════════════════════════════════════════════════════
```

---

## 5. Test Verification Summary

- `python scripts/run_eval.py --mode fast`: Completed in **0.69s** (Target: < 15s).
- `cd nexus-agent && pytest tests/test_eval.py -v`:
  - `test_dataset_generation_count_and_distribution`: **PASSED**
  - `test_dataset_reproducibility`: **PASSED**
  - `test_eval_metrics_thresholds`: **PASSED**
  - `test_eval_report_json_schema`: **PASSED**
- Full `nexus-agent` suite: **54 / 54 PASSED** (0 failures).
- Full `trust-graph-service` suite: **38 / 38 PASSED** (0 failures).

---

## 6. Git Commits

1. `3ba9423` - `feat(eval): generate synthetic 500 benchmark dataset with 3 fraud rings`
2. `8723fe0` - `feat(eval): dual-mode evaluation harness with exact integer paise FP cost reporting`
