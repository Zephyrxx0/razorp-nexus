# Phase 2: Trust Graph Engine Microservice - Codebase Patterns & Analog Map

**Generated:** 2026-09-03  
**Status:** Complete & Ready for Planning  
**Phase Directory:** `/home/zeph/Code/nexus/.planning/phases/02-trust-graph-engine-microservice`  
**Target File:** `02-PATTERNS.md`  

---

## 1. Executive Summary & Mapping Overview

Phase 2 builds the **Trust Graph Engine Microservice** (`trust-graph-service`), a high-performance Python FastAPI service running on port `8001`. This service serves as the core real-time, network-level fraud defense layer for Project Nexus (Track 02: AI Risk Manager).

The service maintains an in-memory, undirected, weighted graph using **NetworkX 3.6+**, backed by **PostgreSQL 16** for persistent rehydration on startup. It provides sub-5ms trust scoring (`POST /trust/score`), real-time signal feedback ingestion (`POST /trust/signal`), dual-execution multi-merchant fraud ring clustering (synchronous 2-hop local ego check + 5-minute background full sweep), and first-class Cytoscape.js graph serialization for the Next.js merchant dashboard (`GET /trust/rings`, `GET /trust/node/{node_id}`, `GET /trust/graph`).

This document maps all files to be created in Phase 2 against the existing codebase patterns established in Phase 1 (`db/py/nexus_db/`, `db/fixtures/`, `db/py/tests/`), extracting concrete code analogies, data flows, and structural contracts.

---

## 2. File Inventory & Classification Matrix

| File Path | Role | Data Flow Direction | Closest Existing Analog | Key Pattern / Responsibility |
|---|---|---|---|---|
| `trust-graph-service/pyproject.toml` | Build & Packaging Configuration | Build / Tooling Config | `db/py/pyproject.toml` | PEP 621 metadata, setuptools build system, dependencies, `tool.pytest.ini_options` with multi-directory pythonpath. |
| `trust-graph-service/app/config.py` | Environment Settings | Inbound (Env Vars) -> App Config | `db/py/nexus_db/client.py` | Pydantic v2 `BaseSettings` / dataclass loading `PORT=8001`, `DATABASE_URL`, `REHYDRATION_DAYS=30`. |
| `trust-graph-service/app/models/schemas.py` | Request & Response Schemas | Inbound / Outbound DTOs | `db/py/nexus_db/models.py` | Pydantic v2 models with `ConfigDict(extra="ignore")`, strict types, integer paise, 0–100 score constraints. |
| `trust-graph-service/app/models/cytoscape.py` | Graph Visualization Models | Outbound JSON Serialization | `db/py/nexus_db/models.py` | Typed schemas for Cytoscape.js elements: `{ data: { id, label, source, target, ... } }`. |
| `trust-graph-service/app/core/lock.py` | Concurrency Control | Internal Engine Coordination | `db/py/nexus_db/client.py` (async resource mgmt) | Custom `AsyncRWLock` enabling concurrent parallel readers with exclusive writer isolation. |
| `trust-graph-service/app/core/scheduler.py` | Background Task Orchestration | Internal Lifecycle -> Periodic Jobs | `db/py/nexus_db/client.py` (lifecycle hooks) | Background `asyncio` task running periodic 5-minute full graph connected-component ring sweeps. |
| `trust-graph-service/app/engine/graph_manager.py` | In-Memory Graph State Container | In-Memory Store & Query Hub | `db/py/nexus_db/crypto.py`, `db/py/nexus_db/sanitize.py` | NetworkX `nx.Graph` container, node format `{type}:{val}`, weighted clique edges, ego-graph extraction. |
| `trust-graph-service/app/engine/scoring.py` | 7-Step Trust Scoring Pipeline | Query Input -> 0–100 Trust Score | `db/py/nexus_db/audit.py` (deterministic rule verification) | Multi-step mathematical penalty evaluation: new entity, direct fraud, 1/2-hop neighbors, tiered subnets, decay. |
| `trust-graph-service/app/engine/ring_detector.py` | Graph Analytics & Ring Detection | Graph Subgraphs -> Ring Envelopes | `db/py/nexus_db/audit.py` (chain validation & integrity) | `nx.connected_components()` validation: >=3 nodes, >=2 merchants, avg degree >=1.5, >=1 fail, stable UUIDs. |
| `trust-graph-service/app/engine/rehydration.py` | Database Startup Restoration | PostgreSQL -> In-Memory Graph | `db/py/nexus_db/client.py` (`get_pool`, query exec) | Rolling 30-day window query (`NOW() - INTERVAL '30 days'`), soft-start resilience, background retry loop. |
| `trust-graph-service/app/api/routes_trust.py` | Core Trust HTTP Endpoints | External HTTP -> Internal Engine | FastAPI router pattern | `POST /trust/score`, `POST /trust/signal`, `GET /trust/rings`, `GET /trust/node/{id}`, `GET /trust/graph`. |
| `trust-graph-service/app/api/routes_health.py` | Health & Telemetry Probes | HTTP Probe -> Diagnostic Status | Health check pattern | `GET /health`, `GET /` returning service status, graph node/edge counts, and DB connection state. |
| `trust-graph-service/app/main.py` | FastAPI Application Factory | Lifecycle Bootstrapper | `db/py/nexus_db/client.py` (init/close lifecycle) | App creation, CORS middleware, lifespan context manager (DB pool, rehydration, scheduler), router inclusion. |
| `trust-graph-service/tests/conftest.py` | Pytest Harness & Shared Fixtures | Test Runner Setup | `db/py/tests/test_crypto.py` | Shared fixtures: `TestClient`, isolated `GraphManager`, seed transaction datasets, mock database pool. |
| `trust-graph-service/tests/test_graph_manager.py` | Unit Tests: Graph Mutations | Test Execution | `db/py/tests/test_crypto.py` | Unit tests for node creation (`{type}:{val}`), clique edge weight increments, and lock safety. |
| `trust-graph-service/tests/test_scoring.py` | Unit Tests: 7-Step Scoring | Test Execution | `db/py/tests/test_crypto.py` | Unit tests verifying score arithmetic, tiered subnet weighting (50%), velocity windows, half-life decay. |
| `trust-graph-service/tests/test_ring_detector.py` | Unit Tests: Fraud Ring Detection | Test Execution | `db/py/tests/test_crypto.py` | Unit tests for ring criteria (nodes, merchants, degree, failures), stable UUID preservation and merging. |
| `trust-graph-service/tests/test_rehydration.py` | Integration Tests: DB Ingestion | Test Execution | `db/py/tests/test_crypto.py` | Rehydration from PostgreSQL seeds (Cluster A & B), soft-start error handling and background recovery. |
| `trust-graph-service/tests/test_api.py` | Integration Tests: HTTP Endpoints | Test Execution | `db/py/tests/test_crypto.py` | End-to-end API tests for all `/trust/*` routes, status codes, latency budget (<10ms), and Cytoscape schemas. |

---

## 3. Deep Dive: Component Analogues & Implementation Patterns

### 3.1. Build & Dependency Configuration

#### Proposed File: `trust-graph-service/pyproject.toml`
- **Role:** Define dependencies, Python runtime compatibility, and pytest discovery.
- **Existing Analog:** `db/py/pyproject.toml`
- **Concrete Code Excerpt from Existing Codebase:**
```toml
# From db/py/pyproject.toml:
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "nexus_db"
version = "0.1.0"
description = "Project Nexus Database Adapter and Cryptographic Engine for Python"
requires-python = ">=3.10"
dependencies = [
    "asyncpg>=0.29.0",
    "cryptography>=43.0.0",
    "pydantic>=2.9.2",
]

[tool.pytest.ini_options]
pythonpath = ["src", "."]
testpaths = ["tests"]
```
- **Pattern Adaptation for `trust-graph-service`:**
```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "nexus_trust_graph_service"
version = "0.1.0"
description = "Project Nexus Real-Time Trust Graph Engine Microservice"
authors = [{ name = "Nexus Team" }]
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.30.6",
    "networkx>=3.3",
    "pydantic>=2.9.2",
    "pydantic-settings>=2.5.0",
    "asyncpg>=0.29.0",
    "httpx>=0.27.2",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.3",
    "pytest-asyncio>=0.24.0",
]

[tool.pytest.ini_options]
pythonpath = [".", "../db/py"]
testpaths = ["tests"]
asyncio_mode = "auto"
```
*Key Distinction:* `pythonpath` includes both `.` and `../db/py`, granting immediate access to `nexus_db.crypto`, `nexus_db.models`, and `nexus_db.client` without requiring editable pip installs.

---

### 3.2. Data Models & Schemas

#### Proposed Files: `app/models/schemas.py` and `app/models/cytoscape.py`
- **Role:** Strict Pydantic v2 schemas for API contracts and Cytoscape serialization.
- **Existing Analog:** `db/py/nexus_db/models.py`
- **Concrete Code Excerpt from Existing Codebase:**
```python
# From db/py/nexus_db/models.py:
class BuyerFingerprintModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email_hash: str
    ip_subnet: str
    device_hash: str | None = None
    upi_handle: str | None = None
    user_agent_hash: str

class TransactionModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    merchant_id: UUID
    amount_paise: int = Field(gt=0)
    trust_score: float | None = None
    trust_decision: Literal["ALLOW", "REVIEW", "DENY"] | None = None
    trust_risk_factors: list[str] = Field(default_factory=list)
```
- **Pattern Adaptation for `schemas.py`:**
```python
from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    merchant_id: UUID
    amount_paise: int = Field(gt=0)
    buyer_fingerprint: dict[str, Any]
    request_id: str | None = None

class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="ignore")
    base_score: float = 100.0
    new_entity_penalty: float = 0.0
    fraud_neighbor_penalty: float = 0.0
    velocity_penalty: float = 0.0
    cross_merchant_penalty: float = 0.0
    ring_penalty: float = 0.0
    missing_signals_penalty: float = 0.0
    reputation_bonus: float = 0.0
    final_score: float = 100.0

class GraphMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nodes_matched: int
    known_fraud_neighbors_1hop: int
    known_fraud_neighbors_2hop: int
    cross_merchant_count: int
    velocity_last_60min: int
    ring_membership: str | None = None

class ScoreResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    score: float = Field(ge=0.0, le=100.0)
    decision: Literal["ALLOW", "REVIEW", "DENY"]
    risk_factors: list[str]
    graph_metrics: GraphMetrics
    score_breakdown: ScoreBreakdown

class SignalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    merchant_id: UUID
    transaction_id: UUID
    buyer_fingerprint: dict[str, Any]
    amount_paise: int = Field(gt=0)
    outcome: Literal["SUCCESS", "DENIED", "FAILED", "PENDING"]
    timestamp: datetime | None = None
```
- **Pattern Adaptation for `cytoscape.py` (D-13, D-16):**
```python
from typing import Any
from pydantic import BaseModel, ConfigDict

class CytoscapeNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    label: str
    signal_type: str
    signal_value: str
    is_known_fraud: bool
    trust_score: float
    ring_id: str | None = None
    merchants_count: int
    transaction_count: int
    failed_transaction_count: int

class CytoscapeNodeElement(BaseModel):
    data: CytoscapeNodeData

class CytoscapeEdgeData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    source: str
    target: str
    weight: float
    edge_type: str
    merchants_shared: list[str]

class CytoscapeEdgeElement(BaseModel):
    data: CytoscapeEdgeData

class CytoscapeGraph(BaseModel):
    nodes: list[CytoscapeNodeElement]
    edges: list[CytoscapeEdgeElement]
```

---

### 3.3. In-Memory Graph Management & Node Key Format

#### Proposed File: `app/engine/graph_manager.py`
- **Role:** Graph node/edge lifecycle, transactions storage, ego-graph extraction.
- **Existing Analog:** `db/py/nexus_db/crypto.py` & `sanitize.py`
- **Concrete Code Excerpt from Existing Codebase:**
```python
# From db/py/nexus_db/crypto.py:
def hash_email(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()

def mask_ip_subnet(ip: str) -> str:
    s = ip.strip()
    match = re.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$", s)
    if match:
        return f"{match.group(1)}.{match.group(2)}.{match.group(3)}.0/24"
    return s
```
- **Pattern Adaptation for `graph_manager.py` (D-03, D-16):**
```python
import networkx as nx
from datetime import datetime, timezone
from typing import Any

class GraphManager:
    def __init__(self):
        self.graph = nx.Graph()

    @staticmethod
    def get_node_key(signal_type: str, signal_val: str) -> str:
        """Formats node ID as {signal_type}:{signal_val}, stripping any sha256: prefix (D-03)."""
        clean_val = str(signal_val).removeprefix("sha256:").strip()
        return f"{signal_type}:{clean_val}"

    def extract_node_keys(self, fingerprint: dict[str, Any]) -> list[str]:
        keys = []
        mapping = [
            ("email", fingerprint.get("email_hash")),
            ("ip", fingerprint.get("ip_subnet")),
            ("device", fingerprint.get("device_hash")),
            ("upi", fingerprint.get("upi_handle")),
            ("ua", fingerprint.get("user_agent_hash")),
        ]
        for sig_type, sig_val in mapping:
            if sig_val:
                keys.append(self.get_node_key(sig_type, str(sig_val)))
        return keys

    def get_ego_graph(self, node_id: str, radius: int = 1) -> nx.Graph:
        """Extracts an ego subgraph copy around node_id."""
        if not self.graph.has_node(node_id):
            return nx.Graph()
        return nx.ego_graph(self.graph, node_id, radius=radius, undirected=True).copy()
```

---

### 3.4. Concurrency Control: Async Read-Write Lock

#### Proposed File: `app/core/lock.py`
- **Role:** Allows unlimited concurrent readers (`POST /trust/score`, `GET /trust/rings`) while guaranteeing mutual exclusion during mutations (`POST /trust/signal`, rehydration).
- **Context Reference:** Decision **D-09**.
- **Existing Analog:** `db/py/nexus_db/client.py` (safe singleton initialization with async guards).
- **Concrete Code Pattern:**
```python
import asyncio
from contextlib import asynccontextmanager

class AsyncRWLock:
    """Async Read-Write Lock allowing multiple concurrent readers or a single exclusive writer."""
    def __init__(self):
        self._readers = 0
        self._writer = False
        self._lock = asyncio.Lock()
        self._read_ready = asyncio.Condition(self._lock)
        self._write_ready = asyncio.Condition(self._lock)

    @asynccontextmanager
    async def read(self):
        async with self._lock:
            while self._writer:
                await self._read_ready.wait()
            self._readers += 1
        try:
            yield
        finally:
            async with self._lock:
                self._readers -= 1
                if self._readers == 0:
                    self._write_ready.notify()

    @asynccontextmanager
    async def write(self):
        async with self._lock:
            while self._writer or self._readers > 0:
                await self._write_ready.wait()
            self._writer = True
        try:
            yield
        finally:
            async with self._lock:
                self._writer = False
                self._write_ready.notify()
                self._read_ready.notify_all()
```

---

### 3.5. 7-Step Trust Scoring Algorithm & Decay Dynamics

#### Proposed File: `app/engine/scoring.py`
- **Role:** Pure mathematical evaluation of the trust score (0–100) and decision categorization (`ALLOW`, `REVIEW`, `DENY`).
- **Context References:** Decisions **D-05**, **D-06**, **D-07**, **D-08**, PRD §12.2.
- **Existing Analog:** `db/py/nexus_db/audit.py` (`verify_audit_chain` sequential step checks).
- **Concrete Implementation Pattern:**
```python
from datetime import datetime, timezone, timedelta
from typing import Any
import math

class TrustScorer:
    @staticmethod
    def score_fingerprint(
        graph_manager: Any,
        fingerprint: dict[str, Any],
        merchant_id: str,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        base_score = 100.0
        risk_factors: list[str] = []
        breakdown = {
            "base_score": 100.0,
            "new_entity_penalty": 0.0,
            "fraud_neighbor_penalty": 0.0,
            "velocity_penalty": 0.0,
            "cross_merchant_penalty": 0.0,
            "ring_penalty": 0.0,
            "missing_signals_penalty": 0.0,
            "reputation_bonus": 0.0,
            "final_score": 100.0,
        }

        graph = graph_manager.graph
        node_keys = graph_manager.extract_node_keys(fingerprint)
        now = datetime.now(timezone.utc)

        # Step 1: Missing Signals Penalty (D-08)
        if len(node_keys) < 3:
            missing = 3 - len(node_keys)
            breakdown["missing_signals_penalty"] = -5.0 * missing
            base_score += breakdown["missing_signals_penalty"]
            risk_factors.append(f"partial_fingerprint: {missing} expected signal(s) omitted")

        matched_nodes = [k for k in node_keys if graph.has_node(k)]

        # Step 2: New Entity Penalty vs Progressive Trust (D-05)
        if not matched_nodes:
            breakdown["new_entity_penalty"] = -10.0
            base_score += breakdown["new_entity_penalty"]
            risk_factors.append("new_entity: no transaction history on record")
        else:
            total_success = sum(graph.nodes[k].get("successful_transaction_count", 0) for k in matched_nodes)
            total_failed = sum(graph.nodes[k].get("failed_transaction_count", 0) for k in matched_nodes)
            if total_success == 0 and total_failed == 0:
                breakdown["new_entity_penalty"] = -10.0
                base_score += breakdown["new_entity_penalty"]
                risk_factors.append("new_entity: no completed transactions on record")
            elif total_success >= 5 and total_failed == 0:
                breakdown["reputation_bonus"] = 5.0
                base_score += breakdown["reputation_bonus"]

        # Step 3: Direct Known Fraud Check (PRD §12.2, D-06)
        direct_fraud = any(graph.nodes[k].get("is_known_fraud", False) for k in matched_nodes)
        if direct_fraud:
            breakdown["fraud_neighbor_penalty"] -= 80.0
            base_score -= 80.0
            risk_factors.append("known_fraud_node: matched signal is directly flagged for fraud")

        # Step 4: 1-Hop & 2-Hop Fraud Neighbors with Tiered Subnet Weighting (D-06)
        one_hop_fraud = set()
        two_hop_fraud = set()
        has_subnet_only_conn = True

        for k in matched_nodes:
            sig_type = graph.nodes[k].get("signal_type")
            for neighbor in graph.neighbors(k):
                if graph.nodes[neighbor].get("is_known_fraud", False):
                    one_hop_fraud.add(neighbor)
                    if sig_type != "ip":
                        has_subnet_only_conn = False
                for second_hop in graph.neighbors(neighbor):
                    if second_hop not in matched_nodes and second_hop != k:
                        if graph.nodes[second_hop].get("is_known_fraud", False):
                            two_hop_fraud.add(second_hop)

        two_hop_fraud -= one_hop_fraud
        tier_weight = 0.5 if has_subnet_only_conn else 1.0

        if one_hop_fraud and not direct_fraud:
            penalty_1hop = -40.0 * tier_weight * min(len(one_hop_fraud), 1)
            breakdown["fraud_neighbor_penalty"] += penalty_1hop
            base_score += penalty_1hop
            risk_factors.append(f"known_fraud_neighbor_1hop: {len(one_hop_fraud)} fraud entity(ies) adjacent (weight={tier_weight})")

        if two_hop_fraud and not direct_fraud:
            penalty_2hop = -20.0 * tier_weight * min(len(two_hop_fraud) / 3.0, 1.0)
            breakdown["fraud_neighbor_penalty"] += penalty_2hop
            base_score += penalty_2hop
            risk_factors.append(f"known_fraud_neighbor_2hop: {len(two_hop_fraud)} fraud entity(ies) within 2 hops (weight={tier_weight})")

        # Step 5: Sliding Velocity Penalties (60m window) (D-07)
        velocity_60min = 0
        merchants_24h = set()
        t_60m = now - timedelta(minutes=60)
        t_24h = now - timedelta(hours=24)

        seen_tx_ids = set()
        for k in matched_nodes:
            for tx in graph.nodes[k].get("transactions", []):
                tx_id = tx.get("tx_id")
                if tx_id in seen_tx_ids:
                    continue
                seen_tx_ids.add(tx_id)
                tx_ts = tx.get("timestamp")
                if tx_ts and tx_ts >= t_60m:
                    velocity_60min += 1
                if tx_ts and tx_ts >= t_24h:
                    merchants_24h.add(tx.get("merchant_id"))

        if velocity_60min > 10:
            breakdown["velocity_penalty"] = -25.0
            base_score += breakdown["velocity_penalty"]
            risk_factors.append(f"high_velocity: {velocity_60min} transactions in last 60 minutes")
        elif velocity_60min > 5:
            breakdown["velocity_penalty"] = -10.0
            base_score += breakdown["velocity_penalty"]
            risk_factors.append(f"elevated_velocity: {velocity_60min} transactions in last 60 minutes")

        # Step 6: Cross-Merchant Spread Penalty (24h window)
        if len(merchants_24h) > 5:
            breakdown["cross_merchant_penalty"] = -35.0
            base_score += breakdown["cross_merchant_penalty"]
            risk_factors.append(f"cross_merchant_spread: {len(merchants_24h)} merchants in 24h")
        elif len(merchants_24h) > 3:
            breakdown["cross_merchant_penalty"] = -15.0
            base_score += breakdown["cross_merchant_penalty"]
            risk_factors.append(f"cross_merchant_spread: {len(merchants_24h)} merchants in 24h")

        # Step 7: Ring Membership Penalty (D-12)
        active_ring_id = None
        for k in matched_nodes:
            r_id = graph.nodes[k].get("ring_id")
            if r_id:
                active_ring_id = r_id
                break

        if active_ring_id:
            breakdown["ring_penalty"] = -100.0
            base_score = 0.0
            risk_factors.append(f"ring_member: node is confirmed member of fraud ring {active_ring_id}")

        final_score = round(max(0.0, min(100.0, base_score)), 1)
        breakdown["final_score"] = final_score

        if final_score >= 70.0:
            decision = "ALLOW"
        elif final_score >= 40.0:
            decision = "REVIEW"
        else:
            decision = "DENY"

        return {
            "score": final_score,
            "decision": decision,
            "risk_factors": risk_factors,
            "graph_metrics": {
                "nodes_matched": len(matched_nodes),
                "known_fraud_neighbors_1hop": len(one_hop_fraud),
                "known_fraud_neighbors_2hop": len(two_hop_fraud),
                "cross_merchant_count": len(merchants_24h),
                "velocity_last_60min": velocity_60min,
                "ring_membership": active_ring_id,
            },
            "score_breakdown": breakdown,
        }
```

---

### 3.6. Fraud Ring Detection & Clustering Algorithm

#### Proposed File: `app/engine/ring_detector.py`
- **Role:** Community clustering via NetworkX connected components with strict PRD §12.3 criteria.
- **Context References:** Decisions **D-10**, **D-11**, **D-12**, **D-13**.
- **Existing Analog:** `db/py/nexus_db/audit.py` (cryptographic verification and structure assertions).
- **Concrete Code Pattern:**
```python
import networkx as nx
from uuid import uuid4
from datetime import datetime, timezone
from typing import Any

def detect_rings(graph: nx.Graph, candidate_nodes: set[str] | None = None) -> list[dict[str, Any]]:
    nodes_to_inspect = candidate_nodes if candidate_nodes is not None else set(graph.nodes())
    if len(nodes_to_inspect) < 3:
        return []

    subgraph = graph.subgraph(nodes_to_inspect).copy()
    components = list(nx.connected_components(subgraph))
    detected_rings = []

    for comp in components:
        # Criterion 1: Node count >= 3 (D-11)
        if len(comp) < 3:
            continue

        comp_sub = subgraph.subgraph(comp)

        # Criterion 2: Merchant span >= 2 (D-11)
        merchants = set()
        for node_id in comp:
            merchants.update(graph.nodes[node_id].get("merchant_ids_seen", set()))
        if len(merchants) < 2:
            continue

        # Criterion 3: Average internal degree >= 1.5 (D-11)
        degrees = [d for _, d in comp_sub.degree()]
        avg_degree = sum(degrees) / len(comp) if comp else 0.0
        if avg_degree < 1.5:
            continue

        # Criterion 4: Transaction failure >= 1 (D-11)
        failed_txns = sum(graph.nodes[n].get("failed_transaction_count", 0) for n in comp)
        if failed_txns < 1:
            continue

        risk_level = "CRITICAL" if len(merchants) >= 5 else "HIGH"

        # Stable Ring ID resolution & merging (D-12)
        existing_ring_ids = {
            graph.nodes[n].get("ring_id") for n in comp if graph.nodes[n].get("ring_id")
        }
        if existing_ring_ids:
            canonical_ring_id = sorted(list(existing_ring_ids))[0]
        else:
            canonical_ring_id = str(uuid4())

        # Immediate Node Flagging & Propagation (D-12)
        unique_failed_tx_ids = set()
        total_blocked_paise = 0
        for n in comp:
            node = graph.nodes[n]
            node["is_known_fraud"] = True
            node["trust_score"] = 0.0
            node["ring_id"] = canonical_ring_id
            for tx in node.get("transactions", []):
                if tx.get("outcome") in ("DENIED", "FAILED"):
                    tx_id = tx.get("tx_id")
                    if tx_id not in unique_failed_tx_ids:
                        unique_failed_tx_ids.add(tx_id)
                        total_blocked_paise += tx.get("amount_paise", 0)

        # Cytoscape Graph Serialization (D-13, D-16)
        cy_nodes = []
        for n in comp:
            nd = graph.nodes[n]
            lbl = f"{nd['signal_type']}:{nd['signal_value'][:8]}..."
            cy_nodes.append({
                "data": {
                    "id": n,
                    "label": lbl,
                    "signal_type": nd["signal_type"],
                    "signal_value": nd["signal_value"],
                    "is_known_fraud": True,
                    "trust_score": 0.0,
                    "ring_id": canonical_ring_id,
                    "merchants_count": len(nd["merchant_ids_seen"]),
                    "transaction_count": nd["transaction_count"],
                    "failed_transaction_count": nd["failed_transaction_count"],
                }
            })

        cy_edges = []
        for u, v in comp_sub.edges():
            ed = graph[u][v]
            cy_edges.append({
                "data": {
                    "id": f"{u}-{v}",
                    "source": u,
                    "target": v,
                    "weight": ed.get("weight", 1.0),
                    "edge_type": ed.get("edge_type", "SHARED_TRANSACTION"),
                    "merchants_shared": list(ed.get("merchants_shared", [])),
                }
            })

        detected_rings.append({
            "ring_id": canonical_ring_id,
            "risk_level": risk_level,
            "affected_merchants": list(merchants),
            "member_nodes_count": len(comp),
            "blocked_txn_count": len(unique_failed_tx_ids),
            "blocked_amount_paise": total_blocked_paise,
            "detection_timestamp": datetime.now(timezone.utc).isoformat(),
            "detection_algorithm": "connected_components",
            "graph": {
                "nodes": cy_nodes,
                "edges": cy_edges,
            },
        })

    return detected_rings
```

---

### 3.7. Startup Rehydration & Soft-Start Resilience

#### Proposed File: `app/engine/rehydration.py`
- **Role:** Restores graph state from PostgreSQL on startup; handles connection failures gracefully without hanging boot.
- **Context References:** Decisions **D-01**, **D-02**.
- **Existing Analog:** `db/py/nexus_db/client.py`
- **Concrete Code Excerpt from Existing Codebase:**
```python
# From db/py/nexus_db/client.py:
async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await init_db_pool()
    return _pool
```
- **Pattern Adaptation for `rehydration.py`:**
```python
import json
import logging
import asyncio
from datetime import datetime, timezone
import asyncpg
from nexus_db.client import get_pool
from ..engine.graph_manager import GraphManager
from ..engine.ring_detector import detect_rings
from ..core.lock import AsyncRWLock

logger = logging.getLogger(__name__)

async def rehydrate_from_db(
    graph_manager: GraphManager,
    lock: AsyncRWLock,
    days: int = 30,
) -> int:
    """Queries transactions from the last 30 days and re-populates the in-memory graph (D-01)."""
    pool = await get_pool()
    query = """
        SELECT id, merchant_id, buyer_fingerprint, amount_paise, status, created_at
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '$1 days'
        ORDER BY created_at ASC;
    """.replace("$1", str(int(days)))

    async with pool.acquire() as conn:
        rows = await conn.fetch(query)

    async with lock.write():
        for row in rows:
            fp = row["buyer_fingerprint"]
            if isinstance(fp, str):
                fp = json.loads(fp)
            graph_manager.ingest_signal(
                fingerprint=fp,
                merchant_id=str(row["merchant_id"]),
                transaction_id=str(row["id"]),
                outcome=row["status"],
                amount_paise=row["amount_paise"],
                timestamp=row["created_at"],
            )
        detect_rings(graph_manager.graph)

    logger.info(f"Successfully rehydrated {len(rows)} transactions into Trust Graph.")
    return len(rows)

async def soft_start_rehydration(
    graph_manager: GraphManager,
    lock: AsyncRWLock,
    days: int = 30,
    retry_interval_seconds: int = 5,
):
    """Attempts rehydration; if DB fails, runs background retry loop without crashing FastAPI (D-02)."""
    try:
        await rehydrate_from_db(graph_manager, lock, days=days)
    except (asyncpg.PostgresError, OSError, ConnectionRefusedError) as exc:
        logger.warning(
            f"PostgreSQL unavailable during startup ({exc}). Microservice soft-started on port 8001 with empty graph. Launching background retry loop..."
        )
        asyncio.create_task(_retry_loop(graph_manager, lock, days, retry_interval_seconds))

async def _retry_loop(graph_manager: GraphManager, lock: AsyncRWLock, days: int, interval: int):
    while True:
        await asyncio.sleep(interval)
        try:
            await rehydrate_from_db(graph_manager, lock, days=days)
            logger.info("Background rehydration succeeded after initial soft-start failure.")
            break
        except Exception as e:
            logger.debug(f"Background rehydration retry failed ({e}); retrying in {interval}s...")
```

---

### 3.8. Test Suite & Testing Conventions

#### Proposed Test Directory: `trust-graph-service/tests/`
- **Existing Analog:** `db/py/tests/test_crypto.py`
- **Concrete Code Excerpt from Existing Codebase:**
```python
# From db/py/tests/test_crypto.py:
import json
import os
import pytest

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURES_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "../../fixtures/crypto-fixtures.json"))

with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
    FIXTURES = json.load(f)

class TestSignalNormalizationParity:
    def test_emails(self):
        for v in FIXTURES["signal_normalization_vectors"]["emails"]:
            assert normalize_email(v["raw"]) == v["normalized"]
            assert hash_email(v["raw"]) == v["hash"]
```
- **Pattern Adaptation for `tests/conftest.py`:**
```python
import json
import os
import pytest
import networkx as nx
from fastapi.testclient import TestClient
from nexus_trust_graph_service.app.main import create_app
from nexus_trust_graph_service.app.engine.graph_manager import GraphManager
from nexus_trust_graph_service.app.core.lock import AsyncRWLock

@pytest.fixture
def isolated_graph():
    return GraphManager()

@pytest.fixture
def rw_lock():
    return AsyncRWLock()

@pytest.fixture
def test_client(isolated_graph, rw_lock):
    app = create_app(graph_manager=isolated_graph, lock=rw_lock, skip_rehydration=True)
    return TestClient(app)

@pytest.fixture
def crypto_fixtures():
    fixtures_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../db/fixtures/crypto-fixtures.json"))
    with open(fixtures_path, "r", encoding="utf-8") as f:
        return json.load(f)
```

---

## 4. Key Architectural Invariants & Anti-Patterns

1. **No Direct Database Writes in Signal Ingestion (D-04):**
   - *Rule:* `POST /trust/signal` must only update the in-memory `nx.Graph`. It must NEVER issue `INSERT INTO transactions`.
   - *Rationale:* Database transaction insertion is owned exclusively by Next.js route handlers and Razorpay webhook handlers. Dual writes cause race conditions and double accounting.

2. **Strict Integer Paise for Currency (D-13, Stack Conventions):**
   - *Rule:* All monetary values in `blocked_amount_paise`, `amount_paise`, and models must be integers.
   - *Rationale:* IEEE 754 floating point numbers cause precision loss in rupee accounting. Convert to rupees only in UI display layers.

3. **Prefixing Node Keys Format (D-03):**
   - *Rule:* Always format node keys as `{signal_type}:{signal_val}` (e.g. `email:a3f8...`, `ip:185.220.101.0/24`). Strip any `sha256:` prefixes from input hashes to maintain exact parity with SQL seeds.
   - *Rationale:* Eliminates key collisions across different signal types (e.g. an email hash vs device hash with identical strings) and provides self-describing IDs for Cytoscape.

4. **Tiered Subnet Weighting for False Positive Defense (D-06):**
   - *Rule:* When evaluating 1-hop and 2-hop fraud neighbor penalties, apply a 50% multiplier (`0.5`) if the connecting entity is exclusively an IP subnet.
   - *Rationale:* Legitimate buyers frequently share public /24 IP subnets on mobile carriers, corporate networks, and coffee shops.

5. **Soft-Start Resilience (D-02):**
   - *Rule:* If PostgreSQL is down or unreachable during startup, the service MUST NOT crash or block. It logs a warning, starts listening on port 8001 with an empty graph, and runs a background async retry loop.

---

## 5. Summary Checklist for Phase 2 Implementation

- [ ] `trust-graph-service/pyproject.toml` configured with dependencies and `pythonpath = [".", "../db/py"]`.
- [ ] `app/core/lock.py` implements `AsyncRWLock` with reader concurrency and writer isolation.
- [ ] `app/engine/graph_manager.py` implements NetworkX graph with `{type}:{val}` keys and weighted clique edges.
- [ ] `app/engine/scoring.py` implements exact 7-step scoring formula, tiered subnet weighting, and half-life decay.
- [ ] `app/engine/ring_detector.py` implements connected-components ring detection, PRD §12.3 thresholds, and stable UUID merging.
- [ ] `app/engine/rehydration.py` implements rolling 30-day SQL ingestion with soft-start retry.
- [ ] `app/models/schemas.py` and `app/models/cytoscape.py` define Pydantic v2 schemas matching API specifications.
- [ ] `app/api/routes_trust.py` exposes `/trust/score`, `/trust/signal`, `/trust/rings`, `/trust/node/{id}`, `/trust/graph`.
- [ ] `app/main.py` mounts routes, configures CORS, and manages lifespan.
- [ ] Full pytest test suite passing with test coverage across unit and integration scenarios.
