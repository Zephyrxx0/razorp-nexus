# Architecture Research

**Domain:** Agentic Commerce Gateway & Network-Level Risk Engine (Dual-Track Platform)  
**Researched:** 2026-09-03  
**Confidence:** HIGH  

## Standard Architecture

The Nexus architecture establishes a clean separation of concerns across presentation, API routing, agent orchestration, real-time graph computation, and durable storage. It bridges autonomous AI buyers (running via protocols like NPCI UAP, ACP, or x402) with Razorpay test-mode merchant infrastructure while guaranteeing that every rupee movement is bounded by real-time fraud ring detection and backed by a 100% explainable audit trail.

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ PRESENTATION & DASHBOARD LAYER (Next.js 14 App Router — Port 3000)                         │
│                                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Merchant Onboarding   │  │ Transaction Feed &    │  │ Cytoscape.js Trust Graph View   │  │
│  │ Wizard (/onboard)     │  │ Audit Timeline Drawer │  │ & Fraud Ring Alert Panel        │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────────────┬────────────────┘  │
└──────────────┼──────────────────────────┼───────────────────────────────┼───────────────────┘
               │                          │                               │
               ▼                          ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ API GATEWAY LAYER (Next.js 14 Route Handlers — Port 3000)                                   │
│                                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ /api/maas/[merchantId]/catalog   (Embeddings-powered semantic product search)         │  │
│  │ /api/maas/[merchantId]/transact  (Buyer validation, token auth, ADK forwarder)        │  │
│  │ /api/webhooks/razorpay           (HMAC-SHA256 signature verification & signal feed)   │  │
│  └──────────────────┬───────────────────────────────────────────┬────────────────────────┘  │
└─────────────────────┼───────────────────────────────────────────┼───────────────────────────┘
                      │                                           │
         HTTP/JSON    │                                           │ HTTP/JSON
         (Session ID) │                                           │ (Signal Event)
                      ▼                                           ▼
┌───────────────────────────────────────────┐   ┌─────────────────────────────────────────────┐
│ AGENT ORCHESTRATION LAYER                 │   │ TRUST GRAPH SERVICE                         │
│ (Google ADK + Gemini 2.0 Flash)           │   │ (Python FastAPI + NetworkX)                 │
│ Port 8000 (`adk api_server`)              │   │ Port 8001                                   │
│                                           │   │                                             │
│  ┌─────────────────────────────────────┐  │   │  ┌───────────────────────────────────────┐  │
│  │ NexusOrchestratorAgent (Linear      │  │   │  │ In-Memory Undirected Multi-Edge Graph │  │
│  │ 6-Step Autonomous Tool Chain):      │  │   │  │ Nodes: Anonymized Fingerprint Signals │  │
│  │ 1. parse_intent                     │  │   │  │ Edges: Co-occurrence & Time Clusters  │  │
│  │ 2. resolve_catalog                  │  │   │  └───────────────────┬───────────────────┘  │
│  │ 3. check_trust_graph ───────────────┼──┼───► POST /trust/score    │                      │
│  │ 4. create_razorpay_order            │  │   │ POST /trust/signal ◄─┘                      │
│  │ 5. capture_razorpay_payment         │  │   │ GET /trust/rings                            │
│  │ 6. log_audit_entry                  │  │   │ GET /trust/graph (Cytoscape payload)        │
│  └──────────────────┬──────────────────┘  │   └──────────────────────┬──────────────────────┘
└─────────────────────┼─────────────────────┘                          │
                      │                                                │
                      │ SQL Queries / Append Audit                     │ Rehydrate on startup
                      ▼                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ DURABLE DATA LAYER (PostgreSQL 16 with pgvector extension — Port 5432)                      │
│                                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────────────────────┐  │
│  │ merchants             │  │ products              │  │ transactions & audit_entries    │  │
│  │ (Encrypted secrets,   │  │ (Stock integers,      │  │ (Immutable append-only logs,    │  │
│  │ SHA-256 MaaS tokens)  │  │ 768-dim embeddings)   │  │ JSONB payloads, zero-updates)   │  │
│  └───────────────────────┘  └───────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation | Port / Protocol |
|-----------|----------------|------------------------|-----------------|
| **Next.js 14 API Gateway** | Public ingress for AI buyers and webhooks. Validates merchant tokens, executes semantic catalog vector queries, proxies transactions to ADK, verifies Razorpay HMAC signatures, and feeds post-payment signals to Trust Graph. | Next.js App Router Route Handlers (`app/api/**`), TypeScript, `pg` driver, Node `crypto` | Port 3000 (HTTP / REST) |
| **Next.js Merchant Dashboard** | Merchant interface for onboarding, catalog editing, live transaction monitoring with expandable step-level audit logs, and network fraud ring visualization. | React Server & Client Components, Tailwind CSS, Cytoscape.js, Recharts, SWR | Port 3000 (HTTP) |
| **Nexus Orchestrator Agent** | Deterministic tool execution engine powered by Gemini 2.0 Flash. Enforces strict linear flow: intent parsing → catalog/stock resolution → trust scoring → order creation → payment capture → immutable audit logging. | Google ADK (`adk api_server`), Python 3.11, Pydantic, HTTPX, Razorpay Python SDK | Port 8000 (`POST /run`) |
| **Trust Graph Engine** | Cross-merchant fraud defense microservice. Maintains an in-memory graph of shared buyer signals, calculates 0-100 trust scores, evaluates graph topology (1-hop/2-hop fraud neighbors, velocity, cross-merchant spread), and detects coordinated fraud rings. | FastAPI, Uvicorn, NetworkX, NumPy, asyncpg | Port 8001 (HTTP / REST) |
| **PostgreSQL Database** | Relational source of truth for merchants, catalogs, transactions, and audit trails. Enforces zero-update triggers on audit logs and provides pgvector cosine search for semantic product discovery. | PostgreSQL 16 + `pgvector`, connection pool via `asyncpg` (Python) and `pg` (Node) | Port 5432 (Postgres Wire) |
| **Razorpay API (Test Mode)** | External payment rails. Creates test orders, executes simulated payment captures, and emits status webhooks (`payment.captured`, `payment.failed`). | Razorpay REST API (`https://api.razorpay.com/v1`) | Outbound HTTPS |

---

## Recommended Project Structure

The project is structured as a coordinated monorepo separating the TypeScript frontend/gateway from the Python AI/Graph microservices:

```
nexus/
├── app/                           # Next.js 14 App Router
│   ├── (marketing)/
│   │   └── page.tsx               # Public landing page & product narrative
│   ├── dashboard/
│   │   ├── layout.tsx             # Dashboard navigation shell & merchant context
│   │   ├── page.tsx               # Analytics overview & quick metrics
│   │   ├── onboard/
│   │   │   └── page.tsx           # Multi-step merchant onboarding wizard
│   │   ├── catalog/
│   │   │   └── page.tsx           # Product catalog manager with AI badge
│   │   ├── transactions/
│   │   │   └── page.tsx           # Real-time transaction feed & audit drawer
│   │   └── trust-graph/
│   │       └── page.tsx           # Cytoscape.js network visualizer & ring panel
│   └── api/
│       ├── merchant/
│       │   └── route.ts           # Merchant registration & credential validation
│       ├── maas/[merchantId]/
│       │   ├── catalog/
│       │   │   └── route.ts       # GET: Vector semantic search over merchant catalog
│       │   └── transact/
│       │       └── route.ts       # POST: MaaS transaction ingress (proxies to ADK)
│       └── webhooks/
│           └── razorpay/
│               └── route.ts       # POST: HMAC-verified webhook event dispatcher
├── components/
│   ├── TrustGraph.tsx             # Cytoscape.js interactive force-directed graph
│   ├── AuditTimeline.tsx          # Step-by-step transaction audit drawer
│   ├── TransactionFeed.tsx        # Live polling / streaming transaction table
│   ├── MetricsPanel.tsx           # Risk metrics (Precision, Recall, FP Cost in ₹)
│   ├── OnboardingWizard.tsx       # 3-step setup (Credentials, Catalog, MaaS Key)
│   └── ui/                        # Radix UI primitives & Tailwind components
├── lib/
│   ├── db.ts                      # PostgreSQL pool (`pg`) for Next.js routes
│   ├── razorpay.ts                # Razorpay Node SDK client wrapper
│   ├── crypto.ts                  # AES-256 secret encryption & SHA-256 hashing
│   ├── embedding.ts               # Gemini text-embedding-004 API client
│   ├── adk-client.ts              # HTTP client invoking ADK agent server (port 8000)
│   └── trust-client.ts            # HTTP client calling Trust Graph (port 8001)
├── nexus-agent/                   # Google ADK Orchestrator & Autonomous Buyer
│   ├── agents/
│   │   ├── orchestrator.py        # NexusOrchestratorAgent declaration
│   │   └── demo_buyer.py          # DemoBuyerAgent for humanless shopping demo
│   ├── tools/
│   │   ├── intent.py              # parse_intent (Gemini NL extraction)
│   │   ├── catalog.py             # resolve_catalog (DB lookup + stock check)
│   │   ├── trust.py               # check_trust_graph (FastAPI client)
│   │   ├── razorpay_tools.py      # create_order & capture_payment tools
│   │   ├── audit.py               # log_audit_entry (immutable DB writer)
│   │   └── maas_client.py         # HTTP tools for DemoBuyerAgent
│   ├── models/
│   │   ├── transaction.py         # Pydantic schemas for intents and results
│   │   └── fingerprint.py         # Anonymized buyer fingerprint schemas
│   ├── requirements.txt           # google-adk, google-generativeai, razorpay, asyncpg
│   └── .env.example
├── trust-graph-service/           # FastAPI Cross-Merchant Risk Engine
│   ├── api/
│   │   └── server.py              # FastAPI application & route endpoints
│   ├── graph/
│   │   ├── engine.py              # NetworkX graph manager & node/edge state
│   │   ├── scorer.py              # Heuristic trust scoring (0-100) & penalty rules
│   │   └── detector.py            # Connected components & clustering ring detector
│   ├── models/
│   │   ├── node.py                # TrustGraphNode schema
│   │   ├── edge.py                # TrustGraphEdge schema
│   │   └── ring.py                # FraudRing schema
│   ├── requirements.txt           # fastapi, uvicorn, networkx, asyncpg, numpy
│   └── .env.example
├── scripts/
│   ├── init_db.sql                # DDL migrations, pgvector setup, audit trigger
│   ├── seed_merchant.py           # Seed script for demo merchant and catalog
│   ├── simulate_ring_attack.py    # Generates 50 synthetic coordinated ring txns
│   └── run_eval.py                # 500-txn held-out precision/recall evaluation
├── docker-compose.yml             # Postgres (5432), Agent (8000), Trust (8001), App (3000)
└── .env.example                   # Master environment template
```

### Structure Rationale

- **Colocated Gateway & Dashboard (`app/`):** Hosting Next.js route handlers and the merchant UI in a single TypeScript project eliminates duplicate types, provides instant local cookie/session context, and enables zero-latency IPC for dashboard updates.
- **Dedicated Agent Microservice (`nexus-agent/`):** Isolates the Google ADK runtime and Gemini SDK from Node.js. ADK's native `adk api_server` command exposes standard REST semantics on port 8000, allowing the agent to be scaled or upgraded independently.
- **Dedicated Graph Microservice (`trust-graph-service/`):** NetworkX requires CPU-bound graph traversals, topological clustering, and persistent in-memory graph objects. Housing this in FastAPI on port 8001 prevents graph analysis workloads from blocking web I/O or LLM orchestration.
- **Standalone Verification & Eval Scripts (`scripts/`):** Contains evaluation harnesses (`run_eval.py`) and attack simulation (`simulate_ring_attack.py`) separate from production code, directly fulfilling Buildathon Track 02 grading criteria without polluting runtime paths.

---

## Architectural Patterns

### Pattern 1: Bounded Autonomous Tool Chain (Two-Phase Gating / Short-Circuit)

**What:** An autonomous agent architecture where financial actions are restricted to a deterministic, unidirectional sequence. Money movement tools cannot be executed unless preceding safety gates succeed.  
**When to use:** In any agentic commerce system where an LLM is granted authority to trigger financial transactions.  
**Trade-offs:** Constrains LLM creativity and free-form multi-turn planning in exchange for zero hallucinated spending and guaranteed auditability.

**Example:**
```python
# nexus-agent/agents/orchestrator.py
ORCHESTRATOR_INSTRUCTION = """
Execute tools in STRICT SEQUENCE:
1. parse_intent -> extracts product_query and quantity.
2. resolve_catalog -> verifies stock and price in paise.
3. check_trust_graph -> scores buyer fingerprint (0-100).
   CRITICAL GATE: If score < 40 (DENY), STOP IMMEDIATELY.
   Do NOT call create_razorpay_order or capture_razorpay_payment.
4. create_razorpay_order -> create test order with metadata notes.
5. capture_razorpay_payment -> capture authorized test payment.
6. log_audit_entry -> seal immutable step records on ALL paths.
"""
```

### Pattern 2: Hybrid Storage Architecture (In-Memory Graph + Relational Durability)

**What:** NetworkX holds the cross-merchant entity graph purely in RAM for sub-millisecond multi-hop neighbor lookups, while PostgreSQL acts as the durable append-only log. On cold start, the graph rehydrates from the database.  
**When to use:** Hackathon and MVP systems where graph queries must be instantaneous (<50ms) but running a heavy graph database (e.g. Neo4j, Amazon Neptune) introduces excessive operational friction.  
**Trade-offs:** Fast to develop and zero database license overhead; requires periodic rehydration or snapshotting if process restarts.

**Example:**
```python
# trust-graph-service/graph/engine.py
class TrustGraphEngine:
    def __init__(self):
        self.graph = nx.Graph()

    async def rehydrate_from_db(self, pool: asyncpg.Pool):
        rows = await pool.fetch("SELECT buyer_fingerprint, merchant_id, status FROM transactions")
        for row in rows:
            self.ingest_transaction_sync(
                fingerprint=json.loads(row["buyer_fingerprint"]),
                merchant_id=str(row["merchant_id"]),
                outcome=row["status"]
            )
```

### Pattern 3: Defense-in-Depth Trust Assertion

**What:** Safety conditions are enforced in both the LLM's system instructions and inside the execution body of downstream tools.  
**When to use:** High-risk operations where model prompt injection, jailbreaking, or non-deterministic reasoning could bypass prompt-level restrictions.  
**Trade-offs:** Slight code redundancy across agent definition and tool implementation.

**Example:**
```python
# nexus-agent/tools/razorpay_tools.py
def create_razorpay_order(amount_paise: int, trust_score: int, ...):
    # Defense-in-depth: Tool refuses execution even if the LLM hallucinated
    if trust_score < 40:
        raise PermissionError(
            f"TrustViolationError: Attempted order creation with trust score {trust_score} (< 40)."
        )
    # Proceed with Razorpay SDK call...
```

### Pattern 4: Immutable Append-Only Audit Logging with Database-Level Enforcement

**What:** Every decision, parameter, tool latency, and failure rationale is recorded to an audit table with PostgreSQL triggers that explicitly block `UPDATE` and `DELETE` operations.  
**When to use:** Regulated commerce, compliance, and multi-agent systems requiring undeniable forensic proof of execution.  
**Trade-offs:** Storage grows monotonically; requires partition pruning strategies for production scale.

---

## Data Flow

### Request Flow

```
[AI Buyer Agent / Caller]
         │
         │ 1. POST /api/maas/{merchant_id}/transact { intent, buyer_fingerprint }
         ▼
[Next.js Gateway (Port 3000)]
         │ 2. Validates Bearer token & merchant status in DB
         │ 3. Proxies JSON payload: POST http://localhost:8000/run
         ▼
[Google ADK Orchestrator Agent (Port 8000)]
         │ 4. parse_intent (Gemini 2.0 Flash extracts query & quantity)
         │ 5. resolve_catalog (Queries Postgres products & stock)
         │ 6. check_trust_graph ──► HTTP POST http://localhost:8001/trust/score
         ▼
    ┌───────────────────────────────────────────────┐
    │ Trust Score Decision Gate                     │
    ├───────────────────────┬───────────────────────┤
    │ [Score >= 40 (ALLOW)] │ [Score < 40 (DENY)]   │
    └───────────┬───────────┴───────────┬───────────┘
                │                       │
                ▼                       ▼
    [create_razorpay_order]   [SHORT-CIRCUIT: SKIP RAZORPAY]
                │                       │
                ▼                       │
    [capture_razorpay_payment]          │
                │                       │
                └───────────┬───────────┘
                            ▼
                  [log_audit_entry] (Appends all step details to Postgres)
                            │
                            ▼
                  [Return Response to Gateway]
                            │
                            ▼
[AI Buyer Agent receives HTTP 200 (Success) or HTTP 403 (Trust Denied)]
```

### State Management

| State Category | Storage Location | Lifetime | Synchronization Mechanism |
|----------------|------------------|----------|---------------------------|
| **Merchant Credentials & Catalog** | PostgreSQL (`merchants`, `products`) | Persistent | Managed via Next.js Dashboard; queried per transaction by gateway and agent. |
| **Active Transaction Context** | ADK Agent Session Memory | Transient (<10s) | Passed via `session_id` in `POST /run`; discarded once audit log is sealed. |
| **Buyer Signal Graph & Rings** | Trust Graph Service RAM (NetworkX) | Ephemeral / In-Memory | Rebuilt from `transactions` table on boot; updated on every transaction attempt and webhook event. |
| **Audit Logs & Execution Trace** | PostgreSQL (`audit_entries`) | Permanent (Immutable) | Appended synchronously by ADK agent Step 6; queried by Dashboard UI via SWR. |
| **Payment Settlement Status** | Razorpay Servers + PostgreSQL | Authoritative | Updated asynchronously via HMAC-signed Razorpay webhook (`payment.captured`). |

### Key Data Flows

#### 1. Happy Path Commerce Execution
1. AI Buyer Agent sends `POST /api/maas/{merchant_id}/transact` with natural language intent and client fingerprint.
2. Next.js Route Handler validates `Authorization: Bearer {maas_token}`, assigns a unique `nexus_transaction_id`, and calls the ADK Agent Server on port 8000.
3. ADK Agent executes `parse_intent`: Gemini 2.0 Flash extracts `product_query` and `quantity`.
4. ADK Agent executes `resolve_catalog`: queries PostgreSQL, confirms stock, decrements inventory reservation, and calculates total paise.
5. ADK Agent executes `check_trust_graph`: sends hashed fingerprint to `http://localhost:8001/trust/score`. Service evaluates graph metrics; returns `score: 88, decision: "ALLOW"`.
6. ADK Agent executes `create_razorpay_order`: calls Razorpay test API with merchant's decrypted key secret, attaching the transaction ID and trust score in notes.
7. ADK Agent executes `capture_razorpay_payment`: simulates instant capture against the test order ID.
8. ADK Agent executes `log_audit_entry`: writes 6 structured audit entries into PostgreSQL.
9. Next.js returns HTTP 200 with receipt, payment ID, and complete step-by-step audit trail to the buyer agent.

#### 2. Fraud-Denied Short-Circuit Execution
1. Coordinated bot agent sends transaction with fingerprint tied to a known fraud ring (shared device hash or /24 IP subnet).
2. Next.js validates merchant and passes request to ADK Agent on port 8000.
3. Agent executes `parse_intent` and `resolve_catalog` successfully.
4. Agent executes `check_trust_graph`: Trust Graph detects 1-hop fraud neighbor and cross-merchant velocity; returns `score: 15, decision: "DENY"`.
5. **Short-Circuit Triggered:** Agent halts linear chain immediately. Tools `create_razorpay_order` and `capture_razorpay_payment` are completely skipped. Zero calls are made to Razorpay.
6. Agent executes `log_audit_entry`: records the transaction as `DENIED`, documenting exact risk factor strings and graph penalty breakdown.
7. Next.js returns HTTP 403 with `status: "DENIED"`, `trust_score: 15`, risk factors, and full audit trail.
8. Background signal feeds the denied attempt into the Trust Graph, increasing connection weights of the fraud ring.

#### 3. Razorpay Webhook & Signal Ingestion Loop
1. Razorpay emits webhook event `payment.captured` or `payment.failed` to `POST /api/webhooks/razorpay`.
2. Next.js validates `X-Razorpay-Signature` using constant-time HMAC-SHA256 comparison.
3. Handler reconciles transaction status in PostgreSQL.
4. Handler fires asynchronous HTTP `POST http://localhost:8001/trust/signal` with transaction outcome, updating graph weights and triggering incremental ring detection.

#### 4. Trust Graph Cold-Start Rehydration
1. On container boot, `trust-graph-service` executes its lifespan handler.
2. Connects to PostgreSQL via `asyncpg` and queries all historical records from `transactions`.
3. Populates NetworkX graph nodes (hashed signals) and co-occurrence edges.
4. Runs full connected-components algorithm (`detect_rings()`) to identify existing rings before opening port 8001 to incoming traffic.

---

## Suggested Build Order & Milestone Dependencies

To ensure smooth progress with minimal blockers, system components must be implemented according to strict layer dependencies:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation, Data Layer & Security Engine            │
│ Postgres DDL, pgvector, AES-256 Crypto, Seed Data           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Trust Graph Engine Microservice (Port 8001)         │
│ NetworkX graph, Scorer (0-100), Ring Detector, /trust/* APIs│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: ADK Orchestrator & Tool Implementations (Port 8000)│
│ Intent Parser, Catalog Resolver, Trust Client, Razorpay     │
│ Test Tools, Immutable Audit Logger, Orchestrator System     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: MaaS Gateway & API Layer (Port 3000)               │
│ /api/maas/catalog, /api/maas/transact, Webhook Handler      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Merchant Dashboard & Visualization                 │
│ Onboarding Wizard, Catalog Editor, Live Audit Drawer,       │
│ Cytoscape.js Trust Graph View                               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Autonomous Demo Buyer & Evaluation Harness         │
│ DemoBuyerAgent, simulate_ring_attack.py, run_eval.py (500)  │
└─────────────────────────────────────────────────────────────┘
```

### Build Order Rationale & Dependencies:
1. **Database Schema first:** The schema defines the contracts for merchants, products, transactions, and audit entries. All downstream services rely on these tables.
2. **Trust Graph Service second:** The ADK agent's 3rd tool (`check_trust_graph`) requires a live endpoint on port 8001 to score fingerprints. Implementing and unit testing this standalone microservice with synthetic data unblocks agent development.
3. **ADK Agent third:** Built and tested using `adk run` or direct curl calls against port 8000. All tools (`resolve_catalog`, `check_trust_graph`, `create_razorpay_order`, `log_audit_entry`) connect directly to the DB, Trust Graph, and Razorpay test APIs.
4. **MaaS Gateway fourth:** Next.js route handlers wrap the ADK agent, handling token authentication, rate limiting, and webhook dispatching.
5. **Merchant Dashboard fifth:** Consumes gateway APIs and displays real-time transaction audit trails and Cytoscape.js graph state.
6. **Demo & Evaluation scripts last:** Built on top of the fully operational stack to execute the 3-act live demo and output precision/recall metrics on the 500-transaction benchmark.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Hackathon / MVP (0-1k txns/day)** | In-memory NetworkX graph rebuilt from PostgreSQL on boot. Single ADK agent instance on port 8000. SQLite or single-node PostgreSQL with pgvector. |
| **Growth Stage (1k-100k txns/day)** | Move Trust Graph to distributed graph database (e.g., Neo4j or Amazon Neptune) with Redis edge caching. Run ADK agent as auto-scaling container pool behind an internal load balancer. Add Redis queue for asynchronous webhook signal ingestion. |
| **Enterprise Network (100k+ txns/day)** | Kafka event streaming for real-time transaction signals. Graph Neural Network (GNN) inference service (e.g., PyTorch Geometric) for continuous embedding-based ring clustering. Database table partitioning on `audit_entries` and `transactions` by month/merchant. |

### Scaling Priorities

1. **First bottleneck (Trust Graph Memory & CPU):** NetworkX is single-threaded in Python. Under high concurrency, graph modifications lock the event loop. *Mitigation:* Offload graph reads to a read-only snapshot or transition to Neo4j/RedisGraph with connection pooling.
2. **Second bottleneck (Gemini Latency):** Sequential LLM parsing adds 1.2-1.8s per transaction. *Mitigation:* Use Gemini 2.0 Flash with explicit JSON schema output mode; fall back to regex/fast-path parser for structured agent callers that pass machine-formatted intents.
3. **Third bottleneck (PostgreSQL Audit Log Volume):** Append-only audit logs generate 6-7 rows per transaction. *Mitigation:* Range partition `audit_entries` by `timestamp` and archive historical entries older than 90 days to S3/Parquet.

---

## Anti-Patterns

### Anti-Pattern 1: Calling Payment Gateways Before Trust Verification (Trust-After-Creation)
**What people do:** Creating a payment gateway order first, then checking trust scores before capture, or checking trust asynchronously post-capture.  
**Why it's wrong:** Exposes merchant payment gateway limits to card testing attacks, leaves abandoned orders on merchant books, and risks chargebacks if capture cannot be aborted.  
**Do this instead:** Hard Trust Gate. Never invoke `create_razorpay_order` unless `check_trust_graph` returns `decision == "ALLOW"`.

### Anti-Pattern 2: Storing Buyer PII Plaintext in Graph Nodes
**What people do:** Adding raw buyer email addresses, phone numbers, and IP addresses as node labels in the shared network graph.  
**Why it's wrong:** Gross violation of privacy and DPDP Act regulations. Data leaks across merchants if one merchant accesses raw graph topology.  
**Do this instead:** One-way SHA-256 hashing on all identifiers (`sha256("email:" + email)`) and /24 subnet truncation for IP addresses prior to graph insertion.

### Anti-Pattern 3: Bypassing Gateway Auth with Direct UI-to-Agent Coupling
**What people do:** Letting the Next.js frontend talk directly to the agent or database without authenticating MaaS tokens.  
**Why it's wrong:** Any malicious caller can trigger agent loops, burn LLM quota, and drain merchant stock without authentication.  
**Do this instead:** Route all traffic through `/api/maas/**` route handlers that enforce hashed Bearer token authentication and merchant validation.

### Anti-Pattern 4: Failing Closed When Trust Graph Service is Unavailable
**What people do:** Throwing an unhandled 500 error or blocking all transactions if the Trust Graph microservice times out.  
**Why it's wrong:** Brings all merchant commerce to a standstill during graph reboots or temporary hiccups.  
**Do this instead:** Graceful degradation to `REVIEW` status (score 50) with an explicit warning logged in the audit trail, allowing merchants to configure fallback behavior.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Razorpay API** | REST via `razorpay` Python SDK & Node SDK | Strict test mode (`rzp_test_...`). Orders created with paise integer amounts. Decrypted at moment of call. |
| **Razorpay Webhooks** | HTTP POST to `/api/webhooks/razorpay` | Authenticated via constant-time HMAC-SHA256 signature verification with `RAZORPAY_WEBHOOK_SECRET`. |
| **Google Gemini API** | `google-genai` / `google-adk` SDK | Used for Gemini 2.0 Flash intent parsing in ADK and `text-embedding-004` vector generation in catalog onboarding. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Next.js Gateway ↔ ADK Agent** | HTTP POST to `http://localhost:8000/run` | Next.js wraps request in ADK session envelope (`app_name`, `session_id`, `new_message`). |
| **ADK Agent ↔ Trust Graph** | HTTP POST to `http://localhost:8001/trust/score` | Synchronous call within `check_trust_graph` tool. 500ms timeout budget. |
| **Next.js Webhook ↔ Trust Graph** | HTTP POST to `http://localhost:8001/trust/signal` | Asynchronous fire-and-forget signal dispatch to update graph weights. |
| **Dashboard UI ↔ Next.js API** | SWR HTTP GET to `/api/dashboard/*` & `/trust/graph` | SWR client polls every 2 seconds for live transaction feed and graph updates. |
| **All Services ↔ PostgreSQL** | PostgreSQL TCP connection (Port 5432) | Node (`pg` connection pool) and Python (`asyncpg` pool). Zero-update trigger enforced on `audit_entries`. |

---

## Sources

- Razorpay API Official Documentation: Orders, Payments, Webhooks, Test Mode Credentials (`https://razorpay.com/docs/api`)
- Google Agent Development Kit (ADK) Documentation & Architecture Guide (`google-adk`)
- Google AI Studio Gemini 2.0 Flash API Reference & Structured Outputs (`https://ai.google.dev/docs`)
- NetworkX Graph Algorithms & Community Detection (`networkx.org`)
- NPCI Unified Agentic Payments (UAP) & x402 Protocol Whitepapers
- Nexus PRD v1.0 (`/home/zeph/Code/nexus/PRD.md`)
- Nexus Project Document (`/home/zeph/Code/nexus/.planning/PROJECT.md`)

---
*Architecture research for: Agentic Commerce & Network Risk Platform (Nexus)*  
*Researched: 2026-09-03*
