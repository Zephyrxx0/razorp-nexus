# Phase 1: Database Schema & Core Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 1-Database Schema & Core Data Layer
**Areas discussed:** Migration & DB Access Tooling, Audit Log Immutability & Integrity, Seed Data & Embedding Generation, Cross-Language Crypto & Hashing Parity

---

## Migration & DB Access Tooling

### Question 1: Schema Definition & Migrations
| Option | Description | Selected |
|--------|-------------|----------|
| Raw SQL migration files | Single source of truth mounted in docker-entrypoint-initdb.d + lightweight runner; zero ORM vector/operator mismatch | ✓ |
| Drizzle ORM for TypeScript | Type-safe schema in TS, raw asyncpg for Python with manual synchronization | |
| Alembic (Python) | Python manages migrations; TypeScript accesses via raw SQL or query builder | |
| You decide | Let the agent decide | |

**User's choice:** Raw SQL migration files (mounted in docker-entrypoint-initdb.d + lightweight runner)
**Notes:** Decided on raw SQL migrations to keep the database schema unified between TypeScript and Python without ORM discrepancies.

### Question 2: TypeScript Connection Pooling Driver
| Option | Description | Selected |
|--------|-------------|----------|
| pg (node-postgres with pg.Pool) | Battle-tested singleton helper with parameterized queries; handles pgvector and JSONB natively | ✓ |
| Kysely on top of pg.Pool | Lightweight query builder with compile-time type safety | |
| postgres.js | Tagged template query driver | |
| You decide | Let the agent decide | |

**User's choice:** pg (node-postgres with pg.Pool) singleton helper with parameterized queries
**Notes:** Chosen for rock-solid stability in Next.js 14 Route Handlers and Server Components.

### Question 3: Indexing Strategy
| Option | Description | Selected |
|--------|-------------|----------|
| HNSW index + B-Tree indexes | Logarithmic vector search latency without clustering warmup + relational B-trees | ✓ |
| IVFFlat index + B-Tree indexes | Lower memory overhead than HNSW, requires existing data for centroids | |
| Flat scan + B-Tree indexes | Sequential scan on embeddings; acceptable only for tiny catalogs | |
| You decide | Let the agent decide | |

**User's choice:** HNSW index (vector_cosine_ops) on products embedding + B-tree indexes on foreign keys, transaction status, and buyer fingerprint fields
**Notes:** Provides instant vector similarity search across product embeddings for MaaS natural language queries.

### Question 4: Directory Organization
| Option | Description | Selected |
|--------|-------------|----------|
| Central db/ directory | Shared db/ with schema.sql, docker-compose.yml, seeds/, and client adapters for TS and Python | ✓ |
| Root-level db/ for SQL only | Isolate connection clients inside each individual service repo | |
| Colocate inside nexus-gateway/ | House everything inside the Next.js app | |
| You decide | Let the agent decide | |

**User's choice:** Central db/ directory with schema.sql, docker-compose.yml, seeds/, and shared client adapters for TS (nexus-gateway) and Python (nexus-agent & trust-graph-service)
**Notes:** Keeps all persistence artifacts in a single canonical workspace location.

---

## Audit Log Immutability & Integrity

### Question 1: Immutability Enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| Dual defense-in-depth | PostgreSQL BEFORE UPDATE/DELETE trigger raising explicit exception + REVOKE UPDATE, DELETE on application user role | ✓ |
| DB trigger only | Trigger raising exception without permission revocation | |
| Permission revocation only | REVOKE permissions without DB triggers | |
| You decide | Let the agent decide | |

**User's choice:** Dual defense-in-depth: PostgreSQL BEFORE UPDATE/DELETE trigger raising explicit exception + REVOKE UPDATE, DELETE on application user role
**Notes:** Ensures immutable audit log integrity even if application roles or superuser configurations are misapplied.

### Question 2: Tamper Evidence & Cryptographic Verification
| Option | Description | Selected |
|--------|-------------|----------|
| Cryptographic hash chain | Include prev_entry_hash and entry_hash forming a SHA-256 hash chain per transaction | ✓ |
| DB trigger + timestamps only | Sequence numbers and millisecond timestamps without hash chaining | |
| Single transaction seal | Seal entire transaction with one hash at completion | |
| You decide | Let the agent decide | |

**User's choice:** Include prev_entry_hash and entry_hash on each AuditEntry forming a cryptographic SHA-256 hash chain per transaction
**Notes:** Enables mathematical proof of sequential ordering and un-tampered audit entries for demo and compliance verification.

### Question 3: Payload Sanitization
| Option | Description | Selected |
|--------|-------------|----------|
| Strict PII sanitization helper | Enforce sanitization before audit write (SHA-256 email/UA, /24 subnet; no plaintext secrets) + flexible JSONB | ✓ |
| Raw data stored as-is | Store uninspected payload in JSONB | |
| Sanitization + size cap | Sanitize and truncate payloads >64KB | |
| You decide | Let the agent decide | |

**User's choice:** Enforce PII sanitization helper before audit write (store only SHA-256 email/UA and /24 subnet; never raw secrets or PII) + flexible JSONB column
**Notes:** Strictly prevents accidental leakage of card numbers, CVVs, or plaintext PII in audit entries.

### Question 4: Integrity Verification Helper
| Option | Description | Selected |
|--------|-------------|----------|
| Dual verification | PostgreSQL function verify_audit_chain(tx_id UUID) in SQL + shared client verification helpers in TS and Python | ✓ |
| Client-side only | Verification logic in application code only | |
| Database SQL function only | SQL function only | |
| You decide | Let the agent decide | |

**User's choice:** Dual verification: PostgreSQL function verify_audit_chain(tx_id UUID) in SQL + shared client verification helpers in TypeScript and Python
**Notes:** Allows instant validation both inside PostgreSQL and across client applications.

---

## Seed Data & Embedding Generation

### Question 1: Product Embeddings Seeding
| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed offline embeddings | Offline seeds/products.sql (pre-generated with Gemini text-embedding-004) + refresh script; zero-delay offline boot | ✓ |
| Live generation on startup | Call Gemini API during container initialization (requires network + key) | |
| Random mock vectors | 768 unit random floats; no API key needed, but poor semantic search | |
| You decide | Let the agent decide | |

**User's choice:** Pre-computed offline embeddings in seeds/products.sql (generated via Gemini text-embedding-004) + scripts/generate_embeddings.py to update/regenerate on demand. Zero-delay offline boot.
**Notes:** Ensures immediate developer setup and test reproducibility without API rate-limit delays or external network dependencies.

### Question 2: Seed Merchants & Categories
| Option | Description | Selected |
|--------|-------------|----------|
| 3 distinct seed merchants | Apex Electronics, Urban Threads, Gourmet Direct (~8 SKUs each across distinct verticals) | ✓ |
| 5 seed merchants | 5 categories with 5-10 SKUs each | |
| 1 seed merchant | Single demo store with 15 products | |
| You decide | Let the agent decide | |

**User's choice:** 3 distinct seed merchants (Apex Electronics, Urban Threads, Gourmet Direct) with ~8 SKUs each across distinct verticals
**Notes:** Directly maps to Track 02 evaluation requiring fraud ring detection across >=3 merchants.

### Question 3: Historical Seed Transactions
| Option | Description | Selected |
|--------|-------------|----------|
| Baseline historical seed set | ~20 transactions across 3 merchants with benign and ring fingerprints for Phase 2 rehydration | ✓ |
| Completely empty transactions | Empty initial transaction tables | |
| Separate seed files | seeds/base.sql vs seeds/demo_history.sql | |
| You decide | Let the agent decide | |

**User's choice:** Yes, include a baseline historical seed set (~20 transactions across 3 merchants with benign and ring fingerprints) to enable immediate verification of schema and Phase 2 graph rehydration.
**Notes:** Allows immediate verification of Trust Graph startup rehydration from PostgreSQL transactions table (TRUST-05).

### Question 4: Schema-Level Financial Constraints
| Option | Description | Selected |
|--------|-------------|----------|
| Strict CHECK constraints | CHECK (price_paise > 0), CHECK (stock >= 0), CHECK (currency = 'INR'), CHECK (amount_paise > 0) | ✓ |
| Application validation only | Pydantic / Zod schemas only | |
| Open currency code | Relax currency constraint for other ISO codes | |
| You decide | Let the agent decide | |

**User's choice:** Strict PostgreSQL CHECK constraints on tables (CHECK (price_paise > 0), CHECK (stock >= 0), CHECK (currency = 'INR'), CHECK (amount_paise > 0))
**Notes:** Enforces mathematical financial integrity at the database engine level.

---

## Cross-Language Crypto & Hashing Parity

### Question 1: AES-256-GCM Serialization Format
| Option | Description | Selected |
|--------|-------------|----------|
| Standard hex iv:auth_tag:ciphertext | 12-byte IV, 16-byte tag, variable ciphertext in hex with colon delimiter | ✓ |
| Binary Base64 pack | Packed buffer base64(iv + ciphertext + auth_tag) | |
| JSON / JSONB object | {"iv": "...", "tag": "...", "ciphertext": "..."} | |
| You decide | Let the agent decide | |

**User's choice:** Standard hex string format iv:auth_tag:ciphertext (12-byte IV, 16-byte tag, variable ciphertext in hex with colon separator)
**Notes:** Clean, explicit, interoperable between Node.js `crypto` and Python `cryptography`.

### Question 2: Buyer Signal Normalization
| Option | Description | Selected |
|--------|-------------|----------|
| Strict shared normalization rules | Trim, lowercased emails, IPv4 /24 subnet regex x.y.z.0/24, normalized User-Agent with cross-language test vectors | ✓ |
| Generic lowercase + trim | Basic normalization prior to SHA-256 | |
| Plaintext User-Agent | Hash only email and IP | |
| You decide | Let the agent decide | |

**User's choice:** Strict shared normalization rules (trim, lowercased emails, IPv4 /24 subnet regex 'x.y.z.0/24', normalized User-Agent) codified in TS & Python crypto utilities with cross-language test vectors.
**Notes:** Guarantees that signals generated in the TypeScript gateway match graph nodes scored in the Python Trust Graph engine.

### Question 3: MaaS Bearer Token Format
| Option | Description | Selected |
|--------|-------------|----------|
| Prefixed token maas_live_<hex32> | Returned once at creation; stored in DB strictly as maas_token_hash (SHA-256) + token_preview | ✓ |
| Encrypted token | Stored with AES-256-GCM to allow retrieval in dashboard | |
| UUID string | Standard UUID token | |
| You decide | Let the agent decide | |

**User's choice:** Prefixed token maas_live_<hex32> shown once at creation; stored in DB strictly as maas_token_hash (SHA-256) + token_preview for identification (standard API key security).
**Notes:** Implements industry best practices for API key security, preventing plain token exposure in database breaches.

### Question 4: Cross-Language Test Verification
| Option | Description | Selected |
|--------|-------------|----------|
| Shared crypto-fixtures.json | Test vector file verified by both pytest (Python) and vitest/jest (TypeScript) testing cross-decryption | ✓ |
| Independent unit tests | Mock string testing without shared vectors | |
| SQL-level tests only | Hashing tests inside database only | |
| You decide | Let the agent decide | |

**User's choice:** Shared crypto-fixtures.json test vector file verified by both pytest (Python) and vitest/jest (TypeScript), testing cross-decryption and identical hashing.
**Notes:** Eliminates subtle cross-language encryption tag and padding discrepancies before building application services.

---

## The Agent's Discretion

- Internal structure and helper signatures in `db/ts/` and `db/py/`.
- Docker Compose service tuning (shared volume names, health check timeouts, restart policies).

## Deferred Ideas

None — all discussed items were scoped directly to Phase 1 data layer requirements.
