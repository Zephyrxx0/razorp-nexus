# Phase 2: Trust Graph Engine Microservice - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 builds and validates the standalone Python FastAPI microservice (running on port 8001) that serves as the network-level fraud defense layer for Project Nexus:
- In-memory undirected weighted graph maintained with NetworkX 3.3.
- Sub-500ms trust scoring via `POST /trust/score`, returning 0-100 score, decision (`ALLOW`, `REVIEW`, `DENY`), graph metrics, and score breakdown.
- Explicit scoring penalty model: new entity (-10), known fraud node (-80), 1-hop fraud neighbor (-40), 2-hop fraud neighbor (-20), velocity (-25/-10), cross-merchant spread (-35/-15), and ring membership (-100/-60).
- Real-time transaction feedback via `POST /trust/signal` updating node attributes and edge weights upon transaction attempts and Razorpay webhook outcomes.
- Connected-components clustering detecting multi-merchant fraud rings across entities spanning >= 2 merchants with >= 3 nodes, average degree >= 1.5, and >= 1 failure on record.
- Network topology and detail query endpoints: `GET /trust/rings`, `GET /trust/node/{node_id}`, and `GET /trust/graph` formatted for Cytoscape.js visualizer consumption.
- Startup rehydration from PostgreSQL `transactions` table using asyncpg connection pool.

</domain>

<decisions>
## Implementation Decisions

### Rehydration & Ingestion
- **D-01: Rolling 30-Day Rehydration Window** — On service startup, query PostgreSQL `transactions` table for records created in the last 30 days (`NOW() - INTERVAL '30 days'`) to populate NetworkX nodes and edges, bounding memory while retaining sufficient history for ring clustering. — **Reversibility:** costly — changing window parameters or query logic impacts boot memory and initial graph recall.
- **D-02: Soft-Start on DB Failure with Background Retry** — FastAPI microservice boots immediately on port 8001 with an empty graph if PostgreSQL is unreachable or empty at startup, logging a warning and running a background async task to retry DB connection and rehydration until successful. — **Reversibility:** reversible — contained entirely within startup lifecycle hook.
- **D-03: Prefixed Node Key Identifier Format** — Graph node keys are formatted as `{signal_type}:{signal_val}` (e.g. `email:a3f8...`, `ip:103.21.44`, `device:abc123`) for transparent debugging, Cytoscape element IDs, and audit logging. — **Reversibility:** costly — node ID format dictates graph lookups, Cytoscape mapping, and audit trail references.
- **D-04: In-Memory Only Signal Ingestion** — `POST /trust/signal` updates the in-memory NetworkX graph immediately without writing to PostgreSQL; database transaction persistence is owned by Next.js / Razorpay webhook layer. — **Reversibility:** costly — cross-service separation of concerns between API gateway and risk microservice.

### Scoring Dynamics & Recovery
- **D-05: Progressive Trust Building for Repeat Buyers** — New entity penalty (-10) drops to 0 after 2 successful transactions; clean transaction history adds up to +5 bonus (capped at 100). — **Reversibility:** reversible — scoring formula parameters can be tuned.
- **D-06: Tiered Signal Weighting for False Positive Defense** — Direct identifiers (email hash, device hash, UPI handle) carry 100% penalty weight; IP subnet carries 50% penalty weight to avoid false-positive blocking of shared ISP / Wi-Fi subnets. — **Reversibility:** reversible — internal traversal penalty weight calculation.
- **D-07: Exponential Half-Life Decay & Strict Velocity Windows** — Historical transaction failure penalties decay with a 7-day half-life; velocity tracking enforces strict sliding 60-minute and 24-hour windows. — **Reversibility:** reversible — scoring decay math internal to Trust Graph engine.
- **D-08: Graceful Partial Fingerprint Evaluation** — Score against whatever signals are present, applying a small missing signal penalty (-5 per omitted signal if fewer than 3 signals provided) rather than rejecting requests with 422. — **Reversibility:** costly — impacts API client contracts for buyer agents and gateway.

### Ring Detection Execution & Concurrency
- **D-09: Async Read-Write Lock Pattern for Graph Operations** — Concurrent reads (`POST /trust/score`, `GET /trust/rings`) execute in parallel; graph mutations (`POST /trust/signal`, rehydration) acquire an exclusive `asyncio.Lock` to guarantee thread-safety while keeping score latency <10ms. — **Reversibility:** costly — changes concurrency architecture in FastAPI service.
- **D-10: Dual Ring Detection Execution (Sync Ego Check + Background Full Sweep)** — `POST /trust/signal` runs a fast synchronous 2-hop local ego component check (<5ms) to catch immediate ring connections, while a background task runs full-graph connected components every 5 minutes. — **Reversibility:** reversible — scheduling configuration in FastAPI lifecycle.
- **D-11: Strict PRD §12.3 Ring Qualification Criteria** — Subgraphs must meet: >= 3 nodes, >= 2 distinct merchants, average degree >= 1.5, and >= 1 failed/blocked transaction on record. Risk level set to `CRITICAL` if >= 5 merchants, otherwise `HIGH`. — **Reversibility:** costly — threshold changes alter ring detection recall and false positive rates.
- **D-12: Stable Ring ID with Immediate Node Propagation** — Retain stable UUIDs for identified rings; merge connected rings into the oldest UUID, immediately setting `is_known_fraud=True` and `trust_score=0` on all constituent and joining nodes. — **Reversibility:** costly — affects ring tracking across polling cycles in the merchant dashboard.

### Ring Topology & Graph Query API
- **D-13: Dual-Layer `/trust/rings` Response Schema** — Returns an array of rings containing business metrics (`ring_id`, `risk_level`, `affected_merchants`, `blocked_txn_count`, `blocked_amount_paise`) alongside a Cytoscape-formatted `graph` object with `nodes` and `edges`. — **Reversibility:** one-way — published API contract consumed by Next.js 14 dashboard and Cytoscape.js.
- **D-14: Comprehensive `/trust/node/{node_id}` Profile Schema** — Returns full node inspection: signal type, signal value, fraud flag, ring ID, first/last seen, transaction counts (total/success/failed), merchants seen, degree, 1-hop neighbor summary, and ego-subgraph elements for the slide-out drawer. — **Reversibility:** one-way — published API contract consumed by the merchant dashboard inspection drawer.
- **D-15: Merchant-Scoped `GET /trust/graph` with 200-Node Limit** — Exposes `GET /trust/graph` with optional `merchant_id` query filter and default 200-node limit to guarantee smooth 60fps rendering in Cytoscape.js. — **Reversibility:** one-way — published API contract for the dashboard visualizer.
- **D-16: Rich Edge Attributes for Cytoscape Styling** — Graph edges contain `source`, `target`, `weight` (co-occurrences), `edge_type` (`SHARED_TRANSACTION`, `SUBNET_OVERLAP`), and `merchants_shared` to power edge width and color styling in Cytoscape. — **Reversibility:** costly — schema contract between backend graph serializer and frontend graph renderer.

### The Agent's Discretion
- Internal directory structure of `trust-graph-service/` (e.g., `app/api/`, `app/core/`, `app/models/`, `app/engine/`).
- Exact Pydantic model names and serialization aliases for graph elements.
- Choice of async background scheduler (native `asyncio.create_task` loop vs APScheduler).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD & System Architecture
- `PRD.md` §8.3 — Standalone Python/FastAPI microservice specification and port 8001 mapping.
- `PRD.md` §11.2 — Trust Graph service API endpoints (`/trust/score`, `/trust/signal`, `/trust/rings`, `/trust/node/{node_id}`).
- `PRD.md` §12.1 — Graph structure, nodes, undirected weighted edges, and co-occurrence semantics.
- `PRD.md` §12.2 — Precise Scoring Algorithm with penalty steps (new entity, known fraud, 1/2-hop neighbors, velocity, cross-merchant spread, ring membership).
- `PRD.md` §12.3 — Ring Detection Algorithm with connected components, degree thresholds, and merchant span checks.
- `PRD.md` §15 — Security architecture (SHA-256 PII hashing, /24 subnet masking, defense-only operations).
- `PRD.md` §16 — Edge cases and resiliency rules (timeout handling, soft-fail REVIEW score 50 when trust service unreachable).

### Requirements Traceability
- `.planning/REQUIREMENTS.md` TRUST-01 — FastAPI microservice (port 8001) maintaining an in-memory NetworkX undirected weighted graph.
- `.planning/REQUIREMENTS.md` TRUST-02 — `POST /trust/score` returning 0-100 score, ALLOW/REVIEW/DENY decision, risk factors, and score breakdown.
- `.planning/REQUIREMENTS.md` TRUST-03 — Explicit scoring penalties (-10, -80, -30, -100).
- `.planning/REQUIREMENTS.md` TRUST-04 — Transaction outcome feedback via `POST /trust/signal` to update edge weights and node attributes in real time.
- `.planning/REQUIREMENTS.md` TRUST-05 — In-memory graph state rehydration from PostgreSQL transactions table on startup.
- `.planning/REQUIREMENTS.md` RING-01 — Multi-merchant fraud ring detection using connected components across entities at >= 2 merchants.
- `.planning/REQUIREMENTS.md` RING-02 — Ring metadata via `GET /trust/rings` (merchants, member nodes, blocked txn count, blocked rupee amount).
- `.planning/REQUIREMENTS.md` RING-04 — Strictly defense-only operations (passive observation, ring scoring, rejection without offensive probing).

### Prior Phase Decisions & Stack Contracts
- `.planning/phases/01-database-schema-core-data-layer/01-CONTEXT.md` — Shared PostgreSQL schema, integer paise conventions, normalized signal hashing, and `crypto-fixtures.json`.
- `.planning/research/STACK.md` — FastAPI `^0.115.0`, NetworkX `^3.3`, Pydantic `^2.9.2`, asyncpg `^0.29.0`, uvicorn `^0.30.6`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/py/nexus_db/client.py`: Shared asyncpg connection pool helper (`get_db_pool()`, `get_connection()`).
- `db/py/nexus_db/models.py`: Pydantic models for `Transaction`, `BuyerFingerprint`, `TransactionStatus`, `AuditEntry`.
- `db/py/nexus_db/crypto.py` & `sanitize.py`: PII normalization and SHA-256 hashing utilities ensuring identical signal representation.
- `db/fixtures/crypto-fixtures.json`: Test vectors validating signal normalization and hashing.
- `db/seeds/03_transactions.sql`: Pre-populated historical transactions across 3 seed merchants including known coordinated ring members for rehydration tests.

### Established Patterns
- Integer paise monetary representations (`amount_paise`).
- Environment configuration via `.env` / `DATABASE_URL`.
- Strong type enforcement with Pydantic v2 and Python 3.11+ type annotations.

### Integration Points
- Microservice port: `8001` (`http://localhost:8001`).
- PostgreSQL port: `5432` (`postgres://nexus:nexus_password@localhost:5432/nexus_db`).
- Downstream consumer: Google ADK Orchestrator (`Phase 3`) calls `POST /trust/score`.
- Downstream consumer: Next.js 14 MaaS Gateway / Webhooks (`Phase 4`) call `POST /trust/signal`.
- Downstream consumer: Merchant Dashboard (`Phase 5`) calls `GET /trust/rings`, `GET /trust/graph`, `GET /trust/node/{node_id}`.

</code_context>

<specifics>
## Specific Ideas

- Provide a test fixture script or unit test that boots the FastAPI service against the `seeds/03_transactions.sql` dataset, verifies that rehydration loads the expected node count, detects the pre-seeded multi-merchant ring, and flags subsequent transactions from ring members with score 0 (DENY).
- Ensure Cytoscape elements formatted by the API use the standard `{ data: { id, label, type, ... } }` node schema and `{ data: { id, source, target, weight, ... } }` edge schema to eliminate data transformation boilerplate in Phase 5.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed strictly within Phase 2 Trust Graph microservice boundary.

</deferred>

---

*Phase: 2-Trust Graph Engine Microservice*
*Context gathered: 2026-09-03*
