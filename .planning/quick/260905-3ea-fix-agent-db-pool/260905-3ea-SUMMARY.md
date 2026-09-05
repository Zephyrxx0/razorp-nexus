# Quick Task Summary: Fix Agent DB Pool & AcquireHelper Fallback in Nexus Agent

**Task Slug:** `260905-3ea-fix-agent-db-pool`  
**Date:** 2026-09-05  
**Status:** complete ✓  

## Overview
Resolved `'NoneType' object has no attribute 'fetchrow'` and database foreign key constraint errors during MaaS agent transaction execution (`POST /api/maas/:merchant_id/transact`).

## Key Changes
1. **`nexus-agent/nexus_agent/api/server.py`**:
   - Initialized PostgreSQL connection pool (`await get_pool()`) within the FastAPI `lifespan` handler.
   - Associated `db_pool` directly with `app.state.runner`.
   - Added graceful cleanup (`await close_db_pool()`) on application shutdown.
2. **`nexus-agent/nexus_agent/__init__.py`**:
   - Added automatic `sys.path` resolution for `db/py` and `nexus-agent` to ensure `nexus_db` is always importable.
3. **`nexus-agent/nexus_agent/pipeline/runner.py`**:
   - Added fallback in `execute()` to dynamically resolve `get_pool()` if neither context nor runner has an initialized pool.
4. **`nexus-agent/nexus_agent/tools/catalog.py` & `razorpay.py`**:
   - Enhanced `_AcquireHelper` to dynamically acquire `get_pool()` if `pool_or_conn` is `None`, with explicit error messaging if the database is unreachable.
5. **`nexus-agent/nexus_agent/tools/audit.py`**:
   - Added automatic transaction existence fallback with foreign key error recovery on `audit_entries` insertion, ensuring seamless real-world persistence without breaking unit test mock pools.

## Verification
- Ran full unit & integration test suite (`python3 -m pytest tests/`): 60 / 60 passed.
- Re-tested live `POST /api/maas/:merchant_id/transact` endpoint with `Sony WH-1000XM5`:
  - Step 1 `PARSE_INTENT` passed.
  - Step 2 `RESOLVE_CATALOG` succeeded in 19ms (stock 25 -> 24).
  - Step 3 `CHECK_TRUST_GRAPH` scored 90.0 (ALLOW) in 126ms.
  - Step 4 `CREATE_RAZORPAY_ORDER` executed.
  - Step 5 Compensatory rollback properly reset inventory.
  - Step 6 `LOG_AUDIT_ENTRY` verified and cryptographically sealed SHA-256 chain in 39ms.
