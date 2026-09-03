# Phase 4: MaaS Gateway & Webhook API Layer - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 builds and exposes the Next.js 14 API Route Layer for machine-to-machine commerce, Bearer token authentication, proxy orchestration, and timing-safe webhook processing:
- `GET /api/maas/[merchant_id]/catalog`: Semantic search using Gemini `text-embedding-004` (768-dim) + pgvector `<=>` cosine distance, falling back to ILIKE search if Gemini API fails or lacks key, returning structured JSON with exact paise pricing (`amount_paise`), INR currency, stock availability, and dynamic `agent_purchase_url`.
- `POST /api/maas/[merchant_id]/transact`: Authenticated endpoint verifying SHA-256 hashed Bearer tokens (`nx_live_*`), validating buyer payload via `@nexus/db` sanitization utilities, rate limiting per merchant (60 rpm catalog, 20 rpm transact), forwarding to ADK orchestrator (port 8000 `POST /run`) with a 10s AbortController timeout, and returning explicit status codes (200 SUCCESS, 403 TRUST DENIED, 409 STOCK ERROR, 422 INVALID INTENT, 500 FAILED) with complete embedded `audit_trail`.
- `GET /api/audit/[transaction_id]`: Historical lookup returning the complete, sealed audit trail for any transaction ID.
- `POST /api/webhooks/razorpay`: Razorpay webhook ingestion enforcing timing-safe HMAC-SHA256 signature verification (`crypto.timingSafeEqual`), status transition idempotency (ignoring duplicate events if transaction is already in a terminal state), and non-blocking background signal dispatch to Trust Graph port 8001 (`POST /trust/signal`) on `payment.captured` and `payment.failed`.
- Webhook testing utilities / fixtures for simulating signed Razorpay events in local development and automated CI.

</domain>

<decisions>
## Implementation Decisions

### Catalog Search & Embedding
- **D-01: On-the-Fly Gemini text-embedding-004 with ILIKE Fallback** — `GET /api/maas/{merchant_id}/catalog` generates a 768-dimensional vector embedding for the `q` query string via Gemini `text-embedding-004`. If the embedding API fails or `GOOGLE_API_KEY` is not present, it gracefully falls back to SQL `ILIKE` keyword matching over product name, description, and category. — **Reversibility:** reversible — encapsulated within catalog query helper.
- **D-02: Relevance Threshold (0.5) with Closest Fallback** — Products are filtered by cosine distance `<=>` with a minimum `match_score >= 0.5` (distance <= 0.5). If 0 products meet the threshold, return top 3 closest items with lower scores so agents understand no high-confidence match was found. — **Reversibility:** reversible — query parameter filter in route handler.
- **D-03: Browse Mode on Empty Query** — When `q` is absent, catalog returns all in-stock products for the merchant ordered by `created_at DESC` with `match_score: 1.0`, respecting `category`, `max_price_paise`, and `limit`. — **Reversibility:** reversible.
- **D-04: Dynamic agent_purchase_url Derivation** — `agent_purchase_url` is dynamically built from request headers (`Host`, `X-Forwarded-Proto`), falling back to `NEXT_PUBLIC_APP_URL` / `APP_URL`, pointing directly to `.../api/maas/{merchant_id}/transact`. — **Reversibility:** reversible.

### MaaS Authentication & Merchant Tokens
- **D-05: Opaque Bearer Tokens with SHA-256 Storage** — MaaS Bearer tokens follow the format `nx_live_<32-hex-bytes>` (64 hex characters preceded by prefix). Only the SHA-256 hash (`crypto.createHash("sha256").update(token).digest("hex")`) is stored and indexed in PostgreSQL `merchants.maas_token_hash`. Lookup is single-indexed equality query. — **Reversibility:** costly — matches Phase 1 schema contract and token generation format.
- **D-06: Granular HTTP Auth Codes (401/403/404)** — Auth failures return distinct codes: 401 Unauthorized for missing or invalid token syntax/hash; 403 Forbidden if the token belongs to a different merchant; 404 Not Found if the URL `merchant_id` does not exist. — **Reversibility:** reversible — route handler response status convention.
- **D-07: In-Memory Sliding Window Rate Limiting** — Gateway implements sliding window rate limiting per merchant ID: 60 rpm for catalog search, 20 rpm for transact. Exceeding limits returns 429 Too Many Requests with a `Retry-After` header. — **Reversibility:** reversible.
- **D-08: Passing merchant_id to Orchestrator (No Plaintext Secrets Over Wire)** — Next.js forwards only `merchant_id` and buyer payload to the ADK orchestrator (port 8000). The orchestrator looks up and decrypts the merchant Razorpay credentials locally using AES-256-GCM (`nexus_db/crypto.py`). — **Reversibility:** costly — inter-service security contract between Gateway and ADK.

### Transact Proxy & ADK Interop
- **D-09: Gateway Pre-Validation & Sanitization via @nexus/db** — Next.js validates and sanitizes the buyer fingerprint object using `@nexus/db` (`sanitize.ts`) before proxying to ADK: normalizes email (lowercase, trimmed), normalizes IPv4 to `/24` subnet, validates UPI handle pattern, and ensures required fields are present before calling the orchestrator. — **Reversibility:** reversible.
- **D-10: Explicit HTTP Status Code Mapping (MAAS-05)** — Transact route maps ADK pipeline outcomes to explicit HTTP codes:
  - `200 OK`: Successful order creation and payment capture with receipt, transaction_id, and audit_trail.
  - `403 Forbidden`: Trust denial (`trust_score < 40` / `TrustViolationError`), returning risk factors, rationale, and audit_trail.
  - `409 Conflict`: Insufficient stock (`StockError`), returning requested vs available stock and audit_trail.
  - `422 Unprocessable Entity`: Intent parsing failure or invalid quantity (`<= 0` or `> 100`).
  - `500 Internal Server Error`: Unhandled tool error or execution failure.
  — **Reversibility:** one-way — core external API contract published to AI buyer agents.
- **D-11: 10-Second AbortController Gateway Timeout** — Next.js enforces a 10s fetch timeout with an `AbortController` when calling ADK runner `POST /run`. On breach, it returns 504 Gateway Timeout. — **Reversibility:** reversible.
- **D-12: Full Audit Trail Embedding & Dedicated Audit API** — Transact responses on all termination paths (200, 403, 409, 422, 500) embed the full `audit_trail: [...]` array. Additionally, `GET /api/audit/{transaction_id}` queries PostgreSQL `audit_entries` to return the complete hash-chained audit log for historical and dashboard access. — **Reversibility:** costly — response schema contract used by buyers and dashboard drawers.

### Webhook Ingestion & Graph Signals
- **D-13: Native Timing-Safe Webhook HMAC Verification** — `POST /api/webhooks/razorpay` reads raw request text and computes HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`. Compares signatures using `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))` after length checking, rejecting mismatches with 400 Bad Request. — **Reversibility:** costly — critical payment security gateway.
- **D-14: State Machine Idempotency on Terminal Statuses** — Webhook processing checks current transaction status in PostgreSQL: if transaction is already in terminal `SUCCESS` or `FAILED`, subsequent duplicate `payment.captured` or `payment.failed` webhook deliveries are acknowledged with 200 OK without corrupting state or executing duplicate increments. — **Reversibility:** costly — payment state machine consistency.
- **D-15: Non-Blocking Asynchronous Signal Dispatch to Port 8001** — On `payment.captured` and `payment.failed`, webhook handler fires non-blocking HTTP requests to Trust Graph service (`http://localhost:8001/trust/signal`). Webhook returns 200 OK to Razorpay immediately without failing the webhook if port 8001 is momentarily busy. — **Reversibility:** reversible.
- **D-16: Signed Webhook Simulation Test Utilities** — Provide test helpers to generate valid HMAC-SHA256 signed Razorpay event payloads for end-to-end integration tests and local development verification without needing live Razorpay servers or ngrok tunnels. — **Reversibility:** reversible.

### The Agent Discretion
- Next.js 14 App Router route handler organization under `app/api/maas/[merchant_id]/catalog/route.ts`, `app/api/maas/[merchant_id]/transact/route.ts`, `app/api/webhooks/razorpay/route.ts`, `app/api/audit/[transaction_id]/route.ts`.
- Implementation details of the in-memory token bucket / sliding window rate limiter.
- Error response payload formatting conventions maintaining JSON schema fidelity with PRD §11.1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD & Architecture
- `PRD.md` §6.1, §6.2, §6.3 — System architecture, linear request flow (happy path & denied path).
- `PRD.md` §7.1 — Next.js 14 App Router role (Route Handlers colocated with dashboard).
- `PRD.md` §11.1 — MaaS endpoints specification (`GET /api/maas/{merchant_id}/catalog`, `POST /api/maas/{merchant_id}/transact`).
- `PRD.md` §11.2 — Trust Graph endpoints (`POST /trust/signal`).
- `PRD.md` §11.3 — Razorpay webhook specification (`POST /api/webhooks/razorpay`, handled events, signature verification).
- `CONVENTIONS.md` — Integer paise currency convention (`amount_paise`), Next.js 14 App Router standards.

### Requirements Traceability
- `.planning/REQUIREMENTS.md` MAAS-01 — Natural language catalog query via Gemini `text-embedding-004` and pgvector cosine similarity.
- `.planning/REQUIREMENTS.md` MAAS-02 — Structured JSON catalog output with paise pricing, INR, stock, `agent_purchase_url`.
- `.planning/REQUIREMENTS.md` MAAS-03 — Purchase execution via `POST /api/maas/{merchant_id}/transact` with buyer fingerprint.
- `.planning/REQUIREMENTS.md` MAAS-04 — Bearer token authentication hashed (SHA-256) at rest.
- `.planning/REQUIREMENTS.md` MAAS-05 — Structured HTTP responses: 200, 403, 409, 500.
- `.planning/REQUIREMENTS.md` RZP-03 — Timing-safe HMAC-SHA256 webhook signature verification.
- `.planning/REQUIREMENTS.md` RZP-04 — Webhook event handling (`payment.captured`, `payment.failed`, `order.paid`) and graph signal dispatch.
- `.planning/REQUIREMENTS.md` AUDIT-03 — 100% sealed audit trail returned in payload and queryable by transaction ID.

### Prior Phase Decisions & Stack Contracts
- `.planning/phases/01-database-schema-core-data-layer/01-CONTEXT.md` — PostgreSQL schema, `maas_token_hash`, pgvector cosine distance `<=>`, `@nexus/db` TypeScript library.
- `.planning/phases/02-trust-graph-engine-microservice/02-CONTEXT.md` — Port 8001 `/trust/signal` event contract.
- `.planning/phases/03-google-adk-orchestrator-tool-suite/03-CONTEXT.md` — Port 8000 ADK runner `POST /run`, deterministic 6-step state machine, integer paise conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/ts/src/client.ts`: Shared PostgreSQL connection pool helper (`getPool()`, `query()`).
- `db/ts/src/crypto.ts`: AES-256-GCM encryption/decryption, SHA-256 hashing for tokens and buyer signals.
- `db/ts/src/sanitize.ts`: Buyer fingerprint sanitization and `/24` subnet normalization.
- `db/ts/src/types.ts`: TypeScript interfaces for `Merchant`, `Product`, `Transaction`, `AuditEntry`, `BuyerFingerprint`.
- `db/ts/src/audit.ts`: SHA-256 hash chain verification and audit entry serialization.

### Established Patterns
- All monetary values stored and calculated strictly as integer paise (`amount_paise`).
- Strict TypeScript static typing without `any`.
- Environment variable configuration via `.env` (`DATABASE_URL`, `GOOGLE_API_KEY`, `RAZORPAY_WEBHOOK_SECRET`, `ADK_AGENT_URL`, `TRUST_GRAPH_URL`).

### Integration Points
- `GET /api/maas/[merchant_id]/catalog`: Queries PostgreSQL `products` table with pgvector cosine distance operator `<=>`.
- `POST /api/maas/[merchant_id]/transact`: Authenticates against `merchants` table and proxies to ADK port 8000 (`POST /run`).
- `POST /api/webhooks/razorpay`: Verifies HMAC signature, updates `transactions` table, and dispatches HTTP POST to Trust Graph port 8001 (`POST /trust/signal`).
- `GET /api/audit/[transaction_id]`: Reads `audit_entries` table ordered by `step_number ASC`.

</code_context>

<specifics>
## Specific Ideas

- Provide a test fixture generator utility so integration tests can craft valid signed webhook payloads against local test server without network.
- Ensure route handlers cleanly isolate server-side secrets (database connection string, webhook secrets) from client bundles.

</specifics>

<deferred>
## Deferred Ideas

None — discussion remained strictly focused on the Phase 4 MaaS Gateway & Webhook API Layer.

</deferred>

---

*Phase: 04-MaaS Gateway & Webhook API Layer*
*Context gathered: 2026-09-03*
