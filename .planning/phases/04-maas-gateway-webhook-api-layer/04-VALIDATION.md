---
phase: 4
slug: maas-gateway-webhook-api-layer
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- test/routes/auth.test.ts test/routes/webhook.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- test/routes/auth.test.ts test/routes/webhook.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 6 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | — | T-04-01 | Next.js 14 App Router, package.json dependencies, Vitest configuration, and DB client wiring | unit | `npm test -- test/routes/health.test.ts` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | MAAS-04 | T-04-02 | Opaque Bearer token (nx_live_*) SHA-256 validation, 401/403/404 handling, in-memory rate limiting (429) | unit | `npm test -- test/routes/auth.test.ts` | ✅ | ✅ green |
| 04-01-03 | 01 | 1 | MAAS-01, MAAS-02 | T-04-03 | GET /api/maas/{id}/catalog with Gemini text-embedding-004 pgvector <=> cosine matching, ILIKE fallback, 0.5 threshold, and dynamic agent_purchase_url | unit | `npm test -- test/routes/catalog.test.ts` | ✅ | ✅ green |
| 04-02-01 | 02 | 2 | MAAS-03, MAAS-05 | T-04-04 | POST /api/maas/{id}/transact buyer sanitization via @nexus/db, proxy to ADK runner port 8000, 10s timeout, and status mapping (200, 403, 409, 422, 500, 504) | integration | `npm test -- test/routes/transact.test.ts` | ✅ | ✅ green |
| 04-02-02 | 02 | 2 | AUDIT-03 | T-04-05 | 100% transactions return sealed audit_trail in transact payload; GET /api/audit/{id} validates hash chain continuity | unit | `npm test -- test/routes/audit.test.ts` | ✅ | ✅ green |
| 04-03-01 | 03 | 3 | RZP-03 | T-04-06 | POST /api/webhooks/razorpay verifies X-Razorpay-Signature with timing-safe crypto.timingSafeEqual on raw request text | unit | `npm test -- test/routes/webhook.test.ts` | ✅ | ✅ green |
| 04-03-02 | 03 | 3 | RZP-04 | T-04-07 | Webhook processes payment.captured and payment.failed, enforces terminal status idempotency, and dispatches async non-blocking signal to Trust Graph port 8001 | integration | `npm test -- test/routes/webhook.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — test runner configuration for Next.js route handlers
- [x] `test/helpers/webhook-generator.ts` — HMAC-SHA256 signed test fixture generator
- [x] `test/helpers/mock-adk.ts` — mock HTTP server / interceptor for ADK port 8000
- [x] Test stub files: `test/routes/auth.test.ts`, `test/routes/catalog.test.ts`, `test/routes/transact.test.ts`, `test/routes/webhook.test.ts`, `test/routes/audit.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real live Razorpay dashboard webhook delivery | RZP-03, RZP-04 | Requires live public internet webhook URL or ngrok tunnel | Trigger test payment in Razorpay dashboard and inspect Next.js server console logs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-03

---

## Validation Audit 2026-09-03
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
