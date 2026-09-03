---
phase: 5
slug: merchant-dashboard-ui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DASH-01 | T-05-01 | Tailwind & shadcn UI component library setup | unit | `npx vitest run test/ui-components.test.tsx` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | DASH-01 | T-05-02 | Key verification route validates rzp_test_* against Razorpay API | integration | `npx vitest run test/merchant-onboard.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | DASH-01 | T-05-03 | Onboarding wizard creates merchant with AES-encrypted keys | integration | `npx vitest run test/merchant-onboard.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | DASH-02 | T-05-04 | Catalog API supports integer paise, stock stepper, and AI toggle | unit | `npx vitest run test/merchant-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | DASH-02 | T-05-05 | Product save synchronizes Gemini vector embeddings into pgvector | integration | `npx vitest run test/merchant-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 2 | DASH-03 | T-05-06 | SWR transactions query delivers status badges and trust score pills | integration | `npx vitest run test/merchant-transactions.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-04 | 02 | 2 | DASH-03 | T-05-07 | Slide-out audit drawer renders 6-step timeline and hash shield | component | `npx vitest run test/audit-drawer.test.tsx` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | DASH-04 | T-05-08 | Trust graph Next.js API route proxies to FastAPI port 8001 | integration | `npx vitest run test/trust-proxy.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 3 | DASH-04 | T-05-09 | Cytoscape visualizer component mounts with CoSE layout and ring filter | component | `npx vitest run test/trust-graph.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/ui-components.test.tsx` — stubs for shadcn UI components rendering
- [ ] `test/merchant-onboard.test.ts` — stubs for DASH-01 key verification and onboarding
- [ ] `test/merchant-catalog.test.ts` — stubs for DASH-02 catalog CRUD and embedding sync
- [ ] `test/merchant-transactions.test.ts` — stubs for DASH-03 transaction feed and SWR query
- [ ] `test/audit-drawer.test.tsx` — stubs for DASH-03 audit timeline drawer component
- [ ] `test/trust-proxy.test.ts` — stubs for DASH-04 Trust Graph proxy routes

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cytoscape force-directed physics animation | DASH-04 | Visual canvas force simulation | Open `/dashboard/trust-graph` in browser, verify ring clusters group and camera focuses |
| CSV catalog drag-and-drop file upload | DASH-02 | File drop interaction | Drag sample CSV file onto dropzone in `/dashboard/catalog` and verify rows parse |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-04
