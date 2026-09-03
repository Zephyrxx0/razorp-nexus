# Plan 04-03: Razorpay Webhook Ingestion & Graph Signaling Summary

**Execution Date:** 2026-09-03  
**Phase:** 04 — MaaS Gateway & Webhook API Layer  
**Wave:** 3  
**Status:** Completed  
**Requirements Covered:** RZP-03, RZP-04  

---

## 1. Executive Summary

Plan 04-03 delivered the production-grade Razorpay webhook ingestion endpoint (`POST /api/webhooks/razorpay`) and background Trust Graph feedback signaling for Project Nexus.

Key capabilities delivered:
1. **Timing-Safe HMAC-SHA256 Signature Verification (`src/lib/webhook-verifier.ts`)**:
   - Implemented `timingSafeCompare(a, b)`: converts strings to UTF-8 Buffers and guards against buffer length mismatch crashes (`RangeError`) by executing an explicit byte length check (`bufA.length !== bufB.length ? false : crypto.timingSafeEqual(...)`) before calling `crypto.timingSafeEqual` (D-13, ASVS V3.2.1, Threat T-04-09).
   - Implemented `verifyRazorpaySignature(rawBody, signature, secret)`: computes the HMAC-SHA256 digest over exact raw request body text using `RAZORPAY_WEBHOOK_SECRET` and performs length-guarded timing-safe comparison.
2. **Signed Webhook Simulation Test Utilities (`test/helpers/webhook-generator.ts`)**:
   - Implemented `generateSignedWebhook(options)`: crafts valid signed Razorpay webhook payloads with standard entity structures, notes, and cryptographic HMAC-SHA256 signatures for deterministic testing without external dependencies (D-16).
   - Implemented `generateTamperedWebhook(options, tamperWith)`: produces tampered signature or modified body fixtures for negative security testing.
3. **Non-Blocking Trust Graph Signal Dispatcher (`src/lib/trust-client.ts`)**:
   - Implemented `dispatchTrustSignalNonBlocking(signal)`: dispatches transaction outcomes to Trust Graph service (`http://localhost:8001/trust/signal`) asynchronously in fire-and-forget mode with comprehensive `.catch()` error absorption (D-15, ASVS V13.1.1, Threat T-04-11).
   - Implemented `dispatchTrustSignalAsync(signal)`: provides an awaitable promise returning a boolean for integration tests.
4. **Razorpay Webhook Route Handler (`src/app/api/webhooks/razorpay/route.ts`)**:
   - Reads the raw body text once (`await req.text()`) and validates the `x-razorpay-signature` header, returning 400 Bad Request with `{ error: "INVALID_SIGNATURE" }` on missing, malformed, or mismatched signatures (Threat T-04-08).
   - Acknowledges webhooks missing `nexus_transaction_id` with 200 OK `{ received: true, status: "IGNORED_NO_TRANSACTION_ID" }`.
   - Acknowledges missing database transactions with 200 OK `{ received: true, status: "TRANSACTION_NOT_FOUND" }`.
   - Enforces terminal state idempotency: if transaction status is already `SUCCESS` or `FAILED`, returns 200 OK `{ received: true, status: "ALREADY_TERMINAL", current_status }` without executing duplicate database mutations or sending redundant graph signals (D-14, Threat T-04-10).
   - On `payment.captured`: atomically updates transaction status to `SUCCESS`, records `razorpay_payment_id`, and dispatches a non-blocking `outcome: 'SUCCESS'` signal to the Trust Graph (RZP-04).
   - On `payment.failed`: atomically updates transaction status to `FAILED`, records `failure_reason`, and dispatches a non-blocking `outcome: 'FAILED'` signal to the Trust Graph (RZP-04).
   - On informational events (`order.paid`, `payment.authorized`): logs event and acknowledges with 200 OK.

---

## 2. Key Accomplishments

### Task 1: Webhook Signature Verifier & Signed Fixture Generator (04-03-01)
- Implemented `src/lib/webhook-verifier.ts`:
  - `timingSafeCompare`: guards against `RangeError` on length mismatch and executes `crypto.timingSafeEqual` in constant time.
  - `verifyRazorpaySignature`: HMAC-SHA256 computation over raw body text.
- Implemented `test/helpers/webhook-generator.ts`:
  - `generateSignedWebhook`: builds standard Razorpay event structures with HMAC-SHA256 signature.
  - `generateTamperedWebhook`: produces tampered fixtures for negative tests.

### Task 2: Non-Blocking Trust Graph Signal Dispatcher (04-03-02)
- Implemented `src/lib/trust-client.ts`:
  - Defined `TrustSignalPayload` interface matching PRD §11.2 and Trust Graph service contracts.
  - Implemented `dispatchTrustSignalNonBlocking` with `.catch()` error absorption to isolate the webhook acknowledgment from port 8001 availability.
  - Implemented `dispatchTrustSignalAsync` for async verification in integration tests.

### Task 3: Razorpay Webhook Route Handler & Test Suite (04-03-01, 04-03-02)
- Implemented `src/app/api/webhooks/razorpay/route.ts`:
  - Signature validation, raw text handling, idempotency checks, transaction updates, and signal dispatching.
- Implemented `test/routes/webhook.test.ts`:
  - 21 comprehensive test cases covering missing/invalid/tampered signatures, buffer length crash prevention, terminal state idempotency, status transitions on captured/failed events, and network fault tolerance when the Trust Graph is unreachable.
- Git commit: `04138d4` - `feat(04-03): implement timing-safe Razorpay webhook ingestion and Trust Graph signaling`.

---

## 3. Verification Results

### Automated Test Runs
All 8 test suites execute and pass cleanly:
- `test/routes/webhook.test.ts`: 21 passed (100%)
- `test/routes/health.test.ts`: 1 passed (100%)
- `test/routes/auth.test.ts`: 11 passed (100%)
- `test/routes/catalog.test.ts`: 7 passed (100%)
- `test/routes/transact.test.ts`: 13 passed (100%)
- `test/routes/audit.test.ts`: 5 passed (100%)
- `test/lib/helpers.test.ts`: 4 passed (100%)
- `db/ts/test/crypto.test.ts`: 13 passed (100%)
- **Total:** 8 test files, 75 passed tests in 1.36s.

Python test suite (`trust-graph-service`):
- 38 passed in 1.03s.

---

## 4. Key Artifacts Created

| Path | Purpose |
|---|---|
| `src/lib/webhook-verifier.ts` | Timing-safe HMAC-SHA256 signature verifier with buffer length guard |
| `test/helpers/webhook-generator.ts` | Test utilities for signed and tampered Razorpay webhook event generation |
| `src/lib/trust-client.ts` | Non-blocking and async Trust Graph signal dispatchers |
| `src/app/api/webhooks/razorpay/route.ts` | Razorpay webhook route handler with state idempotency and graph signaling |
| `test/routes/webhook.test.ts` | Complete Vitest test suite for webhook ingestion and error resilience |

---

## 5. Git Commit Trail

- `04138d4` - `feat(04-03): implement timing-safe Razorpay webhook ingestion and Trust Graph signaling`
