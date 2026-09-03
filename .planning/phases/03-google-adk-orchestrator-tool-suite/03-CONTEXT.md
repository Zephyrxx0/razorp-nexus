# Phase 3: Google ADK Orchestrator & Tool Suite - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 builds and validates the Google ADK Orchestrator Agent service (`nexus-agent`, port 8000) powered by Gemini 2.0 Flash (`gemini-2.0-flash`):
- Deterministic 6-step tool pipeline execution: `parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`.
- Natural language intent parsing extracting `product_query`, integer `quantity`, and `buyer_email` with sub-2s latency.
- Merchant catalog resolution against PostgreSQL with atomic conditional inventory decrement and compensatory rollback on downstream denial or failure.
- Trust Graph client integration querying `http://localhost:8001/trust/score` with SHA-256 hashed buyer fingerprints, with soft-fail fallback to score 50 (REVIEW) on service timeout.
- Programmatic defense-in-depth gate in `create_razorpay_order` raising `TrustViolationError` if `trust_score < 40`, halting execution before any Razorpay API calls.
- Razorpay test-mode order creation and payment capture attaching `nexus_transaction_id`, `trust_score`, and product metadata to order notes, with dual-mode real SDK / mock client support.
- Comprehensive hash-chained append-only audit trail generation in PostgreSQL `audit_entries` on 100% of execution paths (success, denied, failed) with plain-English rationales.
- Port 8000 ADK-compatible runner endpoint (`POST /run`).

</domain>

<decisions>
## Implementation Decisions

### Intent Parsing & Validation
- **D-01: Hybrid Parsing with Gemini 2.0 Flash & Deterministic Fallback** — `parse_intent` uses Gemini 2.0 Flash as the primary structured extractor for natural language intents, backed by a deterministic regex parser for standard commerce patterns (`Buy <N> <Product>`) and fuzzy catalog keyword matching. Quantity defaults to 1 if unspecified; quantities `<= 0` or `> 100` are rejected immediately as 422 Unprocessable Entity. — **Reversibility:** reversible — parsing rules and prompt templates are self-contained in `tools/intent.py`.

### Inventory Reservation & Rollback
- **D-02: Atomic Conditional Decrement with Compensatory Rollback** — `resolve_catalog` performs an atomic conditional decrement directly in PostgreSQL (`UPDATE products SET stock = stock - N WHERE id = $1 AND stock >= N RETURNING stock`), raising `StockError` if available stock is insufficient. If a subsequent step fails (e.g. Trust Graph DENY `< 40`, or Razorpay API error), the orchestrator executes an immediate compensatory increment rollback (`UPDATE products SET stock = stock + N WHERE id = $1`) before final audit logging. — **Reversibility:** costly — changes database concurrency semantics and inventory lifecycle management across services.

### Razorpay Integration & Test-Mode Mocking
- **D-03: Dual-Mode Razorpay Client Adapter with Mock Fallback** — Razorpay operations are abstracted behind a dual-mode client adapter: when active `rzp_test_*` credentials are present and network is available, it interacts with the official `razorpay.Client`. A seamless `MockRazorpayClient` is automatically used when `NEXUS_RAZORPAY_MOCK=true` or when running unit tests offline, generating deterministic test order IDs and synthetic `pay_test_<hex>` payment capture records for server-to-server agentic flows without requiring browser interaction. — **Reversibility:** costly — adapter interfaces touch all payment tool implementations and test harnesses.

### Pipeline Enforcement & Architecture
- **D-04: Deterministic Pipeline Runner with ADK FunctionTools** — A deterministic state machine pipeline runner controls step execution order (`1 -> 2 -> 3 -> 4 -> 5 -> 6`), guaranteeing zero step skipping, eliminating autonomous ReAct ordering hallucinations, and strictly enforcing the defense-in-depth gate (raising `TrustViolationError` at step 4 if `trust_score < 40`). Each step is wrapped as an ADK `FunctionTool`. Step 6 (`log_audit_entry`) is guaranteed to execute on all paths (success, denial, failure). The service exposes an ADK-compatible endpoint on port 8000 (`POST /run`). — **Reversibility:** one-way — core architectural contract governing the agent runtime and inter-service API gateway integration.

### The Agent's Discretion
- Internal modular directory layout within `nexus-agent/` (e.g., `nexus_agent/tools/`, `nexus_agent/pipeline/`, `nexus_agent/api/`).
- Gemini 2.0 Flash prompt engineering and schema definitions for intent parsing and audit rationale synthesis.
- HTTP client configuration and retry policies for the port 8001 Trust Graph service connection (`httpx` with 500ms timeout).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD & Architecture
- `PRD.md` §8.2, §9 — NexusOrchestratorAgent architecture, 6-step execution contract, tool definitions, instruction prompts, and CLI invocation.
- `PRD.md` §10 — Core data models: Merchant, Product, Transaction, AuditEntry.
- `PRD.md` §15 — Security architecture (AES-256-GCM merchant secret decryption, SHA-256 buyer signal hashing).
- `PRD.md` §16 — Resiliency rules (soft-fail review on trust graph unreachable, stock error handling).
- `CONVENTIONS.md` — Financial model: strictly integer paise (`amount_paise`), never floating-point.
- `.planning/research/STACK.md` — Technology stack versions (`google-adk`, `google-generativeai`, `gemini-2.0-flash`, `razorpay`, `httpx`, `asyncpg`).

### Requirements Traceability
- `.planning/REQUIREMENTS.md` ORCH-01 — Nexus Orchestrator Agent on Google ADK (`adk api_server` port 8000) powered by Gemini 2.0 Flash.
- `.planning/REQUIREMENTS.md` ORCH-02 — Strict 6-step deterministic pipeline (`parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`).
- `.planning/REQUIREMENTS.md` ORCH-03 — Structured extraction of `product_query`, integer `quantity`, and `buyer_email` from freeform intent.
- `.planning/REQUIREMENTS.md` ORCH-04 — Inventory validation and atomic stock decrement via `resolve_catalog`.
- `.planning/REQUIREMENTS.md` ORCH-05 — Immediate halt on trust denial (score < 40) without invoking Razorpay API endpoints.
- `.planning/REQUIREMENTS.md` RING-03 — Programmatic defense-in-depth gate in `create_razorpay_order` raising `TrustViolationError` if `trust_score < 40`.
- `.planning/REQUIREMENTS.md` RZP-01 — Razorpay test-mode order creation with integer paise amounts and audit notes attached.
- `.planning/REQUIREMENTS.md` RZP-02 — Test-mode payment capture against created orders and `razorpay_payment_id` recording.

### Prior Phase Decisions & Stack Contracts
- `.planning/phases/01-database-schema-core-data-layer/01-CONTEXT.md` — Shared PostgreSQL schema, append-only trigger immutability, AES-256-GCM secret decryption, SHA-256 signal normalization.
- `.planning/phases/02-trust-graph-engine-microservice/02-CONTEXT.md` — FastAPI port 8001 `/trust/score` contract, partial fingerprint scoring, and `/trust/signal` real-time feedback.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/py/nexus_db/client.py`: Shared asyncpg connection pool helper (`get_db_pool()`, `get_connection()`).
- `db/py/nexus_db/crypto.py`: AES-256-GCM decryption (`decrypt_secret()`) for merchant Razorpay keys, SHA-256 hashing for buyer emails and user agents, and IP subnet normalization.
- `db/py/nexus_db/models.py`: Shared Pydantic models for `Transaction`, `BuyerFingerprint`, `AuditEntry`, `TransactionStatus`.
- `db/py/nexus_db/audit.py`: Cryptographic SHA-256 hash chaining (`compute_entry_hash()`) to link sequential audit log entries.
- `trust-graph-service/app/api/routes_trust.py`: Running FastAPI microservice on port 8001 exposing `POST /trust/score` and `POST /trust/signal`.

### Established Patterns
- Strict integer paise conventions (`amount_paise`) throughout all data models and tool signatures.
- High-performance asynchronous Python using `asyncpg` and `httpx`.
- Environment-based configuration via `.env` / `DATABASE_URL` / `GOOGLE_API_KEY`.

### Integration Points
- Orchestrator port 8000: entry point for Next.js 14 MaaS gateway (`POST /api/maas/{merchant_id}/transact`).
- PostgreSQL port 5432: reads merchant keys and product stock; writes transaction records and immutable audit entries.
- Trust Graph port 8001: queries buyer trust score at step 3; sends outcome signals on completion.
- Razorpay API: test-mode order creation and payment capture for verified buyers.

</code_context>

<specifics>
## Specific Ideas

- Ensure `create_razorpay_order` attaches `nexus_transaction_id`, `trust_score`, and `product_id` to order notes so they appear directly in the Razorpay test dashboard.
- Provide a dedicated test suite with `NEXUS_RAZORPAY_MOCK=true` and Gemini mocking so that full 6-step pipeline integration can be validated in CI without external API keys.

</specifics>

<deferred>
## Deferred Ideas

None — discussion remained strictly focused on the Phase 3 Google ADK Orchestrator & Tool Suite.

</deferred>

---

*Phase: 03-Google ADK Orchestrator & Tool Suite*
*Context gathered: 2026-09-03*
