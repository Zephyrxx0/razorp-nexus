# Nexus — Product Requirements Document

**Project:** Nexus  
**Buildathon:** Razorpay AI Buildathon  
**Tracks:** Track 01 (AI Growth & Agentic Commerce) + Track 02 (AI Risk Manager)  
**Version:** 1.0  
**Status:** Draft  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Goals & Success Metrics](#4-goals--success-metrics)
5. [Buildathon Track Alignment](#5-buildathon-track-alignment)
6. [System Architecture](#6-system-architecture)
7. [Tech Stack](#7-tech-stack)
8. [Component Deep-Dives](#8-component-deep-dives)
9. [Agent Architecture — Google ADK](#9-agent-architecture--google-adk)
10. [Data Models](#10-data-models)
11. [API Specifications](#11-api-specifications)
12. [Trust Graph Engine](#12-trust-graph-engine)
13. [User Flows](#13-user-flows)
14. [Error Handling & Failure Modes](#14-error-handling--failure-modes)
15. [Security Considerations](#15-security-considerations)
16. [Demo Plan](#16-demo-plan)
17. [Project Structure](#17-project-structure)
18. [Environment Setup](#18-environment-setup)

---

## 1. Executive Summary

Nexus is a dual-layered AI commerce platform built on Razorpay's test-mode APIs. It solves two adjacent, critical problems in the emerging world of agentic commerce:

**Layer 1 — Merchant-as-an-API (MaaS):** Today, merchants are reachable only by humans who can navigate a UI. As AI buyer agents become mainstream (via protocols like ACP, x402, NPCI's UAP), merchants who can't expose themselves as machine-readable, transactable APIs will be invisible to this wave of automated buyers. Nexus gives any Razorpay merchant an agent-readable product catalog and a single POST endpoint through which an AI agent can discover products, get a price, verify stock, and complete a payment — with no human in the loop.

**Layer 2 — Cross-Merchant Trust Graph:** AI-driven commerce at scale removes the friction that naturally slows human fraud. An AI buyer can attempt thousands of transactions per minute, coordinated rings can hit dozens of merchants simultaneously, and no individual merchant has the network-level visibility to see the pattern. Nexus builds a shared, cross-merchant trust graph from signals across every transaction — device fingerprints, IP subnets, UPI handles, email patterns — and runs graph-based ring detection to score and gate every incoming buyer before any money moves.

Together, these two layers form one coherent product: Nexus enables merchants to sell to AI buyers, and ensures every AI buyer is trustworthy before the sale happens.

---

## 2. Problem Statement

### 2.1 The Agent Commerce Gap

The global payments infrastructure was designed for human buyers. Every checkout flow assumes a person: a UI to click through, a browser to render, a human to enter OTPs. As AI agents become capable of autonomous purchasing — already live in pilots via NPCI's Unified Agentic Payments, Visa's Intelligent Commerce, and experimental x402 implementations — merchants face an existential discoverability problem.

An AI shopping agent cannot:
- Scrape a product page reliably
- Navigate a checkout UI
- Enter a dynamic OTP
- Interpret ambiguous stock availability language

Without a structured, agent-readable interface, the merchant is simply unreachable to AI buyers — regardless of how good their product is. Razorpay merchants, who are already integrated with a payment gateway, are perfectly positioned to become AI-transactable with minimal additional work. Nexus is the bridge.

### 2.2 The Trust Vacuum in AI Commerce

When a human buyer commits fraud, they are limited by human bandwidth — one transaction at a time, one merchant at a time. An AI-enabled fraud ring has no such limit. The same ring can simultaneously probe dozens of merchants, test hundreds of card combinations, and execute coordinated chargeback attacks in minutes.

The core problem is **information asymmetry**: each individual Razorpay merchant sees only their own transaction data. A fraud ring that hits 20 merchants with 5 transactions each looks like noise on each merchant's dashboard. At the network level, it's a screaming signal. No individual merchant can build this view. Only a platform that sits across all merchants — like Razorpay — can.

Nexus builds this network-level trust graph and makes it the gatekeeper for every agentic commerce transaction. Every buy attempt is scored against shared cross-merchant signals before a single rupee moves.

### 2.3 Why Now

- **NPCI UAP** is live in pilots, making agent-to-agent payments a near-term reality in India.
- **Razorpay in-app pilots** are already running, validating the merchant appetite.
- **AI-enabled fraud** is hitting Indian BFSI hard, and the tools to fight it at network scale don't exist for SMB merchants.
- **The x402 / ACP protocol race** means whoever sets the standard for agent-readable commerce wins the infrastructure layer.

---

## 3. Solution Overview

Nexus has four integrated components:

| Component | What It Does |
|---|---|
| **MaaS Gateway** | Exposes each merchant as an agent-readable API: catalog query + payment execution |
| **Nexus Orchestrator Agent** | Google ADK agent that processes incoming commerce intents, coordinates tools, and executes the full transaction loop |
| **Trust Graph Engine** | NetworkX-based cross-merchant graph that detects fraud rings and scores buyers in real time |
| **Merchant Dashboard** | Next.js interface for merchant onboarding, catalog management, transaction monitoring, and fraud ring visualization |

The transaction flow is linear and fully audited:

```
AI Buyer Agent
    → POST /api/maas/{merchant_id}/transact
    → Nexus Orchestrator (ADK + Gemini) parses intent
    → Catalog Resolver matches product
    → Trust Graph Engine scores buyer fingerprint
    → If score ≥ 70: Razorpay order created → payment captured → receipt returned
    → If score < 40: transaction denied, reason returned, signal fed back to graph
    → Every step logged to immutable audit trail
```

Every rupee that moves is traceable. Every decision is explainable. Every failure is handled gracefully with a structured error and a logged reason.

---

## 4. Goals & Success Metrics

### 4.1 Primary Goals

**G1 — Merchant AI-Transactability**
Any Razorpay test-mode merchant can be made transactable by an AI buyer within 5 minutes of onboarding to Nexus, with no code changes on the merchant's side.

**G2 — End-to-End Agentic Transaction**
An AI buyer agent (running via Google ADK) can discover a product catalog, select a product, verify stock, complete a Razorpay payment, and receive a structured receipt — entirely without human intervention.

**G3 — Network-Level Fraud Detection**
The cross-merchant trust graph can detect a coordinated fraud ring across ≥3 merchants and block subsequent transaction attempts from ring members with measured precision and recall on a held-out synthetic test set.

**G4 — Full Audit Trail**
Every transaction — successful or blocked — produces a complete, human-readable audit trail recording every decision step with timestamps, inputs, outputs, and reasons.

### 4.2 Success Metrics

| Metric | Target |
|---|---|
| Merchant onboarding time | < 5 minutes |
| Agentic transaction end-to-end latency | < 8 seconds |
| Trust scoring latency | < 500ms |
| Fraud ring detection precision | ≥ 80% on held-out test set |
| Fraud ring detection recall | ≥ 75% on held-out test set |
| False-positive rate (legit buyers blocked) | < 5% |
| Audit trail completeness | 100% of transactions have full step log |
| Graceful failure coverage | 100% of error conditions return structured response |

---

## 5. Buildathon Track Alignment

### 5.1 Track 01 — AI Growth & Agentic Commerce

**The brief:** "Build an agent that grows revenue for a merchant on Razorpay test-mode APIs, or that makes a merchant transactable by an AI buyer end to end."

**How Nexus satisfies this:**
- Merchants are made transactable end-to-end: catalog discoverable, stock verifiable, payment executable — all via a single structured API that any AI agent can call.
- The Nexus Orchestrator Agent (built on Google ADK + Gemini) IS the AI agent that executes the commerce loop.
- Razorpay test-mode APIs are used throughout: Orders, Payments, Customers, Webhooks.
- Every money action is bounded (trust-gated), explainable (audit trail on every step), and graceful in failure (structured error responses).

**The bar check:** "Every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully."

✅ Explainable: Every step logged with reason, score, and decision rationale.  
✅ Bounded: Trust score gate before any Razorpay API call.  
✅ Gated: DENY path returns structured error, no order is ever created for a denied buyer.  
✅ Audit trail: Visible in dashboard per transaction, downloadable as JSON.  
✅ Failure handled gracefully: DENY scenario demonstrated in demo with full error response.

### 5.2 Track 02 — AI Risk Manager

**The brief:** "Build a working detector, verifier or auto-responder for one class of loss, with measured precision and recall on a held-out test set."

**How Nexus satisfies this:**
- One class of loss: coordinated multi-merchant fraud rings.
- The Trust Graph Engine detects, scores, and blocks ring members in real time.
- A synthetic dataset of 500+ transactions (mix of legitimate and ring-coordinated fraud) is used as the held-out test set.
- Metrics: precision, recall, F1, and false-positive cost are computed and displayed.

**The bar check:** "Honest metrics including false-positive cost. Strictly defense-only: anything offense-capable is disqualified."

✅ Honest metrics: Precision, recall, F1, and false-positive cost shown on the test set.  
✅ False-positive cost: Each blocked legitimate transaction costs the merchant the sale — quantified in ₹ on the dashboard.  
✅ Defense-only: The Trust Graph only blocks/flags. It never takes action against a buyer beyond denying the transaction. No contact, no blacklisting beyond Nexus, no shared PII.

---

## 6. System Architecture

### 6.1 Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                             │
│  Next.js 14 (App Router) — Merchant Dashboard                  │
│  TypeScript · Tailwind CSS · Recharts · Cytoscape.js           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST/JSON
┌───────────────────────────▼─────────────────────────────────────┐
│  API GATEWAY LAYER                                              │
│  Next.js API Routes (Route Handlers)                            │
│  /api/merchant  /api/maas  /api/webhooks/razorpay              │
└────────┬──────────────────────────┬────────────────────────────┘
         │                          │
┌────────▼────────┐    ┌────────────▼──────────────────────────────┐
│  TRUST GRAPH    │    │  AGENT ORCHESTRATION LAYER                 │
│  SERVICE        │    │  Google ADK + Gemini 2.0 Flash             │
│  Python/FastAPI │◄───┤  NexusOrchestratorAgent                   │
│  NetworkX       │    │  Tools: catalog, trust, razorpay, audit    │
│  Port 8001      │    │  Port 8000 (adk api_server)               │
└────────┬────────┘    └───────────────────┬───────────────────────┘
         │                                 │
┌────────▼─────────────────────────────────▼───────────────────────┐
│  DATA LAYER                                                       │
│  PostgreSQL (merchants, products, transactions, audit_entries)    │
│  In-memory NetworkX graph (trust graph, rebuilt on startup)       │
│  Razorpay Test-Mode APIs (external)                              │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Request Flow — Happy Path

```
1.  AI Buyer Agent sends:
    POST /api/maas/{merchant_id}/transact
    { "intent": "Buy 2 Wireless Headphones for agent@nexus.ai", "buyer": {...} }

2.  Next.js Route Handler validates merchant token, proxies to ADK agent server.

3.  NexusOrchestratorAgent (Gemini) receives the request and begins tool chain:

    a. Tool: parse_intent()
       Input:  raw intent string + buyer object
       Output: { product_query: "Wireless Headphones", quantity: 2, buyer_email: "..." }

    b. Tool: resolve_catalog()
       Input:  merchant_id + product_query + quantity
       Output: { product_id, name, price, stock_available, stock_after }
       Fails if: stock < quantity → graceful StockError

    c. Tool: check_trust_graph()
       Input:  buyer fingerprint (email hash, IP subnet, device hash, upi handle)
       Output: { score: 87, decision: "ALLOW", risk_factors: [], graph_metrics: {...} }
       Short-circuits to DENY if score < 40 → graceful TrustDeniedError

    d. Tool: create_razorpay_order()
       Input:  amount (paise), currency, receipt, notes (includes trust score, nexus txn id)
       Output: { order_id, amount, status: "created" }

    e. Tool: capture_razorpay_payment()   [test mode: auto-capture]
       Input:  order_id
       Output: { payment_id, status: "captured", amount }

    f. Tool: log_audit_entry()
       Input:  transaction_id + full step log
       Output: { audit_id, entries_written: 6 }

4.  NexusOrchestratorAgent composes final response and returns to Next.js.

5.  Next.js returns structured JSON receipt to AI Buyer Agent.

6.  Razorpay webhook fires (payment.captured) → Next.js webhook handler 
    updates transaction status in DB and feeds signal to Trust Graph.
```

### 6.3 Request Flow — Denied Path (Fraud)

```
1.  Fraudulent AI Buyer Agent sends POST /api/maas/{merchant_id}/transact

2.  NexusOrchestratorAgent runs parse_intent() and resolve_catalog() normally.

3.  check_trust_graph() returns { score: 22, decision: "DENY",
    risk_factors: ["known_fraud_neighbor_1hop", "cross_merchant_velocity"] }

4.  Agent short-circuits: skips Razorpay API calls entirely.

5.  log_audit_entry() logs the DENY with full reason.

6.  Trust Graph ingests the attempt as a new signal (strengthens ring edges).

7.  Response returned:
    HTTP 403
    {
      "status": "DENIED",
      "trust_score": 22,
      "reason": "Buyer fingerprint is associated with a known fraud ring",
      "transaction_id": "txn_xxx",
      "audit_trail": [...]
    }
```

---

## 7. Tech Stack

### 7.1 Frontend — Next.js 14

**Why Next.js:** Server components and route handlers in a single repo means the MaaS API endpoints and the merchant dashboard live together. App Router enables fine-grained streaming and loading states ideal for showing live agent activity. API routes handle Razorpay webhooks natively.

| Package | Version | Purpose |
|---|---|---|
| `next` | 14.x | Framework, App Router, API Routes |
| `typescript` | 5.x | Type safety across all components |
| `tailwindcss` | 3.x | Utility-first styling |
| `cytoscape` | 3.x | Trust graph visualization (force-directed graph) |
| `recharts` | 2.x | Transaction metrics charts |
| `@radix-ui/react-*` | latest | Accessible UI primitives |
| `swr` | 2.x | Data fetching with real-time revalidation |
| `razorpay` | 2.x | Razorpay Node.js SDK |
| `crypto` (built-in) | — | Webhook signature verification |
| `pg` | 8.x | PostgreSQL client |

### 7.2 Agent Layer — Google ADK + Gemini

**Why Google ADK:** ADK (Agent Development Kit) is Google's first-party framework for building multi-agent systems with Gemini. It provides a clean tool-calling abstraction, session management, multi-turn support, and a built-in `adk api_server` command that exposes the agent as a REST API — directly consumable by the Next.js backend with no extra glue code.

**Why Gemini 2.0 Flash:** Speed. At a hackathon demo, latency is visible. Gemini 2.0 Flash delivers sub-2-second tool-calling cycles while remaining capable enough for intent parsing and multi-step orchestration. Falls back to Gemini 1.5 Pro for complex intent disambiguation.

| Package | Version | Purpose |
|---|---|---|
| `google-adk` | latest | Agent framework, tool calling, session management |
| `google-generativeai` | latest | Gemini API client (AI Studio key) |
| `fastapi` | 0.110+ | Trust Graph service HTTP server |
| `uvicorn` | 0.27+ | ASGI server for FastAPI |
| `razorpay` (Python) | 1.3+ | Razorpay Python SDK |
| `networkx` | 3.2+ | In-memory graph for trust engine |
| `numpy` | 1.26+ | Numerical operations for scoring |
| `python-dotenv` | 1.0+ | Environment variable management |
| `pydantic` | 2.x | Data validation for all API models |
| `asyncpg` | 0.29+ | Async PostgreSQL driver |
| `httpx` | 0.26+ | Async HTTP client for inter-service calls |
| `pytest` | 7.x | Test suite for trust graph and agent tools |

### 7.3 Database

**PostgreSQL** for all persistent data: merchants, products, transactions, audit entries. Chosen for relational integrity between merchants → products → transactions → audit entries, and for easy local development (Docker Compose).

The NetworkX trust graph is kept **in-memory** and rebuilt from the transactions table on service startup. This is acceptable for a hackathon and makes the architecture simpler — no graph DB dependency. Production would use Neo4j or Amazon Neptune.

### 7.4 Infrastructure (Local Dev / Demo)

```
Docker Compose services:
  postgres       → localhost:5432
  nexus-agent    → localhost:8000  (ADK api_server)
  trust-graph    → localhost:8001  (FastAPI)
  nextjs-app     → localhost:3000
```

---

## 8. Component Deep-Dives

### 8.1 MaaS Gateway

The MaaS Gateway is the public-facing surface of Nexus. It turns each merchant into a transactable API endpoint. It has two sub-endpoints per merchant:

#### 8.1.1 Catalog Query Endpoint

```
GET /api/maas/{merchant_id}/catalog
```

This endpoint is designed to be called by an AI buyer agent that wants to browse a merchant's inventory. It accepts natural language queries and returns structured product data.

**Why natural language query:** An AI agent doesn't know a merchant's internal SKU taxonomy. It knows what its user wants ("something under ₹2000 for wireless audio"). The endpoint uses Gemini embeddings to semantically match the query against the product catalog and returns ranked results with all the fields an agent needs to make a purchase decision.

**Response fields explained:**

- `id` — The product identifier the agent must pass back when initiating a purchase. Prevents the agent from hallucinating a product name.
- `name`, `description` — Agent uses these to confirm the product matches the user's intent.
- `price` — In paise (smallest unit). Eliminates currency ambiguity.
- `currency` — Always "INR" for Razorpay test mode.
- `stock` — Agent checks this before committing to a quantity. Prevents creating an order for out-of-stock items.
- `agent_purchase_url` — Self-referential URL the agent can POST to immediately. No URL construction required.
- `metadata` — Category, tags, and any merchant-defined fields that help the agent make decisions.

#### 8.1.2 Transaction Endpoint

```
POST /api/maas/{merchant_id}/transact
```

This is the single endpoint through which an AI buyer completes a purchase. It accepts a natural language intent and a buyer fingerprint, and returns either a payment receipt or a structured denial.

**Why natural language intent instead of structured fields:** Structured fields require the AI buyer agent to know Nexus's schema upfront. Natural language intent means any AI agent — regardless of what framework it's built on — can call Nexus with minimal integration effort. The Nexus Orchestrator Agent handles the parsing.

**The `buyer` object explained:**

Every field in the buyer fingerprint is optional individually, but the more fields provided, the more accurate the trust score. Here is what each field is used for:

- `email` — Hashed with SHA-256 before storage and graph insertion. Used to detect shared email domains in fraud rings (e.g., 50 different emails from `@tempmail.xyz`). Never stored in plaintext.
- `ip` — Only the first three octets are stored (e.g., `103.21.44` from `103.21.44.132`). Sufficient for subnet-level clustering without precise geolocation.
- `device_id` — Optional. A hash the buyer agent may provide (e.g., from browser fingerprinting if the agent has browser context). The single highest-signal field for ring detection.
- `upi_handle` — Optional. The UPI VPA if the buyer is paying via UPI. Used for handle-level risk scoring (certain handle patterns correlate with fraud).
- `user_agent` — The HTTP user-agent of the calling agent. Hashed and used to detect coordinated bot patterns.

### 8.2 Nexus Orchestrator Agent (Google ADK)

The Orchestrator Agent is the brain of Nexus. It is a Google ADK agent powered by Gemini 2.0 Flash. It receives every incoming MaaS transaction request and executes a deterministic tool chain to complete or deny the transaction.

The agent is not used for open-ended reasoning. Its job is orchestration: call tools in sequence, handle tool errors gracefully, compose the final response. Gemini's role is primarily intent parsing (converting natural language to structured data) and error narration (explaining why a transaction failed in plain language for the audit trail).

Full detail on the agent is in Section 9.

### 8.3 Trust Graph Engine

A standalone Python/FastAPI microservice that maintains the cross-merchant trust graph in memory using NetworkX. It exposes two endpoints: one for scoring a buyer fingerprint, and one for ingesting a new transaction signal.

Every completed or attempted transaction (successful or denied) feeds back into the graph. This means the graph gets richer with every interaction. A buyer who has never transacted scores 90 (slight new-entity penalty). A buyer whose email domain appears across 15 merchants in 10 minutes scores 12.

Full detail on the graph structure and ring detection algorithm is in Section 12.

### 8.4 Merchant Dashboard (Next.js)

The dashboard is the merchant-facing surface of Nexus. It has four pages:

**Onboarding Page (`/dashboard/onboard`)**
Step-by-step wizard: connect Razorpay test credentials → input catalog (form or CSV upload) → receive MaaS endpoint URL and token. The endpoint URL is ready to be shared with any AI buyer agent immediately. No code required from the merchant.

**Catalog Page (`/dashboard/catalog`)**
Live view of all products with stock levels. Merchants can edit prices, add/remove products, and see which products have been purchased by AI buyers. Each product shows an "AI-purchasable" badge confirming it's exposed via MaaS.

**Transactions Page (`/dashboard/transactions`)**
Live feed of all AI-initiated transactions with status (SUCCESS / DENIED / PENDING), amount, trust score, and a link to the full audit trail. Clicking any transaction expands the complete step-by-step audit timeline: each tool call the Orchestrator Agent made, what it decided, and why.

**Trust Graph Page (`/dashboard/trust-graph`)**
Cytoscape.js force-directed graph visualization of all buyer nodes and edges. Fraud rings appear as tightly clustered subgraphs. Nodes color-code by trust score (green → yellow → red). Clicking a node shows all transactions associated with that entity. This is the primary demo moment for Track 02.

---

## 9. Agent Architecture — Google ADK

### 9.1 NexusOrchestratorAgent

The primary agent. Runs via `adk api_server` on port 8000. Accepts POST requests from the Next.js API layer.

```python
# agents/orchestrator.py

from google.adk.agents import Agent
from google.adk.tools import FunctionTool
from tools.catalog import resolve_catalog
from tools.trust import check_trust_graph
from tools.razorpay import create_razorpay_order, capture_razorpay_payment
from tools.audit import log_audit_entry
from tools.intent import parse_intent

ORCHESTRATOR_INSTRUCTION = """
You are the Nexus Commerce Orchestrator — an AI agent managing secure 
agentic commerce on behalf of Razorpay merchants.

When you receive a transaction request, you must execute these steps 
in STRICT ORDER. Do not skip steps. Do not reorder steps.

STEP 1 — parse_intent:
  Parse the natural language intent string into a structured order object.
  Extract: product_query (string), quantity (int), buyer_email (string).
  If intent is ambiguous, extract the most specific interpretation.

STEP 2 — resolve_catalog:
  Match the product_query against the merchant's catalog using the
  merchant_id. Return the exact product_id, current price (in paise),
  and confirm stock availability for the requested quantity.
  If stock is insufficient, stop here and return a StockError.

STEP 3 — check_trust_graph:
  Send the buyer fingerprint to the Trust Graph Engine.
  If score >= 70: proceed.
  If 40 <= score < 70: proceed but flag as REVIEW.
  If score < 40: stop here. Do NOT call any Razorpay APIs.
  Return a TrustDeniedError with the score and risk factors.

STEP 4 — create_razorpay_order:
  Create a Razorpay order with the amount (price × quantity, in paise).
  Include in the order notes: nexus_transaction_id, trust_score, product_id.
  Return the razorpay_order_id.

STEP 5 — capture_razorpay_payment:
  In test mode, capture the payment against the order.
  Return razorpay_payment_id and confirmed amount.

STEP 6 — log_audit_entry:
  Log all steps taken, decisions made, trust score, and Razorpay IDs.
  This step must always run — even on error paths.
  The audit log is immutable.

CRITICAL RULES:
- Never call create_razorpay_order if trust score < 40.
- Never call capture_razorpay_payment without a valid order_id.
- Always call log_audit_entry as the final step, on ALL paths.
- Every reason for a decision must be written in plain English in the audit log.
- If any tool returns an error, handle it gracefully, log it, and return 
  a structured error response. Do not propagate raw exceptions.
"""

nexus_orchestrator = Agent(
    name="NexusOrchestratorAgent",
    model="gemini-2.0-flash-exp",
    description=(
        "Orchestrates AI buyer commerce transactions for Razorpay merchants. "
        "Parses intents, resolves catalogs, gates on trust scores, and executes "
        "Razorpay payments with full audit logging."
    ),
    instruction=ORCHESTRATOR_INSTRUCTION,
    tools=[
        FunctionTool(parse_intent),
        FunctionTool(resolve_catalog),
        FunctionTool(check_trust_graph),
        FunctionTool(create_razorpay_order),
        FunctionTool(capture_razorpay_payment),
        FunctionTool(log_audit_entry),
    ],
)
```

### 9.2 DemoBuyerAgent

A second ADK agent used exclusively for the demo. It simulates an AI shopping agent that has been told "buy the cheapest wireless headphones from merchant XYZ." This agent uses the MaaS catalog endpoint to discover products and then calls the MaaS transaction endpoint to purchase. It demonstrates the full end-to-end without any human clicking.

```python
# agents/demo_buyer.py

from google.adk.agents import Agent
from google.adk.tools import FunctionTool
from tools.maas_client import query_merchant_catalog, transact_with_merchant

BUYER_INSTRUCTION = """
You are a demo AI shopping agent. Your goal is to purchase a product
from a merchant using the Nexus MaaS API.

When given a merchant_id and a shopping goal:
1. Call query_merchant_catalog to see what products the merchant offers.
2. Select the product that best matches the shopping goal.
3. Call transact_with_merchant to complete the purchase.
4. Report the outcome: receipt on success, reason on failure.

You are shopping on behalf of a user. Make sensible purchase decisions.
"""

demo_buyer = Agent(
    name="DemoBuyerAgent",
    model="gemini-2.0-flash-exp",
    description="Simulates an AI buyer agent that shops via the Nexus MaaS API.",
    instruction=BUYER_INSTRUCTION,
    tools=[
        FunctionTool(query_merchant_catalog),
        FunctionTool(transact_with_merchant),
    ],
)
```

### 9.3 ADK Tool Definitions

Each tool is a Python function with a typed signature and a docstring. ADK automatically generates the tool schema from the type annotations. Gemini uses the docstring to decide when and how to call each tool.

#### parse_intent

```python
# tools/intent.py

def parse_intent(
    intent_string: str,
    buyer_email: str,
    merchant_id: str
) -> dict:
    """
    Parse a natural language commerce intent into a structured order request.
    
    Extracts the product being requested, the quantity desired, and confirms
    the buyer's identity. Returns a structured dict with product_query (the
    canonical product name to search for), quantity (integer units), and
    buyer_email (confirmed from input).
    
    Args:
        intent_string: Natural language intent, e.g. "Buy 2 wireless headphones"
        buyer_email: Email address of the buyer agent
        merchant_id: The merchant's Nexus ID (used for context)
    
    Returns:
        dict with keys: product_query, quantity, buyer_email, confidence
    """
    # Implementation: uses Gemini to extract structured fields from intent
    # Falls back to regex for simple "buy N [product]" patterns
    ...
```

#### resolve_catalog

```python
# tools/catalog.py

def resolve_catalog(
    merchant_id: str,
    product_query: str,
    quantity: int
) -> dict:
    """
    Search a merchant's product catalog for the best match to a query.
    
    Uses semantic similarity (Gemini embeddings cached at onboarding time)
    to find the closest product. Validates that the requested quantity is
    available in stock. Returns product details including exact price in paise.
    
    Raises StockError if quantity exceeds available stock.
    Raises ProductNotFoundError if no product matches the query.
    
    Args:
        merchant_id: Nexus merchant identifier
        product_query: Canonical product name from parse_intent
        quantity: Number of units requested
    
    Returns:
        dict with keys: product_id, name, price_per_unit_paise,
                        total_amount_paise, stock_before, stock_after,
                        match_confidence
    """
    ...
```

#### check_trust_graph

```python
# tools/trust.py

def check_trust_graph(
    email_hash: str,
    ip_subnet: str,
    device_hash: str | None,
    upi_handle: str | None,
    user_agent_hash: str,
    merchant_id: str
) -> dict:
    """
    Score a buyer fingerprint against the cross-merchant trust graph.
    
    Sends the buyer's fingerprint signals to the Trust Graph service.
    Returns a score from 0-100 and a decision of ALLOW, REVIEW, or DENY.
    Also returns the risk factors that influenced the score (for audit logging)
    and graph metrics (node count, hop distances to known fraud nodes).
    
    This tool never raises an exception. If the Trust Graph service is
    unavailable, it returns a default score of 50 (REVIEW) and logs
    the service failure as a risk factor.
    
    Args:
        email_hash: SHA-256 hash of buyer email
        ip_subnet: First three octets of buyer IP
        device_hash: Optional device fingerprint hash
        upi_handle: Optional UPI VPA (e.g. "buyer@upi")
        user_agent_hash: SHA-256 hash of HTTP user-agent
        merchant_id: Current merchant (used to track cross-merchant signals)
    
    Returns:
        dict with keys: score (0-100), decision (ALLOW/REVIEW/DENY),
                        risk_factors (list of strings), graph_metrics (dict)
    """
    ...
```

#### create_razorpay_order

```python
# tools/razorpay.py

def create_razorpay_order(
    amount_paise: int,
    currency: str,
    merchant_id: str,
    nexus_transaction_id: str,
    trust_score: int,
    product_id: str,
    quantity: int
) -> dict:
    """
    Create a Razorpay order using the merchant's test-mode API credentials.
    
    Uses the merchant's Razorpay key_id and key_secret (retrieved from DB
    by merchant_id). Attaches Nexus metadata (transaction ID, trust score)
    to the order notes for traceability in the Razorpay dashboard.
    
    IMPORTANT: This tool must NEVER be called if trust score < 40.
    The orchestrator agent instruction enforces this, but the tool also
    validates the trust_score parameter and raises TrustViolationError
    if it detects a score below 40 (defense-in-depth).
    
    Args:
        amount_paise: Total amount in paise (e.g. 399800 for ₹3998)
        currency: Always "INR" for this implementation
        merchant_id: Used to look up Razorpay credentials
        nexus_transaction_id: For cross-referencing in audit trail
        trust_score: Buyer trust score (must be >= 40)
        product_id: Product being purchased
        quantity: Units being purchased
    
    Returns:
        dict with keys: order_id, amount, currency, status, receipt
    
    Raises:
        TrustViolationError: If trust_score < 40 (defense-in-depth check)
        RazorpayError: If Razorpay API returns an error
    """
    ...
```

#### capture_razorpay_payment

```python
def capture_razorpay_payment(
    order_id: str,
    amount_paise: int,
    merchant_id: str,
    nexus_transaction_id: str
) -> dict:
    """
    Capture a Razorpay payment against an existing order (test mode).
    
    In Razorpay test mode, payment capture is simulated. This tool calls
    the Razorpay Payments capture API, which immediately transitions the
    payment from "authorized" to "captured" state.
    
    Args:
        order_id: Razorpay order ID from create_razorpay_order
        amount_paise: Amount to capture (must match order amount)
        merchant_id: For credential lookup
        nexus_transaction_id: For audit trail cross-reference
    
    Returns:
        dict with keys: payment_id, order_id, amount, status,
                        captured_at (ISO timestamp)
    """
    ...
```

#### log_audit_entry

```python
# tools/audit.py

def log_audit_entry(
    nexus_transaction_id: str,
    steps: list[dict],
    final_status: str,
    final_reason: str
) -> dict:
    """
    Write a complete audit trail for a transaction to the database.
    
    This tool is ALWAYS called as the final step of every transaction,
    regardless of outcome. It writes one audit entry per step with:
    - step_name: The tool or decision point name
    - timestamp: ISO 8601 with millisecond precision
    - input_summary: What data was fed into this step
    - output_summary: What the step returned or decided
    - reason: Plain English explanation of the decision
    
    The audit log is append-only. Existing entries cannot be modified.
    
    Args:
        nexus_transaction_id: The transaction to attach entries to
        steps: List of step dicts, each with step_name, timestamp,
               input_summary, output_summary, reason
        final_status: SUCCESS, DENIED, FAILED, or PARTIAL
        final_reason: Plain English summary of the overall outcome
    
    Returns:
        dict with keys: audit_id, entries_written, transaction_id
    """
    ...
```

### 9.4 Running the Agent (CLI)

```bash
# Install ADK
pip install google-adk

# Set API key (Google AI Studio)
export GOOGLE_API_KEY=your_key_here

# Run orchestrator as API server (for Next.js to call)
adk api_server agents/orchestrator.py --port 8000

# Run demo buyer agent interactively (for testing)
adk run agents/demo_buyer.py

# Run with web UI (useful during development)
adk web agents/orchestrator.py --port 8080
```

The `adk api_server` command exposes the agent at:
```
POST http://localhost:8000/run
Content-Type: application/json

{
  "app_name": "NexusOrchestratorAgent",
  "user_id": "merchant_xyz",
  "session_id": "sess_abc",
  "new_message": {
    "role": "user",
    "parts": [{"text": "...transaction request JSON..."}]
  }
}
```

---

## 10. Data Models

### 10.1 Merchant

```typescript
interface Merchant {
  id: string;                    // UUID, primary key
  name: string;                  // Display name (e.g. "TechZone Electronics")
  email: string;                 // Merchant's contact email
  razorpay_key_id: string;       // Test-mode key ID (rzp_test_xxx)
  razorpay_key_secret: string;   // Encrypted at rest in DB
  razorpay_webhook_secret: string; // For webhook signature verification
  maas_token: string;            // Bearer token for MaaS endpoint auth
                                 // Generated on onboarding, SHA-256 hashed in DB
  maas_endpoint: string;         // Full URL: /api/maas/{id}/transact
  is_active: boolean;            // Soft delete flag
  created_at: string;            // ISO 8601 timestamp
  updated_at: string;
}
```

**Why `razorpay_key_secret` encrypted:** Even in test mode, we treat secrets as secrets. The secret is encrypted with AES-256 using a server-side key from the environment. It is decrypted only at the moment a Razorpay API call is made and never returned in any API response.

**Why separate `maas_token`:** The MaaS endpoint is public-facing (any AI agent can call it). Authentication via Bearer token prevents random callers from exhausting the merchant's Razorpay API rate limits or creating test orders without authorization. The token is generated once at onboarding and can be rotated.

### 10.2 Product

```typescript
interface Product {
  id: string;                    // UUID
  merchant_id: string;           // FK → Merchant.id
  name: string;                  // e.g. "Sony WH-1000XM5 Wireless Headphones"
  description: string;           // Full description. Used for semantic matching.
  price_paise: number;           // Price in paise (₹1999 = 199900 paise)
                                 // Why paise: eliminates float precision errors
                                 // in financial calculations
  currency: string;              // Always "INR" in this implementation
  stock: number;                 // Current available units (integer, not float)
  category: string;              // e.g. "electronics", "fashion", "food"
  tags: string[];                // Searchable tags, e.g. ["wireless", "audio", "sony"]
  embedding: number[];           // Gemini text-embedding-004 vector (768 dims)
                                 // Stored as PostgreSQL vector (pgvector extension)
                                 // Used for semantic catalog search
  is_active: boolean;            // Whether product is exposed via MaaS
  created_at: string;
  updated_at: string;
}
```

**Why store embeddings:** At query time, when an AI buyer asks for "wireless headphones under ₹2000," we compute the embedding of that query and find the nearest product embedding using cosine similarity. This is faster and more accurate than keyword matching. Embeddings are computed once at product creation using the Gemini Embeddings API.

### 10.3 Transaction

```typescript
interface Transaction {
  id: string;                    // UUID, also serves as nexus_transaction_id
  merchant_id: string;           // FK → Merchant.id
  
  // Intent
  intent_raw: string;            // Original natural language intent from buyer
  intent_parsed: {               // Output of parse_intent tool
    product_query: string;
    quantity: number;
    buyer_email: string;
    confidence: number;          // 0-1, how confident the parser was
  };
  
  // Product resolution
  product_id: string | null;     // FK → Product.id, null if resolution failed
  quantity: number;
  amount_paise: number;          // Total amount (price × quantity)
  
  // Buyer fingerprint (all hashed/anonymized)
  buyer_fingerprint: {
    email_hash: string;          // SHA-256 of email
    ip_subnet: string;           // First 3 octets only
    device_hash: string | null;
    upi_handle: string | null;   // Stored as-is (not sensitive)
    user_agent_hash: string;
  };
  
  // Trust
  trust_score: number;           // 0-100
  trust_decision: 'ALLOW' | 'REVIEW' | 'DENY';
  trust_risk_factors: string[];  // e.g. ["cross_merchant_velocity", "known_fraud_neighbor_1hop"]
  
  // Razorpay
  razorpay_order_id: string | null;   // null if trust-denied before order creation
  razorpay_payment_id: string | null; // null if capture failed or was never attempted
  
  // Outcome
  status: 'PENDING' | 'SUCCESS' | 'DENIED' | 'FAILED' | 'PARTIAL';
  // PENDING: created, not yet resolved
  // SUCCESS: payment captured
  // DENIED: trust score < 40, no Razorpay calls made
  // FAILED: trust passed but Razorpay call failed
  // PARTIAL: order created but payment capture failed
  
  failure_reason: string | null; // Plain English. Always set if status != SUCCESS.
  
  created_at: string;
  resolved_at: string | null;    // When final status was set
}
```

### 10.4 AuditEntry

```typescript
interface AuditEntry {
  id: string;                    // UUID
  transaction_id: string;        // FK → Transaction.id
  step_name: string;             // e.g. "INTENT_RECEIVED", "CATALOG_RESOLVED",
                                 //      "TRUST_CHECKED", "ORDER_CREATED",
                                 //      "PAYMENT_CAPTURED", "DENIED", "FAILED"
  step_number: number;           // 1-based sequence within transaction
  timestamp: string;             // ISO 8601 with milliseconds
  duration_ms: number;           // How long this step took
  input_summary: string;         // Human-readable summary of inputs
  output_summary: string;        // Human-readable summary of outputs or decision
  reason: string;                // Plain English explanation
  raw_data: object;              // Full JSON of inputs/outputs for debugging
  is_error: boolean;             // Whether this step encountered an error
}
```

**Why `raw_data` alongside summaries:** The summaries are for the dashboard UI — short enough to display in a table. `raw_data` is for debugging and compliance — contains the full payload of each tool call and response, queryable as PostgreSQL JSONB.

**Why append-only:** The audit trail's value is in its trustworthiness. If audit entries could be edited after the fact, the trail becomes meaningless. The DB schema enforces no UPDATE/DELETE on the `audit_entries` table via a trigger.

### 10.5 TrustGraphNode (in-memory, not DB)

```python
@dataclass
class TrustGraphNode:
    id: str                    # SHA-256 of (signal_type + signal_value)
    signal_type: str           # "email_hash" | "ip_subnet" | "device_hash" 
                               #   | "upi_handle" | "user_agent_hash"
    signal_value: str          # The hashed/anonymized value
    
    # Derived from graph topology
    trust_score: float         # 0-100, recomputed on each graph update
    is_known_fraud: bool       # Manually flagged or auto-detected ring member
    
    # Activity tracking
    merchant_ids_seen: set[str]     # Which merchants this signal appeared at
    transaction_count: int          # Total transaction attempts
    failed_transaction_count: int   # Failed/denied transactions
    first_seen: datetime
    last_seen: datetime
```

### 10.6 TrustGraphEdge (in-memory, not DB)

```python
@dataclass  
class TrustGraphEdge:
    source_id: str             # TrustGraphNode.id
    target_id: str             # TrustGraphNode.id
    weight: float              # Co-occurrence count (increments on each shared transaction)
    edge_types: set[str]       # e.g. {"SHARED_SESSION", "SAME_IP_SUBNET", "TIME_CLUSTER"}
    # SHARED_SESSION: both signals appeared in the same transaction
    # SAME_IP_SUBNET: both signals are IP subnets that share first 2 octets
    # TIME_CLUSTER: both signals appeared within 10 minutes across different merchants
    first_seen: datetime
    last_seen: datetime
```

### 10.7 FraudRing (in-memory, also persisted to DB on detection)

```python
@dataclass
class FraudRing:
    id: str                         # UUID
    node_ids: list[str]             # All TrustGraphNode.ids in the ring
    merchant_ids_affected: list[str]
    transaction_attempt_count: int
    blocked_count: int
    total_blocked_amount_paise: int  # Total ₹ blocked from this ring
    risk_level: str                  # "HIGH" | "CRITICAL"
    detection_algorithm: str         # "connected_components" | "louvain"
    detection_timestamp: datetime
    is_active: bool                  # Still generating new attempts?
```

---

## 11. API Specifications

### 11.1 MaaS Endpoints

#### GET /api/maas/{merchant_id}/catalog

**Purpose:** Agent-readable product catalog query.

**Authentication:** `Authorization: Bearer {maas_token}`

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Natural language product query |
| `category` | string | No | Filter by category |
| `max_price_paise` | number | No | Maximum price in paise |
| `in_stock` | boolean | No | Default true; filter out-of-stock |
| `limit` | number | No | Max results, default 10, max 50 |

**Response 200:**
```json
{
  "merchant_id": "merch_abc123",
  "merchant_name": "TechZone Electronics",
  "query": "wireless headphones under 2000",
  "result_count": 3,
  "products": [
    {
      "id": "prod_xyz789",
      "name": "Sony WH-1000XM5 Wireless Headphones",
      "description": "Industry-leading noise cancelling wireless headphones...",
      "price_paise": 199900,
      "price_display": "₹1,999",
      "currency": "INR",
      "stock": 12,
      "category": "electronics",
      "tags": ["wireless", "audio", "sony", "noise-cancelling"],
      "match_score": 0.94,
      "agent_purchase_url": "https://nexus.app/api/maas/merch_abc123/transact"
    }
  ]
}
```

**Response 401:** Invalid or missing MaaS token.  
**Response 404:** Merchant not found or inactive.

---

#### POST /api/maas/{merchant_id}/transact

**Purpose:** Execute an AI-buyer-initiated purchase.

**Authentication:** `Authorization: Bearer {maas_token}`

**Request Body:**
```json
{
  "intent": "Buy 2 units of Sony wireless headphones for agent@nexus.ai",
  "buyer": {
    "email": "agent@nexus.ai",
    "ip": "103.21.44.132",
    "device_id": "a3f8b2c1d4e5...",
    "upi_handle": "agent@upi",
    "user_agent": "NexusDemoBuyer/1.0"
  },
  "metadata": {
    "agent_id": "demo-buyer-001",
    "session_id": "sess_xyz123",
    "caller_framework": "google-adk"
  }
}
```

**Response 200 (SUCCESS):**
```json
{
  "transaction_id": "txn_abc123",
  "status": "SUCCESS",
  "trust_score": 87,
  "trust_decision": "ALLOW",
  "product": {
    "id": "prod_xyz789",
    "name": "Sony WH-1000XM5 Wireless Headphones",
    "quantity": 2,
    "unit_price_paise": 199900,
    "total_amount_paise": 399800,
    "total_amount_display": "₹3,998"
  },
  "razorpay_order_id": "order_ABCdef123",
  "razorpay_payment_id": "pay_XYZghi456",
  "payment_status": "captured",
  "captured_at": "2026-09-02T01:30:45.123Z",
  "audit_trail": [
    {
      "step": "INTENT_RECEIVED",
      "step_number": 1,
      "timestamp": "2026-09-02T01:30:40.001Z",
      "duration_ms": 12,
      "summary": "Received intent: 'Buy 2 units of Sony wireless headphones'",
      "reason": "Transaction initiated by agent demo-buyer-001"
    },
    {
      "step": "INTENT_PARSED",
      "step_number": 2,
      "timestamp": "2026-09-02T01:30:41.234Z",
      "duration_ms": 1233,
      "summary": "Parsed: product_query='Sony wireless headphones', quantity=2",
      "reason": "Gemini extracted product and quantity with 0.97 confidence"
    },
    {
      "step": "CATALOG_RESOLVED",
      "step_number": 3,
      "timestamp": "2026-09-02T01:30:41.890Z",
      "duration_ms": 656,
      "summary": "Matched to 'Sony WH-1000XM5' (match_score: 0.94). Stock: 12 → 10.",
      "reason": "Semantic similarity match. Stock sufficient for quantity 2."
    },
    {
      "step": "TRUST_CHECKED",
      "step_number": 4,
      "timestamp": "2026-09-02T01:30:42.145Z",
      "duration_ms": 255,
      "summary": "Trust score: 87/100. Decision: ALLOW.",
      "reason": "No fraud signals detected. Buyer has no graph neighbors. Slight new-entity penalty applied (-10)."
    },
    {
      "step": "ORDER_CREATED",
      "step_number": 5,
      "timestamp": "2026-09-02T01:30:43.567Z",
      "duration_ms": 1422,
      "summary": "Razorpay order created: order_ABCdef123. Amount: ₹3,998.",
      "reason": "Trust gate passed. Order created with merchant's test-mode credentials."
    },
    {
      "step": "PAYMENT_CAPTURED",
      "step_number": 6,
      "timestamp": "2026-09-02T01:30:44.890Z",
      "duration_ms": 1323,
      "summary": "Payment captured: pay_XYZghi456. Status: captured.",
      "reason": "Test-mode auto-capture successful."
    },
    {
      "step": "AUDIT_LOGGED",
      "step_number": 7,
      "timestamp": "2026-09-02T01:30:45.123Z",
      "duration_ms": 233,
      "summary": "6 audit entries written for txn_abc123.",
      "reason": "Transaction complete. Audit trail sealed."
    }
  ]
}
```

**Response 403 (TRUST DENIED):**
```json
{
  "transaction_id": "txn_def456",
  "status": "DENIED",
  "trust_score": 22,
  "trust_decision": "DENY",
  "risk_factors": [
    "known_fraud_neighbor_1hop: email hash shares a transaction history with 2 confirmed fraud nodes",
    "cross_merchant_velocity: ip_subnet 103.44.21 attempted 17 transactions across 8 merchants in the last 60 minutes"
  ],
  "razorpay_order_id": null,
  "razorpay_payment_id": null,
  "message": "Transaction denied. Buyer fingerprint is associated with a known fraud ring. No payment was processed.",
  "audit_trail": [...]
}
```

**Response 409 (STOCK ERROR):**
```json
{
  "transaction_id": "txn_ghi789",
  "status": "FAILED",
  "error_code": "INSUFFICIENT_STOCK",
  "message": "Only 1 unit of 'Sony WH-1000XM5' available. Requested quantity: 2.",
  "available_stock": 1,
  "requested_quantity": 2,
  "audit_trail": [...]
}
```

### 11.2 Trust Graph Service Endpoints

**Base URL:** `http://localhost:8001`

#### POST /trust/score

**Purpose:** Score a buyer fingerprint against the graph.

**Request:**
```json
{
  "fingerprint": {
    "email_hash": "sha256:a3f8b2c1...",
    "ip_subnet": "103.21.44",
    "device_hash": "abc123...",
    "upi_handle": "buyer@upi",
    "user_agent_hash": "sha256:d4e5f6..."
  },
  "merchant_id": "merch_abc123",
  "request_id": "txn_abc123"
}
```

**Response:**
```json
{
  "score": 87,
  "decision": "ALLOW",
  "risk_factors": [],
  "graph_metrics": {
    "nodes_matched": 3,
    "known_fraud_neighbors_1hop": 0,
    "known_fraud_neighbors_2hop": 0,
    "cross_merchant_count": 1,
    "velocity_last_60min": 1,
    "ring_membership": null
  },
  "score_breakdown": {
    "base_score": 100,
    "new_entity_penalty": -10,
    "fraud_neighbor_penalty": 0,
    "velocity_penalty": 0,
    "cross_merchant_penalty": 0,
    "final_score": 87
  }
}
```

#### POST /trust/signal

**Purpose:** Feed a completed/attempted transaction back into the graph.

```json
{
  "fingerprint": { ... },
  "merchant_id": "merch_abc123",
  "transaction_id": "txn_abc123",
  "outcome": "SUCCESS",
  "amount_paise": 399800,
  "timestamp": "2026-09-02T01:30:45.123Z"
}
```

#### GET /trust/rings

**Purpose:** List detected fraud rings (for dashboard).

#### GET /trust/node/{node_id}

**Purpose:** Full detail on a specific graph node (for clicking a node in the dashboard).

### 11.3 Razorpay Webhooks

#### POST /api/webhooks/razorpay

All Razorpay webhook events are received here. The handler:
1. Verifies the `X-Razorpay-Signature` header using HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`.
2. Parses the event type.
3. Dispatches to the appropriate handler.

**Handled events:**
| Event | Action |
|---|---|
| `payment.captured` | Update transaction status to SUCCESS, feed SUCCESS signal to Trust Graph |
| `payment.failed` | Update transaction status to FAILED, feed FAILURE signal to Trust Graph (increases risk weight) |
| `order.paid` | Confirm final settlement, update audit trail |
| `payment.authorized` | Log as intermediate state, no action |

**Why verify signature:** Even in test mode, we verify Razorpay's webhook signature on every request. Without verification, any caller can POST to this endpoint and manipulate transaction statuses. This is a security-critical step.

---

## 12. Trust Graph Engine

### 12.1 Graph Structure

The trust graph is an **undirected weighted graph** maintained in memory using NetworkX.

**Nodes** represent individual buyer signal entities:
- One node per unique (signal_type, signal_value) pair
- e.g. `node_id = sha256("email_hash:a3f8b2c1...")`
- A single transaction creates up to 5 nodes (one per fingerprint signal)

**Edges** connect nodes that have appeared in the same transaction context:
- Edge weight = number of co-occurrences
- Edge type labels (stored in edge `data` dict): `SHARED_SESSION`, `TIME_CLUSTER`, `SUBNET_OVERLAP`

**Why undirected:** Fraud signal relationships are symmetric. If device D1 and email E1 appear in the same transaction, the signal that D1 is suspicious because of E1 is equally valid as E1 being suspicious because of D1.

**Why weighted:** Repeated co-occurrence is a stronger signal than a single appearance. A device that appears with the same suspicious email 15 times across 8 merchants is far more dangerous than one that appeared once.

### 12.2 Scoring Algorithm

```python
def score_fingerprint(fingerprint: BuyerFingerprint, merchant_id: str) -> TrustScore:
    base_score = 100.0
    risk_factors = []
    
    # Step 1: Find or create nodes for each signal in the fingerprint
    nodes = get_or_create_nodes(fingerprint)
    
    # Step 2: New entity penalty
    # A buyer with no history is slightly less trusted than one with
    # a clean track record. Small penalty to avoid overconfidence.
    if all(node.transaction_count == 0 for node in nodes):
        base_score -= 10
        risk_factors.append("new_entity: no transaction history")
    
    # Step 3: Known fraud node penalty
    # If ANY signal node is directly flagged as known fraud, heavy penalty.
    for node in nodes:
        if node.is_known_fraud:
            base_score -= 80
            risk_factors.append(f"known_fraud_node: {node.signal_type} is directly flagged")
    
    # Step 4: Fraud neighbor penalties (graph traversal)
    # 1-hop: immediate neighbors that are known fraud
    one_hop_fraud = get_fraud_neighbors(nodes, hops=1)
    if one_hop_fraud:
        base_score -= 40 * min(len(one_hop_fraud), 1)
        risk_factors.append(f"known_fraud_neighbor_1hop: {len(one_hop_fraud)} fraud nodes adjacent")
    
    # 2-hop: fraud nodes 2 edges away
    two_hop_fraud = get_fraud_neighbors(nodes, hops=2) - one_hop_fraud
    if two_hop_fraud:
        base_score -= 20 * min(len(two_hop_fraud) / 3, 1)
        risk_factors.append(f"known_fraud_neighbor_2hop: {len(two_hop_fraud)} fraud nodes nearby")
    
    # Step 5: Velocity penalty
    # High transaction velocity across any merchant is suspicious
    velocity_60min = get_transaction_count(nodes, window_minutes=60)
    if velocity_60min > 10:
        base_score -= 25
        risk_factors.append(f"high_velocity: {velocity_60min} transactions in last 60 minutes")
    elif velocity_60min > 5:
        base_score -= 10
    
    # Step 6: Cross-merchant penalty
    # Appearing at many different merchants quickly is a fraud signal
    merchants_in_24h = get_unique_merchant_count(nodes, window_hours=24)
    if merchants_in_24h > 5:
        base_score -= 35
        risk_factors.append(f"cross_merchant_spread: {merchants_in_24h} merchants in 24h")
    elif merchants_in_24h > 3:
        base_score -= 15
    
    # Step 7: Ring membership
    # If any signal node is already in a detected fraud ring, maximum penalty
    ring = get_ring_membership(nodes)
    if ring:
        base_score -= 60
        risk_factors.append(f"ring_member: node is part of fraud ring {ring.id}")
    
    final_score = max(0, min(100, base_score))
    
    # Decision thresholds
    if final_score >= 70:
        decision = "ALLOW"
    elif final_score >= 40:
        decision = "REVIEW"
    else:
        decision = "DENY"
    
    return TrustScore(score=final_score, decision=decision, risk_factors=risk_factors)
```

### 12.3 Ring Detection Algorithm

Ring detection runs:
1. **On every new transaction signal ingested** (incremental check on new/updated nodes)
2. **On a scheduled pass every 5 minutes** (full graph sweep for rings that emerged gradually)

```python
def detect_rings(graph: nx.Graph) -> list[FraudRing]:
    rings = []
    
    # Step 1: Connected components
    # Find all groups of nodes that are connected to each other
    components = list(nx.connected_components(graph))
    
    for component in components:
        # Step 2: Filter for suspicious components
        # A component must meet ALL criteria to be flagged as a ring:
        subgraph = graph.subgraph(component)
        
        # Must have at least 3 nodes (solo/duo could be coincidence)
        if len(component) < 3:
            continue
        
        # Must span at least 2 different merchants
        merchants = set()
        for node_id in component:
            merchants.update(graph.nodes[node_id].get('merchant_ids_seen', set()))
        if len(merchants) < 2:
            continue
        
        # Must have high internal connectivity (average degree > 1.5)
        avg_degree = sum(dict(subgraph.degree()).values()) / len(component)
        if avg_degree < 1.5:
            continue
        
        # Must have at least one node with a failure/block on record
        # (Pure successes could be a legitimate power buyer)
        has_failed_txn = any(
            graph.nodes[n].get('failed_transaction_count', 0) > 0
            for n in component
        )
        if not has_failed_txn:
            continue
        
        # Step 3: Score the ring
        # Rings where members have appeared at 5+ merchants are CRITICAL
        risk_level = "CRITICAL" if len(merchants) >= 5 else "HIGH"
        
        # Step 4: Mark all nodes in the ring as known_fraud
        for node_id in component:
            graph.nodes[node_id]['is_known_fraud'] = True
            graph.nodes[node_id]['trust_score'] = 0
        
        rings.append(FraudRing(
            id=generate_uuid(),
            node_ids=list(component),
            merchant_ids_affected=list(merchants),
            risk_level=risk_level,
            detection_algorithm="connected_components",
            detection_timestamp=datetime.utcnow(),
        ))
    
    return rings
```

### 12.4 Synthetic Test Dataset

For the held-out evaluation, a synthetic dataset of 500 transactions is generated:

- **300 legitimate transactions** from 50 unique buyers across 10 merchants. Each legitimate buyer has consistent signals (same device, varying IPs from same subnet, standard velocity).
- **200 fraudulent transactions** from 5 fraud rings (40 each), each ring using 8-12 coordinated identities across 4-7 merchants. Ring members share device hashes and use IP subnets within the same /24.

**Metrics computed:**
- **Precision:** Of all transactions the detector blocked, what fraction were actually fraudulent?
- **Recall:** Of all actually fraudulent transactions, what fraction did the detector block?
- **F1 Score:** Harmonic mean of precision and recall.
- **False-Positive Rate:** Fraction of legitimate transactions incorrectly blocked.
- **False-Positive Cost (₹):** Sum of amounts of legitimate transactions blocked, expressed in rupees. This is the merchant's cost of the false positives.

---

## 13. User Flows

### 13.1 Merchant Onboarding

**Actor:** A merchant who wants to be transactable by AI buyers.  
**Duration:** ~5 minutes.  
**Prerequisite:** Active Razorpay account in test mode.

```
Step 1 — Navigate to Nexus (localhost:3000)
  → Landing page shows value proposition and "Onboard Your Store" CTA

Step 2 — Enter basic details (/dashboard/onboard)
  → Merchant name, email
  → Razorpay Test Key ID and Key Secret
  → System validates credentials immediately via GET /v1/payments?count=1
  → If invalid: show specific error ("Key ID format invalid" / "Authentication failed")
  → If valid: show green checkmark and proceed

Step 3 — Add product catalog
  Option A: Manual entry
    → Add products one by one: name, description, price, stock, category
    → Each product shows a preview of how it will appear to AI buyers
  Option B: CSV upload
    → Upload CSV with columns: name, description, price_inr, stock, category
    → System validates, shows preview, confirms import count

Step 4 — Generate embeddings
  → System calls Gemini Embeddings API for each product description
  → Progress bar shown: "Preparing catalog for AI buyers... (3/5 products)"
  → On completion: embeddings stored in PostgreSQL (pgvector)

Step 5 — Receive MaaS endpoint
  → Dashboard shows:
    - MaaS Endpoint URL: https://nexus.app/api/maas/{merchant_id}/transact
    - MaaS Token: [masked, with copy button]
    - Catalog Query URL: https://nexus.app/api/maas/{merchant_id}/catalog
  → "Share this endpoint with any AI buyer agent to start receiving orders"
  → Quick test: "Send a test transaction" button triggers DemoBuyerAgent internally

Step 6 — Dashboard active
  → Merchant is now live. Transaction feed shows "Waiting for AI buyers..."
  → Trust Graph page shows empty graph
```

### 13.2 AI Buyer Transaction — Happy Path

**Actor:** An AI buyer agent (Google ADK DemoBuyerAgent) with a shopping goal.  
**Goal:** "Buy the cheapest wireless headphones from merchant merch_abc123"

```
Step 1 — Buyer agent queries catalog
  GET /api/maas/merch_abc123/catalog?q=wireless+headphones&in_stock=true
  Authorization: Bearer {maas_token}
  
  → Receives list of 3 products with prices and stock levels
  → Agent selects "Sony WH-1000XM5" at ₹1,999 (cheapest match)
  → Agent notes: product_id="prod_xyz789", agent_purchase_url

Step 2 — Buyer agent initiates purchase
  POST /api/maas/merch_abc123/transact
  {
    "intent": "Buy 1 unit of Sony WH-1000XM5 Wireless Headphones",
    "buyer": {
      "email": "demo-agent@nexus.ai",
      "ip": "103.21.44.132",
      "user_agent": "NexusDemoBuyer/1.0 google-adk/0.1"
    }
  }

Step 3 — NexusOrchestratorAgent processes (in background)
  [parse_intent]:       ~1.2s  → product_query="Sony WH-1000XM5", quantity=1
  [resolve_catalog]:    ~0.6s  → prod_xyz789, ₹1,999, stock 12→11
  [check_trust_graph]:  ~0.3s  → score=90, decision=ALLOW (new clean buyer, -10 penalty)
  [create_razorpay_order]: ~1.4s → order_ABCdef123
  [capture_razorpay_payment]: ~1.3s → pay_XYZghi456, captured
  [log_audit_entry]:   ~0.2s  → 6 entries written
  
  Total: ~5.0s

Step 4 — Response returned to buyer agent
  HTTP 200 with full receipt including razorpay_payment_id and audit_trail

Step 5 — Razorpay webhook fires
  POST /api/webhooks/razorpay { "event": "payment.captured", ... }
  → Webhook handler verifies signature
  → Updates transaction status in DB (already SUCCESS, confirms it)
  → Feeds SUCCESS signal to Trust Graph (builds buyer's positive history)

Step 6 — Merchant dashboard updates
  → New transaction appears in live feed: "✅ ₹1,999 — Sony WH-1000XM5 — Trust: 90"
  → Product stock shows 11 (updated in real time)
  → Audit trail visible by clicking the transaction
```

### 13.3 AI Buyer Transaction — Denied Path (Fraud Ring)

**Actor:** A fraudulent AI agent that is part of a detected fraud ring.  
**Setup:** The ring has already hit 3 other merchants. Its device hash and IP subnet are in the trust graph.

```
Step 1 — Fraudulent buyer sends transaction request
  POST /api/maas/merch_abc123/transact
  {
    "intent": "Buy 5 Sony headphones",
    "buyer": {
      "email": "ring-member-7@fakeshop.xyz",
      "ip": "103.44.21.87",
      "device_id": "ring_device_hash_abc",
      "upi_handle": "fraudster@upi"
    }
  }

Step 2 — Orchestrator runs first two tools normally
  [parse_intent]:    → product_query="Sony headphones", quantity=5
  [resolve_catalog]: → prod_xyz789, ₹9,995, stock sufficient

Step 3 — Trust Graph check fires
  [check_trust_graph]:
    → email_hash matches ring email domain pattern: "-20"
    → ip_subnet "103.44.21" seen at 6 merchants in last 2 hours: "-35"
    → device_hash is directly in known ring: "-80"
    → final score: 100 - 20 - 35 - 80 = -35 → clamped to 0
    → decision: DENY

Step 4 — Orchestrator short-circuits
  → Skips create_razorpay_order (NO Razorpay API calls made)
  → Skips capture_razorpay_payment
  → Calls log_audit_entry immediately

Step 5 — Response returned
  HTTP 403
  {
    "status": "DENIED",
    "trust_score": 0,
    "trust_decision": "DENY",
    "risk_factors": [
      "known_fraud_neighbor_1hop: device hash is a confirmed ring member",
      "cross_merchant_velocity: ip_subnet 103.44.21 seen at 6 merchants in 2 hours",
      "email_domain_risk: email domain matches known abuse pattern"
    ],
    "message": "Transaction denied. No payment was processed.",
    "razorpay_order_id": null,
    "razorpay_payment_id": null,
    "audit_trail": [...]
  }

Step 6 — Trust Graph updated
  → New attempt from this ring logged
  → Ring's blocked_count incremented
  → All ring nodes' risk scores drop further
  → If new device_hash encountered → added to graph, connected to ring → immediately inherits ring's fraud status

Step 7 — Merchant dashboard
  → New row in transaction feed: "🚫 DENIED — ₹9,995 blocked — Trust: 0 — Ring detected"
  → Trust Graph page shows the ring highlighted in red
  → Ring detail: "Blocked ₹X across 4 merchants today"
```

### 13.4 Fraud Ring Detection Flow

**Actor:** Background process (runs automatically after each transaction batch).

```
Step 1 — New signals ingested after each transaction

Step 2 — Graph updated
  → New nodes created for any unseen fingerprint signals
  → Edges added/weighted between co-occurring signals
  → TIME_CLUSTER edges added for signals that appear within 10 minutes
    of each other across different merchants

Step 3 — Incremental ring check
  → For any newly added/modified node: check its connected component
  → If component meets ring criteria → flag as ring → notify dashboard

Step 4 — Scheduled full sweep (every 5 minutes)
  → Run detect_rings() on full graph
  → Detect any rings that emerged gradually (slow-burn attacks)
  → Update dashboard ring list

Step 5 — Dashboard visualization
  → Cytoscape.js receives updated graph data via polling (/trust/graph)
  → Nodes colored by score: green (70+), yellow (40-69), red (<40)
  → Ring nodes shown with red border, pulsing animation
  → Edges shown with thickness proportional to weight
```

---

## 14. Error Handling & Failure Modes

Every failure mode in Nexus returns a structured error response. No raw stack traces are ever returned to the caller. The Orchestrator Agent instruction explicitly handles each failure type.

| Failure Mode | Error Code | HTTP Status | Razorpay Called? | Audit Logged? |
|---|---|---|---|---|
| Intent parse failure | `INTENT_PARSE_FAILED` | 422 | No | Yes |
| Product not found | `PRODUCT_NOT_FOUND` | 404 | No | Yes |
| Insufficient stock | `INSUFFICIENT_STOCK` | 409 | No | Yes |
| Trust denied | `TRUST_DENIED` | 403 | No | Yes |
| Trust service unavailable | `TRUST_SERVICE_UNAVAILABLE` | 200 (REVIEW) | Yes | Yes |
| Razorpay order create failed | `RAZORPAY_ORDER_FAILED` | 502 | Attempted, failed | Yes |
| Razorpay payment capture failed | `RAZORPAY_CAPTURE_FAILED` | 502 | Yes (partial) | Yes |
| Merchant not found | `MERCHANT_NOT_FOUND` | 404 | No | No |
| Invalid MaaS token | `UNAUTHORIZED` | 401 | No | No |

**Trust Service Unavailable — special handling:**  
If the Trust Graph service is unreachable, the system does NOT fail closed (block all transactions). It defaults to a score of 50 (REVIEW) and proceeds to payment with a logged warning. Failing closed would make Nexus unusable during Trust Graph restarts. This tradeoff is explicitly documented in the audit trail entry for every REVIEW transaction that had a Trust service timeout.

**Partial failure — RAZORPAY_CAPTURE_FAILED:**  
The worst failure mode. An order was created (money was reserved) but capture failed. Nexus handles this by:
1. Logging the transaction as PARTIAL status.
2. Storing the `razorpay_order_id` in the transaction record.
3. Exposing a manual "Retry Capture" button in the merchant dashboard for PARTIAL transactions.
4. Auto-retrying capture once after a 30-second delay via a background job.

---

## 15. Security Considerations

### 15.1 Secret Management

- Razorpay `key_secret` values are **encrypted at rest** in PostgreSQL using AES-256-GCM with a key loaded from `ENCRYPTION_KEY` environment variable. Never stored in plaintext. Never returned in API responses.
- MaaS tokens are stored as **SHA-256 hashes** in the DB. The plaintext is shown to the merchant exactly once (at onboarding). If lost, a new token must be generated (old one invalidated).
- `GOOGLE_API_KEY` and `RAZORPAY_WEBHOOK_SECRET` live only in environment variables. Never committed to source code.

### 15.2 Webhook Verification

```typescript
// Every Razorpay webhook is verified before processing
function verifyRazorpayWebhook(body: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
```

`timingSafeEqual` is used (not `===`) to prevent timing attacks.

### 15.3 Buyer Data Privacy

- Email addresses are **never stored in plaintext**. Hashed with SHA-256 on receipt, before any DB write.
- IP addresses are **truncated to /24 subnet** before storage. The last octet is dropped immediately on ingestion.
- The Trust Graph stores only hashes and anonymized values. No PII is stored in the graph.
- The `raw_data` field in AuditEntry stores tool inputs/outputs but buyer email is redacted to its hash form before writing.

### 15.4 Defense-in-Depth on Trust Gate

The trust gate is enforced at two levels:
1. **Agent instruction level:** The Orchestrator's system prompt explicitly states "Do NOT call create_razorpay_order if trust score < 40."
2. **Tool level:** The `create_razorpay_order` tool itself validates the trust score parameter and raises `TrustViolationError` if it receives a score below 40. This prevents a model jailbreak or hallucination from bypassing the gate.

---

## 16. Demo Plan

The demo runs in three acts, totalling approximately 8 minutes.

### Act 1 — Merchant Goes Live (2 min)

**What the audience sees:**
Open the Nexus dashboard. Run the onboarding wizard live — enter merchant name, paste Razorpay test credentials, add 3 products. Click "Go Live." The MaaS endpoint URL appears. Copy it.

**What it proves:**  
Any Razorpay merchant can become AI-transactable in under 3 minutes.

### Act 2 — AI Buyer Transacts (3 min)

**What the audience sees:**
Open a terminal. Run the DemoBuyerAgent CLI:
```bash
adk run agents/demo_buyer.py
> shopping_goal: "Buy the cheapest wireless headphones from merchant merch_abc123"
```
Watch the agent think out loud (ADK web UI stream visible): querying catalog, selecting product, initiating purchase, receiving receipt. On the merchant dashboard, the transaction feed updates in real time. Click the transaction to see the full 7-step audit trail.

Then: open the Razorpay test-mode dashboard. Show the captured payment sitting there with the Nexus transaction ID in the notes.

**What it proves:**  
End-to-end agentic transaction works. Every step is explainable. Razorpay APIs are being used correctly.

### Act 3 — Fraud Ring Caught (3 min)

**What the audience sees:**
Run a script: `python scripts/simulate_ring_attack.py`

The script sends 50 synthetic transactions from a coordinated 12-member ring across 4 merchants. On the Trust Graph page, the audience watches nodes appear and cluster in real time. After ~15 transactions, the ring is detected — nodes turn red, a ring alert appears. Then run one more transaction from the ring against the current merchant. Watch it get blocked in 300ms. Show the 403 response with trust score 0 and specific risk factors.

Then: show the metrics panel — "50 transactions analyzed. 38 blocked (all ring members). 0 legitimate transactions blocked. False-positive cost: ₹0. Precision: 100%. Recall: 95%."

**What it proves:**  
Network-level fraud detection with honest metrics. Defense-only. No legitimate buyers were affected.

---

## 17. Project Structure

```
nexus/
│
├── app/                           # Next.js App Router
│   ├── (marketing)/
│   │   └── page.tsx               # Landing page
│   ├── dashboard/
│   │   ├── layout.tsx             # Sidebar nav, merchant context
│   │   ├── page.tsx               # Overview / stats
│   │   ├── onboard/
│   │   │   └── page.tsx           # Onboarding wizard
│   │   ├── catalog/
│   │   │   └── page.tsx           # Product management
│   │   ├── transactions/
│   │   │   └── page.tsx           # Transaction feed + audit trail
│   │   └── trust-graph/
│   │       └── page.tsx           # Cytoscape graph visualization
│   └── api/
│       ├── merchant/
│       │   └── route.ts           # POST (create merchant)
│       ├── merchant/[id]/
│       │   └── route.ts           # GET, PUT (merchant detail/update)
│       ├── maas/
│       │   └── [merchantId]/
│       │       ├── catalog/
│       │       │   └── route.ts   # GET catalog query
│       │       └── transact/
│       │           └── route.ts   # POST transaction (proxies to ADK)
│       └── webhooks/
│           └── razorpay/
│               └── route.ts       # Razorpay event handler
│
├── components/
│   ├── TrustGraph.tsx             # Cytoscape.js force-directed graph
│   ├── AuditTimeline.tsx          # Step-by-step transaction audit view
│   ├── TransactionFeed.tsx        # Real-time transaction list
│   ├── MetricsPanel.tsx           # Precision/recall/FP cost display
│   ├── OnboardingWizard.tsx       # Multi-step merchant onboarding
│   └── ui/                        # Shared UI primitives (Radix-based)
│
├── lib/
│   ├── razorpay.ts                # Razorpay Node SDK wrapper
│   ├── trust-client.ts            # HTTP client for Trust Graph service
│   ├── adk-client.ts              # HTTP client for ADK agent server
│   ├── db.ts                      # PostgreSQL connection pool
│   ├── crypto.ts                  # Hashing and encryption helpers
│   └── embedding.ts               # Gemini Embeddings API wrapper
│
├── nexus-agent/                   # Python ADK agent service
│   ├── agents/
│   │   ├── orchestrator.py        # NexusOrchestratorAgent
│   │   └── demo_buyer.py          # DemoBuyerAgent
│   ├── tools/
│   │   ├── intent.py              # parse_intent tool
│   │   ├── catalog.py             # resolve_catalog tool
│   │   ├── trust.py               # check_trust_graph tool
│   │   ├── razorpay_tools.py      # Razorpay API tools
│   │   ├── audit.py               # log_audit_entry tool
│   │   └── maas_client.py         # Demo buyer's MaaS API client tools
│   ├── models/
│   │   ├── transaction.py         # Pydantic models
│   │   └── fingerprint.py         # BuyerFingerprint model
│   ├── requirements.txt
│   └── .env.example
│
├── trust-graph-service/           # Python FastAPI trust graph service
│   ├── api/
│   │   └── server.py              # FastAPI app, /trust/* endpoints
│   ├── graph/
│   │   ├── engine.py              # NetworkX graph management
│   │   ├── detector.py            # Ring detection algorithms
│   │   └── scorer.py              # Trust scoring algorithm
│   ├── models/
│   │   ├── node.py                # TrustGraphNode
│   │   ├── edge.py                # TrustGraphEdge
│   │   └── ring.py                # FraudRing
│   ├── requirements.txt
│   └── .env.example
│
├── scripts/
│   ├── simulate_ring_attack.py    # Demo: generates synthetic fraud ring
│   ├── seed_merchant.py           # Seeds a test merchant + catalog
│   └── run_eval.py                # Runs precision/recall eval on test set
│
├── docker-compose.yml             # postgres + nexus-agent + trust-graph + nextjs
├── .env.example                   # All required environment variables
└── README.md
```

---

## 18. Environment Setup

### 18.1 Prerequisites

- Node.js 20+
- Python 3.11+
- Docker + Docker Compose
- Google AI Studio API key (free tier works for hackathon)
- Razorpay test account (free)

### 18.2 Environment Variables

```env
# ─── Google / Gemini ──────────────────────────────────────────
GOOGLE_API_KEY=AIzaSy...                # Google AI Studio API key
GEMINI_MODEL=gemini-2.0-flash-exp       # Model for agent and embeddings
GEMINI_EMBEDDING_MODEL=text-embedding-004

# ─── Razorpay (Test Mode) ─────────────────────────────────────
RAZORPAY_KEY_ID=rzp_test_...            # From Razorpay dashboard > Settings > API Keys
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...             # From Razorpay dashboard > Settings > Webhooks

# ─── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus

# ─── Encryption ────────────────────────────────────────────────
ENCRYPTION_KEY=...                      # 32-byte hex string for AES-256
                                        # Generate: openssl rand -hex 32

# ─── Service URLs (local dev) ──────────────────────────────────
NEXTJS_URL=http://localhost:3000
ADK_AGENT_URL=http://localhost:8000
TRUST_GRAPH_URL=http://localhost:8001

# ─── App ───────────────────────────────────────────────────────
NODE_ENV=development
```

### 18.3 Running Locally

```bash
# 1. Clone and install
git clone https://github.com/yourteam/nexus
cd nexus
npm install

# 2. Start infrastructure
docker compose up -d postgres

# 3. Run DB migrations
npm run db:migrate

# 4. Seed test merchant and catalog
cd nexus-agent && python scripts/seed_merchant.py

# 5. Start ADK agent server (in its own terminal)
cd nexus-agent
pip install -r requirements.txt
adk api_server agents/orchestrator.py --port 8000

# 6. Start Trust Graph service (in its own terminal)
cd trust-graph-service
pip install -r requirements.txt
uvicorn api.server:app --port 8001 --reload

# 7. Start Next.js
npm run dev

# 8. (Optional) Run demo buyer agent
cd nexus-agent
adk run agents/demo_buyer.py

# 9. (Optional) Simulate ring attack for demo
python scripts/simulate_ring_attack.py --merchant-id merch_abc123 --ring-size 12 --transactions 50
```

### 18.4 Running the Evaluation

```bash
cd nexus-agent
python scripts/run_eval.py \
  --dataset datasets/synthetic_500.json \
  --output results/eval_report.json

# Expected output:
# Total transactions: 500
# Legitimate (ground truth): 300
# Fraudulent (ground truth): 200
# Blocked by Nexus: 196
# True positives (fraud correctly blocked): 190
# False positives (legit incorrectly blocked): 6
# 
# Precision:              0.969 (96.9%)
# Recall:                 0.950 (95.0%)
# F1 Score:               0.959
# False-positive rate:    0.020 (2.0%)
# False-positive cost:    ₹11,940
```

---

*Document version 1.0 — Nexus, Razorpay AI Buildathon*  
*All Razorpay API calls use test-mode credentials. No real money is moved.*
