# Stack Research

**Domain:** Agentic Commerce (MaaS) and Cross-Merchant Fraud Risk Management  
**Researched:** 2026-09-03  
**Confidence:** HIGH  

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js (App Router)** | `14.2.24` | Merchant Dashboard UI & MaaS API Gateway | Colocates the public-facing MaaS API route handlers (`/api/maas/{merchant_id}/*`), merchant onboarding/catalog views, and Razorpay webhook receivers in a single high-performance TypeScript framework. Server Components and Route Handlers isolate API secrets, while streaming UI handles live agent telemetry without separate backend gateway layers. |
| **TypeScript** | `^5.5.4` | End-to-end static typing | Enforces strict compile-time validation across complex multi-service data models: buyer fingerprints, semantic catalog schemas, trust decision envelopes, and immutable audit logs. Prevents null-pointer and shape-drift bugs during rapid integration. |
| **Tailwind CSS** | `^3.4.10` | Utility-first UI styling | Eliminates runtime styling overhead and provides rapid layout iteration for dense, data-rich fintech screens (onboarding wizard, audit timeline, metrics panel). Seamlessly pairs with Radix UI primitives and class merging utilities. |
| **Cytoscape.js** | `^3.30.2` | Interactive Trust Graph visualizer | High-performance HTML5 Canvas/WebGL graph visualization library. Capable of smoothly rendering hundreds of nodes (email hashes, IP subnets, device IDs) and dynamic edges with force-directed physics layout (`cose-bilkent`), making multi-merchant fraud rings immediately identifiable in the dashboard demo. |
| **Google ADK (`google-adk`)** | `^0.1.0` | Agent runtime & tool orchestration | Google's first-party agent development framework. Offers type-safe `FunctionTool` definitions, multi-turn state management, and the native `adk api_server` CLI, which exposes the agent orchestration loop as a REST endpoint directly consumable by Next.js without custom wrapper servers. |
| **Gemini 2.0 Flash (`google-generativeai`)** | `^0.8.3` (`gemini-2.0-flash-exp`) | High-speed LLM intent parsing & semantic orchestration | Sub-2-second tool-calling latency is essential to achieve the target end-to-end commerce transaction latency of <8 seconds. Highly reliable at structured parameter extraction and natural language catalog query mapping. |
| **FastAPI** | `^0.115.0` | High-performance Trust Graph microservice | Asynchronous Python ASGI microservice framework. Pairs natively with Pydantic v2 for sub-millisecond serialization and validation, delivering the <500ms trust scoring latency requirement for real-time transaction gating. |
| **NetworkX** | `^3.3` | In-memory graph analytics & ring clustering | Pure Python graph engine providing instant in-memory graph traversals, connected component extraction (`nx.connected_components`), k-hop neighbor risk aggregation, and ego-graph generation without external distributed database latency. |
| **asyncpg** | `^0.29.0` | High-throughput async PostgreSQL driver | Direct binary protocol driver for Python and PostgreSQL. Achieves maximum throughput for ingesting concurrent buyer fingerprint signals and persisting immutable audit log entries with minimal CPU overhead. |
| **Pydantic** | `^2.9.2` | Data validation & settings management | Powered by `pydantic-core` (Rust). Guarantees strict type safety, automatic schema generation for ADK tools, and rigorous sanitization of incoming untrusted buyer fingerprints and webhook payloads. |
| **PostgreSQL + pgvector** | `PostgreSQL 16` + `pgvector 0.7.4` | Relational source-of-truth & vector search | Provides ACID relational guarantees for merchants, products, transactions, and immutable audit logs. The `pgvector` extension natively indexes 768-dimensional Gemini `text-embedding-004` product embeddings via cosine similarity (`<=>`), enabling semantic catalog search without external vector DBs. |
| **Razorpay SDKs** | Node `^2.9.4` / Python `^1.4.1` | Payment gateway integration (Test Mode) | Official API clients for creating orders, auto-capturing payments in test mode, querying transaction status, and validating HMAC-SHA256 webhook signatures. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-*` | `latest` | Accessible, unstyled UI primitives | Modals, tabs, dropdowns, and tooltips in the merchant dashboard. |
| `lucide-react` | `^0.441.0` | Lightweight UI iconography | Visual indicators for trust scores (shield, alert, check, ban), navigation icons. |
| `recharts` | `^2.12.7` | Dashboard metric charting | Rendering real-time precision/recall curves, false-positive cost tracking, and transaction volume charts. |
| `swr` | `^2.2.5` | Client-side data fetching & polling | Live auto-refreshing of the transaction feed and periodic polling of the trust graph endpoint (`/trust/rings`). |
| `cytoscape-cose-bilkent` | `^4.1.0` | CoSE layout algorithm for Cytoscape | Force-directed clustering layout that naturally pulls dense fraud ring components into visible clusters. |
| `clsx` & `tailwind-merge` | `^2.1.1` & `^2.5.2` | Dynamic class utilities | Conditional styling of transaction status badges and trust score indicators. |
| `uvicorn` | `^0.30.6` | ASGI production server | Running the FastAPI Trust Graph microservice on port 8001. |
| `httpx` | `^0.27.2` | Asynchronous HTTP client | Inter-service calls between Next.js API routes, ADK agent server, and Trust Graph service. |
| `numpy` | `^1.26.4` | Numerical operations | Computing statistical graph metrics, decay factors, and benchmark evaluation statistics (F1, precision, recall). |
| `python-dotenv` | `^1.0.1` | Environment variable loader | Loading configuration in Python services during local execution and testing. |
| `pytest` & `pytest-asyncio` | `^8.3.3` & `^0.24.0` | Automated test suite | Unit and integration testing for graph scoring algorithms, ADK tools, and mock Razorpay flows. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Docker Compose** | Local multi-service orchestration | Runs PostgreSQL 16 with `pgvector` pre-installed (`pgvector/pgvector:pg16`), exposing port 5432. |
| **Google ADK CLI (`adk`)** | Agent execution and developer server | Launches the agent API server (`adk api_server agents/orchestrator.py --port 8000`) or interactive web UI (`adk web`). |
| **OpenSSL** | Cryptographic key generation | Generates 32-byte hex encryption keys (`openssl rand -hex 32`) for AES-256-GCM encryption of merchant API secrets. |
| **Razorpay Dashboard (Test Mode)** | API key provisioning & transaction verification | Sourcing test key pairs (`rzp_test_*`) and verifying order/payment records created by the ADK agent. |
| **Obscura (`obscura`)** | Lightweight headless browser & CDP runner | Automates browser sessions, testing, and scraping. Run `obscura serve -p 9222 --allow-private-network` for local CDP automation or `obscura scrape <url>` / `obscura fetch <url>`. |
| **Graphify (`graphify`)** | Code intelligence & knowledge graph CLI | Extracts AST & semantic dependency graphs (`graphify extract <path> --backend gemini`). Queries architecture hubs (`graphify god-nodes`), traces paths (`graphify path`), and visualizes trees (`graphify tree`). |
| **Fallow (`fallow` / `npx fallow`)** | TypeScript/JS codebase analyzer | Enforces dead code elimination, dependency hygiene, and architectural boundaries. Runs `fallow dead-code`, `fallow dupes`, `fallow health --hotspots`, `fallow guard`, and `fallow audit --base <ref>`. |


---

## Installation

### 1. Frontend & API Gateway (Next.js 14)

```bash
# Core framework and SDKs
npm install next@14.2.24 react@18.3.1 react-dom@18.3.1 typescript@^5.5.4 razorpay@^2.9.4 pg@^8.12.0

# UI Primitives, Styling, and Charts
npm install tailwindcss@^3.4.10 postcss@^8.4.45 autoprefixer@^10.4.20
npm install @radix-ui/react-dialog @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-toast
npm install lucide-react@^0.441.0 recharts@^2.12.7 swr@^2.2.5 clsx@^2.1.1 tailwind-merge@^2.5.2

# Graph Visualization
npm install cytoscape@^3.30.2 cytoscape-cose-bilkent@^4.1.0
npm install -D @types/cytoscape@^3.21.7

# Developer Dependencies
npm install -D @types/node@^20.16.5 @types/react@^18.3.5 @types/react-dom@^18.3.0 @types/pg@^8.11.8
```

### 2. Agent Orchestration Layer (`nexus-agent`)

```bash
# In nexus-agent/
python -m venv .venv
source .venv/bin/activate

# Core Google ADK, Gemini, and Tools
pip install google-adk google-generativeai>=0.8.3
pip install razorpay>=1.4.1 pydantic>=2.9.2 httpx>=0.27.2 asyncpg>=0.29.0 python-dotenv>=1.0.1
pip install pytest>=8.3.3 pytest-asyncio>=0.24.0
```

### 3. Trust Graph Engine (`trust-graph-service`)

```bash
# In trust-graph-service/
python -m venv .venv
source .venv/bin/activate

# FastAPI, NetworkX, and Data Processing
pip install fastapi>=0.115.0 uvicorn[standard]>=0.30.6 networkx>=3.3 numpy>=1.26.4
pip install pydantic>=2.9.2 asyncpg>=0.29.0 httpx>=0.27.2 python-dotenv>=1.0.1
pip install pytest>=8.3.3 pytest-asyncio>=0.24.0
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Next.js 14 App Router** | Vite + React SPA + Express | When developing purely decoupled micro-frontends with an existing standalone Node.js gateway; however, Next.js colocation of server-side API routes and SSR/client UI eliminates extra service overhead and simplifies deployment. |
| **Next.js 14** | Next.js 15 | Next.js 15 introduces breaking async request APIs and React 19 peer dependencies that cause instability with certain UI libraries during rapid prototyping. Next.js 14 is rock-solid and battle-tested. |
| **Google ADK + Gemini 2.0 Flash** | LangChain / LangGraph + GPT-4o | When building complex non-Google ecosystem agents requiring external community integrations. For hackathons focusing on Google AI tools and latency-critical tool calls, Google ADK + Gemini 2.0 Flash provides native CLI tooling (`adk api_server`) and sub-2s response cycles. |
| **In-Memory NetworkX** | Neo4j / Memgraph / AWS Neptune | In enterprise production with hundreds of millions of persistent graph nodes across distributed clusters. For hackathons and prototypes with thousands of transactions, NetworkX in-memory (rebuilt from PostgreSQL on startup) provides instant sub-millisecond graph traversals with zero operational friction. |
| **asyncpg + Raw SQL** | Prisma ORM / SQLAlchemy | When schema migrations require automated ORM introspection. However, Prisma has historically had edge-case limitations with `pgvector` operators (`<=>`), and asyncpg delivers raw binary-protocol performance needed for high-velocity transaction bursts. |
| **PostgreSQL `pgvector`** | Pinecone / Qdrant / Weaviate | When the vector dataset exceeds tens of millions of items with dedicated semantic filtering pipelines. For merchant product catalogs (hundreds to thousands of SKUs), `pgvector` colocates relational stock data with embeddings, preventing distributed transaction splits. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Floating-point Currency (`float` / `number` in ₹)** | IEEE 754 floating-point arithmetic causes precision drift (e.g., `0.1 + 0.2 = 0.30000000000000004`), resulting in corrupted ledger amounts and Razorpay payment mismatch rejections. | **Integer Paise (`amount_paise`)**: Store and calculate all money values as integer paise (e.g., ₹1,999 = `199900`). Convert to display strings only at UI rendering boundaries. |
| **Heavy Graph Databases (Neo4j, Amazon Neptune)** | Massive Docker resource footprints, slow local startup, Cypher query overhead, and multi-service orchestration latency that breaks the <500ms trust scoring budget. | **NetworkX In-Memory Graph**: Kept entirely in RAM for sub-10ms graph traversals, with node/edge state deterministically rebuilt on boot from the PostgreSQL transaction log. |
| **Unbounded Autonomous ReAct Loops** | Open-ended agent thinking loops can hallucinate, loop infinitely, or reorder financial execution steps, risking multiple unintended payment attempts. | **Strict 6-Step Deterministic Tool Chain**: Hard-coded execution contract in Google ADK (`parse_intent` → `resolve_catalog` → `check_trust_graph` → `create_razorpay_order` → `capture_razorpay_payment` → `log_audit_entry`). |
| **Plaintext Storage of Secrets & Buyer PII** | Exposes merchant Razorpay keys and buyer privacy to compliance and security breaches, violating hackathon defense-only requirements. | **AES-256-GCM & SHA-256 Hashing**: Encrypt merchant secrets with AES-256-GCM; hash buyer emails and user agents via SHA-256; truncate IP addresses to /24 subnets before DB/graph ingestion. |
| **Client-Side Razorpay API Invocations** | Client-initiated checkout flows bypass backend trust gates and expose merchant secret keys in browser network inspectors. | **Server-to-Server Razorpay API**: The ADK agent orchestrator creates and captures test-mode orders entirely backend-to-backend after trust verification. |
| **Unverified Razorpay Webhook Callbacks** | Attackers can forge unauthenticated HTTP POST requests to fake successful payment status transitions. | **HMAC-SHA256 Timing-Safe Verification**: Enforce cryptographic verification of `X-Razorpay-Signature` with `crypto.timingSafeEqual`. |

---

## Stack Patterns by Variant

**If Cold Start or Service Restart:**
- Rebuild the NetworkX graph in memory directly from PostgreSQL by querying the `transactions` table.
- Because NetworkX is an ephemeral in-memory structure, keeping PostgreSQL as the immutable relational source of truth ensures zero data loss between container restarts.

**If Trust Graph Service is Unavailable / Times Out:**
- Soft-fail the transaction check to a neutral default trust score of `50` (`decision: "REVIEW"`) and log a risk factor warning (`"trust_service_unavailable"`).
- Because hard-failing closed would halt all merchant commerce during transient internal network hiccups, soft-failing with an explicit audit log allows transactions to proceed with elevated monitoring.

**If Buyer Intent is Ambiguous or Query Low-Confidence (< 0.7):**
- Short-circuit the transaction loop before catalog reservation and return an informative `422 Unprocessable Entity` with structured suggestions.
- Because guessing an unintended product or incorrect quantity creates merchant chargeback disputes and inventory lockouts.

**If Merchant Catalog Exceeds 10,000 SKUs:**
- Switch PostgreSQL `pgvector` indexing from flat sequential scan to an `HNSW` (Hierarchical Navigable Small World) index: `CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops)`.
- Because HNSW provides logarithmic query time scaling for high-dimensional vector similarity while preserving >99% recall.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@14.2.24` | `react@18.3.1`, `react-dom@18.3.1` | App Router is completely stable. Avoid React 19 RC/Canary to prevent peer dependency conflicts with Radix UI and Cytoscape wrappers. |
| `fastapi@0.115.0` | `pydantic@2.9.2` | Leverages Pydantic V2 Rust core serialization; do not mix with legacy Pydantic v1 imports (`pydantic.v1`). |
| `networkx@3.3` | `numpy@1.26.4` / `numpy@2.0.x`, `python@3.11+` | Ensures high-speed graph metric calculations and sub-graph isomorphism/connected component functions. |
| `google-adk@0.1.0+` | `google-generativeai@0.8.3+` | Compatible with Gemini 2.0 Flash (`gemini-2.0-flash-exp`) endpoint for function tool declarations. |
| `cytoscape@3.30.2` | `cytoscape-cose-bilkent@4.1.0` | Provides physics-based layout for clustering fraud rings. Registered via `cytoscape.use(coseBilkent)` in client components. |
| `pgvector@0.7.4` | `PostgreSQL 16` | Supports 768-dimensional float32 vector column types and HNSW/IVFFlat index operations with cosine similarity (`<=>`). |

---

## Sources

- `PRD.md` — Complete system architecture, API schemas, and component requirements for Project Nexus.
- `PROJECT.md` — Core value proposition, constraints, active requirements, and key technical decisions.
- Official Google Agent Development Kit (ADK) Guidelines — `adk api_server` specification and FunctionTool definitions.
- Razorpay API Documentation — Test mode order creation, payment capture, and webhook HMAC signature standards.
- Next.js 14 App Router Documentation — Route Handlers, Server Components, and streaming responses.
- NetworkX 3.3 Reference Manual — Algorithms for connected components and subgraph clustering.

---
*Stack research for: Agentic Commerce (MaaS) and Cross-Merchant Fraud Risk Management*  
*Researched: 2026-09-03*  
