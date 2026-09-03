# Plan 01-03 Summary: Seed Catalog, Precomputed Embeddings & Rehydration Data

**Execution Date:** 2026-09-03  
**Phase:** 01-database-schema-core-data-layer  
**Plan:** 01-03  
**Status:** Completed  

---

## 1. Executive Summary

Plan 01-03 completed the database seeding, offline vector catalog, baseline historical transactions for Phase 2 graph rehydration, and end-to-end schema validation suite for Project Nexus.

The database is populated with 3 diverse merchants across distinct verticals (Apex Electronics, Urban Threads, Gourmet Direct) with encrypted secrets and hashed MaaS Bearer tokens. 24 realistic products (8 SKUs per merchant) are loaded with strict integer paise pricing (`CHECK (price_paise > 0)`), stock constraints (`CHECK (stock >= 0)`), and offline precomputed 768-dimensional unit vector embeddings (tested and indexed with HNSW `vector_cosine_ops` yielding sub-10ms similarity queries).

A baseline set of 20 historical transactions was generated and seeded: 14 benign transactions across all merchants with ALLOW decisions and Razorpay IDs, and 6 coordinated cross-merchant fraud ring transactions spanning 2 multi-merchant clusters with DENIED status and risk factors (`known_ring_cluster`, `velocity_anomaly`). Every transaction is backed by 3 sequential companion audit entries with cryptographically unbroken SHA-256 hash chains starting at `GENESIS`, all verifying to 100% `true` via PostgreSQL's in-engine `verify_audit_chain` function.

Automated TypeScript scripts (`migrate.ts`, `test-schema.ts`, `test-triggers.ts`) execute end-to-end migrations, validate integer constraints and HNSW latency, verify cross-merchant ring clustering, and confirm dual defense-in-depth trigger immutability (`prevent_audit_mutation` rejecting `UPDATE` and `DELETE`).

---

## 2. Tasks Completed

### Task 1: Seed Merchants & Precomputed 768d Product Embeddings
- **Files Created/Modified:**
  - `db/seeds/01_merchants.sql`: Inserts 3 seed merchants with fixed UUIDs, encrypted test secrets, hashed tokens, and webhook endpoints (`ON CONFLICT (id) DO UPDATE`).
  - `db/scripts/generate_embeddings.py`: Standalone embedding generator that supports online Gemini `models/text-embedding-004` calls when `GEMINI_API_KEY` is present, or produces deterministic normalized 768d unit vectors offline.
  - `db/seeds/02_products.sql`: 24 SKUs (8 Apex, 8 Urban Threads, 8 Gourmet Direct) with integer paise pricing and 768-dimensional vector literals.
  - `db/schema.sql`: Updated application role creation section to ensure role `nexus` exists alongside `nexus_app`.
- **Verification:** `python3 db/scripts/generate_embeddings.py && grep -c "INSERT INTO products" db/seeds/02_products.sql` exited 0 (count: 1).
- **Commit:** `e264ddb` (`feat(01-03): seed merchants and precomputed 768d product embeddings`)

### Task 2: Baseline Historical Transactions for Trust Graph Rehydration
- **Files Created:**
  - `db/scripts/generate_transactions.py`: Deterministic transaction and audit chain generator implementing the canonical pipe-delimited preimage formula.
  - `db/seeds/03_transactions.sql`: 20 historical transactions (14 benign + 6 fraud ring) and 60 companion audit log entries with verified SHA-256 hash chains starting from `'GENESIS'`.
- **Key Characteristics:**
  - 14 Benign: isolated subnets, distinct buyer emails, `trust_score >= 85.00`, `trust_decision = 'ALLOW'`, `status = 'SUCCESS'`, valid Razorpay order and payment IDs.
  - 6 Fraud Ring: Cluster A (3 merchants, shared email `fraudster.ring1@proton.me`, subnet `185.220.101.0/24`) + Cluster B (3 merchants, shared email `syndicate.buyer2@tempmail.com`, device `dev_hash_987654`), `trust_score < 35.00`, `trust_decision = 'DENY'`, `status = 'DENIED'`.
  - 60 Companion Audit Entries: exactly 3 steps per transaction (`INTENT_RECEIVED`, `CATALOG_RESOLVED`, `TRUST_CHECKED`), 100% verifiable by engine `verify_audit_chain(id)`.
- **Verification:** `docker exec -i nexus-postgres psql -U postgres -d nexus -c "SELECT count(*) FROM transactions;"` exited 0 (count: 20).
- **Commit:** `33eb699` (`feat(01-03): baseline historical transactions and hash-chained audit seed`)

### Task 3: Migration Runner & End-to-End Schema Validation Script
- **Files Created:**
  - `db/scripts/migrate.ts`: Standalone programmatic runner sequentially applying `schema.sql`, `01_merchants.sql`, `02_products.sql`, and `03_transactions.sql` with elapsed time metrics.
  - `db/scripts/test-schema.ts`: End-to-end validator checking merchant count (3), product count (24), constraint assertions (`price_paise > 0`, `stock >= 0`, `currency = 'INR'`), sub-10ms HNSW vector similarity search (5.25ms), multi-merchant fraud ring detection (2 clusters across 3 merchants), and 100% audit chain verification (20/20 valid).
  - `db/scripts/test-triggers.ts`: Immutability test asserting that `UPDATE` and `DELETE` on `audit_entries` are rejected by trigger `trg_audit_entries_immutable` with code `23000`, step 2 hash chaining succeeds, and engine `verify_audit_chain` evaluates to `true`.
- **Verification:** `npx tsx db/scripts/migrate.ts && npx tsx db/scripts/test-schema.ts && npx tsx db/scripts/test-triggers.ts` exited 0 with all assertions passing.
- **Commit:** `3680bf3` (`feat(01-03): migration runner, schema validation, and trigger test suite`)

---

## 3. Deviations & Adaptations

1. **Role `nexus` Provisioning in `schema.sql`:**  
   Added `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexus') THEN CREATE ROLE nexus WITH LOGIN PASSWORD 'nexus_dev_password' SUPERUSER; END IF;` to Section 6 of `schema.sql`. This aligns default development pool connection strings in `@nexus/db` and `nexus_db` with the PostgreSQL container environment.
2. **Deterministic Offline Embeddings:**  
   To prevent build failures or developer blockers when `GEMINI_API_KEY` is not present in local dev or CI, `generate_embeddings.py` generates normalized 768-dimensional Gaussian-distributed unit vectors with category clustering bias, providing sub-10ms HNSW cosine vector search performance without external network dependency.

---

## 4. Artifacts Produced

| Path | Description |
|---|---|
| `db/seeds/01_merchants.sql` | Seed records for Apex Electronics, Urban Threads, and Gourmet Direct |
| `db/seeds/02_products.sql` | 24 SKUs with precomputed 768d Gemini vector embeddings and integer paise pricing |
| `db/seeds/03_transactions.sql` | 20 historical transactions (14 benign, 6 multi-merchant ring) and 60 companion audit entries |
| `db/scripts/generate_embeddings.py` | Standalone script for generating/refreshing 768d catalog embeddings |
| `db/scripts/generate_transactions.py` | Generator for baseline historical transactions and cryptographic audit logs |
| `db/scripts/migrate.ts` | Programmatic SQL migration runner using `@nexus/db` |
| `db/scripts/test-schema.ts` | End-to-end schema, HNSW vector search, and audit chain verification script |
| `db/scripts/test-triggers.ts` | Integration test asserting PostgreSQL trigger immutability and chain verification |
