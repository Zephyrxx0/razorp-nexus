---
phase: 1
slug: database-schema-core-data-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.0.0 (TypeScript) & pytest ^8.3.3 (Python) |
| **Config file** | db/ts/vitest.config.ts & db/py/pyproject.toml |
| **Quick run command** | `npm test --prefix db/ts && pytest db/py/tests/test_crypto.py -q` |
| **Full suite command** | `npm test --prefix db/ts && pytest db/py -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --prefix db/ts && pytest db/py/tests/test_crypto.py -q`
- **After every plan wave:** Run `npm test --prefix db/ts && pytest db/py -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | AUDIT-01 | T-01-01 | DB trigger blocks UPDATE/DELETE on audit_entries | integration | `npx tsx db/scripts/test-triggers.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | AUDIT-02 | T-01-02 | Cross-language AES-256-GCM and SHA-256 parity | unit | `npm test --prefix db/ts && pytest db/py/tests/test_crypto.py` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | AUDIT-02 | T-01-03 | SHA-256 audit hash-chaining verification | unit | `npm test --prefix db/ts && pytest db/py/tests/test_crypto.py` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | TRUST-05 | T-01-04 | Validates seeds and 768d vector embeddings | integration | `npx tsx db/scripts/test-schema.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `db/fixtures/crypto-fixtures.json` — shared test vectors for cross-language crypto and audit hashing
- [ ] `db/ts/test/crypto.test.ts` — TypeScript vitest suite
- [ ] `db/py/tests/test_crypto.py` — Python pytest suite
- [ ] `db/scripts/test-triggers.ts` — automated trigger immutability and audit chain test

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker container healthy | Infra | Docker engine daemon state | Verify `docker compose ps` shows `nexus-postgres` healthy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-03
