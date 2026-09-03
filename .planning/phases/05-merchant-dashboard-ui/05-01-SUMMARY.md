# Plan 05-01: Dashboard Scaffolding, shadcn/ui Setup, Merchant Session & Onboarding Wizard Summary

**Execution Date:** 2026-09-04  
**Phase:** 05 — Merchant Dashboard UI  
**Wave:** 1  
**Status:** Completed  
**Requirements Covered:** DASH-01  

---

## 1. Executive Summary

Plan 05-01 established the Next.js 14 frontend design foundation using Tailwind CSS and official shadcn/ui component primitives backed by Radix UI. It delivered merchant session cookie persistence (`nexus_merchant_id`) with a header switcher dropdown for instant multi-merchant evaluation during demo flows, and built the self-service multi-step Merchant Onboarding Wizard (`/dashboard/onboard`) with live server-side Razorpay test key validation (`GET /v1/payments?count=1`), AES-256-GCM secret key encryption in PostgreSQL, and MaaS Bearer token issuance.

---

## 2. Key Accomplishments

### Task 1: Frontend Build Pipeline & shadcn/ui Component Setup (05-01-01)
- Configured Tailwind CSS (`tailwind.config.ts`, `postcss.config.mjs`) matching the `05-UI-SPEC.md` design contract (dark zinc palette `#09090b` dominant, `#18181b` card, `#10b981` emerald accent, `#ef4444` destructive, `#f59e0b` warning, 8-pt spacing scale).
- Created `src/lib/utils.ts` providing the standard `cn(...)` utility (`clsx` + `tailwind-merge`).
- Created `src/app/globals.css` with CSS variables and Tailwind directives.
- Implemented official shadcn/ui component primitives in `src/components/ui/`:
  - `button.tsx` (cva variants: default, destructive, outline, secondary, ghost, link).
  - `card.tsx` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter).
  - `input.tsx` (dark zinc border, emerald focus ring).
  - `alert.tsx` (Alert, AlertTitle, AlertDescription with default, destructive, success variants).
  - `badge.tsx` (default, secondary, outline, allow, review, deny variants).
  - `progress.tsx` (Radix UI Progress indicator).
  - `dropdown-menu.tsx` (Radix UI DropdownMenu primitives).
  - `tabs.tsx` (Radix UI Tabs primitives).
- Configured Vitest with jsdom environment matching for `.tsx` files in `vitest.config.ts`.
- Validated via `test/ui-components.test.tsx` (6 tests passing).

### Task 2: Merchant Session Context, Header & Switcher Dropdown (05-01-02)
- Implemented `src/app/api/merchant/session/route.ts`:
  - `GET`: Reads `nexus_merchant_id` cookie, queries active merchant, or defaults to the first merchant in database. Sets 30-day cookie.
  - `POST`: Validates merchant UUID exists and switches active session cookie.
- Implemented `src/app/api/merchant/list/route.ts`:
  - `GET`: Returns list of all registered merchants ordered by `created_at DESC` for dropdown switching.
- Implemented `src/components/providers/merchant-provider.tsx`:
  - React Context managing `activeMerchant`, `merchantsList`, `setActiveMerchantId()`, and `refreshMerchants()`.
- Implemented `src/components/dashboard/header.tsx`:
  - Top bar featuring Nexus brand logo, "MaaS Gateway" subtitle, "Razorpay Test Mode" status badge, navigation tabs, and the Merchant Switcher dropdown with active store checkmark and "+ Onboard New Store" link.
- Implemented `src/app/dashboard/layout.tsx` and redirect in `src/app/dashboard/page.tsx`.

### Task 3: Razorpay Test Key Verification & Onboarding Wizard (05-01-03)
- Implemented `src/app/api/merchant/verify-keys/route.ts`:
  - Enforces `rzp_test_` prefix (rejects non-test keys with 422).
  - Authenticates with Razorpay API via Basic Auth `GET https://api.razorpay.com/v1/payments?count=1`.
  - Returns `{ valid: true }` on 200 or detailed error on 401.
- Implemented `src/app/api/merchant/onboard/route.ts`:
  - Validates store details and test credentials.
  - Encrypts Razorpay secret at rest using AES-256-GCM (`encryptSecret`).
  - Generates MaaS Bearer token (`generateMaasToken` returning `maas_live_*`).
  - Inserts merchant into PostgreSQL and generates initial product embeddings via Gemini `text-embedding-004`.
  - Sets `nexus_merchant_id` session cookie.
- Implemented `src/app/dashboard/onboard/page.tsx`:
  - Multi-step wizard: Store Profile → Razorpay Keys (with live validation) → Initial Product → Synchronous Vector Generation Progress → Endpoint Delivery Card with masked token, copy button, curl command snippet, and sample transaction trigger.
- Validated via `test/merchant-onboard.test.ts` (7 tests passing).

---

## 3. Verification Results

- `test/ui-components.test.tsx`: 6 passed
- `test/merchant-onboard.test.ts`: 7 passed
- Complete test suite: 10 test files, 88 tests passed, 0 failures.
