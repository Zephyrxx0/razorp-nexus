# Phase 4: MaaS Gateway & Webhook API Layer - Technical Research

**Phase:** 04-MaaS Gateway & Webhook API Layer  
**Date:** 2026-09-03  
**Status:** Completed  
**Requirements Covered:** MAAS-01, MAAS-02, MAAS-03, MAAS-04, MAAS-05, RZP-03, RZP-04, AUDIT-03  

---

## 1. Executive Summary

Phase 4 constructs and exposes the external API Gateway layer for Project Nexus using the **Next.js 14 App Router** (`next@14.2.24`). Colocated alongside the forthcoming merchant dashboard, this layer bridges autonomous AI buyer agents, merchant product catalogs, the Google ADK orchestrator agent (port 8000), the NetworkX Trust Graph engine (port 8001), and Razorpay test-mode payment webhooks into a unified, secure machine-to-machine commerce gateway.

### Core Objectives Delivered:
1. **Semantic Catalog Discovery (`GET /api/maas/[merchant_id]/catalog`)**:
   - Generates 768-dimensional embeddings for natural language buyer queries using Google Gemini `models/text-embedding-004`.
   - Executes sub-10ms vector cosine distance queries (`<=>`) via PostgreSQL 16 + `pgvector` HNSW indexes.
   - Provides an automated fallback to SQL `ILIKE` keyword matching if `GOOGLE_API_KEY` is absent or the Gemini API experiences network errors (D-01).
   - Enforces a `0.5` match score threshold (`distance <= 0.5`) with a graceful top-3 closest item fallback (D-02), full-catalog browse mode when queries are blank (D-03), and dynamically computed `agent_purchase_url` properties (D-04).
2. **Authenticated Commerce Transact Proxy (`POST /api/maas/[merchant_id]/transact`)**:
   - Authenticates callers using opaque Bearer tokens (`nx_live_*` / `maas_live_*`) stored as SHA-256 hashes in `merchants.maas_token_hash` (D-05, D-06).
   - Enforces in-memory sliding window rate limits (60 rpm catalog, 20 rpm transact) per merchant ID (D-07).
   - Sanitizes and normalizes incoming buyer fingerprints using the `@nexus/db` TypeScript library (`sanitize.ts`) (D-09).
   - Proxies buyer intents to the Google ADK orchestrator (`POST http://localhost:8000/run`) passing only `merchant_id` to prevent credential leakage (D-08).
   - Enforces a strict 10-second `AbortController` gateway timeout returning 504 on breach (D-11).
   - Maps ADK pipeline execution events to explicit, standard HTTP status codes (`200 SUCCESS`, `403 TRUST DENIED`, `409 STOCK ERROR`, `422 INVALID INTENT`, `500 FAILED`) with embedded hash-chained audit trails (D-10, D-12).
3. **Dedicated Audit Trail API (`GET /api/audit/[transaction_id]`)**:
   - Provides historical, cryptographically verified audit trail access querying `audit_entries` by `transaction_id` (D-12, AUDIT-03).
4. **Timing-Safe Razorpay Webhook Ingestion (`POST /api/webhooks/razorpay`)**:
   - Ingests raw HTTP payloads and validates the `X-Razorpay-Signature` header using native `crypto.timingSafeEqual` with buffer length checking (D-13, RZP-03).
   - Implements idempotent state transitions, preventing duplicate status corruption if a transaction has already achieved terminal `SUCCESS` or `FAILED` status (D-14).
   - Dispatches non-blocking, background HTTP telemetry signals to Trust Graph port 8001 (`POST /trust/signal`) on `payment.captured` and `payment.failed` without blocking webhook acknowledgments (D-15, RZP-04).
5. **Signed Webhook Simulation Test Utilities**:
   - Exposes deterministic fixture generators for generating signed test webhook requests in automated Vitest suites and CI pipelines (D-16).

---

## 2. User Constraints & Implementation Decisions

The following decisions were established in `04-CONTEXT.md` and govern all Phase 4 implementations:

* **D-01: On-the-Fly Gemini text-embedding-004 with ILIKE Fallback** — `GET /api/maas/{merchant_id}/catalog` generates a 768-dimensional vector embedding for the `q` query string via Gemini `text-embedding-004`. If the embedding API fails or `GOOGLE_API_KEY` is not present, it gracefully falls back to SQL `ILIKE` keyword matching over product name, description, and category.
* **D-02: Relevance Threshold (0.5) with Closest Fallback** — Products are filtered by cosine distance `<=>` with a minimum `match_score >= 0.5` (distance <= 0.5). If 0 products meet the threshold, return top 3 closest items with lower scores so agents understand no high-confidence match was found.
* **D-03: Browse Mode on Empty Query** — When `q` is absent, catalog returns all in-stock products for the merchant ordered by `created_at DESC` with `match_score: 1.0`, respecting `category`, `max_price_paise`, and `limit`.
* **D-04: Dynamic agent_purchase_url Derivation** — `agent_purchase_url` is dynamically built from request headers (`Host`, `X-Forwarded-Proto`), falling back to `NEXT_PUBLIC_APP_URL` / `APP_URL`, pointing directly to `.../api/maas/{merchant_id}/transact`.
* **D-05: Opaque Bearer Tokens with SHA-256 Storage** — MaaS Bearer tokens follow the format `nx_live_<32-hex-bytes>` (or `maas_live_<32-hex-bytes>`). Only the SHA-256 hash (`crypto.createHash("sha256").update(token).digest("hex")`) is stored and indexed in PostgreSQL `merchants.maas_token_hash`. Lookup is a single-indexed equality query.
* **D-06: Granular HTTP Auth Codes (401/403/404)** — Auth failures return distinct codes: 401 Unauthorized for missing or invalid token syntax/hash; 403 Forbidden if the token belongs to a different merchant; 404 Not Found if the URL `merchant_id` does not exist or is inactive.
* **D-07: In-Memory Sliding Window Rate Limiting** — Gateway implements sliding window rate limiting per merchant ID: 60 rpm for catalog search, 20 rpm for transact. Exceeding limits returns 429 Too Many Requests with a `Retry-After` header.
* **D-08: Passing merchant_id to Orchestrator (No Plaintext Secrets Over Wire)** — Next.js forwards only `merchant_id` and buyer payload to the ADK orchestrator (port 8000). The orchestrator looks up and decrypts the merchant Razorpay credentials locally using AES-256-GCM (`nexus_db/crypto.py`).
* **D-09: Gateway Pre-Validation & Sanitization via @nexus/db** — Next.js validates and sanitizes the buyer fingerprint object using `@nexus/db` (`sanitize.ts`) before proxying to ADK: normalizes email (lowercase, trimmed), normalizes IPv4 to `/24` subnet, validates UPI handle pattern, and ensures required fields are present before calling the orchestrator.
* **D-10: Explicit HTTP Status Code Mapping (MAAS-05)** — Transact route maps ADK pipeline outcomes to explicit HTTP codes:
  - `200 OK`: Successful order creation and payment capture with receipt, transaction_id, and audit_trail.
  - `403 Forbidden`: Trust denial (`trust_score < 40` / `TrustViolationError`), returning risk factors, rationale, and audit_trail.
  - `409 Conflict`: Insufficient stock (`StockError`), returning requested vs available stock and audit_trail.
  - `422 Unprocessable Entity`: Intent parsing failure or invalid quantity (`<= 0` or `> 100`).
  - `500 Internal Server Error`: Unhandled tool error or execution failure.
* **D-11: 10-Second AbortController Gateway Timeout** — Next.js enforces a 10s fetch timeout with an `AbortController` when calling ADK runner `POST /run`. On breach, it returns 504 Gateway Timeout.
* **D-12: Full Audit Trail Embedding & Dedicated Audit API** — Transact responses on all termination paths (200, 403, 409, 422, 500) embed the full `audit_trail: [...]` array. Additionally, `GET /api/audit/{transaction_id}` queries PostgreSQL `audit_entries` to return the complete hash-chained audit log for historical and dashboard access.
* **D-13: Native Timing-Safe Webhook HMAC Verification** — `POST /api/webhooks/razorpay` reads raw request text and computes HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`. Compares signatures using `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))` after length checking, rejecting mismatches with 400 Bad Request.
* **D-14: State Machine Idempotency on Terminal Statuses** — Webhook processing checks current transaction status in PostgreSQL: if transaction is already in terminal `SUCCESS` or `FAILED`, subsequent duplicate `payment.captured` or `payment.failed` webhook deliveries are acknowledged with 200 OK without corrupting state or executing duplicate increments.
* **D-15: Non-Blocking Asynchronous Signal Dispatch to Port 8001** — On `payment.captured` and `payment.failed`, webhook handler fires non-blocking HTTP requests to Trust Graph service (`http://localhost:8001/trust/signal`). Webhook returns 200 OK to Razorpay immediately without failing the webhook if port 8001 is momentarily busy.
* **D-16: Signed Webhook Simulation Test Utilities** — Provide test helpers to generate valid HMAC-SHA256 signed Razorpay event payloads for end-to-end integration tests and local development verification without needing live Razorpay servers or ngrok tunnels.

---

## 3. Standard Stack & Dependencies

| Dependency | Target Version | Primary Purpose | Integration Details |
|---|---|---|---|
| `next` | `14.2.24` | Web Framework & API Route Handlers | Powers App Router route handlers (`app/api/...`), Server Components, and dynamic request parsing. |
| `react` & `react-dom` | `18.3.1` | React Core Engine | Peer dependency for Next.js 14 App Router. |
| `typescript` | `^5.5.4` | Strict Static Typing | Enforces compile-time contracts for buyer fingerprints, transactions, and audit entries. |
| `@google/generative-ai` | `^0.8.3` | Gemini API Client | Generates 768d text embeddings via `models/text-embedding-004`. |
| `pg` & `@types/pg` | `^8.12.0` / `^8.11.6` | PostgreSQL Connection Pool | Provides binary database connectivity via `@nexus/db` connection pool. |
| `node:crypto` | Native Built-in | Cryptographic Utilities | Timing-safe buffer comparisons, SHA-256 token hashing, HMAC-SHA256 signature verification. |
| `@nexus/db` | Internal Workspace | Database Models & Security | Reuses client pool (`client.ts`), sanitization (`sanitize.ts`), crypto helpers (`crypto.ts`), and types (`types.ts`). |
| `vitest` | `^2.0.0` | Test Runner | Fast unit and integration test runner for route handlers and crypto verification. |

---

## 4. Architecture & Route Handler Patterns

### 4.1 Route Directory Structure
In Next.js 14 App Router, routes are colocated under `src/app/api/` (or `app/api/`):

```
nexus/
├── app/ (or src/app/)
│   └── api/
│       ├── maas/
│       │   └── [merchant_id]/
│       │       ├── catalog/
│       │       │   └── route.ts         # GET: Catalog search & browse
│       │       └── transact/
│       │           └── route.ts         # POST: Authenticated agent checkout proxy
│       ├── webhooks/
│       │   └── razorpay/
│       │       └── route.ts             # POST: Razorpay HMAC webhook ingestion
│       └── audit/
│           └── [transaction_id]/
│               └── route.ts             # GET: Sealed audit trail lookup
├── src/lib/ (or lib/)
│   ├── auth.ts                          # Bearer token validation & merchant lookup
│   ├── rate-limiter.ts                  # In-memory sliding window rate limiter
│   ├── embeddings.ts                    # Gemini embedding client with ILIKE fallback
│   ├── adk-client.ts                    # ADK port 8000 HTTP client with AbortController
│   ├── trust-client.ts                  # Port 8001 non-blocking signal dispatcher
│   ├── url-helpers.ts                   # Dynamic agent_purchase_url constructor
│   └── webhook-verifier.ts              # Timing-safe HMAC signature verification
└── test/
    ├── helpers/
    │   └── webhook-generator.ts         # Signed webhook fixture generator
    └── routes/                          # Vitest route handler unit/integration tests
```

### 4.2 Next.js 14 Route Handler Idioms

#### Context and Parameters
In Next.js 14 App Router, route handlers receive `NextRequest` and a context object containing path parameters:
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { merchant_id: string } }
): Promise<NextResponse> {
  const { merchant_id } = params;
  // ...
}
```

#### Standard JSON Responses
Always return `NextResponse.json(data, { status, headers })`:
```typescript
return NextResponse.json(
  {
    error: 'UNAUTHORIZED',
    message: 'Missing or invalid Bearer token',
  },
  {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer error="invalid_token"',
      'Content-Type': 'application/json',
    },
  }
);
```

#### Reading Query Parameters
```typescript
const searchParams = request.nextUrl.searchParams;
const query = searchParams.get('q') || undefined;
const category = searchParams.get('category') || undefined;
const maxPricePaise = searchParams.get('max_price_paise')
  ? parseInt(searchParams.get('max_price_paise')!, 10)
  : undefined;
const inStock = searchParams.get('in_stock') !== 'false'; // default true
const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10), 1), 50);
```

---

## 5. Don't Hand-Roll: Reusable Core Assets

| Capability | What NOT to Do | What to Use Instead |
|---|---|---|
| **Vector Similarity** | Do NOT compute dot-products or cosine similarities in JavaScript in memory. | Use PostgreSQL + `pgvector` `<=>` cosine distance operator: `SELECT *, (1 - (embedding <=> $1::vector)) AS match_score FROM products WHERE ... ORDER BY embedding <=> $1::vector ASC`. Leveraging the `idx_products_embedding_hnsw` index yields sub-5ms lookups. |
| **Signature Comparison** | Do NOT compare webhook signatures or tokens using string equality `===`. | Use `crypto.timingSafeEqual(bufA, bufB)` from Node.js `node:crypto`. Guard against length mismatch crashes by verifying `bufA.length === bufB.length` first. |
| **Buyer Sanitization** | Do NOT write custom regexes or ad-hoc email/IP parsing in route handlers. | Import `sanitizeAuditData`, `maskIpSubnet`, and `hashEmail` directly from `@nexus/db` (`db/ts/src/sanitize.ts` and `crypto.ts`). |
| **Token Generation & Hashing** | Do NOT use un-salted MD5 or raw token equality in SQL queries. | Use `hashMaasToken(token)` from `@nexus/db` (`crypto.ts`) which hashes tokens using SHA-256 before performing single-indexed query `WHERE maas_token_hash = $1`. |
| **Database Pool** | Do NOT instantiate new `new Pool()` connections per request. | Import `query` and `getDbPool` from `@nexus/db` (`client.ts`), ensuring connection reuse across serverless/container invocations. |
| **Audit Verification** | Do NOT manually iterate audit entries to check hash chains. | Use `verifyAuditChain(entries)` from `@nexus/db` (`audit.ts`) to validate contiguous step numbers, genesis links, and canonical preimage SHA-256 integrity. |

---

## 6. Common Pitfalls & Edge Cases

### 6.1 Floating-Point Currency Bugs
* **The Pitfall:** Using JavaScript `number` floats for monetary values (e.g. `29.99 * 100 = 2998.9999999999995`) causes rounding drift, leading to database schema rejections and Razorpay payment amount mismatch errors.
* **The Rule:** Currency is strictly tracked as **integer paise** (`amount_paise: number`, e.g., ₹1,999 is stored and transferred as `199900`).
* **The Solution:** Never divide or multiply money values during catalog queries, transaction routing, or order creation. Compute formatted strings solely at the UI/presentation boundary:
  ```typescript
  export function formatPaiseToInr(amountPaise: number): string {
    const rupees = amountPaise / 100;
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  ```

### 6.2 Webhook Raw Body Stream Consumption Before JSON Parsing
* **The Pitfall:** Calling `await req.json()` in Next.js consumes the underlying ReadableStream. If you subsequently attempt `await req.text()`, it returns an empty string or throws. Furthermore, re-serializing the parsed JSON via `JSON.stringify(body)` produces different whitespace or key ordering than the original wire payload, causing HMAC verification to fail 100% of the time.
* **The Rule:** In `app/api/webhooks/razorpay/route.ts`, **read the body as text exactly once**:
  ```typescript
  const rawBody = await req.text();
  const isValid = verifyRazorpaySignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  const payload = JSON.parse(rawBody);
  ```

### 6.3 `crypto.timingSafeEqual` Buffer Length Mismatch Crash
* **The Pitfall:** `crypto.timingSafeEqual(bufA, bufB)` throws a runtime `RangeError: Input buffers must have the same byte length` if the two buffers differ in size. An attacker sending an invalid signature of unexpected length (e.g. empty or 32 chars) will cause an unhandled 500 server crash.
* **The Rule:** Always guard buffer comparison with a strict byte length equality check:
  ```typescript
  export function timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
  ```

### 6.4 Unhandled Promise Rejections on Non-Blocking Port 8001 Dispatch
* **The Pitfall:** Per Decision D-15, the webhook handler must fire an asynchronous signal to `http://localhost:8001/trust/signal` without blocking the HTTP 200 response to Razorpay. If Trust Graph is undergoing rehydration or momentarily offline, an unhandled floating promise (`fetch(...).catch(...)` without complete error absorption) can trigger `unhandledRejection` warnings or crash Node worker threads.
* **The Rule:** Wrap signal dispatch in an isolated safe utility that swallows and logs connection errors:
  ```typescript
  export function dispatchTrustSignalNonBlocking(signal: TrustSignalPayload): void {
    const trustUrl = process.env.TRUST_GRAPH_URL || 'http://localhost:8001';
    fetch(`${trustUrl}/trust/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    }).catch((err) => {
      console.warn(`[TrustSignal] Background signal dispatch failed: ${err.message}`);
    });
  }
  ```

### 6.5 In-Memory Rate Limiter Memory Leaks
* **The Pitfall:** An in-memory sliding window map keyed by `merchant_id` or IP accumulates timestamps indefinitely if keys are never evicted.
* **The Rule:** Prune entries older than the current 60-second window on every access, and run a periodic sweep every 5 minutes to delete merchants with no recent traffic.

### 6.6 Token Prefix & Schema Validation
* **The Pitfall:** Incoming Authorization header might have malformed prefixes, Bearer tokens with trailing whitespace, or invalid character sets.
* **The Rule:** Extract token strictly with regex `/^Bearer\s+([a-zA-Z0-9_-]+)$/i`, validate minimum length (`>= 24`), and hash with SHA-256 before querying PostgreSQL. If the query returns a merchant whose ID does not match the URL `params.merchant_id`, return `403 Forbidden` (D-06).

---

## 7. Code Examples & Integration Contracts

### 7.1 Catalog Endpoint (`GET /api/maas/[merchant_id]/catalog`)

#### Query Execution with Gemini Embedding & ILIKE Fallback (D-01, D-02, D-03)
```typescript
import { query } from '@nexus/db';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function searchCatalog(
  merchantId: string,
  searchQuery?: string,
  category?: string,
  maxPricePaise?: number,
  inStock: boolean = true,
  limit: number = 10
) {
  let embeddingVector: number[] | null = null;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (searchQuery && apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'models/text-embedding-004' });
      const result = await model.embedContent(searchQuery);
      if (result.embedding?.values && result.embedding.values.length === 768) {
        embeddingVector = result.embedding.values;
      }
    } catch (err) {
      console.warn(`Gemini embedding failed, falling back to ILIKE: ${err}`);
    }
  }

  // 1. Vector Search Path
  if (embeddingVector) {
    const vectorStr = `[${embeddingVector.join(',')}]`;
    const sql = `
      SELECT 
        id, merchant_id, name, description, price_paise, currency, stock, category, tags,
        ROUND((1 - (embedding <=> $1::vector))::numeric, 4) AS match_score
      FROM products
      WHERE merchant_id = $2
        AND is_active = true
        ${inStock ? 'AND stock > 0' : ''}
        ${category ? 'AND category = $4' : ''}
        ${maxPricePaise ? `AND price_paise <= ${maxPricePaise}` : ''}
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3
    `;
    const params: any[] = [vectorStr, merchantId, limit];
    if (category) params.push(category);

    const { rows } = await query(sql, params);

    // Apply 0.5 threshold (D-02)
    const qualifying = rows.filter((r) => Number(r.match_score) >= 0.5);
    if (qualifying.length > 0) {
      return qualifying;
    }
    // Return top 3 closest items as fallback
    return rows.slice(0, 3);
  }

  // 2. Keyword Search / Browse Fallback Path (D-01, D-03)
  const whereClauses: string[] = ['merchant_id = $1', 'is_active = true'];
  const sqlParams: any[] = [merchantId];
  let paramIdx = 2;

  if (inStock) {
    whereClauses.push('stock > 0');
  }
  if (category) {
    whereClauses.push(`category = $${paramIdx++}`);
    sqlParams.push(category);
  }
  if (maxPricePaise) {
    whereClauses.push(`price_paise <= $${paramIdx++}`);
    sqlParams.push(maxPricePaise);
  }

  let matchScoreExpr = '1.0::numeric AS match_score';
  let orderBy = 'created_at DESC';

  if (searchQuery) {
    whereClauses.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`);
    sqlParams.push(`%${searchQuery}%`);
    paramIdx++;
    matchScoreExpr = '0.75::numeric AS match_score';
  }

  sqlParams.push(limit);
  const sql = `
    SELECT id, merchant_id, name, description, price_paise, currency, stock, category, tags, ${matchScoreExpr}
    FROM products
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${paramIdx}
  `;

  const { rows } = await query(sql, sqlParams);
  return rows;
}
```

#### Response 200 JSON Contract (PRD §11.1)
```json
{
  "merchant_id": "11111111-1111-1111-1111-111111111111",
  "merchant_name": "Apex Electronics",
  "query": "wireless headphones under 30000",
  "result_count": 1,
  "products": [
    {
      "id": "10000000-0000-0000-0000-000000000001",
      "name": "Sony WH-1000XM5",
      "description": "Industry-leading wireless noise canceling headphones with Auto NC Optimizer, 30-hour battery life, and crystal-clear hands-free calling.",
      "price_paise": 2999000,
      "price_display": "₹29,990",
      "currency": "INR",
      "stock": 25,
      "category": "Consumer Tech",
      "tags": ["audio", "headphones", "noise-canceling", "bluetooth"],
      "match_score": 0.9412,
      "agent_purchase_url": "http://localhost:3000/api/maas/11111111-1111-1111-1111-111111111111/transact"
    }
  ]
}
```

---

### 7.2 Transact Endpoint (`POST /api/maas/[merchant_id]/transact`)

#### Request Body Schema (PRD §11.1)
```json
{
  "intent": "Buy 2 units of Sony wireless headphones for agent@nexus.ai",
  "buyer": {
    "email": "agent@nexus.ai",
    "ip": "103.21.44.132",
    "device_id": "a3f8b2c1d4e500112233445566778899",
    "upi_handle": "agent@upi",
    "user_agent": "NexusDemoBuyer/1.0"
  },
  "metadata": {
    "agent_id": "demo-buyer-001",
    "session_id": "sess_xyz123",
    "caller_framework": "google-adk"
  }
}
```

#### Proxy Call to ADK Runner (`http://localhost:8000/run`)
Next.js formats the sanitized payload and forwards to the ADK orchestrator:
```typescript
const adkPayload = {
  user_id: sanitizedBuyer.email || 'nexus_buyer',
  merchant_id: merchantId,
  intent: body.intent,
  buyer_email: sanitizedBuyer.email,
  buyer_fingerprint: {
    email_hash: sanitizedBuyer.email ? hashEmail(sanitizedBuyer.email) : undefined,
    ip_subnet: sanitizedBuyer.ip ? maskIpSubnet(sanitizedBuyer.ip) : '127.0.0.1/24',
    device_hash: sanitizedBuyer.device_id ? hashDeviceId(sanitizedBuyer.device_id) : undefined,
    upi_handle: sanitizedBuyer.upi_handle,
    user_agent_hash: sanitizedBuyer.user_agent ? hashUserAgent(sanitizedBuyer.user_agent) : undefined,
  },
  custom_metadata: body.metadata || {},
};

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s SLA (D-11)

try {
  const adkResponse = await fetch(`${process.env.ADK_AGENT_URL || 'http://localhost:8000'}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adkPayload),
    signal: controller.signal,
  });
} catch (err: any) {
  if (err.name === 'AbortError') {
    return NextResponse.json({ error: 'GATEWAY_TIMEOUT', message: 'ADK agent timed out after 10s' }, { status: 504 });
  }
  return NextResponse.json({ error: 'AGENT_UNAVAILABLE', message: 'ADK server connection failed' }, { status: 502 });
} finally {
  clearTimeout(timeoutId);
}
```

#### Response 200 (SUCCESS) (PRD §11.1)
```json
{
  "transaction_id": "txn_abc123",
  "status": "SUCCESS",
  "trust_score": 87,
  "trust_decision": "ALLOW",
  "product": {
    "id": "10000000-0000-0000-0000-000000000001",
    "name": "Sony WH-1000XM5",
    "quantity": 2,
    "unit_price_paise": 2999000,
    "total_amount_paise": 5998000,
    "total_amount_display": "₹59,980"
  },
  "razorpay_order_id": "order_ABCdef123",
  "razorpay_payment_id": "pay_XYZghi456",
  "payment_status": "captured",
  "captured_at": "2026-09-03T14:30:45.123Z",
  "audit_trail": [
    {
      "step": "PARSE_INTENT",
      "step_number": 1,
      "timestamp": "2026-09-03T14:30:40.001Z",
      "duration_ms": 12,
      "summary": "Query: 'Sony WH-1000XM5', Qty: 2",
      "reason": "Intent parsed successfully"
    },
    {
      "step": "RESOLVE_CATALOG",
      "step_number": 2,
      "timestamp": "2026-09-03T14:30:41.234Z",
      "duration_ms": 45,
      "summary": "Resolved: Sony WH-1000XM5, Total: 5998000 paise",
      "reason": "Catalog resolved and stock atomically decremented"
    },
    {
      "step": "CHECK_TRUST_GRAPH",
      "step_number": 3,
      "timestamp": "2026-09-03T14:30:41.890Z",
      "duration_ms": 15,
      "summary": "Score: 87.0, Decision: ALLOW",
      "reason": "Trust check passed safety threshold (>= 40)"
    },
    {
      "step": "CREATE_RAZORPAY_ORDER",
      "step_number": 4,
      "timestamp": "2026-09-03T14:30:42.145Z",
      "duration_ms": 120,
      "summary": "Order ID: order_ABCdef123, Status: created",
      "reason": "Razorpay order created with audit notes"
    },
    {
      "step": "CAPTURE_RAZORPAY_PAYMENT",
      "step_number": 5,
      "timestamp": "2026-09-03T14:30:43.567Z",
      "duration_ms": 140,
      "summary": "Payment ID: pay_XYZghi456, Status: captured",
      "reason": "Payment successfully captured"
    },
    {
      "step": "LOG_AUDIT_ENTRY",
      "step_number": 6,
      "timestamp": "2026-09-03T14:30:44.890Z",
      "duration_ms": 10,
      "summary": "Audit trail persisted and verified",
      "reason": "All pipeline operations succeeded"
    }
  ]
}
```

#### Response 403 (TRUST DENIED) (PRD §11.1, MAAS-05)
```json
{
  "transaction_id": "txn_def456",
  "status": "DENIED",
  "trust_score": 22.0,
  "trust_decision": "DENY",
  "risk_factors": [
    "known_fraud_neighbor_1hop: email hash shares a transaction history with 2 confirmed fraud nodes",
    "cross_merchant_velocity: ip_subnet 103.44.21.0/24 attempted 17 transactions across 8 merchants in last 60 minutes"
  ],
  "razorpay_order_id": null,
  "razorpay_payment_id": null,
  "message": "Transaction denied. Buyer fingerprint is associated with a known fraud ring. No payment was processed.",
  "audit_trail": [
    {
      "step": "PARSE_INTENT",
      "step_number": 1,
      "timestamp": "2026-09-03T14:30:40.001Z",
      "duration_ms": 12,
      "summary": "Query: 'Sony WH-1000XM5', Qty: 1",
      "reason": "Intent parsed successfully"
    },
    {
      "step": "RESOLVE_CATALOG",
      "step_number": 2,
      "timestamp": "2026-09-03T14:30:40.100Z",
      "duration_ms": 35,
      "summary": "Resolved: Sony WH-1000XM5, Total: 2999000 paise",
      "reason": "Catalog resolved and stock atomically decremented"
    },
    {
      "step": "CHECK_TRUST_GRAPH",
      "step_number": 3,
      "timestamp": "2026-09-03T14:30:40.150Z",
      "duration_ms": 18,
      "summary": "Score: 22.0, Decision: DENY",
      "reason": "Trust violation: score 22.0 is below safety threshold (40)"
    },
    {
      "step": "LOG_AUDIT_ENTRY",
      "step_number": 4,
      "timestamp": "2026-09-03T14:30:40.200Z",
      "duration_ms": 12,
      "summary": "Audit trail persisted and verified",
      "reason": "Trust violation: score 22.0 is below safety threshold (40)"
    }
  ]
}
```

#### Response 409 (STOCK ERROR) (PRD §11.1, MAAS-05)
```json
{
  "transaction_id": "txn_ghi789",
  "status": "FAILED",
  "error_code": "INSUFFICIENT_STOCK",
  "message": "Only 1 unit of 'Sony WH-1000XM5' available. Requested quantity: 5.",
  "available_stock": 1,
  "requested_quantity": 5,
  "audit_trail": [...]
}
```

#### Response 422 (INVALID INTENT) (D-10)
```json
{
  "error": "UNPROCESSABLE_ENTITY",
  "message": "Intent string could not be parsed into a valid product query and quantity",
  "details": {
    "intent": "gibberish hello world",
    "reason": "Zero confidence product match"
  }
}
```

---

### 7.3 Razorpay Webhook Endpoint (`POST /api/webhooks/razorpay`)

#### Signature Verification & Idempotent Processing (PRD §11.3, D-13, D-14, D-15)
```typescript
import * as crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@nexus/db';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // 1. Read raw body text once for HMAC validation (D-13)
  const rawBody = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_apex_test_secret_123';

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');

  // Timing-safe length-guarded comparison
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const eventType: string = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;

  const notes = paymentEntity?.notes || orderEntity?.notes || {};
  const nexusTxnId = notes.nexus_transaction_id;

  if (!nexusTxnId) {
    // Acknowledge events without nexus transaction metadata
    return NextResponse.json({ status: 'IGNORED_NO_TRANSACTION_ID' }, { status: 200 });
  }

  // 2. State Machine Idempotency Guard (D-14)
  const { rows } = await query(
    'SELECT id, merchant_id, status, amount_paise, buyer_fingerprint FROM transactions WHERE id = $1',
    [nexusTxnId]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const txn = rows[0];
  if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
    // Idempotent early-return for terminal states
    return NextResponse.json(
      { status: 'ALREADY_TERMINAL', current_status: txn.status },
      { status: 200 }
    );
  }

  // 3. Handle Events & Transition Status (RZP-04)
  let nextStatus: string = txn.status;
  let outcome: 'SUCCESS' | 'FAILED' | null = null;

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    nextStatus = 'SUCCESS';
    outcome = 'SUCCESS';
    await query(
      'UPDATE transactions SET status = $1, razorpay_payment_id = $2, resolved_at = clock_timestamp() WHERE id = $3',
      [nextStatus, paymentEntity?.id || txn.razorpay_payment_id, txn.id]
    );
  } else if (eventType === 'payment.failed') {
    nextStatus = 'FAILED';
    outcome = 'FAILED';
    await query(
      'UPDATE transactions SET status = $1, failure_reason = $2, resolved_at = clock_timestamp() WHERE id = $3',
      [nextStatus, paymentEntity?.error_description || 'Payment failed', txn.id]
    );
  }

  // 4. Non-blocking asynchronous signal dispatch to Port 8001 (D-15)
  if (outcome) {
    const trustUrl = process.env.TRUST_GRAPH_URL || 'http://localhost:8001';
    fetch(`${trustUrl}/trust/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: txn.merchant_id,
        transaction_id: txn.id,
        buyer_fingerprint: txn.buyer_fingerprint,
        amount_paise: Number(txn.amount_paise),
        outcome: outcome,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      console.warn(`[Webhook] Trust signal dispatch failed: ${err.message}`);
    });
  }

  return NextResponse.json({ status: 'PROCESSED', event: eventType, new_status: nextStatus }, { status: 200 });
}
```

---

### 7.4 Historical Audit Lookup Endpoint (`GET /api/audit/[transaction_id]`)

#### Query Implementation (D-12, AUDIT-03)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { query, verifyAuditChain, AuditEntry } from '@nexus/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { transaction_id: string } }
): Promise<NextResponse> {
  const { transaction_id } = params;

  const { rows } = await query<AuditEntry>(
    `SELECT 
       id, transaction_id, step_name, step_number, timestamp, duration_ms,
       input_summary, output_summary, reason, raw_data, is_error,
       prev_entry_hash, entry_hash
     FROM audit_entries
     WHERE transaction_id = $1
     ORDER BY step_number ASC`,
    [transaction_id]
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: `No audit entries found for transaction ${transaction_id}` },
      { status: 404 }
    );
  }

  const isChainValid = verifyAuditChain(rows);

  return NextResponse.json(
    {
      transaction_id,
      entry_count: rows.length,
      is_sealed: true,
      chain_valid: isChainValid,
      audit_trail: rows,
    },
    { status: 200 }
  );
}
```

---

## 8. Validation Architecture & Testing Strategy

### 8.1 Testing Stack & Harness
- **Test Framework**: `vitest` (`^2.0.0`) in `node` environment.
- **Route Handler Invocation**: Next.js route handlers (`GET`, `POST`) are invoked directly in tests by passing synthetic `NextRequest` instances constructed with the web-standard `Request` constructor.
- **Database Isolation**: Unit tests utilize stubbed database query methods or a transactional test database sandbox.

### 8.2 Webhook Fixture Generator (`test/helpers/webhook-generator.ts`)
To satisfy D-16 and allow reliable CI execution without live Razorpay webhooks or ngrok:

```typescript
import * as crypto from 'crypto';

export interface GenerateWebhookOptions {
  event: 'payment.captured' | 'payment.failed' | 'order.paid' | 'payment.authorized';
  nexusTransactionId: string;
  merchantId: string;
  amountPaise: number;
  paymentId?: string;
  orderId?: string;
  secret: string;
  errorDescription?: string;
}

export function generateSignedWebhook(options: GenerateWebhookOptions): {
  payload: any;
  rawBody: string;
  signature: string;
} {
  const payload = {
    entity: 'event',
    account_id: 'acc_nexus_test',
    event: options.event,
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: options.paymentId || `pay_${crypto.randomBytes(8).toString('hex')}`,
          entity: 'payment',
          amount: options.amountPaise,
          currency: 'INR',
          status: options.event === 'payment.captured' ? 'captured' : 'failed',
          order_id: options.orderId || `order_${crypto.randomBytes(8).toString('hex')}`,
          error_description: options.errorDescription || null,
          notes: {
            nexus_transaction_id: options.nexusTransactionId,
            merchant_id: options.merchantId,
          },
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', options.secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return { payload, rawBody, signature };
}
```

### 8.3 Test Suite Matrix

| Test Suite | File Path | Scope & Assertions |
|---|---|---|
| **Catalog API** | `test/routes/catalog.test.ts` | 1. Blank query browse mode (`match_score: 1.0`, in-stock only).<br>2. Gemini embedding query + pgvector `<=>` score filtering.<br>3. Score threshold 0.5 filtering & closest fallback.<br>4. Fallback to SQL `ILIKE` on missing API key.<br>5. Correct integer paise formatting and dynamic `agent_purchase_url`. |
| **Auth & Rate Limiting** | `test/routes/auth.test.ts` | 1. 401 on missing or invalid Bearer token.<br>2. 403 on token-merchant mismatch.<br>3. 404 on unknown merchant.<br>4. Sliding window 429 Too Many Requests with `Retry-After`. |
| **Transact API Proxy** | `test/routes/transact.test.ts` | 1. Normalizes and sanitizes buyer fingerprint before calling ADK.<br>2. Returns 200 SUCCESS with order, payment, and embedded `audit_trail`.<br>3. Returns 403 TRUST DENIED with score and risk factors.<br>4. Returns 409 STOCK ERROR when stock insufficient.<br>5. Returns 422 on unparseable intent.<br>6. Returns 504 on 10s AbortController timeout. |
| **Razorpay Webhooks** | `test/routes/webhook.test.ts` | 1. Rejects missing or invalid `X-Razorpay-Signature` with 400.<br>2. Protects against timing attacks via `crypto.timingSafeEqual`.<br>3. Prevents buffer length crash on short signatures.<br>4. Updates transaction status on `payment.captured` & `payment.failed`.<br>5. Idempotently ignores duplicate deliveries for terminal transactions.<br>6. Dispatches non-blocking HTTP signal to Port 8001. |
| **Audit API** | `test/routes/audit.test.ts` | 1. Returns 404 for unknown transaction ID.<br>2. Returns 200 with complete ordered audit log.<br>3. Validates cryptographic hash chain continuity (`verifyAuditChain`). |

---

## 9. Next Steps for Planning

With technical approaches, data contracts, and edge cases defined, the Phase 4 planner should break down implementation into atomic plans:
1. **Plan 04-01**: Gateway Shared Infrastructure (`src/lib/` auth, sliding window rate limiter, Gemini/ILIKE search service, URL builder, webhook verifier, and signed test fixtures).
2. **Plan 04-02**: Catalog Discovery & Audit Routes (`GET /api/maas/[merchant_id]/catalog`, `GET /api/audit/[transaction_id]`).
3. **Plan 04-03**: Transact Commerce Proxy & Webhook Ingestion (`POST /api/maas/[merchant_id]/transact` with ADK integration + `POST /api/webhooks/razorpay` with idempotent graph signaling).
4. **Plan 04-04**: End-to-End Route Validation & Comprehensive Vitest Suite.

---
*Research Completed for Phase 04: MaaS Gateway & Webhook API Layer*
