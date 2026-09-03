# Plan 04-01: Scaffold, Auth & Semantic Catalog Search Summary

**Execution Date:** 2026-09-03  
**Phase:** 04 — MaaS Gateway & Webhook API Layer  
**Wave:** 1  
**Status:** Completed  
**Requirements Covered:** MAAS-01, MAAS-02, MAAS-04  

---

## 1. Executive Summary

Plan 04-01 established the Next.js 14 App Router API Gateway infrastructure, configured TypeScript path aliases (`@/*` and `@nexus/db`), set up the Vitest test harness, and delivered the core authentication, sliding-window rate limiting, and semantic catalog search components for Project Nexus.

The gateway features:
1. **Health Check Endpoint (`GET /api/health`)**: Provides service status and uptime metadata.
2. **In-Memory Sliding-Window Rate Limiter (`src/lib/rate-limiter.ts`)**: Implements timestamp sliding-window enforcement (60 rpm for catalog, 20 rpm for transact per D-07) with automatic memory eviction.
3. **Bearer Token Authentication (`src/lib/auth.ts`)**: Authenticates callers via opaque Bearer tokens (`nx_live_*` or `maas_live_*`), computes SHA-256 hashes via `@nexus/db` (`hashMaasToken`), executes single-indexed database lookups against `merchants.maas_token_hash`, and returns granular HTTP status codes (401, 403, 404 per D-05, D-06).
4. **Semantic Catalog Discovery (`GET /api/maas/[merchant_id]/catalog`)**: Generates 768-dimensional query embeddings using Gemini `models/text-embedding-004`, executes sub-5ms vector cosine distance queries (`<=>`) via PostgreSQL 16 + pgvector, enforces a 0.5 match threshold with top-3 closest fallback (D-02), provides graceful SQL ILIKE fallback if Gemini is unreachable (D-01), enables browse mode when queries are blank (D-03), formats prices strictly in integer paise with Indian Rupee formatting (D-04, §6.1), and dynamically generates `agent_purchase_url` pointing directly to the transact endpoint.

---

## 2. Key Accomplishments

### Task 1: Next.js 14 App Router Workspace, Dependencies, Vitest Config & Health Check (04-01-01)
- Updated root `package.json` with `next@14.2.24`, `react@18.3.1`, `@google/generative-ai@^0.21.0`, `pg@^8.12.0`, `vitest@^2.0.0`, and workspace configuration for `db/ts`.
- Configured `tsconfig.json` with `@/*` and `@nexus/db` path mappings.
- Created `vitest.config.ts` with node test environment and path resolution aliases.
- Created `src/app/api/health/route.ts` returning status 200 with service metadata `nexus-maas-gateway`.
- Validated via `test/routes/health.test.ts`.
- Git commit: `e32d861` - `feat(04-01): scaffold Next.js 14 App Router, Vitest config, and health route`.

### Task 2: Sliding-Window Rate Limiter & Bearer Token Authentication (04-01-02)
- Implemented `src/lib/rate-limiter.ts`:
  - `checkRateLimit(key, limit, windowMs)` maintaining timestamp arrays per key.
  - Returns `allowed`, `remaining`, `resetMs`, and computed `retryAfterSeconds`.
  - Background memory cleanup timer with `unref()` ensuring clean process teardown.
  - `resetRateLimits()` for test isolation.
- Implemented `src/lib/auth.ts`:
  - `authenticateMaaSRequest(req, expectedMerchantId)` checking Bearer header against `TOKEN_PATTERN`.
  - Validates minimum token length (>= 24) and prefixes (`nx_live_*` or `maas_live_*`).
  - Hashes token via SHA-256 (`hashMaasToken`) and queries `merchants` table.
  - Returns 401 for missing/malformed/unknown tokens.
  - Returns 404 if the requested merchant does not exist in the database.
  - Returns 403 if the token belongs to another merchant or if the merchant account is inactive.
  - Returns authenticated merchant object on success.
- Validated via `test/routes/auth.test.ts` (11 tests passing).
- Git commit: `9a0082c` - `feat(04-01): implement in-memory rate limiter and Bearer token authentication`.

### Task 3: Semantic Catalog Discovery with Gemini text-embedding-004 & pgvector (04-01-03)
- Implemented `src/lib/embeddings.ts`:
  - `generateEmbedding(text)` calling Gemini `models/text-embedding-004` to generate 768-dimensional vectors.
  - Gracefully detects missing API keys or network errors, logging warnings and returning `null` to signal fallback.
- Implemented `src/lib/url-helpers.ts`:
  - `formatPaiseToInr(amountPaise)`: Converts integer paise to Indian Rupee display string (`2999000` -> `₹29,990`).
  - `buildAgentPurchaseUrl(req, merchantId)`: Dynamically resolves `agent_purchase_url` from headers or environment.
- Implemented `src/app/api/maas/[merchant_id]/catalog/route.ts`:
  - Enforces 60 rpm rate limit per merchant.
  - Authenticates caller with `authenticateMaaSRequest`.
  - Parses and clamps query parameters (`q`, `category`, `max_price_paise`, `in_stock`, `limit` 1..50).
  - Primary path: Gemini embedding + pgvector cosine distance (`<=>`) with 0.5 threshold filtering, falling back to top-3 closest items if all items score < 0.5.
  - Fallback / Browse path: SQL ILIKE search with `match_score: 0.75` when embedding is unavailable, or browse mode with `match_score: 1.0` ordered by `created_at DESC` when `q` is absent.
  - Returns structured JSON response matching PRD §11.1 specification.
- Validated via `test/routes/catalog.test.ts` (7 tests passing) and `test/lib/helpers.test.ts` (4 tests passing).
- Git commit: `7c5ff70` - `feat(04-01): implement semantic catalog search with Gemini embeddings and pgvector`.

---

## 3. Verification Results

### Automated Test Runs
`npm test` executes all route and library test suites:
- `test/routes/health.test.ts`: 1 passed (100%)
- `test/routes/auth.test.ts`: 11 passed (100%)
- `test/routes/catalog.test.ts`: 7 passed (100%)
- `test/lib/helpers.test.ts`: 4 passed (100%)
- `db/ts/test/crypto.test.ts`: 13 passed (100%)
- **Total:** 5 test files, 36 passed tests in 1.04s.

---

## 4. Key Artifacts Created

| Path | Purpose |
|---|---|
| `package.json` | Next.js 14, React 18, Google Generative AI, pg, and Vitest dependencies |
| `tsconfig.json` | TypeScript configuration with `@/*` and `@nexus/db` path aliases |
| `vitest.config.ts` | Vitest runner configuration with alias resolution |
| `src/app/api/health/route.ts` | Gateway health check route handler |
| `src/lib/rate-limiter.ts` | In-memory sliding-window rate limiter |
| `src/lib/auth.ts` | MaaS Bearer token authentication helper |
| `src/lib/embeddings.ts` | Gemini `text-embedding-004` embedding generator |
| `src/lib/url-helpers.ts` | Dynamic purchase URL generator & paise formatter |
| `src/app/api/maas/[merchant_id]/catalog/route.ts` | Semantic catalog search & browse route handler |
| `test/routes/health.test.ts` | Health check route test suite |
| `test/routes/auth.test.ts` | Rate limiter & Bearer auth test suite |
| `test/routes/catalog.test.ts` | Catalog discovery route test suite |
| `test/lib/helpers.test.ts` | Unit tests for URL and embedding helpers |

---

## 5. Git Commit Trail

- `e32d861` - `feat(04-01): scaffold Next.js 14 App Router, Vitest config, and health route`
- `9a0082c` - `feat(04-01): implement in-memory rate limiter and Bearer token authentication`
- `7c5ff70` - `feat(04-01): implement semantic catalog search with Gemini embeddings and pgvector`
