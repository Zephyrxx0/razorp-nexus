# Phase 4: MaaS Gateway & Webhook API Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 04-MaaS Gateway & Webhook API Layer
**Areas discussed:** Catalog Search & Embedding, MaaS Auth & Merchant Tokens, Transact Proxy & ADK Interop, Webhook Ingestion & Graph Signals

---

## Catalog Search & Embedding

| Option | Description | Selected |
|--------|-------------|----------|
| On-the-fly Gemini text-embedding-004 + fallback to ILIKE keyword match on embedding API failure/missing key | Primary vector search with resilient text fallback | ✓ |
| Strict Gemini vector embedding only | Throw 503/500 if embedding fails | |
| You decide | Agent discretion | |

**User choice:** On-the-fly Gemini text-embedding-004 + fallback to ILIKE keyword match on embedding API failure/missing key
**Notes:** Ensures local dev and transient API hiccups do not halt commerce catalog queries.

| Option | Description | Selected |
|--------|-------------|----------|
| Min match_score threshold 0.5 (cosine distance <= 0.5); if 0 match, return top 3 closest with low scores | Threshold filtering with graceful fallback | ✓ |
| No score filter | Return top N results strictly ordered by similarity | |
| You decide | Agent discretion | |

**User choice:** Min match_score threshold 0.5 (cosine distance <= 0.5); if 0 match, return top 3 closest with low scores
**Notes:** Prevents completely irrelevant items from pretending to be matches while still offering closest options.

| Option | Description | Selected |
|--------|-------------|----------|
| Browse mode — return all in-stock products ordered by created_at DESC (match_score: 1.0) | Default browse view | ✓ |
| Require q param | Return 400 if search term not provided | |
| You decide | Agent discretion | |

**User choice:** Browse mode — return all in-stock products ordered by created_at DESC (match_score: 1.0)
**Notes:** Allows buyer agents to explore the full catalog without generating a search query.

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic derivation from request headers (Host / X-Forwarded-Proto) falling back to NEXT_PUBLIC_APP_URL | Auto-adapting URL generation | ✓ |
| Strict static NEXT_PUBLIC_APP_URL from environment only | Fixed URL | |
| You decide | Agent discretion | |

**User choice:** Dynamic derivation from request headers (Host / X-Forwarded-Proto) falling back to NEXT_PUBLIC_APP_URL
**Notes:** Works seamlessly across local dev, staging, and production domains.

---

## MaaS Auth & Merchant Tokens

| Option | Description | Selected |
|--------|-------------|----------|
| Opaque token with prefix nx_live_<32-byte-hex>, SHA-256 hashed before DB lookup | Matches Phase 1 schema contract | ✓ |
| Stateless JWT signed with HMAC-SHA256 | Signed claims | |
| You decide | Agent discretion | |

**User choice:** Opaque token with prefix nx_live_<32-byte-hex>, SHA-256 hashed before DB lookup
**Notes:** Consistent with merchants.maas_token_hash column.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict status breakdown: 401 on missing/invalid token, 403 on token-merchant mismatch, 404 on inactive/unknown merchant | Clear diagnostic status codes | ✓ |
| Uniform 401 Unauthorized for any auth failure | Opaque error response | |
| You decide | Agent discretion | |

**User choice:** Strict status breakdown: 401 on missing/invalid token, 403 on token-merchant mismatch, 404 on inactive/unknown merchant
**Notes:** Makes automated buyer agent debugging immediate and unambiguous.

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight in-memory sliding window rate limiter per merchant (60 rpm catalog, 20 rpm transact) returning 429 | Sliding window token bucket | ✓ |
| Skip gateway rate limiter in MVP | Rely on Trust Graph velocity | |
| You decide | Agent discretion | |

**User choice:** Lightweight in-memory sliding window rate limiter per merchant (60 rpm catalog, 20 rpm transact) returning 429
**Notes:** Protects gateway resources from rogue buyer agent loops.

| Option | Description | Selected |
|--------|-------------|----------|
| Pass only merchant_id in orchestrator payload; orchestrator fetches and decrypts keys directly in Python runner | Defense-in-depth isolation | ✓ |
| Decrypt keys in Next.js gateway and forward via internal HTTP body | Plaintext loopback transfer | |
| You decide | Agent discretion | |

**User choice:** Pass only merchant_id in orchestrator payload; orchestrator fetches and decrypts keys directly in Python runner
**Notes:** Eliminates plaintext credential transmission across loopback HTTP calls.

---

## Transact Proxy & ADK Interop

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway sanitizes & validates buyer object via db/ts sanitize.ts before forwarding to ADK orchestrator | Boundary validation | ✓ |
| Raw pass-through to ADK port 8000 | Backend-only validation | |
| You decide | Agent discretion | |

**User choice:** Gateway sanitizes & validates buyer object via db/ts sanitize.ts before forwarding to ADK orchestrator
**Notes:** Reuses @nexus/db TypeScript library built in Phase 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit HTTP status: 200 SUCCESS, 403 TRUST DENIED, 409 STOCK ERROR, 422 INVALID INTENT, 500 FAILED | Standard MAAS-05 contract | ✓ |
| Uniform 200 OK with body status enum | Non-standard REST | |
| You decide | Agent discretion | |

**User choice:** Explicit HTTP status: 200 SUCCESS, 403 TRUST DENIED, 409 STOCK ERROR, 422 INVALID INTENT, 500 FAILED (per MAAS-05)
**Notes:** Meets PRD and evaluation suite requirements.

| Option | Description | Selected |
|--------|-------------|----------|
| 10-second AbortController timeout on HTTP fetch to ADK runner — returns 504 on breach | Strict SLA boundary | ✓ |
| 15-second timeout allowing maximum headroom | Extended timeout | |
| You decide | Agent discretion | |

**User choice:** 10-second AbortController timeout on HTTP fetch to ADK runner — returns 504 on breach
**Notes:** Adheres to the <8s transaction budget with safety margin.

| Option | Description | Selected |
|--------|-------------|----------|
| Embed full audit_trail array directly in every transact response + provide GET /api/audit/{transaction_id} lookup | Dual delivery (response + lookup) | ✓ |
| Return only audit_trail_url | Small response payload | |
| You decide | Agent discretion | |

**User choice:** Embed full audit_trail array directly in every transact response + provide GET /api/audit/{transaction_id} lookup
**Notes:** Fulfills AUDIT-03 requirement completely.

---

## Webhook Ingestion & Graph Signals

| Option | Description | Selected |
|--------|-------------|----------|
| Native Node crypto.timingSafeEqual with Buffer comparison on raw request body and RAZORPAY_WEBHOOK_SECRET | Cryptographic timing-attack defense | ✓ |
| Use razorpay npm SDK validateWebhookSignature utility helper | Library wrapper | |
| You decide | Agent discretion | |

**User choice:** Native Node crypto.timingSafeEqual with Buffer comparison on raw request body and RAZORPAY_WEBHOOK_SECRET
**Notes:** Standard zero-dependency Node crypto verification.

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent state machine guards: ignore duplicates if transaction already in terminal status (SUCCESS/FAILED) | State machine integrity | ✓ |
| Unconditional status re-write on every received event | Unsafe overwrite | |
| You decide | Agent discretion | |

**User choice:** Idempotent state machine guards: ignore duplicates if transaction already in terminal status (SUCCESS/FAILED)
**Notes:** Prevents corrupting settled transactions during Razorpay webhook retries.

| Option | Description | Selected |
|--------|-------------|----------|
| Asynchronous non-blocking signal dispatch with try/catch logging; return 200 to Razorpay promptly | High-availability webhook handling | ✓ |
| Synchronous await on /trust/signal; fail webhook with 500 if Trust Graph unreachable | Blocking cascade | |
| You decide | Agent discretion | |

**User choice:** Asynchronous non-blocking signal dispatch with try/catch logging; return 200 to Razorpay promptly
**Notes:** Prevents Razorpay webhook backoff and retry storms during internal graph recalculations.

| Option | Description | Selected |
|--------|-------------|----------|
| Provide test utility / helper to generate signed test webhook payloads for integration testing & local dev | Frictionless local verification | ✓ |
| Rely purely on manual curl or external ngrok tunneling | Manual testing only | |
| You decide | Agent discretion | |

**User choice:** Provide test utility / helper to generate signed test webhook payloads for integration testing & local dev
**Notes:** Enables full CI/CD test automation for payment webhooks.

---

## The Agent Discretion

- Organization of Next.js App Router folders under app/api/maas/[merchant_id]/...
- Sliding-window rate limiter memory structure and eviction intervals.
- Specific JSON error message text and field layouts conforming to PRD schemas.

## Deferred Ideas

None — discussion remained strictly focused on the Phase 4 MaaS Gateway & Webhook API Layer.
