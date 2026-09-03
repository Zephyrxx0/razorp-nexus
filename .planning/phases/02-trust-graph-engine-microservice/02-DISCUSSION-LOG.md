# Phase 2: Trust Graph Engine Microservice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 2-Trust Graph Engine Microservice
**Areas discussed:** Rehydration & Ingestion, Scoring Dynamics & Recovery, Ring Detection Execution & Concurrency, Ring Topology & Graph Query API

---

## Rehydration & Ingestion

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling 30-day window | Load transactions from the last 30 days (fast boot, bounds memory while retaining sufficient history for ring clustering) | ✓ |
| All historical transactions | Load every transaction in PostgreSQL without time cutoff | |
| Configurable limit | Default to last 10,000 transactions or 30 days via environment variable | |
| You decide | Pick the best balance of boot speed and detection accuracy | |

**User's choice:** Rolling 30-day window
**Notes:** Bounded memory footprint while preserving multi-merchant ring detection history.

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-start with empty graph + background retry | Boot immediately on port 8001 with 0 nodes, log warning, and trigger background rehydration task until DB connects | ✓ |
| Fail-fast | Raise an exception and abort container boot if PostgreSQL is unreachable | |
| Degraded read-only mode | Serve health checks as healthy but return score=50 (REVIEW) for all requests until initial rehydration completes | |
| You decide | Choose the standard production resilience pattern | |

**User's choice:** Soft-start with empty graph + background retry
**Notes:** Microservice boots cleanly and retries in background without blocking container startup.

| Option | Description | Selected |
|--------|-------------|----------|
| Prefixed type string: `{signal_type}:{signal_val}` | Human-readable for debugging, dashboard Cytoscape labels, and audit timelines (e.g. `email:a3f8...`, `ip:103.21.44`) | ✓ |
| Full SHA-256 hash | Strictly opaque 64-char hex strings with type stored purely in node attributes | |
| Dual representation | Prefixed identifier as node key, with short hash for DOM element IDs | |
| You decide | Choose the cleaner representation | |

**User's choice:** Prefixed type string: `{signal_type}:{signal_val}`
**Notes:** Provides direct visual clarity in Cytoscape and audit logs without secondary lookups.

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory only in Trust service | /trust/signal updates the in-memory NetworkX graph immediately; PostgreSQL persistence is handled by Next.js / Razorpay webhook | ✓ |
| Dual write | /trust/signal updates in-memory graph AND updates an asyncpg connection pool | |
| Periodic state snapshot | Dump graph state/metrics to snapshot table every 10 minutes | |
| You decide | Choose the lowest-latency path | |

**User's choice:** In-memory only in Trust service
**Notes:** Clean separation of concerns between relational ledger persistence and in-memory graph state.

---

## Scoring Dynamics & Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive trust building | New entity penalty (-10) drops to 0 after 2 successful transactions; clean history adds up to +5 bonus (capped at 100) | ✓ |
| Strict penalty-only model | Score starts at 100, penalties only subtract, new entity penalty drops to 0 after 1 successful txn | |
| Exponential trust growth | Each successful purchase with clean signals adds +2 trust, known fraud penalties remain permanent | |
| You decide | Balance fraud defense strictness with legitimate repeat-buyer experience | |

**User's choice:** Progressive trust building
**Notes:** Encourages legitimate repeat buyer agents while preserving defense strictness.

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered signal weighting | Email and device hashes carry 100% penalty weight; IP subnet carries 50% penalty weight | ✓ |
| Equal signal weighting | All 5 fingerprint signals carry equal penalty weight across graph traversals | |
| Subnet threshold damping | IP subnet requires >= 3 confirmed fraud transactions before propagating penalties | |
| You decide | Choose configuration that best minimizes false-positive rupee cost | |

**User's choice:** Tiered signal weighting
**Notes:** Prevents innocent users on shared Wi-Fi or ISP /24 subnets from false-positive blocking.

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential half-life decay | Failed txn penalties decay with a 7-day half-life; velocity windows are strictly time-windowed (sliding 60m and 24h) | ✓ |
| Strict static flags with rolling window | High velocity expires strictly after 60m/24h; known_fraud tags are permanent until unflag/restart | |
| Linear daily decay | Node risk decreases by 10% each day without new incidents | |
| You decide | Pick standard fraud engineering approach | |

**User's choice:** Exponential half-life decay
**Notes:** Realistic risk attenuation that naturally resolves transient failures over a 7-day half-life.

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful partial evaluation | Score against available signals, apply missing signal penalty (-5 per missing if fewer than 3 provided) | ✓ |
| Permissive evaluation | Score against whatever signals are present with zero penalty | |
| Strict rejection | Require all 5 signals and return 422 Unprocessable Entity | |
| You decide | Best developer experience for autonomous agents | |

**User's choice:** Graceful partial evaluation
**Notes:** Enables lightweight CLI / agent purchases while applying bounded uncertainty penalty.

---

## Ring Detection Execution & Concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Read-write lock pattern | asyncio.Lock for mutations, concurrent reads; /trust/score reads without blocking readers (<10ms) | ✓ |
| Single asyncio.Lock for all access | Protect both reads and writes with a single mutual exclusion lock | |
| Thread executor offload | Offload heavy NetworkX operations to a background thread pool executor | |
| You decide | Safest locking mechanism maintaining sub-50ms p99 latency | |

**User's choice:** Read-write lock pattern
**Notes:** Guarantees graph integrity during signal ingestion while keeping scoring lookups ultra-fast.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual execution | Synchronous local 2-hop ego component check (<5ms) to catch immediate ring connections + periodic background full sweep | ✓ |
| Strictly background | Ingest immediately and run ring detection asynchronously in a background task | |
| Synchronous full sweep | Run complete connected-components sweep across entire graph on every signal | |
| You decide | Optimize for instantaneous ring interception | |

**User's choice:** Dual execution
**Notes:** Delivers instant interception of expanding rings with sub-5ms local traversals, backed by 5-minute global sweeps.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict PRD §12.3 specification | >= 3 nodes, >= 2 distinct merchants, average degree >= 1.5, >= 1 failure/block on record; risk CRITICAL if >= 5 merchants | ✓ |
| Configurable threshold parameters | Expose minimum nodes, merchant spread, and degree via environment variables | |
| Aggressive clustering | >= 2 nodes across >= 2 merchants with high co-occurrence regardless of degree | |
| You decide | Balance recall and false positive defense | |

**User's choice:** Strict PRD §12.3 specification
**Notes:** Adheres strictly to the proven ring detection specification from the PRD.

| Option | Description | Selected |
|--------|-------------|----------|
| Stable Ring ID with immediate propagation | Retain stable UUID for existing rings, merge overlapping into oldest UUID, set is_known_fraud=True and trust_score=0 | ✓ |
| Regenerate Ring IDs on every sweep | Clean-slate ring IDs generated on each clustering pass | |
| Quarantine stage before zeroing | New nodes enter temporary SUSPECT quarantine status (score=30) | |
| You decide | Cleanest approach for Cytoscape and audit tracking | |

**User's choice:** Stable Ring ID with immediate propagation
**Notes:** Consistent ring identifiers across dashboard polling cycles with zero tolerance for newly attached ring members.

---

## Ring Topology & Graph Query API

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-layer response | Business metadata (ring_id, risk_level, affected_merchants, blocked_txns, blocked_paise) AND Cytoscape elements (nodes, edges) | ✓ |
| Summary metadata only | Summary metadata and node IDs; separate topology endpoint on demand | |
| Raw NetworkX node-link JSON | Direct networkx.node_link_data() serialization | |
| You decide | Cleanest structure for Next.js 14 and Cytoscape.js | |

**User's choice:** Dual-layer response
**Notes:** Single query provides both the high-level metrics cards and visualizer elements in the dashboard.

| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive node profile | signal_type, signal_value, is_known_fraud, ring_id, first/last seen, txn counts, merchants seen, 1-hop summary, ego subgraph | ✓ |
| Basic attributes only | Strictly node properties without neighbor lists or subgraph data | |
| Transaction history list | Node properties plus recent transaction IDs | |
| You decide | Provide necessary attributes for slide-out drawer | |

**User's choice:** Comprehensive node profile
**Notes:** Powers the slide-out inspection drawer in Phase 5 with complete diagnostic context.

| Option | Description | Selected |
|--------|-------------|----------|
| `GET /trust/graph` with optional merchant_id filter and limit | Returns Cytoscape elements with merchant-scoped filtering (defaults to max 200 nodes for 60fps) | ✓ |
| Unfiltered `GET /trust/graph` only | Returns all non-isolated nodes and edges | |
| Only ring-specific graphs | No whole-graph endpoint; only ring and ego subgraphs | |
| You decide | Optimize for Cytoscape.js rendering performance | |

**User's choice:** `GET /trust/graph` with optional merchant_id filter and limit
**Notes:** Prevents browser DOM lag by scoping graph size while providing merchant-relevant visual telemetry.

| Option | Description | Selected |
|--------|-------------|----------|
| Rich edge attributes | source, target, weight (co-occurrences), edge_type (SHARED_TRANSACTION, SUBNET_OVERLAP), merchants_shared count | ✓ |
| Minimal edge attributes | Strictly source, target, and numeric weight | |
| Multi-graph edge list | Multiple discrete edges between the same two nodes | |
| You decide | Standard schema pairing cleanly with Cytoscape cose-bilkent layout | |

**User's choice:** Rich edge attributes
**Notes:** Allows front-end styling of edge thickness, colors, and relationship tooltips in Cytoscape.

---

## The Agent's Discretion

- Internal organization of `trust-graph-service/` codebase (routes, models, core engine, background tasks).
- Exact Pydantic model serialization aliases for Cytoscape elements (`data.id`, `data.source`, etc.).
- Choice between native `asyncio.create_task` loop vs APScheduler for periodic 5-minute full-graph sweep.

## Deferred Ideas

None — discussion stayed within Phase 2 Trust Graph microservice boundary.
