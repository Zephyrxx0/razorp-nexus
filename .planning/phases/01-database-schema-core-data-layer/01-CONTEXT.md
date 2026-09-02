# Phase 1: Database Schema & Core Data Layer - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the core data and cryptographic foundation for Project Nexus:
- PostgreSQL 16 schema with `pgvector` extension running via Docker Compose (`pgvector/pgvector:pg16`).
- Relational tables: `merchants`, `products`, `transactions`, and `audit_entries`.
- Database-level financial integrity enforcing integer paise (`amount_paise`, `price_paise`), non-negative stock, and INR currency constraints.
- Dual defense-in-depth immutability on `audit_entries` (PostgreSQL `BEFORE UPDATE OR DELETE` trigger raising an exception + application role `REVOKE`).
- Cryptographic SHA-256 hash-chaining across `audit_entries` per transaction with SQL and client verification utilities.
- Cross-language cryptographic parity (AES-256-GCM secret encryption and SHA-256 buyer signal hashing) shared between TypeScript (Node.js) and Python.
- Pre-computed seed catalog with 768-dimensional Gemini `text-embedding-004` vectors across 3 diverse merchants, plus baseline historical transactions for Trust Graph rehydration.

</domain>

<decisions>
## Implementation Decisions

### Migration & DB Access Tooling
- **D-01:** Raw SQL migration files mounted in `docker-entrypoint-initdb.d` + lightweight runner as single source of truth across Python and TypeScript — **Reversibility:** costly — changing migration runner or switching to an ORM would require rewriting schema definitions and synchronization logic across TS and Python.
- **D-02:** `pg` (node-postgres with `pg.Pool`) singleton helper with parameterized queries for TypeScript (Next.js 14 API routes and server components) — **Reversibility:** reversible — wraps database access cleanly in a shared client adapter.
- **D-03:** HNSW index (`vector_cosine_ops`) on `products.embedding` + B-Tree indexes on relational foreign keys (`merchant_id`), transaction status/created_at, and buyer fingerprint fields — **Reversibility:** costly — altering vector index types on large datasets requires index drops and rebuilds.
- **D-04:** Central `db/` repository directory containing `schema.sql`, `docker-compose.yml`, `seeds/`, and shared client adapters for TS (`nexus-gateway`) and Python (`nexus-agent` & `trust-graph-service`) — **Reversibility:** costly — changing directory structure alters import paths across multiple services.

### Audit Log Immutability & Integrity
- **D-05:** Dual defense-in-depth: PostgreSQL `BEFORE UPDATE OR DELETE` trigger raising explicit SQL exception + `REVOKE UPDATE, DELETE` permissions on application database user role — **Reversibility:** one-way — changing this breaks the immutability guarantee required by AUDIT-01.
- **D-06:** Cryptographic SHA-256 hash-chaining on `AuditEntry` (`prev_entry_hash` and `entry_hash` per transaction) — **Reversibility:** one-way — altering hash-chain column schema invalidates historical verification logs.
- **D-07:** Strict PII sanitization helper before audit write (storing only SHA-256 email/UA and /24 subnet, never plaintext secrets or raw PII) + flexible JSONB column — **Reversibility:** costly — changing sanitization rules affects compliance guarantees and downstream audit parsing.
- **D-08:** Dual verification helpers: PostgreSQL SQL function `verify_audit_chain(tx_id UUID)` + shared client verification libraries in TypeScript and Python — **Reversibility:** reversible — pure verification logic without side effects.

### Seed Data & Embedding Generation
- **D-09:** Pre-computed offline embeddings in `seeds/products.sql` (generated via Gemini `text-embedding-004`) + `scripts/generate_embeddings.py` for on-demand regeneration, enabling zero-delay offline boot — **Reversibility:** reversible — seeds can be refreshed or replaced via script.
- **D-10:** 3 distinct seed merchants ("Apex Electronics", "Urban Threads", "Gourmet Direct") with ~8 SKUs each across distinct verticals to support >=3 merchant fraud ring testing — **Reversibility:** reversible — seed catalogs can be augmented.
- **D-11:** Baseline historical transaction seed set (~20 transactions across 3 merchants with benign and ring fingerprints) to enable immediate schema verification and Phase 2 graph rehydration — **Reversibility:** reversible — test fixtures can be expanded.
- **D-12:** Strict PostgreSQL CHECK constraints (`CHECK (price_paise > 0)`, `CHECK (stock >= 0)`, `CHECK (currency = 'INR')`, `CHECK (amount_paise > 0)`) enforced directly by the database engine — **Reversibility:** costly — dropping or altering constraints requires table locks and schema migration.

### Cross-Language Crypto & Hashing Parity
- **D-13:** Standard hex string format `iv:auth_tag:ciphertext` (12-byte IV, 16-byte auth tag, variable ciphertext in hex with colon separator) for AES-256-GCM encrypted merchant secrets — **Reversibility:** one-way — changing ciphertext encoding requires re-encrypting all stored merchant secrets.
- **D-14:** Strict shared signal normalization rules (trim, lowercased emails, IPv4 /24 subnet regex `x.y.z.0/24`, normalized User-Agent) codified in TS and Python crypto utilities with cross-language test vectors — **Reversibility:** costly — changing normalization changes generated hash values and breaks historical graph node lookups.
- **D-15:** Prefixed Bearer token format `maas_live_<hex32>` shown once to merchant at creation; stored in database strictly as `maas_token_hash` (SHA-256) + `token_preview` for display — **Reversibility:** one-way — changing token hashing scheme requires regenerating all merchant API tokens.
- **D-16:** Shared `crypto-fixtures.json` test vector suite verified by both `pytest` (Python) and `vitest`/`jest` (TypeScript) testing cross-decryption and identical hashing — **Reversibility:** reversible — test suite is additive and maintainable.

### The Agent's Discretion
- Exact naming and helper signatures in `db/ts/` and `db/py/` client packages, provided they conform to the test vectors and SQL schema.
- Docker Compose service configuration tuning (e.g. shared volume names, health check timeouts, memory limits).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD & Architecture
- `PRD.md` §10 — Complete TypeScript definitions for Merchant, Product, Transaction, and AuditEntry.
- `PRD.md` §15 — Security architecture (AES-256-GCM secret encryption, SHA-256 PII hashing, /24 subnet masking).
- `PRD.md` §18 — Docker Compose environment setup and container specifications (`pgvector/pgvector:pg16`).
- `CONVENTIONS.md` — Money model: strictly integer paise (`amount_paise`), never floating-point.
- `.planning/research/STACK.md` — Technology stack versions (`pgvector 0.7.4`, `asyncpg 0.29.0`, `pg 8.12.0`).

### Requirements Traceability
- `.planning/REQUIREMENTS.md` AUDIT-01 — Immutable append-only audit entries via database triggers.
- `.planning/REQUIREMENTS.md` AUDIT-02 — Audit trail recording millisecond timestamps, step names, inputs, outputs, and plain-English rationales.
- `.planning/REQUIREMENTS.md` TRUST-05 — Transaction schema design facilitating in-memory graph rehydration on boot.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet (Phase 1 is the initial greenfield phase).

### Established Patterns
- Clean directory layout: `db/` for database schema, migrations, and seeds; `db/ts/` and `db/py/` for shared client adapters.
- Multi-service architecture: Next.js 14 frontend/gateway, Google ADK Python orchestrator, FastAPI Python Trust Graph microservice.

### Integration Points
- PostgreSQL port 5432: shared source of truth for all three application services.
- `seeds/products.sql`: loaded on container boot with Gemini 768d vectors.
- `crypto-fixtures.json`: shared test fixture ensuring TS and Python encryption/hashing parity.

</code_context>

<specifics>
## Specific Ideas

- Ensure `verify_audit_chain(tx_id)` can be executed directly in SQL via `SELECT verify_audit_chain('...')` to return a simple boolean `true`/`false`, proving ledger integrity during demo walkthroughs.
- Pre-generate high-quality product embeddings using actual Gemini `text-embedding-004` calls so that local developers and CI tests do not require an active Gemini API key just to spin up the database.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed strictly within Phase 1 database schema, core data layer, and cryptographic boundary.

</deferred>

---

*Phase: 1-Database Schema & Core Data Layer*
*Context gathered: 2026-09-03*
