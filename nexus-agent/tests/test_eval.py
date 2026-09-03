"""
nexus-agent/tests/test_eval.py

Unit and integration tests for benchmark dataset generator and evaluation suite (EVAL-01, EVAL-02).
"""

from hashlib import sha256
from pathlib import Path
import json
import sys

# Ensure repository root, scripts, and trust-graph-service are accessible
TESTS_DIR = Path(__file__).resolve().parent
AGENT_DIR = TESTS_DIR.parent
ROOT_DIR = AGENT_DIR.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
TRUST_DIR = ROOT_DIR / "trust-graph-service"

for p in (str(ROOT_DIR), str(SCRIPTS_DIR), str(TRUST_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from generate_benchmark_dataset import generate_dataset


def test_dataset_generation_count_and_distribution():
    """Validates 500 records, 300 LEGIT, 200 FRAUD across >=4 merchants and 3 rings."""
    dataset_file = ROOT_DIR / "datasets" / "synthetic_500.json"
    if dataset_file.exists():
        with open(dataset_file, "r", encoding="utf-8") as f:
            transactions = json.load(f)
    else:
        transactions = generate_dataset(seed=42)

    assert len(transactions) == 500, f"Expected 500 transactions, got {len(transactions)}"

    legit_count = sum(1 for t in transactions if t["label"] == "LEGIT")
    fraud_count = sum(1 for t in transactions if t["label"] == "FRAUD")
    assert legit_count == 300, f"Expected 300 LEGIT, got {legit_count}"
    assert fraud_count == 200, f"Expected 200 FRAUD, got {fraud_count}"

    # Merchants >= 4
    merchants = {t["merchant_id"] for t in transactions}
    assert len(merchants) >= 4, f"Expected >= 4 merchants, got {len(merchants)}"

    # Fraud rings == 3 distinct ring IDs
    fraud_rings = {t["ring_id"] for t in transactions if t["label"] == "FRAUD"}
    assert fraud_rings == {"ring_alpha", "ring_beta", "ring_gamma"}

    # Legitimate transactions have ring_id null
    assert all(t["ring_id"] is None for t in transactions if t["label"] == "LEGIT")

    # Verify amount_paise is integer and strictly positive
    assert all(isinstance(t["amount_paise"], int) and t["amount_paise"] > 0 for t in transactions)

    # Verify required buyer fields
    for t in transactions:
        b = t["buyer"]
        assert "email" in b and "ip" in b and "device_id" in b and "upi_handle" in b


def test_dataset_reproducibility():
    """Verifies that running the generator with seed=42 produces identical SHA-256 hashes."""
    run1 = generate_dataset(seed=42)
    run2 = generate_dataset(seed=42)

    hash1 = sha256(json.dumps(run1, sort_keys=True).encode("utf-8")).hexdigest()
    hash2 = sha256(json.dumps(run2, sort_keys=True).encode("utf-8")).hexdigest()

    assert hash1 == hash2, "Deterministic dataset generator produced non-identical hashes for seed 42"
