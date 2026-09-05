# Nexus (razorp-nexus)

Nexus is a **dual-layered AI commerce platform** built for Razorpay **test mode**.  
It helps merchants become machine-transactable for AI buyers while adding real-time fraud defense before payment capture.

## Core Value Proposition

Nexus combines growth and risk control in one flow:

1. **Merchant-as-an-API (MaaS) gateway**  
   Exposes merchant catalog + transaction capabilities through agent-friendly API routes.
2. **Cross-merchant Trust Graph**  
   Scores buyer risk across shared graph signals to detect coordinated fraud rings across multiple merchants.

This allows autonomous buyer agents to transact end-to-end while keeping decisions explainable and bounded.

## Dual-Layer Architecture

- **Layer 1 — MaaS Gateway (Next.js API routes)**
  - Agent-facing routes under `/api/maas/[merchant_id]/*`
  - Merchant onboarding, catalog, transactions, and Razorpay webhook handling
- **Layer 2 — Trust Graph Service (FastAPI + NetworkX)**
  - Real-time risk scoring and ring detection
  - Shared signal analysis across merchants before payment capture
- **Agent Orchestration Layer**
  - Python service for deterministic orchestration (Google ADK/Gemini-oriented workflow)
- **Data Layer**
  - PostgreSQL (system of record) + pgvector (semantic retrieval support)

## Intended Tech Stack

- **Frontend/Gateway:** Next.js 14, TypeScript, Tailwind CSS
- **Agent + Services:** Python, FastAPI, Google ADK, NetworkX
- **Data:** PostgreSQL + pgvector
- **Payments:** Razorpay **test mode only**

## Repository Status

This repository includes active implementation across:
- Next.js app and API routes in `src/app`
- Agent service in `nexus-agent/`
- Trust graph microservice in `trust-graph-service/`
- DB schema and container config in `db/`

Some features are still evolving; refer to `PRD.md` and planning docs for deeper design context.

## High-Level Setup / Development

> This is a high-level guide based on the current repository layout and scripts.

### 1) Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for local PostgreSQL/pgvector)

### 2) Install dependencies

```bash
npm install
```

For Python services, install each package in its own directory:

```bash
pip install -e ./nexus-agent
pip install -e ./trust-graph-service
pip install -e ./db/py
```

### 3) Start local database

```bash
docker compose -f db/docker-compose.yml up -d
```

### 4) Run services

- Next.js app:
  ```bash
  npm run dev
  ```
- Agent API service (example):
  ```bash
  uvicorn nexus_agent.api.server:app --host 0.0.0.0 --port 8000
  ```
- Trust Graph service:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port 8001
  ```

### 5) Razorpay mode restriction

Use **Razorpay test-mode keys only** (`rzp_test_*`).  
Live keys are out of scope for this repository.

## Security & Privacy

Nexus is designed around defense-first controls:

- Merchant Razorpay credentials are encrypted at rest (AES-256-GCM design target).
- Buyer PII signals are privacy-reduced before graph ingestion:
  - hashes (SHA-256) for sensitive identifiers
  - subnet truncation for IP-based signals
- Trust decisions are auditable: each transaction path is intended to produce an explainable, bounded decision trail.

## Test-Mode / Demo Disclaimer

This project is for **test-mode/demo and buildathon-style development**.  
It is **not production-ready** for live payment processing without additional work on:

- security hardening,
- compliance/legal controls,
- reliability/operational safeguards,
- formal threat modeling and external review.

---

For detailed product and architecture context, see:
- `PRD.md`
- `CONVENTIONS.md`
- `AGENTS.md`
