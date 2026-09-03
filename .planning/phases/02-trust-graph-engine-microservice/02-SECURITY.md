---
phase: 2
slug: trust-graph-engine-microservice
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-03
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client / Gateway ↔ Trust Graph Service | HTTP REST API on port 8001 | Buyer fingerprints (hashed), transaction outcomes, trust scores |
| Trust Graph Service ↔ PostgreSQL | Asyncpg connection pool (port 5432) | Historical rolling 30-day transaction logs, buyer fingerprints |
| In-Memory Concurrency Boundary | Shared memory `nx.Graph` across async coroutines | Node attributes, edge weights, ring metadata |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | `app/engine/graph_manager.py` | high | mitigate | `GraphManager.get_node_key()` isolates signal namespaces, sanitizes keys, and strips redundant `sha256:` prefixes (ASVS V5.1.1) | closed |
| T-02-02 | Tampering | `app/core/lock.py` | high | mitigate | `AsyncRWLock` isolates mutations with exclusive write locking while enabling concurrent reads for score requests (ASVS V11.1.4) | closed |
| T-02-03 | Elevation of Privilege | `app/engine/scoring.py` | critical | mitigate | `TrustScorer` applies strict clamping `round(max(0.0, min(100.0, raw_score)), 1)` and deterministic decision boundaries (ASVS V11.1.1) | closed |
| T-02-04 | Denial of Service | `app/engine/scoring.py` | medium | mitigate | Tiered 50% subnet penalty weight prevents shared IP /24 false-positive lockouts; clean history reputation bonus (ASVS V11.1.2) | closed |
| T-02-05 | Elevation of Privilege | `app/engine/ring_detector.py` | high | mitigate | `detect_rings_in_subgraph()` enforces strict PRD §12.3 criteria (>=3 nodes, >=2 merchants, deg >=1.5, >=1 fail) and zeroes trust score (ASVS V11.1.3) | closed |
| T-02-06 | Repudiation | `app/engine/ring_detector.py` | medium | mitigate | Stable oldest UUID preserved upon cluster merges and immediately propagated to member nodes to prevent audit churn (ASVS V8.3.1) | closed |
| T-02-07 | Denial of Service | `app/engine/rehydration.py` | high | mitigate | Soft-start resilience with empty graph boot and background retry loop prevents crash loops during DB boot latency (ASVS V1.14.1) | closed |
| T-02-08 | Information Disclosure | `app/api/routes_trust.py` | high | mitigate | Strictly passive defense-only queries, SHA-256 hashed PII, merchant scoping, and hard 200 node limit on graph exports (ASVS V1.4.1) | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

*No accepted risks.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-03 | 8 | 8 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-03
