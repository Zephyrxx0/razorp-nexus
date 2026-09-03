"""Nexus Orchestrator Agent ADK definition (ORCH-01, PRD §8.2, §9)."""

from pathlib import Path
import sys

# Ensure nexus_db and local modules are resolvable
_current = Path(__file__).resolve()
for parent in _current.parents:
    _db_py = parent / "db" / "py"
    if _db_py.exists() and str(_db_py) not in sys.path:
        sys.path.insert(0, str(_db_py))
    if (parent / "nexus_agent").exists() and str(parent) not in sys.path:
        sys.path.insert(0, str(parent))

from google.adk.agents import Agent
from google.adk.tools import FunctionTool

from nexus_agent.tools.audit import log_audit_entry
from nexus_agent.tools.catalog import resolve_catalog
from nexus_agent.tools.intent import parse_intent
from nexus_agent.tools.razorpay import capture_razorpay_payment, create_razorpay_order
from nexus_agent.tools.trust import check_trust_graph

ORCHESTRATOR_INSTRUCTION = """
You are the Nexus Commerce Orchestrator — an AI agent managing secure agentic commerce on behalf of Razorpay merchants.

When you receive a transaction request, you must execute these steps in STRICT SEQUENTIAL ORDER (1 -> 2 -> 3 -> 4 -> 5 -> 6). Do not skip steps. Do not reorder steps.

STEP 1 — parse_intent:
  Parse natural language buyer intent into structured product query, quantity, and buyer email. Validate that quantity is between 1 and 100.
  If invalid, halt and jump directly to Step 6.

STEP 2 — resolve_catalog:
  Match product query against merchant catalog and atomically decrement reserved inventory.
  If stock is insufficient or product not found, halt and jump directly to Step 6.

STEP 3 — check_trust_graph:
  Query Trust Graph Engine at port 8001 for buyer reputation scoring.
  If score >= 70: ALLOW. Proceed to Step 4.
  If 40 <= score < 70: REVIEW. Proceed to Step 4 with heightened monitoring.
  If score < 40: DENY. Immediately execute compensatory stock rollback, release reserved inventory, and halt pipeline. Do NOT call any Razorpay tools. Jump directly to Step 6.

STEP 4 — create_razorpay_order:
  Guarded by defense-in-depth gate (trust_score >= 40).
  Create Razorpay order in integer paise with attached cryptographic audit notes.
  If creation fails, execute compensatory stock rollback and jump directly to Step 6.

STEP 5 — capture_razorpay_payment:
  Capture payment against authorized order.
  If capture fails, execute compensatory stock rollback and jump directly to Step 6.

STEP 6 — log_audit_entry:
  CRITICAL: Must execute on 100% of execution paths (SUCCESS, DENIED, FAILED).
  Write append-only cryptographic SHA-256 hash-chained audit record and update transaction state.

CRITICAL INVARIANTS:
- Never call create_razorpay_order if trust score < 40.
- Never call capture_razorpay_payment without a valid order_id.
- Always execute compensatory rollback if transaction fails after Step 2 stock reservation.
- Always call log_audit_entry as the final step.
"""

# ADK FunctionTool wrappers
parse_intent_tool = FunctionTool(parse_intent)
resolve_catalog_tool = FunctionTool(resolve_catalog)
check_trust_graph_tool = FunctionTool(check_trust_graph)
create_razorpay_order_tool = FunctionTool(create_razorpay_order)
capture_razorpay_payment_tool = FunctionTool(capture_razorpay_payment)
log_audit_entry_tool = FunctionTool(log_audit_entry)

root_agent = Agent(
    name="nexus_orchestrator",
    model="gemini-2.0-flash",
    description=(
        "Nexus Autonomous Commerce Orchestrator Agent. "
        "Orchestrates natural language intent parsing, merchant catalog resolution with atomic inventory locking, "
        "graph-based trust evaluation, Razorpay order/payment movement, and immutable hash-chained audit logging."
    ),
    instruction=ORCHESTRATOR_INSTRUCTION,
    tools=[
        parse_intent_tool,
        resolve_catalog_tool,
        check_trust_graph_tool,
        create_razorpay_order_tool,
        capture_razorpay_payment_tool,
        log_audit_entry_tool,
    ],
)
