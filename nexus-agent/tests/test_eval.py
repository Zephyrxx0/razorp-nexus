"""
nexus-agent/tests/test_eval.py

Unit and integration tests for benchmark dataset generator and evaluation suite (EVAL-01, EVAL-02).
"""

from datetime import datetime
from hashlib import sha256
from pathlib import Path
import json
import sys
import time

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
from run_eval import run_evaluation, evaluate_fast_mode


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


def test_eval_metrics_thresholds():
    """
    Evaluates synthetic benchmark dataset in fast mode and validates PRD §18.4 targets:
      - Precision >= 80% (expected ~0.95+)
      - Recall >= 75% (expected ~0.90+)
      - False-positive rate <= 5.0%
      - False-positive cost equals exact sum of amount_paise for FP transactions
    """
    dataset_file = ROOT_DIR / "datasets" / "synthetic_500.json"
    assert dataset_file.exists(), f"Dataset missing at {dataset_file}"

    with open(dataset_file, "r", encoding="utf-8") as f:
        transactions = json.load(f)

    start_time = time.monotonic()
    report, results = evaluate_fast_mode(transactions, verbose=False)
    elapsed = time.monotonic() - start_time

    # Performance requirement: in-memory evaluation runs in < 15 seconds
    assert elapsed < 15.0, f"Fast mode took {elapsed:.2f}s, expected < 15s"

    # Accuracy / Gating thresholds (PRD §18.4)
    assert report["total_transactions"] == 500
    assert report["legitimate_count"] == 300
    assert report["fraudulent_count"] == 200

    assert report["precision"] >= 0.80, f"Precision {report['precision']} below target 0.80"
    assert report["recall"] >= 0.75, f"Recall {report['recall']} below target 0.75"
    assert report["false_positive_rate"] <= 0.05, f"FPR {report['false_positive_rate']} above 0.05"

    # Verify confusion matrix integrity
    assert report["true_positives"] + report["false_negatives"] == 200
    assert report["true_negatives"] + report["false_positives"] == 300
    assert report["blocked_by_nexus"] == report["true_positives"] + report["false_positives"]

    # Verify exact False-Positive Cost calculation
    actual_fp_paise = sum(
        r["amount_paise"] for r in results if r["label"] == "LEGIT" and r["decision"] == "DENY"
    )
    assert report["false_positive_cost_paise"] == actual_fp_paise
    expected_inr = f"₹{actual_fp_paise / 100:,.2f}"
    assert report["false_positive_cost_inr"] == expected_inr


def test_eval_report_json_schema():
    """Verifies that results/eval_report.json conforms to the expected contract."""
    report_file = ROOT_DIR / "results" / "eval_report.json"
    # Ensure fresh execution if report not present
    if not report_file.exists():
        run_evaluation(
            dataset_path=ROOT_DIR / "datasets" / "synthetic_500.json",
            mode="fast",
            output_path=report_file,
        )

    with open(report_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    required_keys = [
        "total_transactions",
        "legitimate_count",
        "fraudulent_count",
        "blocked_by_nexus",
        "true_positives",
        "false_positives",
        "true_negatives",
        "false_negatives",
        "precision",
        "recall",
        "f1_score",
        "false_positive_rate",
        "false_positive_cost_paise",
        "false_positive_cost_inr",
        "mode",
        "evaluated_at",
    ]

    for key in required_keys:
        assert key in data, f"Missing key '{key}' in eval_report.json"

    assert isinstance(data["false_positive_cost_paise"], int)
    assert isinstance(data["precision"], float)
    assert isinstance(data["recall"], float)
    assert isinstance(data["f1_score"], float)
    assert isinstance(data["false_positive_rate"], float)
    assert data["mode"] == "fast"
