# Phase 5: Merchant Dashboard UI - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Construct the Next.js 14 App Router merchant dashboard with self-service onboarding wizard, catalog management interface, real-time transaction feed with expandable audit timeline drawer, and interactive Cytoscape.js force-directed graph visualizer.

</domain>

<decisions>
## Implementation Decisions

### Onboarding & Merchant Session
- **D-01:** Cookie-based session (`nexus_merchant_id`) with header merchant switcher dropdown for testing multiple merchants in demo scenarios. — **Reversibility:** costly — touches API route auth headers and client state.
- **D-02:** Live server-side validation call to Razorpay `GET /v1/payments?count=1` during step 2 of wizard with instant checkmark or clear API error.
- **D-03:** Step 5 displays masked token with copy button, curl code snippet with endpoint URLs, and a "Run Test Transaction" simulation button.
- **D-04:** Dedicated Settings tab to update Razorpay keys, regenerate MaaS tokens, and inspect webhook secrets.

### Live Transaction Feed & Audit Drawer
- **D-05:** SWR polling every 3 seconds + manual "Refresh Now" button (reliable, lightweight, zero socket infrastructure).
- **D-06:** Color-coded score pill (Green >=70 ALLOW, Amber 40-69 REVIEW, Red <40 DENY) with hoverable decomposed risk tags.
- **D-07:** Vertical chronological step timeline in slide-out drawer with latency pills, plain-English rationale cards, and collapsible raw step inputs/outputs.
- **D-08:** "Hash Chain Verified" integrity badge previewing current and previous SHA-256 hashes + "Download Sealed Audit Trail (.json)" button.

### Trust Graph Visualizer
- **D-09:** Cytoscape.js with CoSE-Bilkent (or CoSE) force-directed physics layout clustering connected fraud rings into tight visual groupings.
- **D-10:** Toolbar ring selector dropdown + "Highlight Rings" toggle that dims background and focuses camera on selected ring cluster.
- **D-11:** Slide-over node inspector panel with entity type, score gauge, connected neighbors, and related transactions with audit links.
- **D-12:** Next.js API proxy routes (`/api/trust/*`) proxying to FastAPI port 8001 (clean CORS isolation, server-side caching).

### Catalog Editor & Embedding Sync
- **D-13:** Modal form (Name, Description, ₹ price, Stock, Category, AI-purchasable switch) + CSV bulk upload dropzone.
- **D-14:** Synchronous Gemini vector embedding generation on product save via `generateProductEmbedding` (`text-embedding-004`) with progress indicator toast.
- **D-15:** Instant inline toggle for "AI-Purchasable" and inline stock stepper with optimistic UI and immediate DB update.
- **D-16:** "AI Agent View" preview drawer rendering exact JSON catalog payload as seen by autonomous agents via `GET /api/maas/{merchant_id}/catalog`.

### the agent's Discretion
- Styling with Tailwind CSS and Radix UI primitives; icons with Lucide-react.
- Exact drawer transition animation timings.
- Layout responsive breakpoints with desktop-first data table optimizations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Requirements & Architecture
- `PRD.md` §8.4 — Merchant Dashboard page definitions and requirements
- `PRD.md` §13.1 — Step-by-step Merchant Onboarding flow
- `.planning/ROADMAP.md` §Phase 5 — Phase 5 goals, dependencies, and success criteria
- `.planning/REQUIREMENTS.md` §Merchant Dashboard — DASH-01, DASH-02, DASH-03, DASH-04

### Microservice & API Contracts
- `trust-graph-service/app/api/routes_trust.py` — Cytoscape graph, rings, and node endpoints (`/trust/graph`, `/trust/rings`, `/trust/node/{node_id}`)
- `src/app/api/maas/[merchant_id]/catalog/route.ts` — MaaS catalog endpoint and schema
- `src/app/api/audit/[transaction_id]/route.ts` — Historical transaction audit trail endpoint with hash verification

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/embeddings.ts`: `generateProductEmbedding` for generating Gemini `text-embedding-004` vectors.
- `src/lib/auth.ts`: `generateMaaSToken`, `hashToken` for Bearer token lifecycle.
- `@nexus/db` (`db/ts`): Database connection pool and schema definitions for merchants, products, transactions, audit_logs.

### Established Patterns
- All monetary amounts stored as integer paise (`amount_paise`) and converted to formatted ₹ in UI components.
- Server-side routes isolate database credentials and secrets; client components access backend via Next.js Route Handlers.
- Defense-in-depth and cryptographic validation standard across services.

### Integration Points
- `/dashboard/onboard`: Step-by-step onboarding wizard.
- `/dashboard/catalog`: Catalog manager with inline edit, AI toggle, and CSV dropzone.
- `/dashboard/transactions`: Live polling transaction feed and slide-out audit drawer.
- `/dashboard/trust-graph`: Cytoscape.js force-directed visualizer with ring filtering.
- `/api/trust/*`: Route handlers proxying to FastAPI microservice on port 8001.
- `/api/merchant/*`: Route handlers for merchant session, settings, catalog mutations, and test simulation.

</code_context>

<specifics>
## Specific Ideas
- Header merchant switcher dropdown enables smooth switching between multiple merchants during demo presentations.
- One-click "Run Test Transaction" simulation button from onboarding completion instantly triggers sample agent transaction to verify the pipeline.
- Slide-out audit drawer shows cryptographic hash-chain integrity badge with current/previous SHA-256 hash previews.

</specifics>

<deferred>
## Deferred Ideas
None — discussion stayed strictly within Phase 5 scope.

</deferred>

---

*Phase: 05-Merchant-Dashboard-UI*
*Context gathered: 2026-09-03*
