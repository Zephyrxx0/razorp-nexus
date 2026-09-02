# Project Research Summary

**Project:** Nexus  
**Domain:** Agentic Commerce Gateway (Track 01) & Cross-Merchant AI Risk Management (Track 02)  
**Researched:** 2026-09-03  
**Confidence:** HIGH  

## Executive Summary

Nexus is a dual-track agentic commerce platform built for the Razorpay ecosystem. It bridges traditional merchants to autonomous AI buyers via an agent-readable Merchant-as-an-API (MaaS) gateway while shielding the entire network through a real-time, cross-merchant Trust Graph that detects syndicated fraud rings before financial execution occurs. As emerging protocols like NPCI Unified Agentic Payments (UAP), Agentic Commerce Protocol (ACP), and x402 enable machine-to-machine commerce, merchants face a dual challenge: discovering AI buyer demand without complex custom integrations, and mitigating coordinated fraud across merchants where isolated fraud rules are blind to syndicated attackers. Nexus addresses both tracks simultaneously on Razorpay test rails.

The recommended architectural approach is a decoupled, multi-service monorepo. The presentation and public gateway layer is built on **Next.js 14 App Router**, colocating merchant onboarding and dashboard UI with high-throughput MaaS route handlers (`/api/maas/{merchant_id}/*`). The autonomous commerce engine is orchestrated via **Google ADK** powered by **Gemini 2.0 Flash**, enforcing an explainable, bounded 6-step tool chain (`parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`). Real-time network risk evaluation is delegated to an asynchronous **FastAPI** microservice utilizing **NetworkX** for sub-500ms in-memory graph clustering, while **PostgreSQL 16** with **pgvector** acts as the relational source of truth, semantic catalog vector store, and immutable append-only audit ledger.

The primary engineering and regulatory risks identified in research center on four areas: (1) ungated money movement and LLM jailbreak vulnerabilities, mitigated through programmatic defense-in-depth hard gates that physically reject payment creation when trust scores fall below 40; (2) unexplainable black-box risk scoring, solved by decomposed additive scoring rules and database-enforced append-only audit entries; (3) aggressive over-blocking that destroys merchant revenue, avoided via calibrated 3-tier gating (`ALLOW`, `REVIEW`, `DENY`) and explicit ₹ False-Positive Cost tracking; and (4) hackathon disqualification via offensive security measures, resolved by strictly passive observation, one-way SHA-256 hashing of buyer identifiers, and /24 subnet truncation for IP addresses.

---

## Key Findings

### Recommended Stack

The chosen technology stack prioritizes sub-second execution speed, strict type safety across multi-service boundaries, low operational friction, and native compatibility with the Google AI and Razorpay ecosystems.

Detailed specification in [STACK.md](file:///home/zeph/Code/nexus/.planning/research/STACK.md).

**Core technologies:**
- **Next.js 14 (App Router) & TypeScript:** Merchant Dashboard UI & MaaS API Gateway — Colocates public machine-to-machine route handlers, Razorpay webhook receivers, and merchant administration within a unified TypeScript codebase, eliminating external gateway overhead and isolating API secrets.
- **Google ADK (`google-adk`) & Gemini 2.0 Flash:** Agent runtime & tool orchestration — Provides type-safe FunctionTools, multi-turn state management, and the `adk api_server` REST CLI, paired with Gemini 2.0 Flash for sub-2s tool execution.
- **FastAPI & NetworkX:** Real-time Trust Graph microservice — Delivers sub-millisecond in-memory graph traversals, connected component clustering, and k-hop risk propagation, meeting the strict <500ms trust scoring budget.
- **PostgreSQL 16 + `pgvector`:** Relational store, vector search, & immutable audit log — Colocates relational data with 768-dimensional Gemini `text-embedding-004` product embeddings via cosine similarity (`<=>`), with database-level triggers enforcing zero updates/deletions on audit logs.
- **Razorpay SDKs (Node & Python):** Payment gateway integration (Test Mode) — Manages test-mode order generation, automated payment capture, status polling, and constant-time HMAC-SHA256 webhook validation.
- **Cytoscape.js (`cytoscape-cose-bilkent`):** Interactive Trust Graph visualizer — Renders force-directed clustering in the merchant dashboard, transforming invisible network risk into an interpretable visual map for live judging.

---

### Expected Features

Detailed specification in [FEATURES.md](file:///home/zeph/Code/nexus/.planning/research/FEATURES.md).

**Must have (table stakes):**
- **MaaS Semantic Catalog API (`GET /api/maas/{merchant_id}/catalog`):** Structured JSON catalog discovery powered by pgvector semantic embeddings for natural language buyer queries.
- **MaaS Transact API (`POST /api/maas/{merchant_id}/transact`):** Machine-to-machine checkout endpoint accepting buyer fingerprints and intent strings.
- **Razorpay Test-Mode Orders & Payments:** Full two-phase create and capture lifecycle using official Razorpay test rails (`rzp_test_*`).
- **HMAC-SHA256 Webhook Verification:** Timing-safe cryptographic verification on `/api/webhooks/razorpay` to prevent spoofed capture callbacks.
- **Merchant Onboarding & Catalog UI:** Friction-free 3-step setup validating credentials, issuing MaaS bearer tokens, and importing inventory.
- **Credential Encryption at Rest:** AES-256-GCM encryption for all merchant Razorpay secrets, decrypted only at point of execution.
- **Live Transaction Feed:** Dashboard feed displaying transaction statuses, trust scores, and rupee amounts.

**Should have (competitive differentiators):**
- **Google ADK 6-Step Orchestrator Agent:** Rigid, explainable tool sequence enforcing bounded execution for Track 01.
- **Cross-Merchant NetworkX Trust Graph:** In-memory graph linking anonymized buyer signals across distinct merchants to eliminate cross-store information asymmetry.
- **Multi-Merchant Fraud Ring Detection:** Connected-components clustering identifying syndicated attack networks across ≥2 merchants and dropping member scores to 0 for Track 02.
- **100% Immutable Append-Only Audit Trail:** Database-enforced immutable ledger capturing every tool invocation, duration, inputs, outputs, and plain-English rationale.
- **Interactive Cytoscape.js Graph Visualizer:** Force-directed live graph highlighting rings, risk clusters, and individual entity metrics.
- **Simulated Attack Benchmark with Honest Metrics (`run_eval.py`):** 500-transaction held-out benchmark reporting Precision, Recall, F1, and explicit ₹ False-Positive Cost.
- **Autonomous Demo Buyer Agent:** Live proof of humanless commerce discovering products, comparing prices, and completing purchases.
- **Defense-in-Depth Trust Interceptor:** Hardcoded programmatic check inside payment tools throwing `TrustViolationError` if trust score < 40.

**Defer (v2+ / Anti-Features):**
- **Offensive Countermeasures (Doxxing, Probing, Tarpits):** Strictly prohibited under Buildathon rules; system remains 100% defense-only.
- **Heavy Graph Databases (Neo4j / Amazon Neptune):** Unnecessary operational footprint for hackathon scale; in-memory NetworkX with PostgreSQL rehydration is faster and simpler.
- **Cryptocurrency / Web3 Agent Wallets:** Distracts from Indian INR commerce; standard paise fiat rails align with NPCI UAP guidelines.
- **Plaintext PII Sharing:** Violates DPDP Act; all signals are strictly SHA-256 hashed and IP addresses truncated to /24 subnets.

---

### Architecture Approach

Detailed specification in [ARCHITECTURE.md](file:///home/zeph/Code/nexus/.planning/research/ARCHITECTURE.md).

The Nexus architecture decouples concerns into four distinct layers: a Next.js 14 presentation and API gateway layer (Port 3000), an autonomous agent orchestration layer running Google ADK with Gemini 2.0 Flash (Port 8000), a high-performance Python FastAPI Trust Graph microservice running NetworkX (Port 8001), and a PostgreSQL 16 database with pgvector (Port 5432). Financial execution is gated by a linear state machine where Razorpay order creation cannot execute unless preceding trust evaluation yields an `ALLOW` or `REVIEW` decision.

**Major components:**
1. **Next.js 14 API Gateway & Dashboard (Port 3000):** Ingress for autonomous buyers and webhooks; hosts merchant onboarding, catalog management, live transaction feeds, and Cytoscape.js graph views.
2. **Nexus Orchestrator Agent (Port 8000):** Google ADK agent executing the deterministic 6-step tool chain with sub-2s tool latency.
3. **Trust Graph Service (Port 8001):** FastAPI + NetworkX engine scoring buyer fingerprints (0-100), detecting multi-merchant rings, and streaming graph topologies.
4. **PostgreSQL 16 + pgvector (Port 5432):** Durable relational store, product embedding index, and immutable append-only audit log with DB triggers preventing updates/deletions.
5. **Razorpay Test Rails:** External payment gateway managing order creation, simulated capture, and webhook event dispatching.

---

### Critical Pitfalls

Detailed specification in [PITFALLS.md](file:///home/zeph/Code/nexus/.planning/research/PITFALLS.md).

1. **Ungated Money Movement & LLM Jailbreak Bypass:** Prompt instructions are probabilistic and vulnerable to injection.  
   *Mitigation:* Implement programmatic defense-in-depth code gates inside `create_razorpay_order` that raise `TrustViolationError` if `trust_score < 40`, independent of LLM reasoning.
2. **Black-Box Unexplainable Risk Decisions:** Returning a raw score without reasoning violates Track 01 and Track 02 evaluation criteria.  
   *Mitigation:* Scorer outputs an additive `score_breakdown` with explicit `risk_factors`, recorded to PostgreSQL `audit_entries` with plain-English rationales and visualized in an interactive drawer.
3. **False-Positive Cost Blindness & Over-Blocking:** Aggressive blocking destroys merchant GMV; reporting only precision/recall ignores economic loss.  
   *Mitigation:* Calibrate 3-tier thresholds (`ALLOW` ≥ 70, `REVIEW` 40-69, `DENY` < 40) with modest cold-start deductions (-10), and quantify ₹ False-Positive Cost in `run_eval.py`.
4. **Fragile LLM Tool Cascades & Latency Blowout (>8s SLA):** Unbounded agent thinking loops and multi-step reasoning exceed real-time commerce budgets.  
   *Mitigation:* Restrict Gemini 2.0 Flash strictly to natural language intent parsing; execute all subsequent catalog, trust, payment, and audit steps via compiled, sub-100ms Python functions.
5. **Disqualification via Offense-Capable Countermeasures:** Implementing retaliatory probes, honeypots, or raw PII blacklists violates Buildathon rules.  
   *Mitigation:* System operates strictly defense-only (HTTP 403 + internal signal update), with one-way SHA-256 hashing and /24 subnet truncation for all stored identifiers.

---

## Implications for Roadmap

Based on research dependencies, component coupling, and risk mitigations, the project should be implemented in 7 sequential phases:

### Phase 1: Foundation, Data Layer & Security Engine
**Rationale:** The relational schema, cryptographic utilities, and vector extension define the core data contracts for all downstream services.  
**Delivers:** PostgreSQL 16 schema with `pgvector`, integer paise currency conventions, AES-256-GCM secret encryption, SHA-256 PII anonymization, audit trigger forbidding updates/deletes, and Docker Compose orchestration.  
**Addresses:** Credential Encryption at Rest, Immutable Append-Only Audit Trail schema, pgvector catalog storage.  
**Avoids:** Floating-point currency drift (Pitfall 7) and plaintext secret/PII leaks (Pitfall 5).

### Phase 2: Trust Graph Engine Microservice (Port 8001)
**Rationale:** The ADK agent requires an operational risk scoring endpoint before its tool chain can be tested; building this as a standalone microservice unblocks agent development.  
**Delivers:** FastAPI application running in-memory NetworkX graph, decomposed 0-100 heuristic scorer with explicit `risk_factors`, connected components fraud ring detector, and cold-start PostgreSQL rehydration.  
**Uses:** Python 3.11, FastAPI, NetworkX, NumPy, asyncpg, Pydantic v2.  
**Implements:** Cross-Merchant Trust Graph Engine, Fraud Ring Detector, `/trust/score`, `/trust/signal`, `/trust/rings`, and `/trust/graph` endpoints.  
**Avoids:** Black-box unexplainable decisions (Pitfall 2) and full-graph blocking performance bottlenecks.

### Phase 3: MaaS Gateway & Semantic Catalog API (Port 3000)
**Rationale:** Exposes merchant inventory to AI buyers and provides the public ingress layer for machine-to-machine checkout before agent wiring.  
**Delivers:** Next.js 14 Route Handlers for `/api/maas/[merchantId]/catalog` (pgvector cosine similarity search using Gemini `text-embedding-004`) and HMAC-SHA256 webhook handler (`/api/webhooks/razorpay`).  
**Addresses:** MaaS Semantic Catalog API, HMAC Webhook Verification.  
**Avoids:** Dynamic embedding calculation bottlenecks (Pitfall 4) and timing-attack webhook vulnerabilities.

### Phase 4: Google ADK Orchestrator & Tool Chain (Port 8000)
**Rationale:** Implements the core intelligent agent required for Track 01, connecting the gateway to the database, trust service, and Razorpay APIs.  
**Delivers:** Google ADK agent with Gemini 2.0 Flash running via `adk api_server`, strict 6-step tool implementations (`parse_intent`, `resolve_catalog`, `check_trust_graph`, `create_razorpay_order`, `capture_razorpay_payment`, `log_audit_entry`), and defense-in-depth trust gate.  
**Addresses:** Google ADK 6-Step Orchestrator, Defense-in-Depth Trust Interceptor, 100% Immutable Audit Trail logging.  
**Avoids:** Ungated money movement / prompt injection bypasses (Pitfall 1) and unbounded LLM latency loops (Pitfall 4).

### Phase 5: Razorpay Payment Execution & Lifecycle State Machine
**Rationale:** Connects the orchestrator's payment tools to real Razorpay test-mode rails with complete error handling and inventory rollback.  
**Delivers:** Server-side Razorpay order creation and payment capture, metadata notes binding (`nexus_transaction_id`, `trust_score`), and partial failure state machine with stock reservation rollback.  
**Addresses:** Razorpay Test-Mode Integration, Inventory Gating, MaaS Transact API completion.  
**Avoids:** Orphaned state on payment capture failure (Pitfall 8) and client-side credential exposure.

### Phase 6: Merchant Dashboard & Cytoscape.js Visualization (Port 3000)
**Rationale:** Provides the visual presentation layer required for demo judges, giving merchants visibility into transactions, audit logs, and fraud rings.  
**Delivers:** Next.js 14 merchant dashboard with 3-step onboarding wizard, catalog editor, live transaction feed with expandable `AuditTimeline` drawer, and interactive force-directed `TrustGraph` visualizer powered by Cytoscape.js and `cose-bilkent`.  
**Addresses:** Merchant Onboarding Wizard, Live Transaction Feed, Cytoscape.js Trust Graph Visualizer.  
**Avoids:** Unreadable hairball graph visualizations (UX Pitfall) and hidden multi-step agent reasoning (UX Pitfall).

### Phase 7: Autonomous Demo Buyer, Attack Simulator & Evaluation Benchmark
**Rationale:** Final verification and demonstration harness validating both tracks: Track 01 via zero-human-touch autonomous buying, and Track 02 via simulated attack detection and a 500-transaction held-out benchmark.  
**Delivers:** Autonomous Google ADK `DemoBuyerAgent`, synthetic ring attack generator (`simulate_ring_attack.py`), held-out benchmark runner (`run_eval.py`) measuring Precision, Recall, F1, and ₹ False-Positive Cost, and offline demo fallback mocks (`MOCK_EXTERNAL_APIS`).  
**Addresses:** Autonomous Demo Buyer Agent, Simulated Attack Benchmark, Live Demo Hardening.  
**Avoids:** False-positive cost blindness (Pitfall 3) and live demo failure from external API flakiness (Pitfall 6).

---

### Phase Ordering Rationale

- **Bottom-Up Dependency Flow:** The database schema and cryptographic foundations (Phase 1) must precede all services. The Trust Graph (Phase 2) must be live before the ADK Agent (Phase 4) can execute its 3rd tool (`check_trust_graph`). The payment rails (Phase 5) must be hardened before the end-to-end buyer agent and attack simulators (Phase 7) run.
- **Microservice Isolation:** Building the Trust Graph and ADK Agent as independent microservices allows them to be unit tested and verified with synthetic curl requests prior to full UI integration.
- **Risk-First Architecture:** Gating money movement with hard programmatic assertions is established in Phase 4 and Phase 5 before running attack simulations, preventing any possibility of accidental live charges or bypassed gates.
- **Evaluation Last:** The benchmark harness (`run_eval.py`) and attack simulator require a fully operational backend stack to evaluate genuine system performance against held-out test data.

---

### Research Flags

**Phases likely needing deeper research / prototyping during planning:**
- **Phase 4 (Google ADK Tool Chain):** The exact request/response envelope for invoking Google ADK's `adk api_server` from Next.js route handlers requires targeted verification during phase planning to ensure clean session state passing.
- **Phase 6 (Cytoscape.js React Integration):** Cytoscape requires pure client-side rendering (`ssr: false`) and dynamic `cy.batch()` element diffing to prevent canvas re-mounting flickers during live polling.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (PostgreSQL & Crypto):** Standard relational tables, `pgcrypto`, `pgvector` extension, and Node.js `crypto` AES-256-GCM / SHA-256 patterns.
- **Phase 2 (FastAPI & NetworkX):** Well-documented Python ASGI patterns; NetworkX `connected_components` is standard graph theory.
- **Phase 3 (Next.js Route Handlers):** Standard Next.js 14 App Router route handlers with `req.json()` and `req.text()`.
- **Phase 5 (Razorpay Test API):** Standard REST calls to `/v1/orders` and `/v1/payments/{id}/capture` with Basic auth.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | All core technologies (Next.js 14, Google ADK, FastAPI, NetworkX, PostgreSQL 16, pgvector, Razorpay SDK) verified against official documentation and version matrices. |
| **Features** | HIGH | Complete alignment with Razorpay AI Buildathon criteria for Track 01 (Agentic Commerce) and Track 02 (AI Risk Manager), with explicit anti-feature boundaries. |
| **Architecture** | HIGH | Clean 4-tier separation of concerns, deterministic linear agent tool chain, hybrid in-memory/relational storage, and programmatic defense-in-depth gates. |
| **Pitfalls** | HIGH | Comprehensive analysis of 8 critical failure modes, including LLM jailbreaks, black-box disqualifications, false-positive costs, latency limits, and demo flakiness. |

**Overall confidence:** HIGH

### Gaps to Address

- **ADK `api_server` Session Contract:** Validate the exact JSON payload expected by `adk api_server` for multi-tool invocations during Phase 4 plan creation.  
  *Handling:* Create a minimal spike in `nexus-agent/` testing `adk api_server` with a 2-tool mock before writing production tools.
- **Cytoscape DOM Element Diffing:** Ensure Cytoscape does not re-render or reset viewport zoom when new transactions arrive via SWR polling.  
  *Handling:* Implement element diffing helper using `cy.json()` or `cy.add()` / `cy.remove()` rather than full graph re-initialization.
- **Razorpay Webhook Raw Body Handling:** Next.js Route Handlers must access `await req.text()` before parsing JSON to preserve exact whitespace for HMAC signature verification.  
  *Handling:* Standard Next.js pattern; verify in unit test with sample Razorpay webhook payload.

---

## Sources

### Primary (HIGH confidence)
- `PRD.md` — Complete system architecture, API schemas, and component requirements for Project Nexus.
- `PROJECT.md` — Core value proposition, constraints, active requirements, and key technical decisions.
- Razorpay Official API Documentation (`https://razorpay.com/docs/api/`) — Orders, Payments, Webhooks, and Test Mode validation.
- Google Agent Development Kit (ADK) & Gemini 2.0 Flash Reference (`google-adk`, `google-generativeai`).
- NetworkX 3.3 Reference Manual (`networkx.org`) — Connected components, clustering algorithms, and ego-graph metrics.
- PostgreSQL 16 + `pgvector` Documentation (`github.com/pgvector/pgvector`) — Cosine similarity operator (`<=>`) and HNSW indexing.

### Secondary (MEDIUM confidence)
- NPCI Unified Agentic Payments (UAP) Architectural Drafts & Whitepapers — Emergent Indian agentic payment standards.
- Cytoscape.js & `cytoscape-cose-bilkent` Documentation — Force-directed physics layout configurations.
- PCI-DSS & India Digital Personal Data Protection (DPDP) Act 2023 Guidelines — PII minimization, hashing, and credential encryption standards.

### Tertiary (LOW confidence / Validation during build)
- Google ADK `adk api_server` multi-tenant session isolation under concurrent execution — to be verified during Phase 4 implementation.

---
*Research completed: 2026-09-03*  
*Ready for roadmap: yes*
