# Plan 02-02 Summary: Trust Scoring Pipeline & Connected Components Fraud Ring Detector

## Overview
Plan 02-02 implemented the deterministic 7-step trust scoring engine (`scoring.py`), the connected components fraud ring detection engine with stable UUID merging (`ring_detector.py`), and integrated synchronous 2-hop local ego ring checks (<5ms) into signal ingestion within `GraphManager` (`graph_manager.py`).

## Key Changes Delivered

### 1. 7-Step Trust Scoring Pipeline (`trust-graph-service/app/engine/scoring.py`)
- **Step 1 (Missing Signal Penalty, D-08):** Evaluates non-null signals in fingerprint; applies `-5.0` penalty for each missing signal below 3 (`3 - count`).
- **Step 2 (New Entity vs Progressive Trust, D-05):** Applies `-10.0` penalty for entities with no transaction history or fewer than 2 clean transactions; drops penalty to `0.0` after 2 clean transactions; awards `+5.0` reputation bonus for >= 5 clean transactions with 0 failures.
- **Step 3 (Known Fraud Direct Node Check, PRD §12.2, D-06):** Directly penalizes known fraud nodes with `-80.0` (direct identifiers) or `-40.0` (IP subnet tier).
- **Step 4 (1-Hop and 2-Hop Fraud Neighbors with Tiered Subnet Weighting, D-06):** Calculates adjacent fraud neighbor penalties with a 50% tier weight (`0.5`) if connections are exclusively via IP subnet, else `1.0`.
- **Step 5 (Sliding Velocity Penalties, D-07):** Evaluates unique transactions in the sliding 60-minute window (`-10.0` for >5 attempts, `-25.0` for >10 attempts).
- **Step 6 (Cross-Merchant Spread Penalties):** Tracks unique merchants transacted across in the sliding 24-hour window (`-15.0` for >3 merchants, `-35.0` for >5 merchants).
- **Step 7 (Ring Membership Penalty, D-12):** Immediately sets score to `0.0` (`-100.0` penalty) if any node belongs to an active detected fraud ring.
- **Step 8 (Exponential Half-Life Decay, D-07):** Evaluates decayed failure weight $\sum 2^{-\Delta t / 7}$ for past failures, applying up to `-15.0` decaying penalty.
- **Step 9 (Clamping & Categorization):** Clamps raw score between `0.0` and `100.0`, assigning `ALLOW` (>= 70.0), `REVIEW` (40.0–69.9), or `DENY` (< 40.0).

### 2. Connected Components Fraud Ring Detector (`trust-graph-service/app/engine/ring_detector.py`)
- Implemented `detect_rings_in_subgraph` and `detect_all_rings` strictly enforcing PRD §12.3 criteria (D-11):
  1. Node count $\ge 3$
  2. Merchant span $\ge 2$ distinct merchants
  3. Average internal degree $\ge 1.5$
  4. Failed/denied transactions $\ge 1$
- **Risk Level Assignment:** `CRITICAL` if $\ge 5$ distinct merchants, else `HIGH`.
- **Stable UUID Merging (D-12):** Detects existing ring IDs across component nodes; preserves the oldest/lexically first canonical UUID upon cluster merging.
- **Node Propagation:** Immediately marks all constituent nodes with `is_known_fraud=True`, `trust_score=0.0`, and `ring_id=canonical_ring_id`.
- **Paise Deduplication:** Deduplicates failed transaction IDs across member nodes before summing `blocked_amount_paise`.
- **Cytoscape Element Formatting (D-13, D-16):** Formats nodes and edges with rich styling metadata for the Phase 5 dashboard visualizer.

### 3. Synchronous 2-Hop Local Ego Ring Detection on Ingestion (`graph_manager.py`)
- Integrated `check_local_ego_rings` into `GraphManager.ingest_signal` (Decision D-10).
- Upon ingesting a transaction, extracts the 2-hop neighborhood of touched nodes and runs `detect_rings_in_subgraph`, updating `self.rings` in <5ms.
- Updated `ingest_signal` return signature to `(nodes_updated, edges_updated, rings_detected)`.

## Verification Results
- `trust-graph-service/tests/test_scoring.py`: 9 unit tests verifying all scoring steps, tiered weights, velocity windows, and decay dynamics.
- `trust-graph-service/tests/test_ring_detector.py`: 8 unit tests verifying criteria rejections, qualification, CRITICAL risk scaling, stable UUID merging, paise deduplication, and synchronous ego detection on ingestion.
- `trust-graph-service/tests/test_graph_manager.py`: 7 unit tests verifying node normalization, clique creation, weights, and concurrency lock.
- **Total:** 24 passed tests in 0.34s (`pytest trust-graph-service/tests/ -v`).

## Commits
- `d2cd6ce`: `feat(02-02): implement 7-step trust scoring engine with decay and tiered weights`
- `dd11641`: `feat(02-02): implement connected components fraud ring detection engine`
- `da3a202`: `feat(02-02): integrate synchronous 2-hop local ego ring detection on signal ingestion`
