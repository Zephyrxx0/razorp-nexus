# Nexus

## What This Is

Nexus is a dual-layered AI commerce platform built on Razorpay test-mode APIs. It bridges merchants to autonomous AI buyers via an agent-readable Merchant-as-an-API (MaaS) gateway while protecting the ecosystem with a real-time, cross-merchant Trust Graph that detects coordinated multi-merchant fraud rings before money moves.

## Core Value

Enable seamless end-to-end agentic commerce on Razorpay while enforcing network-level fraud ring defense and 100% explainable, bounded transaction auditability.

## Business Context

- **Customer**: Razorpay merchants seeking AI buyer revenue, and autonomous AI agents purchasing goods.
- **Revenue model**: Transaction fee on MaaS volume + premium network fraud defense.
- **Success metric**: Transaction latency < 8s, trust scoring < 500ms, fraud ring precision ≥ 80% & recall ≥ 75% with quantified false-positive cost.
- **Strategy notes**: Built for Razorpay AI Buildathon targeting Track 01 (Agentic Commerce) and Track 02 (AI Risk Manager).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **MaaS Catalog API**: Semantic catalog search (`GET /api/maas/{merchant_id}/catalog`) using Gemini embeddings for natural language queries.
- [ ] **MaaS Transact API**: Autonomous transaction endpoint (`POST /api/maas/{merchant_id}/transact`) accepting buyer fingerprints and intent.
- [ ] **Nexus Orchestrator Agent**: Google ADK agent with Gemini 2.0 Flash executing strict 6-step tool chain (`parse_intent`, `resolve_catalog`, `check_trust_graph`, `create_razorpay_order`, `capture_razorpay_payment`, `log_audit_entry`).
- [ ] **Trust Graph Engine**: Python/FastAPI microservice with NetworkX in-memory graph tracking shared buyer signals across merchants.
- [ ] **Fraud Ring Detection**: Real-time graph clustering & heuristic scoring (0-100) gating transactions (ALLOW ≥ 70, REVIEW 40-69, DENY < 40).
- [ ] **Razorpay Test-Mode Integration**: Orders creation, payment capture, and webhook handler with HMAC-SHA256 signature verification.
- [ ] **Audit Trail**: Immutable append-only transaction logs capturing every tool decision, rationale, latency, and failure reason.
- [ ] **Risk Benchmark Evaluation**: Evaluation pipeline on 500+ synthetic transactions measuring precision, recall, F1, and false-positive cost in ₹.
- [ ] **Merchant Dashboard**: Next.js 14 App Router UI with onboarding wizard, catalog editor, real-time transaction audit viewer, and Cytoscape.js graph visualizer.
- [ ] **Demo Buyer Agent**: Autonomous ADK buyer agent to showcase zero-human-touch browsing and purchasing.

### Out of Scope

- Production multi-region database clustering / Neo4j — in-memory NetworkX rebuilt from PostgreSQL is sufficient for hackathon scope.
- Offensive fraud counter-measures (doxxing, active probing) — strictly defense-only (deny & record signal) per hackathon rules.
- Real card/UPI money movement — strictly Razorpay test-mode credentials.
- Complex multi-currency forex conversion — strictly INR paise rails.

## Context

- Hackathon: Razorpay AI Buildathon (Bangalore).
- Dual track submission: Track 01 (Agentic Commerce) + Track 02 (AI Risk Manager).
- Follows emerging agent protocols (NPCI UAP, ACP, x402).
- Single source of truth detailed in `PRD.md`.

## Constraints

- **Tech Stack**: Next.js 14 (TypeScript/Tailwind), Python (FastAPI, Google ADK, NetworkX), PostgreSQL (pgvector).
- **LLM**: Gemini 2.0 Flash via Google AI Studio (`google-adk`, `google-generativeai`).
- **Payments**: Razorpay test-mode API keys only.
- **Security**: Merchant keys encrypted at rest; buyer PII hashed (SHA-256 / subnet truncations) before graph ingestion.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router for Gateway & UI | Colocates MaaS endpoints with merchant dashboard in unified TypeScript codebase | — Pending |
| Google ADK + Gemini 2.0 Flash | Native tool-calling agent framework with sub-2s latency and built-in REST API server | — Pending |
| In-Memory NetworkX for Trust Graph | High-performance graph traversal and clustering without external graph DB operational overhead | — Pending |
| Amounts in paise (integer) | Avoids floating-point precision errors in financial calculations | — Pending |
| Hard Trust Gate (<40 = DENY) | Prevents calling Razorpay API completely for flagged entities; bounded money action | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-03 after initialization*
