# Phase 3: Google ADK Orchestrator & Tool Suite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 03-google-adk-orchestrator-tool-suite
**Areas discussed:** Intent Parsing & Validation, Inventory Reservation & Rollback, Razorpay Test-Mode & Offline Mocking, Pipeline Enforcement Model

---

## Intent Parsing & Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Gemini 2.0 Flash primary + regex fallback + fuzzy match | Gemini 2.0 Flash primary with regex fallback + fuzzy catalog keyword match; default quantity 1, reject <= 0 or > 100 as 422 | ✓ |
| Pure Gemini 2.0 Flash with Pydantic structured schema | Fail request if LLM unavailable or intent unparseable | |
| Deterministic regex/pattern parser first | Escalate to Gemini only if pattern matching fails or confidence low | |

**User's choice:** Gemini 2.0 Flash primary with regex fallback + fuzzy catalog keyword match; default quantity 1, reject <= 0 or > 100 as 422.
**Notes:** Fast regex catches simple commerce phrases (`"Buy 2 Headphones"`) without LLM latency; Gemini 2.0 Flash extracts complex/colloquial intent. Unparseable or invalid quantities rejected as 422.

---

## Inventory Reservation & Rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic conditional decrement with rollback | Atomic conditional decrement in resolve_catalog (`UPDATE products SET stock = stock - N WHERE id = $1 AND stock >= N`) with compensatory rollback on Trust Denial / Payment Failure | ✓ |
| Optimistic check in resolve_catalog | Read-only check in step 2; atomic decrement executed only after successful payment capture in step 5 | |
| Postgres row-level lock | Hold `SELECT ... FOR UPDATE` row lock across entire multi-step pipeline transaction | |

**User's choice:** Atomic conditional decrement in resolve_catalog with compensatory rollback on Trust Denial / Payment Failure.
**Notes:** Prevents overselling during concurrent transactions without holding open DB transactions across external HTTP calls. Compensatory increment restores stock if trust score < 40 or Razorpay payment fails.

---

## Razorpay Test-Mode & Offline Mocking

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-mode client adapter with Mock fallback | Real test-mode API (`razorpay.Client`) when `rzp_test_*` credentials active, plus seamless `MockRazorpayClient` (`NEXUS_RAZORPAY_MOCK=true`) for offline dev & CI; synthetic `pay_test_` capture generation for server-to-server flows | ✓ |
| Strict live Razorpay SDK only | All tests & dev require active network and valid `rzp_test_*` credentials | |
| Sandbox stub only | Purely mock Razorpay responses in Python tools; defer live Razorpay HTTP integration to Next.js API layer | |

**User's choice:** Dual-mode Razorpay Client adapter: real test-mode API (`razorpay.Client`) when `rzp_test_*` credentials active, plus seamless `MockRazorpayClient` (`NEXUS_RAZORPAY_MOCK=true`) for offline dev & CI; synthetic `pay_test_` capture generation for server-to-server flows.
**Notes:** Enables complete offline unit/integration testing while supporting live Razorpay test-mode API verification with merchant key pairs.

---

## Pipeline Enforcement Model

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic Pipeline Runner with ADK FunctionTools | State machine guarantees strict step sequence (1->2->3->4->5->6), uses Gemini for intent & audit explanations, enforces defense-in-depth `TrustViolationError` at step 4, guarantees step 6 `log_audit_entry` runs on all paths, exposed via port 8000 endpoint | ✓ |
| Stateful ADK FunctionTools with internal prerequisite checks | Tools track execution state on session and error out if invoked out of sequence, while ADK Agent manages LLM tool selection loop | |
| Pure prompt-guided ADK Agent | LLM freely invokes tools based on system prompt without hardcoded pipeline controller | |

**User's choice:** Deterministic Pipeline Runner with ADK FunctionTools: state machine guarantees strict step sequence (1->2->3->4->5->6), uses Gemini for intent & audit explanations, enforces defense-in-depth `TrustViolationError` at step 4, guarantees step 6 `log_audit_entry` runs on all paths, exposed via port 8000 endpoint.
**Notes:** Eliminates tool hallucination and non-deterministic reordering. Programmatic check at step 4 guarantees Razorpay is never invoked if score < 40, meeting Track 02 strict defense requirements.

---

## the agent's Discretion

- Internal package layout of `nexus-agent/`.
- Prompt construction for Gemini 2.0 Flash intent parsing and audit explanation text.
- HTTP client retry policy and timeouts (500ms timeout on Trust Graph).

## Deferred Ideas

None — discussion stayed strictly within Phase 3 scope.
