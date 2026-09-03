# Phase 5: Merchant Dashboard UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 05-Merchant Dashboard UI
**Areas discussed:** Onboarding & Merchant Session, Live Transaction Feed & Audit Drawer, Trust Graph Visualizer, Catalog Editor & Embedding Sync

---

## Onboarding & Merchant Session

| Option | Description | Selected |
|--------|-------------|----------|
| Cookie session + switcher | Cookie session (nexus_merchant_id) + merchant switcher in header to easily test multiple merchants in demo | ✓ |
| LocalStorage single merchant | Single active merchant stored in localStorage only with no switcher | |
| Full auth screen | Full auth login screen (email magic link / password) before reaching dashboard | |

**User's choice:** Cookie session (nexus_merchant_id) + merchant switcher in header to easily test multiple merchants in demo
**Notes:** Facilitates testing multiple merchant perspectives during hackathon demos.

| Option | Description | Selected |
|--------|-------------|----------|
| Live API verification | Live server-side validation call to Razorpay GET /v1/payments?count=1 with instant checkmark or clear API error message | ✓ |
| Regex format check | Client-side regex pattern check (rzp_test_*) only without hitting Razorpay API | |
| Defer validation | Defer validation until first transaction attempt | |

**User's choice:** Live server-side validation call to Razorpay GET /v1/payments?count=1 with instant checkmark or clear API error message
**Notes:** Immediate feedback on invalid Razorpay test keys before proceeding through wizard.

| Option | Description | Selected |
|--------|-------------|----------|
| Masked token + curl + test button | Masked token with copy button, curl code snippet with endpoint URLs, and a 'Run Test Transaction' simulation button | ✓ |
| Downloadable .env | Downloadable .env file containing MaaS token and endpoint URLs without inline test trigger | |
| Plain text table | Plain text credentials table with unmasked token and link to API docs | |

**User's choice:** Masked token with copy button, curl code snippet with endpoint URLs, and a 'Run Test Transaction' simulation button
**Notes:** Provides complete developer experience for immediate agent testing.

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Settings tab | Dedicated Settings tab to update Razorpay keys, regenerate MaaS tokens, and view webhook secrets | ✓ |
| Read-only panel | Read-only credentials panel; re-run onboarding wizard to onboard additional merchants | |
| You decide | Lightweight settings panel with token rotation and key update | |

**User's choice:** Dedicated Settings tab to update Razorpay keys, regenerate MaaS tokens, and view webhook secrets
**Notes:** Allows credentials rotation and secret management post-onboarding.

---

## Live Transaction Feed & Audit Drawer

| Option | Description | Selected |
|--------|-------------|----------|
| SWR polling | SWR polling every 3 seconds + manual 'Refresh Now' button (reliable, lightweight, zero socket infrastructure) | ✓ |
| SSE streaming | Server-Sent Events (SSE) streaming endpoint (/api/merchant/transactions/stream) | |
| WebSocket | WebSocket bidirectional connection | |

**User's choice:** SWR polling every 3 seconds + manual 'Refresh Now' button (reliable, lightweight, zero socket infrastructure)
**Notes:** Zero operational overhead, reliable across all environments.

| Option | Description | Selected |
|--------|-------------|----------|
| Color score pill + risk tags | Color-coded score pill (Green >=70 ALLOW, Amber 40-69 REVIEW, Red <40 DENY) with hoverable decomposed risk tags | ✓ |
| Numeric score only | Numeric score only (e.g. 85/100) with status text badge | |
| Decision badge only | Decision badge only (SUCCESS, DENIED, FAILED) without displaying score in table view | |

**User's choice:** Color-coded score pill (Green >=70 ALLOW, Amber 40-69 REVIEW, Red <40 DENY) with hoverable decomposed risk tags
**Notes:** Clear visual hierarchy indicating transaction risk level and reason.

| Option | Description | Selected |
|--------|-------------|----------|
| Step timeline + rationale | Chronological timeline of steps with latency pills, plain-English rationale, and collapsible raw step inputs/outputs | ✓ |
| Raw JSON code block | Code block JSON viewer showing entire sealed audit JSON with download button | |
| Card layout | Card layout with step status badges and plain-English summary, hiding technical inputs | |

**User's choice:** Chronological timeline of steps with latency pills, plain-English rationale, and collapsible raw step inputs/outputs
**Notes:** Provides 100% explainability for autonomous agent decisions.

| Option | Description | Selected |
|--------|-------------|----------|
| Hash badge + export | 'Hash Chain Verified' integrity badge with current/prev hash preview + 'Download Sealed Audit Trail (.json)' button | ✓ |
| Export button only | 'Download JSON' button only without displaying cryptographic hashes | |
| Full modal checksum | Full cryptographic audit verification modal with sha256 checksum calculator | |

**User's choice:** 'Hash Chain Verified' integrity badge with current/prev hash preview + 'Download Sealed Audit Trail (.json)' button
**Notes:** Visually highlights tamper-evident cryptographic hash chaining.

---

## Trust Graph Visualizer

| Option | Description | Selected |
|--------|-------------|----------|
| CoSE-Bilkent physics layout | CoSE-Bilkent (or CoSE) force-directed physics layout that clusters connected fraud rings into tight visual groupings | ✓ |
| Concentric circular layout | Concentric circular layout grouped by trust score tiers (Green outer, Red center) | |
| Grid layout | Grid layout with manual draggable node positions | |

**User's choice:** CoSE-Bilkent (or CoSE) force-directed physics layout that clusters connected fraud rings into tight visual groupings
**Notes:** Makes multi-merchant fraud rings immediately identifiable in dashboard demos.

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar selector + dimming | Toolbar ring selector dropdown + 'Highlight Rings' toggle that dims background and focuses camera on selected ring cluster | ✓ |
| Static red color | Static red coloring for ring nodes without dedicated isolation/dimming controls | |
| Tabbed views | Separate tabbed views for 'Full Graph' vs 'Fraud Rings' | |

**User's choice:** Toolbar ring selector dropdown + 'Highlight Rings' toggle that dims background and focuses camera on selected ring cluster
**Notes:** Allows presenters to focus specifically on detected fraud rings.

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-over inspector panel | Slide-over node inspector panel with entity type, score gauge, connected neighbors, and related transactions with audit links | ✓ |
| Floating canvas tooltip | Floating canvas tooltip displaying entity ID and current trust score on click | |
| Modal dialog | Modal dialog taking over screen to view entity details | |

**User's choice:** Slide-over node inspector panel with entity type, score gauge, connected neighbors, and related transactions with audit links
**Notes:** Deep entity inspection without leaving the graph view context.

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js API proxy | Next.js API proxy routes (/api/trust/*) proxying to FastAPI port 8001 (clean CORS isolation, server-side caching) | ✓ |
| Direct browser fetch | Direct browser fetches to http://localhost:8001/trust/* requiring CORS on Python service | |
| Static snapshot polling | Static snapshot polling written to PostgreSQL by Python background task | |

**User's choice:** Next.js API proxy routes (/api/trust/*) proxying to FastAPI port 8001 (clean CORS isolation, server-side caching)
**Notes:** Keeps client network architecture clean and avoids browser CORS issues.

---

## Catalog Editor & Embedding Sync

| Option | Description | Selected |
|--------|-------------|----------|
| Modal form + CSV dropzone | Modal form (Name, Description, ₹ price, Stock, Category, AI-purchasable switch) + CSV bulk upload dropzone | ✓ |
| Modal form only | Single-product modal form only without CSV upload | |
| Inline editable rows | Inline editable table rows with quick-save | |

**User's choice:** Modal form (Name, Description, ₹ price, Stock, Category, AI-purchasable switch) + CSV bulk upload dropzone
**Notes:** Supports both quick single edits and bulk catalog onboarding.

| Option | Description | Selected |
|--------|-------------|----------|
| Synchronous on save | Synchronous on save via Next.js backend calling generateProductEmbedding with progress indicator toast | ✓ |
| Background async worker | Background async worker with 'Embedding Syncing...' status badge on the product row | |
| Manual re-index button | Manual 'Regenerate Embeddings' button in catalog toolbar for batch re-indexing | |

**User's choice:** Synchronous on save via Next.js backend calling generateProductEmbedding with progress indicator toast
**Notes:** Ensures immediate semantic query availability in vector search.

| Option | Description | Selected |
|--------|-------------|----------|
| Instant toggle + stock stepper | Instant inline toggle for 'AI-Purchasable' and inline stock stepper with optimistic UI and immediate DB update | ✓ |
| Full modal required | Require opening full edit modal for any stock or visibility change | |
| Batch save button | Inline editable stock input with separate 'Save Changes' button in table toolbar | |

**User's choice:** Instant inline toggle for 'AI-Purchasable' and inline stock stepper with optimistic UI and immediate DB update
**Notes:** Frictionless catalog management.

| Option | Description | Selected |
|--------|-------------|----------|
| AI Agent View drawer | 'AI Agent View' preview drawer showing exact JSON catalog payload as seen by autonomous agents | ✓ |
| Row hover tooltip | Hover tooltip on each product row showing formatted AI agent prompt/summary | |
| No preview | No agent preview; table display is sufficient | |

**User's choice:** 'AI Agent View' preview drawer showing exact JSON catalog payload as seen by autonomous agents
**Notes:** Lets merchants verify machine-readable catalog representations.

---

## the agent's Discretion
- UI design using Tailwind CSS, Radix UI primitives, Lucide-react icons.
- Drawer animations and responsive layout breakpoints.

## Deferred Ideas
None.
