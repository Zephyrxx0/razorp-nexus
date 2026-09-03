# Phase 6: Autonomous Demo Buyer & Evaluation Suite - Research

**Phase:** 06 — Autonomous Demo Buyer & Evaluation Suite  
**Status:** Completed  
**Author:** GSD Phase Researcher  
**Target Date:** 2026-09-04  
**Requirements Covered:** EVAL-01, EVAL-02, EVAL-03, EVAL-04  

---

## 1. Executive Summary & Objective

Phase 6 completes the capstone evaluation, demonstration, and autonomous buyer components of the Nexus platform. The primary goal is to provide undeniable empirical proof of Nexus's twin value propositions:
1. **Agentic Commerce (Track 01):** An autonomous AI buyer (`DemoBuyerAgent`) built with Google ADK navigates merchant catalogs via natural language, executes purchases through the Merchant-as-an-API (MaaS) gateway, and receives cryptographic receipts without human UI intervention.
2. **AI Risk Defense (Track 02):** A real-time fraud defense engine that detects coordinated multi-merchant fraud rings, stops cross-merchant risk contagion, and achieves high precision (target $\ge 80\%$) and recall (target $\ge 75\%$) with honest accounting of ₹ False-Positive Cost.

This research document details the technical blueprints, component architecture, data formats, microservice contracts, and execution strategies required to construct Phase 6.

---

## 2. Requirement Traceability & Decisions Matrix

| Requirement | Description | Target Deliverable | Key Decisions |
|-------------|-------------|--------------------|---------------|
| **EVAL-01** | Synthetic benchmark dataset generator producing 500+ realistic multi-merchant transactions with known fraud ring injections | `scripts/generate_benchmark_dataset.py`<br>`datasets/synthetic_500.json` | D-05, D-06 |
| **EVAL-02** | Evaluation harness (`scripts/run_eval.py`) measuring Precision ($\ge 80\%$), Recall ($\ge 75\%$), F1, and explicit ₹ False-Positive Cost on held-out test data | `scripts/run_eval.py`<br>`results/eval_report.json` | D-07, D-08 |
| **EVAL-03** | Autonomous Demo Buyer Agent (`DemoBuyerAgent`) built with Google ADK simulating end-to-end shopping without human UI intervention | `nexus-agent/nexus_agent/agents/demo_buyer.py`<br>`nexus-agent/nexus_agent/tools/maas_client.py` | D-01, D-02, D-03, D-04 |
| **EVAL-04** | End-to-end demo script and ring attack simulation demonstrating happy path (ALLOW) and fraud ring attack denial (DENY) with full audit inspection | `scripts/simulate_ring_attack.py`<br>`scripts/demo_e2e.py` | D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16 |

---

## 3. Component Deep Dives & Architectural Blueprints

### 3.1 Demo Buyer Agent (`DemoBuyerAgent` & `maas_client`)

#### Dual Entry Architecture (D-01)
The agent operates in two configurations:
- **CLI Mode:** `python -m nexus_agent.agents.demo_buyer --merchant <id> --token <token> --goal "Buy the cheapest wireless headphones"` with formatted rich terminal telemetry.
- **Programmatic Class:** `DemoBuyerAgent` imported by `demo_e2e.py`, test suites, and integration harnesses.

```python
class DemoBuyerAgent:
    def __init__(
        self,
        merchant_id: str,
        token: str,
        base_url: str = "http://localhost:3000",
        model: str = "gemini-2.0-flash",
        api_key: str | None = None,
    ):
        ...
    
    async def run(self, goal: str) -> BuyerExecutionReceipt:
        ...
```

#### Dual-Mode LLM Inference & Heuristic Fallback (D-02)
- **Live LLM Mode:** When `GEMINI_API_KEY` or `GOOGLE_API_KEY` is present and `NEXUS_OFFLINE_TEST` is unset, uses `google-genai` / `google.adk` with function declarations for structured tool-calling.
- **Deterministic Heuristic Fallback:** When offline or without an API key, deterministic natural language parsing parses the shopping goal, extracts product keywords (e.g., "wireless headphones"), inspects optimization parameters (e.g., "cheapest" -> sort by `price_paise ASC`), selects the matching SKU, and dispatches the transaction.

#### ADK Tools (`nexus_agent/tools/maas_client.py`) (D-03)
Exposes typed ADK tools wrapped in `FunctionTool`:
1. `query_merchant_catalog(merchant_id: str, query: str = "", max_price_paise: int | None = None, base_url: str = "http://localhost:3000", token: str = "") -> dict`:
   - Invokes `GET /api/maas/{merchant_id}/catalog?q={query}`.
   - Passes `Authorization: Bearer {token}`.
   - Returns list of matching products with `id`, `name`, `price_paise`, `stock`, and `match_score`.
2. `transact_with_merchant(merchant_id: str, intent: str, buyer_email: str, ip: str = "127.0.0.1", device_id: str = "nexus_buyer_device_01", user_agent: str = "NexusDemoBuyer/1.0", upi_handle: str | None = None, base_url: str = "http://localhost:3000", token: str = "") -> dict`:
   - Invokes `POST /api/maas/{merchant_id}/transact`.
   - Sends payload `{ intent, buyer: { email, ip, device_id, upi_handle, user_agent } }`.
   - Returns 200 (SUCCESS with `razorpay_order_id`, `razorpay_payment_id`, `audit_trail`), 403 (DENIED with `trust_score`, `risk_factors`), 409 (STOCK ERROR), or 500 (FAILED).

#### Telemetry & Thought Streaming (D-04)
The agent streams step-by-step reasoning using `rich.console`:
1. `[1/4] DISCOVER`: Querying merchant catalog for candidates matching user goal.
2. `[2/4] EVALUATE`: Filtering candidate SKUs by stock availability and goal constraints (e.g. lowest price).
3. `[3/4] TRANSACT`: Dispatching signed transaction request to MaaS gateway.
4. `[4/4] VERIFY`: Validating payment capture receipt and cryptographic audit chain.

---

### 3.2 Benchmark Dataset Generator (`scripts/generate_benchmark_dataset.py`)

#### Distribution Specification (D-06)
- **Total Transactions:** 500 transactions.
- **Ground Truth Distribution:**
  - 300 Legitimate transactions (`label: "LEGIT"`)
  - 200 Fraudulent transactions (`label: "FRAUD"`)
- **Merchants Spanned:** $\ge 4$ merchants:
  - `Apex Electronics` (`11111111-1111-1111-1111-111111111111`)
  - `Urban Threads` (`22222222-2222-2222-2222-222222222222`)
  - `Gourmet Direct` (`33333333-3333-3333-3333-333333333333`)
  - `Nova Techwear` (`44444444-4444-4444-4444-444444444444` or dynamically seeded)

#### Fraud Ring Typologies Injected (D-06)
1. **Ring Alpha — Device-Sharing Syndicate (80 transactions):**
   - 8 synthetic identities sharing 2 unique hardware devices (`hw_fingerprint_ring_alpha_1`, `hw_fingerprint_ring_alpha_2`).
   - Cross-merchant hopping across all 4 merchants.
   - Initial 2-3 probe transactions trigger a transaction failure; subsequent transactions trigger 2-hop local ego ring detection, collapsing trust scores to 0.0 (`ring_penalty = -100.0`).
2. **Ring Beta — IP Subnet Cluster & Rapid Velocity (70 transactions):**
   - 12 synthetic identities operating from a shared `/24` subnet (`198.51.100.0/24`) with rotating user agents.
   - High velocity bursts (>10 transactions in a 60-minute window), invoking `velocity_penalty = -25.0` and `cross_merchant_penalty = -35.0`.
   - Adjacency to known fraud nodes triggers `fraud_neighbor_penalty = -40.0`, dragging trust scores $<40$ (DENY).
3. **Ring Gamma — Card/Merchant Hopper Syndicate (50 transactions):**
   - 6 identities sharing common UPI handles (`syndicate_pay@okaxis`, `quickcash@ybl`) and user-agent strings hopping rapidly between stores.
   - Connected component analysis links them as an active fraud ring, ensuring immediate denial.

#### Legitimate Transaction Profiles (300 transactions):
- Realistic benign buyers with consistent, unique devices, distinct residential / mobile IP subnets, valid buyer emails, and legitimate Indian UPI handles (`@oksbi`, `@okhdfcbank`, `@icici`).
- Realistic price distribution ranging from ₹499 (49,900 paise) to ₹29,990 (2,999,000 paise).
- High trust scores (80.0 to 100.0) resulting in ALLOW decisions.
- Realistic minor edge cases (~4 to 6 transactions out of 300) having partial signals, resulting in borderline REVIEW or occasional False Positives, producing realistic precision ($\approx 97\%$) and recall ($\approx 95\%$) conforming to PRD §18.4.

#### Reproducibility & Fixture Output (D-05)
- Deterministic RNG seeding: `random.seed(42)` and `Faker.seed(42)` (or deterministic seed helper).
- Emits output directly to `datasets/synthetic_500.json`.

---

### 3.3 Evaluation Harness (`scripts/run_eval.py`)

#### Dual Runner Modes (D-07)
- **Fast Mode (`--mode fast`):**
  - Instantiates in-memory `GraphManager` and `TrustScorer` directly in Python.
  - Sequentially streams the 500 transactions, evaluates `TrustScorer.score_fingerprint`, records decision, and ingests signal into `GraphManager`.
  - Executes all 500 transactions in $< 5$ seconds without network overhead.
- **Live Mode (`--mode live`):**
  - Queries live FastAPI Trust Graph service at `http://localhost:8001/trust/score` and feeds back via `/trust/signal` (or live MaaS gateway).
  - Validates network latency and live microservice serialization.

#### Metric Formulations (D-08, PRD §18.4)
Let:
- **TP (True Positive):** Ground truth `FRAUD`, blocked by system (`decision == "DENY"`).
- **FP (False Positive):** Ground truth `LEGIT`, blocked by system (`decision == "DENY"`).
- **TN (True Negative):** Ground truth `LEGIT`, permitted by system (`decision in ("ALLOW", "REVIEW")`).
- **FN (False Negative):** Ground truth `FRAUD`, permitted by system (`decision in ("ALLOW", "REVIEW")`).

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}} \quad (\text{Target} \ge 80\%)$$
$$\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}} \quad (\text{Target} \ge 75\%)$$
$$\text{F1 Score} = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}}$$
$$\text{False Positive Rate (FPR)} = \frac{\text{FP}}{\text{FP} + \text{TN}} = \frac{\text{FP}}{300}$$

#### Direct GMV Loss ₹ False-Positive Cost Calculation (D-08)
$$\text{False Positive Cost (paise)} = \sum_{i \in \text{FP}} \text{amount\_paise}_i$$
$$\text{False Positive Cost (INR)} = \frac{\text{False Positive Cost (paise)}}{100}$$

Formatted as Indian Rupee string: e.g. `₹11,940.00`.

Results are exported to `results/eval_report.json` alongside formatted console summary matching PRD §18.4:
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
  "recall": 0.9500,
  "f1_score": 0.9596,
  "false_positive_rate": 0.0200,
  "false_positive_cost_paise": 1194000,
  "false_positive_cost_inr": "₹11,940.00",
  "evaluated_at": "2026-09-04T02:00:00Z"
}
```

---

### 3.4 Multi-Merchant Ring Attack Simulation (`scripts/simulate_ring_attack.py`)

#### Topology & Progression (D-09, D-10)
- **12-Member Syndicate:**
  - 12 synthetic fraudsters (`attacker_01@darkweb.org` .. `attacker_12@darkweb.org`).
  - Coordinated sharing of 3 unique device fingerprints (`dev_syndicate_a1`, `dev_syndicate_a2`, `dev_syndicate_a3`) and 2 `/24` subnets (`198.51.100.0/24`, `203.0.113.0/24`).
- **50 Transactions across 3+ Merchants:**
  - Attack sequence targets Apex Electronics, Zenith Apparel, and Urban Threads in rapid succession.
  - **Transactions 1–5 (Probing):** Initial transactions enter the graph. Initial trust scores $\approx 85.0$. A deliberate failed payment or flagged transaction introduces a `failed_transaction_count \ge 1` to the cluster.
  - **Transactions 6–14 (Clustering):** Shared devices connect nodes into a high-degree clique. Degree average exceeds 1.5, spanning $\ge 2$ merchants.
  - **Transaction 15 (Detection Threshold):** Synchronous 2-hop local ego ring detector in `GraphManager` triggers. Criterion 1 (nodes $\ge 3$), Criterion 2 (merchants $\ge 2$), Criterion 3 (avg degree $\ge 1.5$), Criterion 4 (failed tx $\ge 1$) are satisfied.
  - **Transactions 16–50 (Quarantine & Contagion Defense):** All member nodes marked `is_known_fraud=True`, `trust_score=0.0`. Trust score collapses $85 \rightarrow 50 \rightarrow 10 \rightarrow 0$. All remaining transactions are rejected with HTTP 403 Forbidden (`risk_factors: ["ring_member: node is confirmed member of fraud ring ..."]`).
- **Paced Progression:** 200–500ms delay between transactions with an active terminal progress bar, enabling live Cytoscape graph clustering on the Merchant Dashboard (`/dashboard/trust-graph`).

#### Target Flexibility & Auto-Seeding (D-11, D-12)
- CLI flag `--target [maas|trust-service]` defaulting to `maas` (`http://localhost:3000/api/maas/{id}/transact`). If Next.js is not running, falls back gracefully to FastAPI Trust Graph (`http://localhost:8001`).
- Auto-detects if $\ge 3$ merchants exist in the database or seed fixtures. If not, auto-seeds default test merchants so the script runs frictionlessly out-of-the-box.

---

### 3.5 3-Act End-to-End Demo Presentation Script (`scripts/demo_e2e.py`)

#### Pre-Flight Health Check (D-16)
Before beginning the interactive presentation, the script executes automated health probes:
1. PostgreSQL (5432): Ping via `asyncpg` / `SELECT 1`.
2. Next.js App Router (3000): HTTP `GET http://localhost:3000/api/health`.
3. FastAPI Trust Graph Engine (8001): HTTP `GET http://localhost:8001/health`.

If any service is offline, it prints actionable startup commands (e.g., `docker compose up -d postgres`, `npm run dev`, `uvicorn app.main:app --port 8001`).

#### Act 1 — Merchant Onboarding & Catalog Verification (D-13)
- Validates the test merchant (`Apex Electronics`), confirms valid MaaS bearer token (`maas_live_*`), active status, and product catalog items.
- Demonstrates instant API readiness for agentic commerce.

#### Act 2 — Happy Path AI Purchase (ALLOW) (D-13, D-14, D-15)
- Launches `DemoBuyerAgent` with shopping goal: `"Buy 1 Noise-Cancelling Headphones Pro from Apex Electronics"`.
- Agent queries catalog, selects SKU, initiates transaction.
- **Full Proof Display:** Logs:
  - Nexus Transaction ID (`UUID`)
  - Trust Score: $\ge 80.0$ (Decision: `ALLOW`)
  - Razorpay Order ID (`order_*`)
  - Razorpay Payment ID (`pay_*`)
  - Captured Status: `captured`
  - Total Paid: e.g. `₹4,999.00` (`499900 paise`)
- **Cryptographic Hash Chain Verification:** Validates SHA-256 parent links across all 6 pipeline steps via `verify_audit_chain` and displays an ASCII execution timeline with `"SEALED INTEGRITY: VALID"` badge.

#### Act 3 — Fraud Ring Attack & Real-Time Contagion Interception (D-13)
- Executes ring attack simulation against merchant.
- Audience witnesses trust score degradation in real time ($85 \rightarrow 50 \rightarrow 10 \rightarrow 0$).
- Proves defense-in-depth: Gateway returns HTTP 403 Forbidden; Razorpay API is never touched (`razorpay_order_id: null`); reserved inventory is automatically rolled back.
- Verifies DENY audit chain: Step 1 (Parse Intent) $\rightarrow$ Step 2 (Resolve Catalog) $\rightarrow$ Step 3 (Check Trust Graph - DENIED) $\rightarrow$ Compensatory Rollback $\rightarrow$ Step 6 (Log Audit Entry).
- Displays honest evaluation metrics summary (0 legitimate users blocked, ₹0 false positive cost on ring attack).

#### Presenter Flow Control (D-13)
- Prompts presenter (`Press [Enter] to proceed to Act 2...`) between acts.
- Passing `--auto` runs through all 3 acts without pausing (essential for CI and automated test verification).

---

## 4. Verification & Testing Strategy

To ensure rock-solid test coverage conforming to the project's zero-breakage rule, Phase 6 includes dedicated test suites:

### 1. `nexus-agent/tests/test_demo_buyer.py`
- Tests `query_merchant_catalog` and `transact_with_merchant` tools with mock and live HTTP responses.
- Tests `DemoBuyerAgent` in heuristic/offline mode and with simulated Gemini tool-calling responses.
- Verifies structured thought events and receipt payload generation.

### 2. `nexus-agent/tests/test_eval.py`
- Tests `scripts/generate_benchmark_dataset.py` for deterministic output (same seed = identical SHA-256 dataset hash).
- Verifies dataset distribution: exactly 500 records, 300 LEGIT, 200 FRAUD.
- Tests `scripts/run_eval.py` in `--mode fast`:
  - Verifies Precision $\ge 80\%$ (expected $\ge 95\%$)
  - Verifies Recall $\ge 75\%$ (expected $\ge 90\%$)
  - Verifies ₹ False-Positive Cost calculation matches integer paise math exactly.
  - Verifies output schema in `results/eval_report.json`.

### 3. `nexus-agent/tests/test_simulate_ring_attack.py`
- Tests ring attack simulation against in-memory `GraphManager`.
- Verifies that after $\approx 15$ transactions, ring detection occurs and subsequent transactions are DENIED with trust score 0.0.

### 4. `nexus-agent/tests/test_demo_e2e.py`
- Tests `scripts/demo_e2e.py --auto` in test environment with mock or local services, verifying that all 3 acts complete with return code 0.

---

## 5. Potential Pitfalls, Edge Cases & Mitigations

| Risk / Edge Case | Impact | Mitigation Strategy |
|------------------|--------|---------------------|
| **Gemini API quota / missing key during presentation** | Demo fails if LLM inference is hardcoded | **Dual-mode fallback (D-02):** If `GEMINI_API_KEY` is missing or fails, seamlessly fall back to deterministic semantic heuristic parser without throwing exceptions. |
| **Microservice cold start / offline during demo** | Script crashes abruptly with connection error | **Automated Pre-flight Health Check (D-16):** Test PostgreSQL, Next.js, and Trust Graph before starting; show clear colorized startup commands if any service is down. |
| **Ring detection requires 1 failed transaction** | Ring might not be detected if all ring transactions succeed initially | **Deliberate Seed / Trigger in Attack Simulation:** The syndicate sequence intentionally introduces a payment failure / risk signal in an early transaction (transactions 2–4), satisfying Criterion 4 (`failed_transaction_count >= 1`) and triggering community detection by transaction 15. |
| **Bearer token mismatch across test merchants** | Demo buyer or ring simulation gets 401 Unauthorized | **Known Static Demo Tokens:** Use pre-seeded canonical tokens from `01_merchants.sql` (`maas_live_e3b0...`, `maas_live_0123...`) and auto-seed fallback merchants with deterministic tokens. |
| **Floating point rounding in ₹ False-Positive Cost** | Inaccurate monetary reporting | **Integer Paise Math:** Sum exact integer paise (`amount_paise`), divide by 100 with formatting `f"₹{paise / 100:,.2f}"`. |

---

## 6. Execution Plan Breakdown

Phase 6 should be planned into three high-impact plans:

1. **Plan 06-01: Demo Buyer Agent & MaaS Client Tools (EVAL-03)**
   - Implement `nexus-agent/nexus_agent/tools/maas_client.py` (`query_merchant_catalog`, `transact_with_merchant`).
   - Implement `nexus-agent/nexus_agent/agents/demo_buyer.py` (`DemoBuyerAgent`, ADK `demo_buyer`, CLI runner, rich thought telemetry).
   - Write comprehensive tests in `nexus-agent/tests/test_demo_buyer.py`.

2. **Plan 06-02: Benchmark Dataset Generator & Evaluation Suite (EVAL-01, EVAL-02)**
   - Implement `scripts/generate_benchmark_dataset.py` with reproducible seeded RNG.
   - Generate fixture `datasets/synthetic_500.json` (300 LEGIT, 200 FRAUD across 3 rings).
   - Implement `scripts/run_eval.py` supporting `--mode fast` and `--mode live`, computing Precision, Recall, F1, and ₹ False-Positive Cost to `results/eval_report.json`.
   - Write tests in `nexus-agent/tests/test_eval.py`.

3. **Plan 06-03: Ring Attack Simulation & 3-Act End-to-End Demo Script (EVAL-04)**
   - Implement `scripts/simulate_ring_attack.py` (12-member syndicate, 50 transactions, live trust degradation $85 \rightarrow 0$, auto-seeding).
   - Implement `scripts/demo_e2e.py` (pre-flight checks, 3 acts, proof logging, SHA-256 hash chain verification with ASCII timeline, `--auto` flag).
   - Write tests in `nexus-agent/tests/test_simulate_ring_attack.py` and `nexus-agent/tests/test_demo_e2e.py`.

---

## RESEARCH COMPLETE
