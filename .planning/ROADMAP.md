# Roadmap: Nexus

## Overview

Nexus is a dual-track agentic commerce platform built for the Razorpay AI Buildathon (Track 01 Agentic Commerce & Track 02 AI Risk Manager). This roadmap delivers a complete end-to-end system across 6 focused vertical MVP capability slices: establishing the PostgreSQL 16 and pgvector data foundation, building the in-memory NetworkX Trust Graph microservice, creating the Google ADK 6-step orchestrator agent with defense-in-depth payment gating, deploying the Next.js 14 MaaS API gateway and HMAC webhook layer, developing the merchant dashboard UI with Cytoscape.js graph visualizer, and proving system efficacy with an autonomous demo buyer and 500-transaction evaluation benchmark.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Database Schema & Core Data Layer** - PostgreSQL 16, pgvector, AES-256 secret encryption, immutable audit schema & DB triggers (completed 2026-09-03)
- [ ] **Phase 2: Trust Graph Engine Microservice** - FastAPI port 8001, in-memory NetworkX, 0-100 scoring, real-time signal feedback, connected components ring clustering
- [ ] **Phase 3: Google ADK Orchestrator & Tool Suite** - Google ADK port 8000, Gemini 2.0 Flash, 6-step tool pipeline, intent parser, catalog resolver, trust client, Razorpay order/payment tools, defense-in-depth trust gate
- [ ] **Phase 4: MaaS Gateway & Webhook API Layer** - Next.js 14 route handlers, semantic catalog search via pgvector embeddings, Bearer token auth, transact endpoint proxy, HMAC-SHA256 webhook handler
- [ ] **Phase 5: Merchant Dashboard UI** - Next.js 14 App Router, onboarding wizard, catalog editor, real-time transaction feed with expandable audit timeline drawer, Cytoscape.js force-directed graph visualizer
- [ ] **Phase 6: Autonomous Demo Buyer & Evaluation Suite** - Google ADK DemoBuyerAgent, multi-merchant ring attack simulation, 500-txn benchmark evaluation script computing Precision, Recall, F1, and explicit ₹ False-Positive Cost

## Phase Details

### Phase 1: Database Schema & Core Data Layer

**Goal**: Establish PostgreSQL 16 schema, pgvector extension, integer paise financial conventions, AES-256-GCM secret encryption, and trigger-enforced append-only audit log tables.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):

  1. PostgreSQL 16 container initializes with `pgvector` extension and creates `merchants`, `products`, `transactions`, and `audit_entries` tables.
  2. PostgreSQL trigger physically blocks any `UPDATE` or `DELETE` statement on `audit_entries` table, raising an exception to guarantee immutability.
  3. Cryptographic utilities encrypt merchant secrets using AES-256-GCM and hash buyer PII (emails, IPs to /24 subnets) using SHA-256.
  4. All monetary amounts across schemas and data models are constrained to integer paise, preventing floating-point precision errors.

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 01-01: Database Infrastructure & Schema DDL (Docker Compose with pgvector:pg16, schema.sql with integer paise CHECK constraints, HNSW index, audit trigger + REVOKE immutability, verify_audit_chain function, test-triggers script)
- [x] 01-02: Cryptographic Utilities & Cross-Language Parity Suite (crypto-fixtures.json, TypeScript db/ts adapter + Vitest test, Python db/py adapter + Pytest test, verifying AES-256-GCM, PII hashing, and audit hash chaining)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03: Seed Catalog, Precomputed Embeddings & Rehydration Data (seeds/01_merchants.sql, seeds/02_products.sql with 768d Gemini vectors, seeds/03_transactions.sql with historical rehydration data, scripts/generate_embeddings.py, end-to-end integration test)

### Phase 2: Trust Graph Engine Microservice

**Goal**: Build the standalone Python FastAPI microservice (port 8001) maintaining an in-memory NetworkX graph for sub-500ms trust scoring, real-time feedback signals, connected-components ring clustering, and DB rehydration.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05, RING-01, RING-02, RING-04
**Success Criteria** (what must be TRUE):

  1. FastAPI microservice runs on port 8001 and responds to health checks within 10ms.
  2. `POST /trust/score` evaluates incoming buyer fingerprints against an in-memory NetworkX graph within 500ms, returning a 0-100 score, decision (`ALLOW`, `REVIEW`, `DENY`), and decomposed risk factors.
  3. Trust engine applies configured penalties for new entities (-10), 1-hop fraud proximity (-80), cross-merchant velocity (-30), and known fraud ring membership (-100).
  4. Connected-components clustering detects multi-merchant fraud rings across entities spanning >= 2 merchants and exposes ring topologies via `GET /trust/rings`.
  5. `POST /trust/signal` updates edge weights in real time upon transaction outcomes, and the service rehydrates graph state from PostgreSQL on startup.

**Plans**: TBD

Plans:

- [ ] 02-01: TBD

### Phase 3: Google ADK Orchestrator & Tool Suite

**Goal**: Implement the Google ADK orchestrator agent (port 8000) with Gemini 2.0 Flash executing the deterministic 6-step tool pipeline, Razorpay test-mode order/payment tools, and programmatic defense-in-depth trust gate.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, RING-03, RZP-01, RZP-02
**Success Criteria** (what must be TRUE):

  1. Google ADK agent service runs on port 8000 with Gemini 2.0 Flash, executing the deterministic 6-step tool sequence (`parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`).
  2. Freeform buyer intent strings are parsed into structured `product_query`, integer `quantity`, and `buyer_email` with sub-2s latency.
  3. Programmatic defense-in-depth gate in `create_razorpay_order` raises `TrustViolationError` if `trust_score < 40`, halting execution before calling Razorpay APIs.
  4. Razorpay test-mode order creation and payment capture succeed on `ALLOW` decisions, attaching `nexus_transaction_id` and audit metadata to order notes.
  5. Inventory stock is checked and reserved during `resolve_catalog`, halting with a stock error if requested quantity exceeds available inventory.

**Plans**: TBD

Plans:

- [ ] 03-01: TBD

### Phase 4: MaaS Gateway & Webhook API Layer

**Goal**: Expose Next.js 14 machine-to-machine route handlers for semantic catalog search via pgvector embeddings, Bearer token auth, transact endpoint proxying to the ADK orchestrator, timing-safe HMAC-SHA256 webhook handling, and sealed audit trail delivery.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: MAAS-01, MAAS-02, MAAS-03, MAAS-04, MAAS-05, RZP-03, RZP-04, AUDIT-03
**Success Criteria** (what must be TRUE):

  1. `GET /api/maas/{merchant_id}/catalog` returns structured JSON catalog with paise pricing, INR currency, stock availability, and `agent_purchase_url` using pgvector cosine similarity matching on Gemini embeddings.
  2. `POST /api/maas/{merchant_id}/transact` validates Bearer token authentication against hashed secrets, dispatches to the ADK orchestrator, and returns structured 200, 403, 409, or 500 responses.
  3. Razorpay webhook endpoint (`POST /api/webhooks/razorpay`) verifies `X-Razorpay-Signature` with timing-safe HMAC-SHA256 comparison.
  4. Webhook handler processes `payment.captured`, `payment.failed`, and `order.paid` events, updating transaction records and dispatching signals to the Trust Graph service.
  5. 100% of transactions (success, denied, failed) produce a complete, sealed audit trail returned in the API payload and queryable by transaction ID.

**Plans**: TBD

Plans:

- [ ] 04-01: TBD

### Phase 5: Merchant Dashboard UI

**Goal**: Construct the Next.js 14 App Router merchant dashboard with self-service onboarding, catalog editor, real-time transaction feed with expandable audit timeline drawer, and interactive Cytoscape.js force-directed graph visualizer.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):

  1. Merchant can complete self-service onboarding in Next.js 14 dashboard, saving encrypted Razorpay test keys and receiving a MaaS Bearer token.
  2. Merchant can view, add, edit, and toggle AI-purchasable products with instant stock and pricing updates in the catalog manager.
  3. Live transaction feed updates with real-time status badges (`SUCCESS`, `DENIED`, `FAILED`) and trust score indicators.
  4. Clicking any transaction opens a slide-out audit timeline drawer detailing every tool step, latency breakdown, and plain-English decision rationale.
  5. Merchant can view interactive Cytoscape.js force-directed graph visualizer rendering buyer nodes, co-occurrence edges, and highlighted multi-merchant fraud ring clusters.

**Plans**: TBD

Plans:

- [ ] 05-01: TBD

### Phase 6: Autonomous Demo Buyer & Evaluation Suite

**Goal**: Build the autonomous Google ADK DemoBuyerAgent, multi-merchant ring attack simulation, end-to-end demo script, and 500-transaction benchmark evaluation harness computing Precision, Recall, F1, and explicit ₹ False-Positive Cost.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04
**Success Criteria** (what must be TRUE):

  1. Autonomous `DemoBuyerAgent` (Google ADK) browses the MaaS catalog and successfully completes an end-to-end purchase without human intervention.
  2. Multi-merchant ring attack simulation triggers coordinated attacks across 3+ merchants, demonstrating immediate detection, score degradation to 0, and blocked transactions.
  3. Evaluation harness (`scripts/run_eval.py`) runs 500+ synthetic transactions and outputs metrics achieving Precision >= 80%, Recall >= 75%, F1, and explicit ₹ False-Positive Cost calculation.
  4. End-to-end demonstration script executes both happy path (ALLOW) and fraud ring attack denial (DENY) with sealed audit trail verification.

**Plans**: TBD

Plans:

- [ ] 06-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Schema & Core Data Layer | 3/3 | Complete    | 2026-09-03 |
| 2. Trust Graph Engine Microservice | 0/TBD | Not started | - |
| 3. Google ADK Orchestrator & Tool Suite | 0/TBD | Not started | - |
| 4. MaaS Gateway & Webhook API Layer | 0/TBD | Not started | - |
| 5. Merchant Dashboard UI | 0/TBD | Not started | - |
| 6. Autonomous Demo Buyer & Evaluation Suite | 0/TBD | Not started | - |
