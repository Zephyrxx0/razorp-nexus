"""Nexus Agent ADK definitions and agents."""

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


def __getattr__(name: str):
    if name in ("BuyerExecutionReceipt", "DemoBuyerAgent", "demo_buyer"):
        from nexus_agent.agents.demo_buyer import (
            BuyerExecutionReceipt,
            DemoBuyerAgent,
            demo_buyer,
        )
        mapping = {
            "BuyerExecutionReceipt": BuyerExecutionReceipt,
            "DemoBuyerAgent": DemoBuyerAgent,
            "demo_buyer": demo_buyer,
        }
        return mapping[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "BuyerExecutionReceipt",
    "DemoBuyerAgent",
    "demo_buyer",
]
