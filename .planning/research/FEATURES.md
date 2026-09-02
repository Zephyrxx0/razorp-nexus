# Feature Research

**Domain:** Agentic Commerce & AI Risk Management (Razorpay Ecosystem)
**Researched:** 2026-09-03
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users and developers assume exist. Missing these = product feels broken or unusable in a payment ecosystem.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **MaaS Semantic Catalog API** (`GET /api/maas/{merchant_id}/catalog`) | AI buyers cannot reliably parse arbitrary HTML. They need structured JSON with semantic search to discover products from natural language prompts. | MEDIUM | Uses Gemini `text-embedding-004` (768-dim) vectors cached in PostgreSQL with pgvector. Returns product ID, price in paise, available stock, and direct purchase URL. |
| **MaaS Transact API** (`POST /api/maas/{merchant_id}/transact`) | Autonomous agents require a single machine-to-machine endpoint to execute orders with natural language intent and buyer signals. | MEDIUM | Authenticated via merchant MaaS bearer token; accepts natural language intent string and buyer fingerprint (email, IP, device, UPI handle, UA). |
| **Razorpay Test-Mode Integration** | Real payment gateway interaction is required to validate end-to-end commerce mechanics in the Buildathon. | MEDIUM | Leverages official Razorpay SDK (`rzp_test_...` credentials); creates Orders with attached Nexus metadata notes and captures payments upon authorization. |
| **HMAC-SHA256 Webhook Verification** | Standard security practice for payment callbacks; prevents spoofed payment capture notifications. | LOW | Cryptographic timing-safe comparison (`crypto.timingSafeEqual`) on `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` on `/api/webhooks/razorpay`. |
| **Merchant Onboarding Wizard** | Merchants need a friction-free setup (<5 minutes) without writing code to expose their stores to AI buyers. | MEDIUM | 3-step Next.js wizard validating Razorpay test credentials via API check, creating MaaS tokens, and importing initial catalogs. |
| **Catalog Management & Inventory Gating** | Merchants must maintain active items and prevent overselling when autonomous agents burst order volume. | LOW | Next.js catalog editor + CSV bulk upload; atomic stock checks before order creation; returns structured `INSUFFICIENT_STOCK` (409) if unavailable. |
| **Merchant Dashboard & Live Transaction Feed** | Merchants need real-time operational visibility into AI-driven transactions, approval rates, and revenue. | MEDIUM | Next.js 14 App Router UI with auto-revalidating feed (SWR/SSE) displaying status badges (`SUCCESS`, `DENIED`, `REVIEW`, `FAILED`), trust scores, and amount in ₹. |
| **Credential Encryption at Rest** | Merchants must not expose their Razorpay Key Secrets in plaintext in application storage. | LOW | Server-side AES-256-GCM encryption for `razorpay_key_secret` with key loaded from `ENCRYPTION_KEY` env var; decrypted only at transaction execution. |

### Differentiators (Competitive Advantage)

Features that set Nexus apart from standard gateways and isolated fraud detectors. Directly addresses Razorpay AI Buildathon criteria for Track 01 and Track 02.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Google ADK 6-Step Orchestrator Agent** | Solves Track 01 bar: "every money action explainable, bounded and gated." Enforces a rigid, deterministic tool chain using Gemini 2.0 Flash. | HIGH | Tool order: `parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`. Execution sub-2s. Programmatic hard gate stops execution if trust score < 40. |
| **Cross-Merchant NetworkX Trust Graph** | Solves the core information asymmetry problem. Individual merchants cannot see coordinated fraud across peers; Nexus unifies cross-merchant signals. | HIGH | Python FastAPI microservice maintaining in-memory undirected weighted graph. Connects signals (SHA-256 email, /24 IP subnet, device hash, UPI handle) across merchants. Sub-500ms scoring. |
| **Multi-Merchant Fraud Ring Detection** | Solves Track 02 brief: "working detector for one class of loss." Automatically detects syndicated fraud networks attacking multiple merchants. | HIGH | Evaluates graph topology using connected components and clustering heuristics (≥3 nodes, ≥2 merchants, high density, ≥1 prior failure). Automatically drops member scores to 0. |
| **Interactive Cytoscape.js Graph Visualizer** | Provides an immediate visual "aha moment" during the demo; transforms invisible network risk into an interpretable visual map. | MEDIUM | Renders force-directed graph in merchant dashboard; color-codes nodes (green ≥70, yellow 40-69, red <40), highlights ring clusters with pulsing animations, and displays entity metrics on click. |
| **100% Immutable Append-Only Audit Trail** | Delivers complete auditability for autonomous AI transactions. Every tool invocation logs duration, inputs, outputs, and plain-English rationale. | MEDIUM | Append-only PostgreSQL table with database trigger prohibiting UPDATE/DELETE. Step-by-step interactive timeline drawer in UI; downloadable as JSON. |
| **Simulated Attack Benchmark with Honest Metrics** | Proves real-world detector efficacy for Track 02 with quantified trade-offs: Precision, Recall, F1, and explicit ₹ False-Positive Cost. | MEDIUM | Python test runner (`run_eval.py`) evaluating 500 synthetic transactions (300 legit, 200 fraud across 5 rings). Quantifies the exact ₹ sales lost due to blocked legitimate buyers. |
| **Autonomous Demo Buyer Agent** | Live proof of end-to-end zero-human-touch commerce. An autonomous Google ADK agent shops, searches catalogs, evaluates options, and buys. | MEDIUM | Built on Google ADK (`adk run agents/demo_buyer.py`); navigates MaaS catalog API, selects cheapest item matching goal, and executes transaction without UI interaction. |
| **Defense-in-Depth Trust Interceptor** | Guarantees financial safety against LLM hallucinations, prompt injections, or tool bypass attempts. | LOW | Hardcoded programmatic check inside `create_razorpay_order` raising `TrustViolationError` if `trust_score < 40`, ensuring no payment order is ever generated for flagged buyers regardless of LLM output. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem attractive on the surface but create fatal security, regulatory, operational, or scope issues.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Offensive Fraud Actions (Counter-Probing, Doxxing, Active Retaliation)** | Desire to "punish" fraudsters or hack back against identified attack sources. | Disqualifies submission under Razorpay Buildathon rules ("Strictly defense-only: anything offense-capable is disqualified"). Creates severe legal and compliance liabilities. | Strictly defense-only: deny the transaction with HTTP 403, record the fingerprint signal into the trust graph, and strengthen internal risk weights. |
| **Production Multi-Region Graph Database (Neo4j / Amazon Neptune)** | Enterprise-grade graph persistence and distributed query handling. | Adds massive operational overhead, Docker footprint, high setup latency, and brittle external infrastructure dependencies during a short hackathon build. | In-memory NetworkX graph in Python FastAPI microservice, reconstructed deterministically from PostgreSQL transactions on startup. Fast, reliable, zero-config. |
| **Live Production Payment Rails & Real Money Transfers** | Desire to show "real rupees moving" with live bank accounts. | Massive compliance risk, KYC barriers, risk of financial loss during demo testing, and explicitly outside hackathon scope. | Razorpay test-mode credentials (`rzp_test_...`) with automated capture simulation and realistic test receipts. |
| **Cryptocurrency / Blockchain / Web3 Agent Wallets** | Popular trend in crypto agentic frameworks (e.g., ERC-4337, Solana agent wallets). | Distracts from Razorpay's core INR ecosystem; introduces severe gas fee latency, regulatory uncertainty under RBI guidelines, and high friction for mainstream Indian merchants. | Standard INR paise-based fiat rails aligning with NPCI Unified Agentic Payments (UAP) and domestic agent protocols. |
| **Open-Ended Unconstrained Autonomous LLM Decisions for Money Movement** | Desire to showcase "maximum AI agency" by letting the model decide pricing, refunds, and bank calls freely. | Unacceptable risk of prompt injection, non-deterministic hallucinated amounts, and uncontrolled financial loss. Money actions must be bounded. | Strict, deterministic 6-step tool chain where tool inputs and business boundaries are programmatically validated before execution. |
| **Plaintext Cross-Merchant PII Sharing** | Easier graph debugging and richer entity profiles across merchants. | Violates India's Digital Personal Data Protection Act (DPDPA) and merchant privacy. Sharing unhashed emails and IP addresses across merchants creates catastrophic liability. | One-way SHA-256 hashing for emails/devices, truncation of IP addresses to `/24` subnets, and zero plain PII storage in the graph engine. |
| **Fail-Closed Strategy on Trust Service Outage** | Instinct to block all transactions if the risk scoring service crashes. | Single point of failure turns any temporary microservice restart into complete commerce downtime for all merchants. | Default to score 50 (`REVIEW`), proceed with order creation, attach logged warning to the audit trail, and flag for asynchronous review. |

---

## Feature Dependencies

```
[Merchant Onboarding & Credentials]
    └──requires──> [Credential Encryption at Rest]
    └──requires──> [Razorpay Test-Mode Integration]

[MaaS Semantic Catalog API]
    └──requires──> [Merchant Onboarding & Credentials]
    └──requires──> [Catalog Management & Inventory Gating]
    └──requires──> [Gemini Embeddings (text-embedding-004)]

[Trust Graph Engine (NetworkX)]
    └──requires──> [Buyer Fingerprint Anonymization]

[Fraud Ring Detection Algorithm]
    └──requires──> [Trust Graph Engine (NetworkX)]
    └──requires──> [Cross-Merchant Signal Ingestion]

[Google ADK 6-Step Orchestrator]
    └──requires──> [MaaS Semantic Catalog API]
    └──requires──> [Trust Graph Engine (NetworkX)]
    └──requires──> [Razorpay Test-Mode Integration]
    └──requires──> [Defense-in-Depth Trust Interceptor]
    └──requires──> [100% Immutable Append-Only Audit Trail]

[MaaS Transact API]
    └──requires──> [Google ADK 6-Step Orchestrator]

[Interactive Cytoscape.js Visualizer]
    └──requires──> [Trust Graph Engine (NetworkX)]
    └──requires──> [Fraud Ring Detection Algorithm]
    └──enhances──> [Merchant Dashboard & Live Transaction Feed]

[Simulated Attack Benchmark (run_eval.py)]
    └──requires──> [Trust Graph Engine (NetworkX)]
    └──requires──> [Fraud Ring Detection Algorithm]
    └──requires──> [500-Transaction Synthetic Dataset]

[Autonomous Demo Buyer Agent]
    └──requires──> [MaaS Semantic Catalog API]
    └──requires──> [MaaS Transact API]

[Offensive Fraud Actions] ──conflicts──> [Buildathon Defense-Only Quality Gate]
[Neo4j Production Cluster] ──conflicts──> [Fast Local Hackathon Development]
```

### Dependency Notes

- **[MaaS Transact API] requires [Google ADK 6-Step Orchestrator]:** The transaction endpoint does not execute business logic directly; it validates authentication and delegates execution to the ADK orchestrator agent.
- **[Google ADK 6-Step Orchestrator] requires [Trust Graph Engine]:** The orchestrator cannot create a Razorpay order until Step 3 (`check_trust_graph`) returns an ALLOW or REVIEW decision.
- **[Google ADK 6-Step Orchestrator] requires [Defense-in-Depth Trust Interceptor]:** The tool `create_razorpay_order` contains hardcoded validation rejecting `trust_score < 40` to guarantee that prompt injections cannot force payment creation.
- **[Fraud Ring Detection Algorithm] requires [Trust Graph Engine & Cross-Merchant Signals]:** Coordinated rings can only be identified when signals span at least 2 distinct merchants.
- **[Interactive Cytoscape.js Visualizer] enhances [Merchant Dashboard]:** The dashboard remains functional with just a transaction table, but Cytoscape provides the crucial visual proof of graph clustering for judges.
- **[Offensive Fraud Actions] conflicts with [Buildathon Defense-Only Quality Gate]:** Any active retaliatory behavior explicitly triggers disqualification under Razorpay Track 02 rules.

---

## MVP Definition

### Launch With (v1)

Minimum viable product for the Razorpay AI Buildathon submission.

- [x] **MaaS Semantic Catalog API** — Essential for AI agents to discover inventory via natural language queries.
- [x] **MaaS Transact API** — Essential entrypoint for autonomous machine-to-machine checkout.
- [x] **Google ADK 6-Step Orchestrator** — Essential to fulfill Track 01 requirement of an explainable, bounded, gated agent.
- [x] **Trust Graph Engine (NetworkX)** — Essential microservice evaluating buyer risk across merchants in real time (<500ms).
- [x] **Multi-Merchant Fraud Ring Detector** — Essential to satisfy Track 02 requirement of detecting a specific loss class.
- [x] **Razorpay Test-Mode Orders & Payments** — Essential to demonstrate working payments on Razorpay rails.
- [x] **HMAC-SHA256 Webhook Verification** — Essential to securely confirm payment capture and update signals.
- [x] **100% Immutable Append-Only Audit Trail** — Essential to prove decision explainability with per-step rationale.
- [x] **Merchant Dashboard with Live Feed** — Essential interface for onboarding, catalog configuration, and audit inspection.
- [x] **Cytoscape.js Trust Graph Visualizer** — Essential visual centerpiece for Track 02 demonstration.
- [x] **Autonomous Demo Buyer Agent** — Essential to prove zero-human-touch end-to-end transaction capabilities.
- [x] **Synthetic Evaluation Benchmark (`run_eval.py`)** — Essential to report honest Precision, Recall, F1, and ₹ False-Positive Cost on 500 transactions.

### Add After Validation (v1.x)

Features to add once core demo and benchmark are verified.

- [ ] **Louvain Community Detection Algorithm** — Trigger: When network graph density increases and connected components produce overly broad clusters.
- [ ] **Merchant Outbound Webhook Notifications** — Trigger: When external merchants request real-time webhook alerts upon blocked fraud attempts.
- [ ] **Dynamic Per-Merchant Risk Appetite Tuning** — Trigger: When merchants demand custom score gating (e.g., high-risk luxury goods requiring score ≥85).
- [ ] **Automated Chargeback & Dispute Feedback Loop** — Trigger: When Razorpay dispute webhooks are simulated to retroactively mark graph nodes as confirmed fraud.

### Future Consideration (v2+)

Features to defer until post-hackathon enterprise productionization.

- [ ] **Distributed Graph Database (Neo4j / Memgraph)** — Defer because in-memory NetworkX easily handles tens of thousands of nodes with zero operational latency during demo.
- [ ] **Native NPCI Unified Agentic Payments (UAP) Adapter** — Defer pending national standard stabilization and production sandbox availability.
- [ ] **Consortium-Wide Privacy-Preserving Federated Learning** — Defer until multi-bank deployment agreements and legal data-sharing frameworks are established.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MaaS Semantic Catalog API | HIGH | MEDIUM | P1 |
| MaaS Transact API | HIGH | MEDIUM | P1 |
| Google ADK 6-Step Orchestrator | HIGH | HIGH | P1 |
| Razorpay Test Orders & Capture | HIGH | MEDIUM | P1 |
| Trust Graph Engine (NetworkX) | HIGH | HIGH | P1 |
| Multi-Merchant Fraud Ring Detection | HIGH | HIGH | P1 |
| Immutable Append-Only Audit Trail | HIGH | MEDIUM | P1 |
| Cytoscape.js Graph Visualizer | HIGH | MEDIUM | P1 |
| Synthetic Attack Benchmark & Metrics | HIGH | MEDIUM | P1 |
| Demo Buyer Agent (ADK) | HIGH | MEDIUM | P1 |
| HMAC Webhook Verification | MEDIUM | LOW | P1 |
| Merchant Onboarding & Catalog UI | MEDIUM | MEDIUM | P1 |
| Credential Encryption at Rest | MEDIUM | LOW | P1 |
| Louvain Community Clustering | MEDIUM | MEDIUM | P2 |
| Merchant Outbound Webhooks | MEDIUM | LOW | P2 |
| Configurable Risk Thresholds | MEDIUM | LOW | P2 |
| Production Neo4j Cluster | MEDIUM | HIGH | P3 |
| NPCI UAP Protocol Adapter | HIGH | HIGH | P3 |

**Priority key:**
- **P1:** Must have for Buildathon submission and live judging
- **P2:** High-value polish, add once P1 core test passes
- **P3:** Post-hackathon enterprise scaling

---

## Competitor Feature Analysis

| Feature | Traditional E-Commerce APIs (Shopify / WooCommerce) | Standalone Fraud Tools (Thirdwatch / Sift / Riskified) | Emerging Agentic Commerce (Skyfire / x402 / AP2) | Nexus Approach |
|---------|----------------------------------------------------|-------------------------------------------------------|--------------------------------------------------|----------------|
| **AI Agent Transactability** | None. APIs expect structured SKU payloads or human session tokens; no natural language intent parsing. | N/A (Risk only; does not provide commerce discovery or order execution). | Provides wallet-based agent APIs, but lacks native Razorpay INR rails and merchant catalog search. | **Unified MaaS Gateway:** Natural language semantic catalog discovery + single POST transact endpoint on Razorpay test rails. |
| **Fraud Ring Detection** | Per-merchant isolated rules (IP rate limit, email blocklist). No cross-merchant visibility. | Centralized risk engine, but opaque black-box ML scores with high enterprise SaaS pricing. | Minimal risk scoring; assumes agent cryptographic wallet signature equals legitimacy. | **Cross-Merchant Trust Graph:** Collaborative in-memory NetworkX graph revealing multi-merchant coordinated rings in real time. |
| **Auditability & Explainability** | Basic server logs; no AI decision reasoning or tool-level traces. | Risk reason codes ("high IP risk"), but lacks transparent step-by-step tool auditability. | Transaction receipt hashes only; no intermediate decision audit trail. | **100% Immutable Step Audit Trail:** Append-only log recording every tool input, output, duration, and plain-English justification. |
| **Financial Gating** | Manual risk rules or post-authorization cancellation. | Scores transactions, but merchants must write custom webhook handlers to cancel. | No trust gate; if the wallet signs, money moves. | **Programmatic Pre-Payment Hard Gate:** Razorpay order creation is physically impossible if trust score < 40 (defense-in-depth). |
| **Visual Explainability** | Flat table of orders. | Proprietary dashboards with enterprise charts; no graph visualization for SMBs. | Developer block explorers. | **Interactive Cytoscape.js Visualizer:** Force-directed real-time graph showing clusters, fraud rings, and node connectivity. |
| **Evaluation Transparency** | Marketing claims ("reduces fraud by 40%"). | Proprietary benchmark data; no reproducible synthetic test suite. | No published fraud evaluation benchmarks. | **Reproducible Benchmark Suite:** 500-transaction synthetic benchmark outputting honest Precision, Recall, F1, and ₹ False-Positive Cost. |

---

## Sources

- Razorpay API Documentation: Orders, Payments, Customers, and Webhook Signatures (`https://razorpay.com/docs/api/`)
- Google Agent Development Kit (ADK) & Gemini 2.0 Flash Documentation (`google-adk`, `google-generativeai`)
- NPCI Unified Agentic Payments (UAP) Architectural Drafts & Whitepapers
- NetworkX 3.x Graph Theory Library Documentation (Bipartite graphs, connected components, degree centrality)
- Nexus Product Requirements Document (`PRD.md`) & Project Charter (`PROJECT.md`)
- Razorpay AI Buildathon Track 01 & Track 02 Briefs and Quality Gates

---
*Feature research for: Agentic Commerce & AI Risk Management (Razorpay Ecosystem)*
*Researched: 2026-09-03*
