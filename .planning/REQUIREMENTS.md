# Requirements: Nexus

**Defined:** 2026-09-03  
**Core Value:** Enable seamless end-to-end agentic commerce on Razorpay while enforcing network-level fraud ring defense and 100% explainable, bounded transaction auditability.

## v1 Requirements

Requirements for initial release covering both Track 01 (Agentic Commerce) and Track 02 (AI Risk Manager) in Milestone 1.

### MaaS Gateway (Merchant-as-an-API)

- [ ] **MAAS-01**: Merchant can expose product catalog via `GET /api/maas/{merchant_id}/catalog` supporting natural language queries using Gemini `text-embedding-004` and pgvector cosine similarity.
- [ ] **MAAS-02**: MaaS catalog endpoint returns structured JSON with exact paise pricing, currency (INR), stock availability, and direct `agent_purchase_url`.
- [ ] **MAAS-03**: AI buyer can execute purchase via `POST /api/maas/{merchant_id}/transact` with natural language intent and buyer fingerprint object.
- [ ] **MAAS-04**: MaaS API enforces Bearer token authentication generated during merchant onboarding and hashed (SHA-256) at rest.
- [ ] **MAAS-05**: MaaS API returns structured HTTP responses: 200 (SUCCESS with receipt & audit trail), 403 (TRUST DENIED with risk breakdown), 409 (STOCK ERROR), or 500 (FAILED).

### Agent Orchestration (Google ADK)

- [ ] **ORCH-01**: Nexus Orchestrator Agent runs on Google ADK (`adk api_server` on port 8000) powered by Gemini 2.0 Flash with sub-2s tool-calling latency.
- [ ] **ORCH-02**: Agent executes strict 6-step deterministic pipeline: `parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`.
- [ ] **ORCH-03**: Agent extracts structured `product_query`, integer `quantity`, and `buyer_email` from freeform intent via `parse_intent`.
- [ ] **ORCH-04**: Agent validates inventory and decrements stock on successful transaction via `resolve_catalog` (halts on insufficient stock).
- [ ] **ORCH-05**: Agent halts immediately on trust denial (score < 40) without invoking Razorpay API endpoints.

### Trust Graph Engine

- [ ] **TRUST-01**: FastAPI microservice (port 8001) maintains an in-memory NetworkX undirected weighted graph connecting buyer signals (email hash, /24 IP subnet, device hash, UPI handle, user-agent hash).
- [ ] **TRUST-02**: Trust engine scores incoming fingerprints via `POST /trust/score` returning a 0-100 score, decision (ALLOW ≥ 70, REVIEW 40-69, DENY < 40), risk factors, and score breakdown.
- [ ] **TRUST-03**: Trust engine applies explicit scoring penalties: new entity (-10), 1-hop fraud neighbor (-80), velocity across merchants (-30), and known ring membership (-100).
- [ ] **TRUST-04**: Completed and denied transactions feed back into graph via `POST /trust/signal` to update edge weights and node attributes in real time.
- [ ] **TRUST-05**: Trust Graph rehydrates its in-memory state from PostgreSQL transactions table on service startup.

### Fraud Ring Detection & Risk Interception

- [ ] **RING-01**: Graph engine detects multi-merchant fraud rings using connected components and community clustering algorithms across entities appearing at ≥2 merchants.
- [ ] **RING-02**: Fraud rings expose metadata via `GET /trust/rings` including affected merchants, member nodes, blocked transaction count, and blocked rupee amount.
- [ ] **RING-03**: Programmatic defense-in-depth interceptor in `create_razorpay_order` raises `TrustViolationError` if called with trust score < 40.
- [ ] **RING-04**: System operates strictly defense-only (passive observation, ring scoring, transaction rejection); no offensive probing or cross-merchant PII leakage.

### Razorpay Integration & Webhooks

- [ ] **RZP-01**: Order tool creates Razorpay test-mode orders using merchant credentials with amount in integer paise and audit notes attached.
- [ ] **RZP-02**: Payment tool captures payments against created orders in test mode and records `razorpay_payment_id`.
- [ ] **RZP-03**: Webhook endpoint (`POST /api/webhooks/razorpay`) verifies `X-Razorpay-Signature` header with timing-safe HMAC-SHA256 comparison.
- [ ] **RZP-04**: Webhook handler processes `payment.captured`, `payment.failed`, and `order.paid` events to update transaction statuses and feed graph signals.

### Audit Trail & Explainability

- [ ] **AUDIT-01**: PostgreSQL schema enforces immutable append-only audit entries (`AuditEntry`) via database triggers (disallowing UPDATE/DELETE).
- [ ] **AUDIT-02**: Audit trail records timestamp (ms precision), duration, step name, input summary, output summary, and plain-English rationale for every tool decision.
- [ ] **AUDIT-03**: 100% of transactions (success, denied, failed) produce a complete, sealed audit trail visible in dashboard and downloadable as JSON.

### Merchant Dashboard

- [ ] **DASH-01**: Next.js 14 App Router dashboard with self-service onboarding wizard to connect Razorpay test credentials and generate MaaS endpoints.
- [ ] **DASH-02**: Catalog management interface to view, add, edit, and toggle AI-purchasable products with stock indicators.
- [ ] **DASH-03**: Real-time transactions feed with status badges (SUCCESS, DENIED, FAILED), trust score pill, and slide-out audit timeline drawer.
- [ ] **DASH-04**: Interactive Cytoscape.js force-directed graph visualization rendering buyer signal nodes, co-occurrence edges, and highlighted fraud ring clusters.

### Evaluation & Benchmark Suite

- [ ] **EVAL-01**: Synthetic benchmark dataset generator producing 500+ realistic multi-merchant transactions with known fraud ring injections.
- [ ] **EVAL-02**: Evaluation harness (`scripts/run_eval.py`) measuring Precision (target ≥ 80%), Recall (target ≥ 75%), F1, and explicit ₹ False-Positive Cost on held-out test data.
- [ ] **EVAL-03**: Autonomous Demo Buyer Agent (`DemoBuyerAgent`) built with Google ADK simulating end-to-end shopping without human UI intervention.
- [ ] **EVAL-04**: End-to-end demo script demonstrating both happy path (ALLOW) and fraud ring attack denial (DENY) with complete audit trail inspection.

## v2 Requirements

### Advanced Enhancements (Post-Buildathon)

- **V2-01**: Multi-tenant distributed graph storage with automated Redis caching for >10,000 tx/sec.
- **V2-02**: Dynamic adaptive pricing engine based on buyer agent reputation and merchant margin targets.
- **V2-03**: Multi-party zero-knowledge proof verification for buyer agent credential attestations without revealing wallet history.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real money payment rails | Strictly Razorpay test mode per hackathon guidelines |
| Offensive counter-actions (probing, active bot scanning) | Violates Track 02 defense-only mandate |
| External distributed graph database (Neo4j/Neptune) | In-memory NetworkX with Postgres rehydration is faster and avoids cluster setup complexity |
| Cryptographic crypto/Web3 tokens | Focus is Indian domestic INR commerce aligning with NPCI UAP rails |
| Unbounded LLM autonomous financial reasoning | Money actions must remain strictly bounded, deterministic, and gated |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAAS-01 | Phase 4 | Pending |
| MAAS-02 | Phase 4 | Pending |
| MAAS-03 | Phase 4 | Pending |
| MAAS-04 | Phase 4 | Pending |
| MAAS-05 | Phase 4 | Pending |
| ORCH-01 | Phase 3 | Pending |
| ORCH-02 | Phase 3 | Pending |
| ORCH-03 | Phase 3 | Pending |
| ORCH-04 | Phase 3 | Pending |
| ORCH-05 | Phase 3 | Pending |
| TRUST-01 | Phase 2 | Pending |
| TRUST-02 | Phase 2 | Pending |
| TRUST-03 | Phase 2 | Pending |
| TRUST-04 | Phase 2 | Pending |
| TRUST-05 | Phase 2 | Pending |
| RING-01 | Phase 2 | Pending |
| RING-02 | Phase 2 | Pending |
| RING-03 | Phase 3 | Pending |
| RING-04 | Phase 2 | Pending |
| RZP-01 | Phase 3 | Pending |
| RZP-02 | Phase 3 | Pending |
| RZP-03 | Phase 4 | Pending |
| RZP-04 | Phase 4 | Pending |
| AUDIT-01 | Phase 1 | Pending |
| AUDIT-02 | Phase 1 | Pending |
| AUDIT-03 | Phase 4 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| EVAL-01 | Phase 6 | Pending |
| EVAL-02 | Phase 6 | Pending |
| EVAL-03 | Phase 6 | Pending |
| EVAL-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-03*
*Last updated: 2026-09-03 after initial definition*

