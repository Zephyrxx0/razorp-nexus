"""Nexus Orchestrator Agent and Tool Suite."""

import os
from pathlib import Path
import sys
from dotenv import load_dotenv

# Ensure nexus_db and local modules are resolvable
# Ensure nexus_db, local modules, and root .env are resolvable
_current = Path(__file__).resolve()
for parent in _current.parents:
    _db_py = parent / "db" / "py"
    if _db_py.exists() and str(_db_py) not in sys.path:
        sys.path.insert(0, str(_db_py))
    if (parent / "nexus-agent").exists() and str(parent / "nexus-agent") not in sys.path:
        sys.path.insert(0, str(parent / "nexus-agent"))
    _root_env = parent / ".env"
    if _root_env.exists():
        load_dotenv(_root_env)

