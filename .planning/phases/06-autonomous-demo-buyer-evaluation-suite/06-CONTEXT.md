# Phase 6: Autonomous Demo Buyer & Evaluation Suite - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the autonomous Google ADK `DemoBuyerAgent`, multi-merchant ring attack simulation (`scripts/simulate_ring_attack.py`), 500-transaction benchmark evaluation harness (`scripts/run_eval.py` computing Precision, Recall, F1, and explicit ₹ False-Positive Cost), and comprehensive end-to-end 3-Act demonstration script (`scripts/demo_e2e.py`).

</domain>

<decisions>
## Implementation Decisions

### Demo Buyer Agent Runtime
- **D-01:** Dual entry model: standalone CLI (`python -m nexus_agent.agents.demo_buyer --merchant <id> --goal "..."`) and programmatic Python class `DemoBuyerAgent` reusable in test suites and evaluation scripts.
- **D-02:** Dual-mode LLM inference: live Gemini 2.0 Flash (`google-genai` / `gemini-2.0-flash-exp`) with structured tool-calling when `GEMINI_API_KEY` is present; deterministic semantic/heuristic fallback when API key is unset or network is offline.
- **D-03:** Real HTTP communication via `httpx` async client against live Next.js MaaS endpoints (`GET /api/maas/{id}/catalog`, `POST /api/maas/{id}/transact`) using live Bearer tokens (`maas_live_*`).
- **D-04:** Structured thought & execution telemetry: agent streams step-by-step reasoning (catalog search -> candidate filtering -> SKU selection -> order dispatch -> payment verification) with formatted terminal output and structured JSON outcome receipts.

### Evaluation Benchmark Dataset & Metrics
- **D-05:** Deterministic generator script `scripts/generate_benchmark_dataset.py` with seeded RNG outputting reproducible versioned JSON fixture `datasets/synthetic_500.json` (enabling instant offline testing and on-demand regeneration).
- **D-06:** 300 Legitimate / 200 Fraud transaction distribution (per PRD §18.4) with ground truth labels (`label: "LEGIT"` vs `label: "FRAUD"`), injecting 3 distinct coordinated fraud rings (device-sharing clique, IP subnet cluster, and card/merchant hopper) across 4+ merchants.
- **D-07:** Dual-mode evaluation runner in `scripts/run_eval.py` supporting `--mode fast` (in-memory evaluation against NetworkX `TrustGraph` engine in <15s) and `--mode live` (evaluates against live FastAPI `/trust/score` & `/transact` endpoints).
- **D-08:** Direct GMV loss ₹ False-Positive Cost calculation: sums exact `amount_paise` of legitimate transactions falsely blocked (DENIED when label is LEGIT), converted to formatted ₹ and paise, alongside Precision (target >= 80%), Recall (target >= 75%), F1, and FPR, writing results to `results/eval_report.json`.

### Ring Attack Simulation Topology
- **D-09:** 12-member coordinated syndicate across 3+ merchants (per PRD §14/§18.3) sharing overlapping device fingerprints and /24 IP subnets sending 50 transactions across 3+ merchants to demonstrate cross-merchant risk contagion.
- **D-10:** Paced progression (200-500ms intervals between txs) with terminal progress bar and live trust score transitions (85 -> 50 -> 10 -> 0), allowing live Cytoscape.js dashboard graph clustering during presentations.
- **D-11:** Hybrid target flag `--target [maas|trust-service]` defaulting to `maas` (`POST /api/maas/{id}/transact`) for complete E2E gateway defense demonstration, with fallback to FastAPI port 8001 if Next.js is not running.
- **D-12:** Auto-detect & auto-seed: `simulate_ring_attack.py` inspects DB/API for >=3 test merchants; if not present, automatically invokes or seeds standard test merchants (Apex, Zenith, Nova) for frictionless out-of-the-box execution.

### End-to-End Demo Presentation Script
- **D-13:** 3-Act interactive CLI (`scripts/demo_e2e.py`) following PRD §14 (Act 1: Merchant onboarding check, Act 2: Happy path ALLOW purchase with DemoBuyerAgent, Act 3: Ring attack DENY & graph clustering) with step-by-step pauses for presenter commentary and an `--auto` flag for non-interactive CI verification.
- **D-14:** Full proof verification display for Act 2 happy path: logs Razorpay Order ID (`order_*`), Payment ID (`pay_*`), captured status, integer paise amount in ₹, and Nexus transaction ID.
- **D-15:** Cryptographic hash-chain validation & ASCII timeline: verifies SHA-256 parent link integrity across 100% of tool steps for both ALLOW and DENY, rendering an ASCII step latency/rationale table and "SEALED INTEGRITY: VALID" badge.
- **D-16:** Automated pre-flight health check: pings PostgreSQL (5432), Next.js (3000), and FastAPI Trust Graph (8001) before running, reporting green status checks or actionable startup commands if down.

### the agent's Discretion
- Exact CLI styling, color themes, and spinner animations (using rich or standard ANSI codes).
- Internal synthetic data generation random seeds and specific product query strings.
- Exact retry delays and timeout thresholds for HTTP clients.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Requirements & Architecture
- `PRD.md` §9.2 — `DemoBuyerAgent` specification, instruction prompt, and tool definitions
- `PRD.md` §14 — Demo walkthrough script (Act 1, Act 2, Act 3) and expected presenter flows
- `PRD.md` §18.3 / §18.4 — Simulation setup, expected eval output, precision/recall targets, and ₹ FP cost calculation
- `.planning/ROADMAP.md` §Phase 6 — Phase 6 goals, requirements (EVAL-01..04), and success criteria
- `.planning/REQUIREMENTS.md` §Evaluation & Benchmark Suite — EVAL-01, EVAL-02, EVAL-03, EVAL-04

### Microservice & API Contracts
- `nexus-agent/nexus_agent/tools/` — Orchestrator tool suite (intent, catalog, trust, razorpay, audit)
- `nexus-agent/nexus_agent/pipeline/runner.py` — 6-step deterministic transaction execution pipeline
- `trust-graph-service/app/services/graph.py` — In-memory NetworkX TrustGraph engine and scoring algorithms
- `trust-graph-service/app/api/routes_trust.py` — Trust scoring, graph, and ring detection endpoints
- `src/app/api/maas/[merchant_id]/transact/route.ts` — MaaS transaction route handler
- `src/app/api/maas/[merchant_id]/catalog/route.ts` — MaaS catalog route handler
- `src/app/api/audit/[transaction_id]/route.ts` — Audit trail endpoint with cryptographic hash chaining

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/seed-demo.js`: Database seeding script for test merchants (Apex Electronics, Zenith Apparel) and product catalogs with integer paise pricing.
- `nexus-agent/nexus_agent/pipeline/state.py`: Typed Pydantic data models for `BuyerFingerprint`, `TransactionState`, and `AuditEntry`.
- `nexus-agent/nexus_agent/razorpay_adapter.py`: Razorpay test-mode adapter for order creation and payment capture.
- `trust-graph-service/app/services/detector.py`: Connected component and fraud ring detection algorithms.

### Established Patterns
- Integer paise (`amount_paise`) strictly used for all financial amounts.
- Buyer PII hashed (SHA-256 for email/user-agent, /24 truncation for IPs) before trust graph ingestion.
- Deterministic 6-step pipeline producing cryptographic SHA-256 hash chains in append-only PostgreSQL table.
- Dual-mode patterns (fast engine vs live HTTP) for developer speed and testing resilience.

### Integration Points
- `datasets/synthetic_500.json`: 500-transaction benchmark dataset fixture.
- `scripts/generate_benchmark_dataset.py`: Generator script for the benchmark dataset.
- `scripts/run_eval.py`: Evaluation harness computing precision, recall, F1, and ₹ False-Positive Cost.
- `scripts/simulate_ring_attack.py`: Multi-merchant coordinated ring attack simulation.
- `scripts/demo_e2e.py`: 3-Act interactive and automated demo script runner.
- `nexus-agent/nexus_agent/agents/demo_buyer.py`: Google ADK `DemoBuyerAgent`.

</code_context>

<specifics>
## Specific Ideas
- The evaluation report should mirror the PRD §18.4 format: Total transactions (500), Legitimate (300), Fraudulent (200), Blocked by Nexus, True positives, False positives, Precision (>=80%), Recall (>=75%), F1, False-positive rate, and False-positive cost in ₹.
- Terminal demo script provides a compelling stage presentation where the audience watches trust score degrade as nodes turn red on the Cytoscape graph in real time.

</specifics>

<deferred>
## Deferred Ideas
None — discussion stayed strictly within Phase 6 scope.

</deferred>

---

*Phase: 6-Autonomous Demo Buyer & Evaluation Suite*
*Context gathered: 2026-09-04*
