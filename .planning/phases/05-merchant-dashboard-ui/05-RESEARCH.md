# Phase 05: Merchant Dashboard UI - Research

**Researched:** 2026-09-04
**Domain:** Next.js 14 App Router, shadcn/ui, Radix UI Primitives, Tailwind CSS, Cytoscape.js, SWR
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md & User Prompt)

**CRITICAL:** The following constraints and decisions are locked and non-negotiable.

### Locked Decisions
- **MANDATORY SHADCN:** Use official shadcn/ui components (Radix UI primitives wrapped in Tailwind) instead of writing custom bespoke component implementations.
- **D-01:** Cookie-based session (`nexus_merchant_id`) with header merchant switcher dropdown for testing multiple merchants in demo scenarios.
- **D-02:** Live server-side validation call to Razorpay `GET /v1/payments?count=1` during step 2 of onboarding wizard with instant checkmark or clear API error.
- **D-03:** Step 5 displays masked token with copy button, curl code snippet with endpoint URLs, and a "Run Test Transaction" simulation button.
- **D-04:** Dedicated Settings tab to update Razorpay keys, regenerate MaaS tokens, and inspect webhook secrets.
- **D-05:** SWR polling every 3 seconds + manual "Refresh Now" button (reliable, lightweight, zero socket infrastructure).
- **D-06:** Color-coded score pill (Green >=70 ALLOW, Amber 40-69 REVIEW, Red <40 DENY) with hoverable decomposed risk tags.
- **D-07:** Vertical chronological step timeline in slide-out drawer with latency pills, plain-English rationale cards, and collapsible raw step inputs/outputs.
- **D-08:** "Hash Chain Verified" integrity badge previewing current and previous SHA-256 hashes + "Download Sealed Audit Trail (.json)" button.
- **D-09:** Cytoscape.js with CoSE-Bilkent (or CoSE) force-directed physics layout clustering connected fraud rings into tight visual groupings.
- **D-10:** Toolbar ring selector dropdown + "Highlight Rings" toggle that dims background and focuses camera on selected ring cluster.
- **D-11:** Slide-over node inspector panel with entity type, score gauge, connected neighbors, and related transactions with audit links.
- **D-12:** Next.js API proxy routes (`/api/trust/*`) proxying to FastAPI port 8001 (clean CORS isolation, server-side caching).
- **D-13:** Modal form (Name, Description, ₹ price, Stock, Category, AI-purchasable switch) + CSV bulk upload dropzone.
- **D-14:** Synchronous Gemini vector embedding generation on product save via `generateProductEmbedding` (`text-embedding-004`) with progress indicator toast.
- **D-15:** Instant inline toggle for "AI-Purchasable" and inline stock stepper with optimistic UI and immediate DB update.
- **D-16:** "AI Agent View" preview drawer rendering exact JSON catalog payload as seen by autonomous agents via `GET /api/maas/{merchant_id}/catalog`.

### the agent's Discretion
- Styling with Tailwind CSS and Radix UI primitives; icons with Lucide-react.
- Exact drawer transition animation timings.
- Layout responsive breakpoints with desktop-first data table optimizations.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed strictly within Phase 5 scope.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Merchant Onboarding Wizard | Browser / Client | Next.js Server Route (`/api/merchant/onboard`) | Client manages multi-step state; server encrypts Razorpay keys with AES-256-GCM and seeds merchant |
| Key Verification | Next.js Server Route (`/api/merchant/verify-keys`) | Razorpay API | Server securely tests test key ID/secret against `https://api.razorpay.com/v1/payments?count=1` without leaking secret to browser |
| Catalog Management & CRUD | Browser / Client (`/dashboard/catalog`) | Next.js Server Route (`/api/merchant/products`) | Client renders table with optimistic updates; server persists to PostgreSQL and triggers Gemini embeddings |
| Real-time Transaction Feed | Browser / Client (`/dashboard/transactions`) | Next.js Server Route (`/api/merchant/transactions`) | SWR client polls `/api/merchant/transactions` every 3s; server queries PostgreSQL transactions table |
| Audit Timeline Drawer | Browser / Client (Sheet / Drawer) | Next.js Server Route (`/api/audit/[transaction_id]`) | Fetches sealed audit trail with sha256 hash verification payload and renders step timeline |
| Trust Graph Force-Directed Visualizer | Browser / Client (`/dashboard/trust-graph`) | Next.js Proxy Route (`/api/trust/*`) → FastAPI (8001) | Client renders Cytoscape.js HTML5 canvas; server proxies requests to FastAPI to avoid browser CORS |

</architectural_responsibility_map>

<research_summary>
## Summary

Phase 5 builds the presentation layer of Project Nexus. Next.js 14 App Router hosts both the React Server Component layout and client-side interactive views for the four primary dashboard surfaces: Onboarding Wizard, Catalog Editor, Transaction Feed with Audit Drawer, and the Trust Graph Force-Directed Visualizer.

Per user instruction, **shadcn/ui** is mandatory. We configure Tailwind CSS with `@tailwindcss/typography` and the zinc dark-theme palette specified in `05-UI-SPEC.md`. We install official shadcn component primitives backed by Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-switch`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-accordion`, `@radix-ui/react-scroll-area`) along with `lucide-react` for iconography and `sonner` for notification toasts.

For graph visualization, `cytoscape` (HTML5 canvas) is used in a Next.js dynamic client component (`ssr: false`), running the force-directed `cose-bilkent` or `cose` layout to naturally group connected fraud ring subgraphs. The frontend talks to the Trust Graph FastAPI service (port 8001) via Next.js Route Handlers (`/api/trust/graph`, `/api/trust/rings`, `/api/trust/node/*`), ensuring complete network decoupling and avoiding CORS complexities.

**Primary recommendation:** Initialize Tailwind CSS and shadcn/ui components first, build the merchant session cookie context with header switcher, then implement the 4 dashboard views with SWR polling and proxy API handlers.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `14.2.24` | React framework with App Router | [VERIFIED: package.json:16] Existing foundation for both SSR pages and API route handlers |
| `react` / `react-dom` | `18.3.1` | UI rendering | [VERIFIED: package.json:18-19] Stable React 18 base |
| `tailwindcss` | `^3.4.10` | Utility CSS framework | Industry standard for Next.js and shadcn/ui |
| `postcss` / `autoprefixer` | `^8.4.41` / `^10.4.20` | CSS build pipeline | Required for Tailwind compilation |
| `@radix-ui/react-*` | `^1.x` | Accessible headless UI primitives | Foundation for all shadcn components |
| `lucide-react` | `^0.441.0` | Iconography | Clean, lightweight icon suite recommended by shadcn |
| `cytoscape` | `^3.30.2` | Graph visualization canvas | High performance Canvas/WebGL network graph engine |
| `cytoscape-cose-bilkent` | `^4.1.0` | Force-directed CoSE layout | Physics-based clustering layout for fraud rings |
| `swr` | `^2.2.5` | Client data fetching & polling | Lightweight Stale-While-Revalidate polling for real-time transactions |
| `clsx` & `tailwind-merge` | `^2.1.1` & `^2.5.2` | Dynamic class merges | Used by shadcn `cn(...)` utility |
| `class-variance-authority` | `^0.7.0` | Component variant styling | shadcn standard for button and badge variants |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | `^1.5.0` | Toast notifications | Embedding sync progress and copy-to-clipboard alerts |
| `@testing-library/react` | `^16.0.0` | React component testing | Testing dashboard client components in Vitest |
| `jsdom` | `^24.1.0` | DOM simulation environment | Vitest environment for React DOM testing |

**Installation:**
```bash
npm install -D tailwindcss postcss autoprefixer @types/cytoscape jsdom @testing-library/react @testing-library/jest-dom
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-switch @radix-ui/react-scroll-area @radix-ui/react-accordion @radix-ui/react-slot @radix-ui/react-progress lucide-react clsx tailwind-merge class-variance-authority sonner swr cytoscape cytoscape-cose-bilkent
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Browser Client (Next.js 14 Client Components)
  │
  ├── 1. Merchant Session Context (cookie: nexus_merchant_id)
  │      └── Header Switcher Dropdown (selects active merchant)
  │
  ├── 2. Onboarding Wizard (/dashboard/onboard)
  │      └── Step 1: Merchant Details
  │      └── Step 2: Razorpay Credentials (calls POST /api/merchant/verify-keys)
  │      └── Step 3: Catalog Setup (Manual form or CSV dropzone)
  │      └── Step 4: Embedding Progress (calls generateProductEmbedding)
  │      └── Step 5: MaaS Endpoint & Bearer Token Reveal + "Trigger Sample Transaction"
  │
  ├── 3. Catalog Manager (/dashboard/catalog)
  │      └── GET /api/merchant/products (fetch items)
  │      └── Inline "AI-Purchasable" switch & Stock stepper (PATCH /api/merchant/products)
  │      └── "AI Agent View" preview drawer (renders machine-readable JSON)
  │
  ├── 4. Live Transactions Feed (/dashboard/transactions)
  │      └── SWR polling (every 3s) GET /api/merchant/transactions
  │      └── Status badges (SUCCESS, DENIED, FAILED) & Trust score pills (ALLOW, REVIEW, DENY)
  │      └── Click row → Open Slide-out Audit Timeline Sheet
  │          └── 6-step tool execution timeline, duration ms, plain-English rationale
  │          └── Hash Chain Verified badge + Download Sealed Audit Trail (.json)
  │
  └── 5. Trust Graph Visualizer (/dashboard/trust-graph)
         └── Cytoscape HTML5 canvas (ssr: false)
         └── Fetches GET /api/trust/graph & GET /api/trust/rings (proxied to FastAPI 8001)
         └── CoSE-Bilkent layout clustering multi-merchant fraud rings
         └── Toolbar ring selector & "Highlight Rings" camera focus toggle
         └── Click node → Slide-over Node Inspector Sheet
```

### Recommended Project Structure
```
src/
├── app/
│   ├── layout.tsx                     # Root HTML shell with Inter font and Toaster
│   ├── page.tsx                       # Landing page redirecting to /dashboard
│   ├── dashboard/
│   │   ├── layout.tsx                 # Dashboard app shell: Header, Nav tabs, Merchant Switcher
│   │   ├── page.tsx                   # Default dashboard redirect (to /dashboard/transactions)
│   │   ├── onboard/page.tsx           # Step-by-step Onboarding Wizard
│   │   ├── catalog/page.tsx           # Catalog Manager with Table, Modal, AI View Drawer
│   │   ├── transactions/page.tsx      # Live Transaction Feed & Audit Drawer Sheet
│   │   ├── trust-graph/page.tsx       # Cytoscape Force-Directed Graph Visualizer
│   │   └── settings/page.tsx          # Merchant credentials, tokens, webhook secrets
│   └── api/
│       ├── merchant/
│       │   ├── session/route.ts       # Get/set active merchant cookie
│       │   ├── list/route.ts          # List all merchants for header switcher
│       │   ├── verify-keys/route.ts   # Live Razorpay GET /v1/payments?count=1 validation
│       │   ├── onboard/route.ts       # Create merchant with encrypted keys & token
│       │   ├── products/route.ts      # Catalog CRUD & instant vector embedding sync
│       │   ├── transactions/route.ts  # Live transaction query with decomposed risk factors
│       │   └── test-transact/route.ts # Simulation trigger for sample AI purchase
│       └── trust/
│           ├── graph/route.ts         # Proxy to FastAPI GET /trust/graph
│           ├── rings/route.ts         # Proxy to FastAPI GET /trust/rings
│           └── node/[node_id]/route.ts# Proxy to FastAPI GET /trust/node/{node_id}
├── components/
│   ├── ui/                            # Official shadcn component implementations
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── table.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── badge.tsx
│   │   ├── switch.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── tabs.tsx
│   │   ├── scroll-area.tsx
│   │   ├── accordion.tsx
│   │   ├── alert.tsx
│   │   └── progress.tsx
│   ├── dashboard/
│   │   ├── header.tsx                 # Top bar with merchant switcher & active status
│   │   ├── nav-tabs.tsx               # Navigation tabs between dashboard pages
│   │   ├── audit-drawer.tsx           # Slide-out 6-step audit timeline drawer
│   │   ├── catalog-modal.tsx          # Add/edit product modal with ₹ to paise conversion
│   │   ├── ai-agent-view-drawer.tsx   # Machine-readable JSON catalog preview
│   │   ├── cytoscape-graph.tsx        # Client component rendering Cytoscape canvas
│   │   └── node-inspector-sheet.tsx   # Slide-over entity detail inspector
│   └── providers/
│       └── merchant-provider.tsx      # React context holding active merchant ID
└── lib/
    └── utils.ts                       # shadcn cn() utility function
```

### Pattern 1: Cytoscape Client Component with CoSE Layout
```typescript
// Dynamic import or 'use client' directive with useEffect container mount
'use client'
import React, { useEffect, useRef } from 'react'
import cytoscape, { Core } from 'cytoscape'
// @ts-ignore
import coseBilkent from 'cytoscape-cose-bilkent'

if (typeof window !== 'undefined') {
  try {
    cytoscape.use(coseBilkent)
  } catch (e) {
    // avoid re-registration in HMR
  }
}

export function CytoscapeGraph({ elements, onNodeClick, highlightedRingId }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#f4f4f5',
            'font-size': '12px',
            'width': '36px',
            'height': '36px'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#3f3f46',
            'curve-style': 'bezier'
          }
        }
      ],
      layout: {
        name: 'cose-bilkent',
        animate: false,
        nodeRepulsion: 4500,
        idealEdgeLength: 60
      }
    })

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.data())
    })

    cyRef.current = cy
    return () => { cy.destroy() }
  }, [elements])

  return <div ref={containerRef} className="w-full h-[600px] bg-zinc-950 rounded-lg border border-zinc-800" />
}
```

### Pattern 2: SWR Real-time Transaction Feed Polling
```typescript
'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function useTransactionsFeed(merchantId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    merchantId ? `/api/merchant/transactions?merchant_id=${merchantId}` : null,
    fetcher,
    {
      refreshInterval: 3000,
      revalidateOnFocus: true
    }
  )

  return {
    transactions: data?.transactions || [],
    isLoading,
    isError: error,
    refresh: () => mutate()
  }
}
```
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Headless Accessible Modals & Sheets | Custom `div` overlay with manual focus trapping and Esc listeners | shadcn `Dialog` and `Sheet` (`@radix-ui/react-dialog`) | Handles keyboard accessibility, aria-labels, backdrop click, body scroll locking, and screen readers |
| Graph Layout Physics | Custom force-directed canvas math | Cytoscape.js with `cose-bilkent` | Force-directed simulation involves multi-body Coulomb repulsion, spring hooke laws, and convergence damping |
| Data Polling & Caching | `setInterval` with `fetch` in `useEffect` | `swr` hook | Handles race conditions, tab focus revalidation, error retry, deduplication, and manual cache invalidation |
| Class Name Merging | Manual string template literals `className={`p-4 ${isActive ? 'bg-green' : ''}`}` | `cn(...)` (`clsx` + `tailwind-merge`) | Resolves Tailwind utility conflicts (e.g. `p-2` vs `p-4`) correctly |
| Dropdown Navigation & Switcher | Custom absolute positioning menu | shadcn `DropdownMenu` (`@radix-ui/react-dropdown-menu`) | Handles portal rendering, collision detection against viewport edges, and keyboard arrow navigation |

</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Cytoscape Server-Side Rendering Crash
**What goes wrong:** `window is not defined` or `HTMLCanvasElement is not defined` error during Next.js server compilation.
**Why it happens:** Cytoscape depends directly on the browser DOM and HTML5 `<canvas>`. Next.js tries to pre-render React components on the server.
**How to avoid:** Use dynamic import with `{ ssr: false }` (`const CytoscapeGraph = dynamic(() => import('@/components/dashboard/cytoscape-graph'), { ssr: false })`) or guard execution with `typeof window !== 'undefined'` in `useEffect`.
**Warning signs:** Build failure on `next build` pointing at `cytoscape` module.

### Pitfall 2: Direct Browser Calls to FastAPI Port 8001 (CORS)
**What goes wrong:** Browser blocks requests to `http://localhost:8001/trust/graph` with CORS error.
**Why it happens:** Cross-origin browser requests between `localhost:3000` and `localhost:8001`.
**How to avoid:** Always proxy via Next.js Route Handlers (`/api/trust/*`) on port 3000. Server-to-server HTTP fetch from Next.js to FastAPI has zero CORS restrictions.
**Warning signs:** Browser console displays `Cross-Origin Request Blocked`.

### Pitfall 3: Floating Point Currency Drift
**What goes wrong:** Products display ₹19.99 but are stored as ₹19.990000000000002 or Razorpay fails with decimal paise errors.
**Why it happens:** IEEE 754 arithmetic with floats.
**How to avoid:** Store strictly `amount_paise` (integer). In catalog forms, accept ₹ as string, multiply by 100 with `Math.round(parseFloat(val) * 100)` to get integer paise, and display with `(amount_paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })`.
**Warning signs:** Non-integer values in database `price_paise` column.

### Pitfall 4: SWR Infinite Render Loops
**What goes wrong:** Continuous re-rendering of table components freezing the browser.
**Why it happens:** Passing an inline unstable object reference as the SWR key or fetcher function without memoization.
**How to avoid:** Use plain string URL as SWR key (`/api/merchant/transactions?merchant_id=${id}`) and static module-level fetcher.
</common_pitfalls>

<code_examples>
## Code Examples

### Razorpay Test Mode Key Live Verification (Next.js Route Handler)
```typescript
// src/app/api/merchant/verify-keys/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { key_id, key_secret } = await req.json()
    if (!key_id || !key_secret) {
      return NextResponse.json({ valid: false, error: 'Key ID and Key Secret are required.' }, { status: 400 })
    }

    if (!key_id.startsWith('rzp_test_')) {
      return NextResponse.json({ valid: false, error: 'Key ID must start with rzp_test_ for test mode.' }, { status: 422 })
    }

    const authHeader = 'Basic ' + Buffer.from(`${key_id}:${key_secret}`).toString('base64')
    const rzpRes = await fetch('https://api.razorpay.com/v1/payments?count=1', {
      headers: { Authorization: authHeader }
    })

    if (!rzpRes.ok) {
      return NextResponse.json({ valid: false, error: 'Authentication failed with Razorpay API. Check your test credentials.' }, { status: 401 })
    }

    return NextResponse.json({ valid: true })
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 })
  }
}
```

### Trust Graph Next.js Proxy Route Handler
```typescript
// src/app/api/trust/graph/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const trustServiceUrl = process.env.TRUST_GRAPH_URL || 'http://127.0.0.1:8001'
    const res = await fetch(`${trustServiceUrl}/trust/graph`, {
      cache: 'no-store'
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Trust Graph service unavailable' }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```
</code_examples>

## Validation Architecture

### Test Infrastructure
- **Framework:** `vitest` (configured in `vitest.config.ts`)
- **Environment:** `jsdom` for React component rendering tests, `node` for API route handlers
- **Quick run command:** `npm run test`
- **Full suite command:** `npm run test`
- **Estimated runtime:** ~5 seconds

### Automated Verification Coverage:
1. **DASH-01 Onboarding & Key Verification:**
   - Unit test for `/api/merchant/verify-keys` validating correct Basic Auth header, rejection of non-test keys, and handling 200/401 Razorpay responses.
   - Test for `/api/merchant/onboard` verifying AES-256-GCM encryption of merchant secret keys and emission of Bearer token.
2. **DASH-02 Catalog Manager:**
   - Unit test for `/api/merchant/products` verifying product creation with integer paise, stock stepper updates, and AI-purchasable switch toggle.
   - Verification of synchronous `generateProductEmbedding` invocation and pgvector storage.
3. **DASH-03 Live Transactions & Audit Drawer:**
   - Unit test for `/api/merchant/transactions` verifying query by merchant ID and status/score serialization.
   - Test for `/api/audit/[transaction_id]` verifying hash chain integrity checks.
   - React component test for `AuditDrawer` rendering 6-step timeline and latency indicators.
4. **DASH-04 Cytoscape Trust Graph Visualizer:**
   - Unit test for `/api/trust/graph` and `/api/trust/rings` proxy handlers.
   - Test for node color mapping logic (Green ALLOW, Amber REVIEW, Red DENY/ring).

</sota_updates>

<sources>
## Sources

### Primary (HIGH confidence)
- [PRD.md §8.4, §13.1](PRD.md) — Merchant Dashboard architecture and onboarding workflow [VERIFIED]
- [ROADMAP.md §Phase 5](.planning/ROADMAP.md) — Phase 5 success criteria and requirement IDs [VERIFIED]
- [05-CONTEXT.md](.planning/phases/05-merchant-dashboard-ui/05-CONTEXT.md) — User locked decisions and constraints [VERIFIED]
- [05-UI-SPEC.md](.planning/phases/05-merchant-dashboard-ui/05-UI-SPEC.md) — Approved design contract [VERIFIED]
- [trust-graph-service/app/api/routes_trust.py](trust-graph-service/app/api/routes_trust.py) — Cytoscape graph, ring, and node endpoints [VERIFIED]

### Secondary (MEDIUM confidence)
- shadcn/ui documentation — React 18 / Next.js 14 Radix UI component patterns
- Cytoscape.js documentation — `cose-bilkent` layout setup and dynamic styling rules
</sources>

<metadata>
## Metadata

**Research scope:** Next.js 14 App Router dashboard, shadcn/ui, Tailwind CSS, Cytoscape.js, SWR polling, Razorpay test mode verification.
**Confidence breakdown:**
- Standard stack: HIGH
- Architecture patterns: HIGH
- Pitfalls & Don't Hand-Roll: HIGH
- Code examples: HIGH

**Research date:** 2026-09-04
**Valid until:** End of Project Nexus Phase 5
</metadata>

---

*Phase: 05-merchant-dashboard-ui*
*Research completed: 2026-09-04*
*Ready for planning: yes*
