# Phase 6: Autonomous Demo Buyer & Evaluation Suite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 06-Autonomous Demo Buyer & Evaluation Suite
**Areas discussed:** Demo Buyer Agent Runtime, Evaluation Benchmark Dataset & Metrics, Ring Attack Simulation Topology, End-to-End Demo Presentation Script

---

## Demo Buyer Agent Runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Dual entry CLI + class | Standalone CLI (`python -m nexus_agent.agents.demo_buyer --merchant <id> --goal "..."`) + programmatic Python class `DemoBuyerAgent` callable by scripts/eval | ✓ |
| Strict ADK runner only | `adk run nexus_agent/agents/demo_buyer.py` interactive shell only | |
| FastAPI endpoint only | Mounted exclusively inside `nexus-agent` (`POST /buyer/run`) | |

**User's choice:** Dual entry CLI + class
**Notes:** Provides maximum flexibility for CLI demo, evaluation harness, and unit testing.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-mode Gemini / mock | Live Gemini 2.0 Flash (`gemini-2.0-flash-exp`) with deterministic mock fallback when `GEMINI_API_KEY` is unset or offline | ✓ |
| Strict Live Gemini only | Always call Gemini 2.0 Flash; fail fast if API key is missing | |
| Deterministic rules only | Fast local regex/price-filter logic without LLM calls | |

**User's choice:** Dual-mode Gemini / mock
**Notes:** Enables seamless development and CI testing without network/quota failures while maintaining live LLM demo capability.

| Option | Description | Selected |
|--------|-------------|----------|
| Real HTTP requests via httpx | Call Next.js MaaS endpoints (`GET /api/maas/{id}/catalog`, `POST /api/maas/{id}/transact`) using live Bearer tokens | ✓ |
| Direct Python in-process dispatch | Invoke `nexus_agent.pipeline.runner` directly to avoid network hops | |
| You decide | Agent picks optimal balance | |

**User's choice:** Real HTTP requests via httpx
**Notes:** Demonstrates true agentic commerce boundary as an external client interacting with the merchant API.

| Option | Description | Selected |
|--------|-------------|----------|
| Structured thought & execution trace | Agent logs step-by-step reasoning with formatted terminal output and structured JSON outcome | ✓ |
| Silent return | Raw JSON receipt/error payload only | |
| Interactive confirmation | Agent pauses for human confirmation before transact | |

**User's choice:** Structured thought & execution trace
**Notes:** Essential for stage presentation so audience sees agent decision rationale.

---

## Evaluation Benchmark Dataset & Metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic generator + versioned fixture | `scripts/generate_benchmark_dataset.py` saving reproducible `datasets/synthetic_500.json` | ✓ |
| On-the-fly dynamic generation | Generate 500 fresh synthetic transactions in RAM every run without saving JSON fixture | |
| Static committed JSON only | Manually curated fixture checked into git without generator | |

**User's choice:** Deterministic generator + versioned fixture
**Notes:** Reproducible, inspectable, and supports instant offline benchmarking.

| Option | Description | Selected |
|--------|-------------|----------|
| 300 Legit / 200 Fraud (PRD §18.4) | Injects 3 distinct coordinated fraud rings (clique, IP subnet cluster, card hopper) across 4+ merchants | ✓ |
| 400 Legit / 100 Fraud | 80/20 baseline reflecting e-commerce fraud proportions | |
| Custom parameterizable | Configurable CLI flags defaulting to 300/200 | |

**User's choice:** 300 Legit / 200 Fraud (PRD §18.4)
**Notes:** Standardized benchmark targeting Precision >= 80% and Recall >= 75%.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-mode runner (`--mode fast\|live`) | Fast engine mode (<15s in RAM) + Full HTTP mode against live FastAPI endpoints | ✓ |
| Fast engine mode only | Pure in-memory Python evaluation calling TrustGraph engine directly | |
| Full HTTP mode only | Always requires running Next.js and FastAPI services | |

**User's choice:** Dual-mode runner (`--mode fast|live`)
**Notes:** Fast mode is ideal for CI and regression checks; live mode validates full networking stack.

| Option | Description | Selected |
|--------|-------------|----------|
| Direct GMV loss + reporting | Sum exact `amount_paise` of legitimate transactions blocked (in ₹) + Precision, Recall, F1, FPR, writing `results/eval_report.json` | ✓ |
| Weighted impact model | Combine lost GMV with estimated customer churn penalty multiplier | |
| You decide | Agent picks formulation | |

**User's choice:** Direct GMV loss + reporting
**Notes:** Explicit ₹ false-positive cost proves business impact without arbitrary churn assumptions.

---

## Ring Attack Simulation Topology

| Option | Description | Selected |
|--------|-------------|----------|
| 12-member syndicate across 3+ merchants | 12 entities sharing overlapping device IDs and /24 subnets sending 50 txs across 3+ merchants | ✓ |
| Dense clique topology | 8 entities all interconnected via identical device hashes | |
| Fully customizable CLI parameters | Configurable flags defaulting to PRD standard | |

**User's choice:** 12-member syndicate across 3+ merchants (PRD §14/§18.3)
**Notes:** Proves cross-merchant fraud contagion across multiple distinct store catalogs.

| Option | Description | Selected |
|--------|-------------|----------|
| Paced progression (200-500ms intervals) | Sends txs sequentially with progress bar and score transitions (85 -> 50 -> 10 -> 0) | ✓ |
| Instant concurrent burst | Fires all 50 txs concurrently via asyncio | |
| Interactive stepped mode | Pauses after every 10 transactions | |

**User's choice:** Paced progression (200-500ms intervals)
**Notes:** Enables the Cytoscape graph visualizer to render clustering and color shifts dynamically during live demo.

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid target with MaaS default | `--target [maas\|trust-service]` defaulting to MaaS `POST /api/maas/{id}/transact` | ✓ |
| Strict MaaS only | Always call Next.js MaaS API | |
| Trust Graph service only | Directly invoke FastAPI `/trust/score` | |

**User's choice:** Hybrid target with MaaS default
**Notes:** Demonstrates real API gateway blocking while retaining fallback if Next.js is not active.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect & auto-seed | Query DB/API for >=3 merchants; automatically seed standard fixtures if missing | ✓ |
| Strict prerequisite check | Refuse to run without manual seeding first | |
| You decide | Agent discretion | |

**User's choice:** Auto-detect & auto-seed
**Notes:** Zero-friction execution for any evaluator running the script.

---

## End-to-End Demo Presentation Script

| Option | Description | Selected |
|--------|-------------|----------|
| 3-Act interactive CLI with `--auto` flag | Follows PRD §14 with interactive step pauses and `--auto` for automated verification | ✓ |
| Non-interactive batch script only | Executes all scenarios consecutively | |
| Web-based demo trigger panel | UI button inside merchant dashboard | |

**User's choice:** 3-Act interactive CLI with `--auto` flag
**Notes:** Perfect dual-use for stage presentations and automated verification passes.

| Option | Description | Selected |
|--------|-------------|----------|
| Full proof display | Print Razorpay Order ID, Payment ID, captured status, ₹ amount, and audit tx ID | ✓ |
| Minimal receipt output | Print only transaction ID and status | |
| You decide | Agent discretion | |

**User's choice:** Full proof display
**Notes:** Verifies Razorpay test mode integration beyond question.

| Option | Description | Selected |
|--------|-------------|----------|
| Cryptographic hash-chain validation & ASCII timeline | Validate SHA-256 parent link across 100% of tool steps, printing latency table and "SEALED INTEGRITY: VALID" badge | ✓ |
| Simple table without crypto validation | Table of audit entries only | |
| Export JSON file to disk | Write `results/demo_audit_trail.json` with minimal terminal summary | |

**User's choice:** Cryptographic hash-chain validation & ASCII timeline
**Notes:** Demonstrates Project Nexus's core value: 100% explainable, immutable, bounded transaction auditability.

| Option | Description | Selected |
|--------|-------------|----------|
| Automated pre-flight check | Validates Postgres (5432), Next.js (3000), and FastAPI (8001) connectivity before executing | ✓ |
| Fast-fail on connection error | Proceed immediately without preflight | |
| You decide | Agent discretion | |

**User's choice:** Automated pre-flight check
**Notes:** Prevents confusing errors during live demonstrations.

---

## the agent's Discretion
- Formatting nuances of terminal tables and ASCII timeline art.
- Specific default search query strings for the Demo Buyer Agent.
- Benchmark RNG random seed value for reproducible dataset generation.

## Deferred Ideas
None — discussion stayed strictly within Phase 6 scope.
