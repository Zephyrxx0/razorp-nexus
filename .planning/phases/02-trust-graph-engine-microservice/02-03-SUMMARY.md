# Plan 02-03 Summary: PostgreSQL Rehydration, Background Scheduler, Cytoscape Endpoints & FastAPI Microservice

## Overview
Plan 02-03 finalized the Trust Graph Engine Microservice by delivering PostgreSQL rolling 30-day historical rehydration with soft-start startup resilience (D-01, D-02), Cytoscape.js first-class graph models and extraction methods (D-13, D-14, D-15, D-16), a 5-minute periodic ring detection background scheduler (D-10), and assembling the complete FastAPI application running on port 8001 exposing `/health`, `/trust/score`, `/trust/signal`, `/trust/rings`, `/trust/node/{node_id}`, and merchant-filtered `/trust/graph`.

## Key Changes Delivered

### 1. PostgreSQL Rolling Rehydration & Soft-Start Resilience (`rehydration.py`)
- **Rolling 30-Day Query (D-01):** Implemented `rehydrate_from_db` querying `transactions` where `created_at >= NOW() - ($1 || ' days')::interval` ordered chronologically (`ASC`).
- **Graph Re-population:** Ingests historical transactions with original timestamps and outcome classifications, rebuilding accurate temporal weights and node counters. Runs `detect_all_rings` after ingestion to restore historical ring clusters (e.g., Clusters A and B).
- **Soft-Start Resilience (D-02):** Implemented `soft_start_rehydration_loop` catching startup database connection failures (`asyncpg.PostgresError`, `OSError`, `ConnectionRefusedError`), logging a soft-start warning, and polling every 5 seconds without blocking the FastAPI microservice from binding and serving requests.

### 2. Cytoscape.js First-Class Graph Serialization Models & Element Extractors (`cytoscape.py`, `graph_manager.py`)
- **Cytoscape Models (D-13, D-16):** Defined `CytoscapeNodeData`, `CytoscapeNode`, `CytoscapeEdgeData`, `CytoscapeEdge`, and `CytoscapeGraph` matching `{ data: { id, label, source, target, ... } }` specifications.
- **Rich Edge Attributes (D-16):** Edges include `source`, `target`, `weight`, `edge_type` (`SHARED_TRANSACTION`, `SUBNET_OVERLAP`), and `merchants_shared` list of merchant UUIDs for dynamic frontend styling.
- **Merchant Subgraph Extraction (D-15):** Added `get_merchant_subgraph` supporting optional `merchant_id` filtering and clamping results at `limit` (max 200 nodes) to ensure 60fps rendering in Cytoscape.js.
- **Node Inspection Profile (D-14):** Added `get_node_profile` extracting 1-hop ego subgraph, neighbor summaries, and transaction history metrics for the dashboard slide-out drawer.

### 3. Background Ring Sweep Scheduler (`scheduler.py`)
- **Periodic Full-Graph Sweep (D-10):** Implemented `periodic_ring_detection_sweep` running every 300 seconds (5 minutes), acquiring write lock to execute `detect_all_rings` across the entire in-memory graph and updating cached ring records.

### 4. FastAPI Application Assembly & Endpoints (`main.py`, `routes_health.py`, `routes_trust.py`, `config.py`)
- **Configuration (`config.py`):** BaseSettings model with `port = 8001`, `database_url`, `rehydrate_days = 30`, and `periodic_sweep_interval_sec = 300`.
- **Lifespan Management (`main.py`):** Configured application lifespan initializing `GraphManager`, managing background tasks (rehydration + scheduler), CORS middleware (`*`), and cleanup on shutdown.
- **Endpoints Implemented:**
  - `GET /` & `GET /health`: Service status and live topology metrics (`node_count`, `edge_count`, `ring_count`).
  - `POST /trust/score`: Real-time sub-5ms trust scoring under read lock returning `ScoreResponse`.
  - `POST /trust/signal`: Post-transaction outcome ingestion under write lock returning `SignalResponse` with synchronous 2-hop local ego check.
  - `GET /trust/rings`: Dual-layer ring telemetry returning business metrics and Cytoscape subgraphs (`RingDetailResponse`).
  - `GET /trust/node/{node_id:path}`: Detailed node profile drawer data (`NodeDetailResponse`) with 404 for missing entities.
  - `GET /trust/graph`: Induced Cytoscape graph payload (`CytoscapeGraph`) scoped to merchant and node limits.

## Verification Results
- `trust-graph-service/tests/test_rehydration.py`: 4 tests verifying successful historical SQL restoration, ring cluster recovery, and soft-start retry loops upon connection failure.
- `trust-graph-service/tests/test_graph_manager.py`: 10 tests verifying node/edge Cytoscape serialization, merchant filtering, 200-node limits, and node profiles.
- `trust-graph-service/tests/test_api.py`: 7 integration tests with FastAPI `TestClient` verifying all endpoints (`/health`, `/trust/score` ALLOW & DENY, `/trust/signal`, `/trust/rings`, `/trust/node/{id}`, `/trust/graph`).
- `trust-graph-service/tests/`: **38 passed tests in 1.91s** across entire test suite.

## Commits
- `e3083fd`: `feat(02-03): implement postgresql rolling rehydration with soft-start resilience`
- `8fb9a54`: `feat(02-03): implement cytoscape graph serialization models and extractors`
- `6a4b2a3`: `feat(02-03): assemble fastapi application, background scheduler and api routes`
