#!/usr/bin/env python3
"""
scripts/run_eval.py

Dual-mode Benchmark Evaluation Harness for Nexus Trust Graph Engine.
Evaluates synthetic benchmark datasets against the Trust Graph scoring algorithms,
computing Precision, Recall, F1 Score, False-Positive Rate, and honest direct
GMV loss ₹ False-Positive Cost in integer paise (EVAL-01, EVAL-02, D-07, D-08).
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import argparse
import json
import sys

# Ensure trust-graph-service and scripts directories are on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
TRUST_DIR = ROOT_DIR / "trust-graph-service"

if str(TRUST_DIR) not in sys.path:
    sys.path.insert(0, str(TRUST_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def evaluate_fast_mode(
    transactions: list[dict[str, Any]],
    verbose: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Evaluates transactions sequentially in-memory against NetworkX GraphManager and TrustScorer.
    Executes in < 5 seconds without network overhead.
    """
    from app.engine.graph_manager import GraphManager
    from app.engine.scoring import TrustScorer

    gm = GraphManager()
    eval_results: list[dict[str, Any]] = []

    for idx, tx in enumerate(transactions):
        buyer_fp = tx["buyer"]
        merchant_id = str(tx["merchant_id"])
        tx_id = str(tx["transaction_id"])
        ts_raw = tx["timestamp"]
        ts = datetime.fromisoformat(ts_raw) if isinstance(ts_raw, str) else ts_raw

        # Step 1: Score fingerprint against in-memory Trust Graph
        score_res = TrustScorer.score_fingerprint(
            graph_manager=gm,
            fingerprint=buyer_fp,
            merchant_id=merchant_id,
            request_id=tx_id,
        )
        decision = score_res["decision"]
        trust_score = score_res["score"]

        # Step 2: Determine ingested outcome
        # If blocked by Nexus gating decision, outcome is DENIED
        # Otherwise, ingest simulated outcome (e.g. payment failure signal on early syndicate probing)
        if decision == "DENY":
            outcome = "DENIED"
        else:
            outcome = tx.get("simulated_outcome", "SUCCESS")

        # Step 3: Ingest signal into graph (triggers 2-hop local ego ring detection)
        gm.ingest_signal(
            fingerprint=buyer_fp,
            merchant_id=merchant_id,
            transaction_id=tx_id,
            outcome=outcome,
            amount_paise=int(tx["amount_paise"]),
            timestamp=ts,
        )

        eval_results.append({
            "transaction_id": tx_id,
            "label": tx["label"],
            "decision": decision,
            "score": trust_score,
            "amount_paise": tx["amount_paise"],
            "ring_id": tx.get("ring_id"),
        })

        if verbose:
            tag = "BLOCK" if decision == "DENY" else "PASS "
            print(f"[{idx+1:03d}/500] {tag} | ID: {tx_id} | Label: {tx['label']:<5} | Decision: {decision:<6} | Score: {trust_score:5.1f}")

    metrics = calculate_metrics(eval_results, mode="fast")
    return metrics, eval_results


def evaluate_live_mode(
    transactions: list[dict[str, Any]],
    trust_url: str = "http://localhost:8001",
    verbose: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Evaluates transactions over HTTP against live FastAPI Trust Graph Service endpoints
    (POST /trust/score and POST /trust/signal).
    """
    import httpx

    eval_results: list[dict[str, Any]] = []

    with httpx.Client(base_url=trust_url, timeout=10.0) as client:
        # Pre-flight health check
        try:
            health_res = client.get("/health")
            if health_res.status_code != 200:
                raise RuntimeError(f"Trust Graph health check returned status {health_res.status_code}")
        except Exception as e:
            raise ConnectionError(
                f"Failed to connect to Trust Graph service at {trust_url}. "
                "Ensure FastAPI service is running: `cd trust-graph-service && uvicorn app.main:app --port 8001`"
            ) from e

        for idx, tx in enumerate(transactions):
            tx_id = str(tx["transaction_id"])
            m_id = str(tx["merchant_id"])
            fp = tx["buyer"]
            ts = tx["timestamp"]

            # 1. Evaluate score
            score_payload = {
                "merchant_id": m_id,
                "buyer_fingerprint": fp,
                "request_id": tx_id,
            }
            res_score = client.post("/trust/score", json=score_payload)
            res_score.raise_for_status()
            score_data = res_score.json()
            decision = score_data["decision"]
            trust_score = score_data["score"]

            # 2. Ingest signal
            outcome = "DENIED" if decision == "DENY" else tx.get("simulated_outcome", "SUCCESS")
            signal_payload = {
                "merchant_id": m_id,
                "transaction_id": tx_id,
                "buyer_fingerprint": fp,
                "outcome": outcome,
                "amount_paise": int(tx["amount_paise"]),
                "timestamp": ts,
            }
            res_sig = client.post("/trust/signal", json=signal_payload)
            res_sig.raise_for_status()

            eval_results.append({
                "transaction_id": tx_id,
                "label": tx["label"],
                "decision": decision,
                "score": trust_score,
                "amount_paise": tx["amount_paise"],
                "ring_id": tx.get("ring_id"),
            })

            if verbose:
                tag = "BLOCK" if decision == "DENY" else "PASS "
                print(f"[{idx+1:03d}/500] {tag} | ID: {tx_id} | Label: {tx['label']:<5} | Decision: {decision:<6} | Score: {trust_score:5.1f}")

    metrics = calculate_metrics(eval_results, mode="live")
    return metrics, eval_results


def calculate_metrics(results: list[dict[str, Any]], mode: str = "fast") -> dict[str, Any]:
    """
    Calculates confusion matrix and financial metrics conforming to PRD §18.4 and D-08:
      - TP = Count(label == "FRAUD" and decision == "DENY")
      - FP = Count(label == "LEGIT" and decision == "DENY")
      - TN = Count(label == "LEGIT" and decision in ("ALLOW", "REVIEW"))
      - FN = Count(label == "FRAUD" and decision in ("ALLOW", "REVIEW"))
      - Precision = TP / (TP + FP)
      - Recall = TP / (TP + FN)
      - F1 = 2 * (P * R) / (P + R)
      - False Positive Rate = FP / (FP + TN)
      - False Positive Cost (paise) = sum(amount_paise for FP txs)
    """
    total = len(results)
    legit_count = sum(1 for r in results if r["label"] == "LEGIT")
    fraud_count = sum(1 for r in results if r["label"] == "FRAUD")

    tp = 0
    fp = 0
    tn = 0
    fn = 0
    fp_cost_paise = 0

    for r in results:
        label = r["label"]
        decision = r["decision"]
        is_blocked = (decision == "DENY")

        if label == "FRAUD":
            if is_blocked:
                tp += 1
            else:
                fn += 1
        elif label == "LEGIT":
            if is_blocked:
                fp += 1
                fp_cost_paise += int(r["amount_paise"])
            else:
                tn += 1

    blocked_by_nexus = tp + fp
    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    if (precision + recall) > 0:
        f1_score = round(2 * (precision * recall) / (precision + recall), 4)
    else:
        f1_score = 0.0
    false_positive_rate = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0

    return {
        "total_transactions": total,
        "legitimate_count": legit_count,
        "fraudulent_count": fraud_count,
        "blocked_by_nexus": blocked_by_nexus,
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "f1_score": f1_score,
        "false_positive_rate": false_positive_rate,
        "false_positive_cost_paise": fp_cost_paise,
        "false_positive_cost_inr": f"₹{fp_cost_paise / 100:,.2f}",
        "mode": mode,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


def print_evaluation_summary(report: dict[str, Any]) -> None:
    """Renders formatted ANSI evaluation box matching PRD §18.4."""
    cyan = "\033[96m"
    green = "\033[92m"
    yellow = "\033[93m"
    red = "\033[91m"
    bold = "\033[1m"
    reset = "\033[0m"

    print("\n" + f"{cyan}{bold}═════════════════════════════════════════════════════════════════════{reset}")
    print(f"{cyan}{bold}                NEXUS TRUST GRAPH BENCHMARK EVALUATION                {reset}")
    print(f"{cyan}{bold}═════════════════════════════════════════════════════════════════════{reset}")
    print(f" Total transactions:             {bold}{report['total_transactions']}{reset}")
    print(f" Legitimate (ground truth):      {bold}{report['legitimate_count']}{reset}")
    print(f" Fraudulent (ground truth):      {bold}{report['fraudulent_count']}{reset}")
    print(f" Blocked by Nexus:               {bold}{report['blocked_by_nexus']}{reset}")
    print(f" True positives (fraud blocked): {green}{bold}{report['true_positives']}{reset}")
    print(f" False positives (legit blocked):{yellow}{bold}{report['false_positives']}{reset}")
    print(f" False negatives (fraud passed): {red}{bold}{report['false_negatives']}{reset}")
    print(f" True negatives (legit passed):  {green}{bold}{report['true_negatives']}{reset}")
    print(f"─────────────────────────────────────────────────────────────────────")
    print(f" Precision:                      {green}{bold}{report['precision']:.3f} ({report['precision']*100:.1f}%){reset}  [Target: >= 80.0%]")
    print(f" Recall:                         {green}{bold}{report['recall']:.3f} ({report['recall']*100:.1f}%){reset}  [Target: >= 75.0%]")
    print(f" F1 Score:                       {green}{bold}{report['f1_score']:.3f}{reset}")
    print(f" False-positive rate:            {yellow}{bold}{report['false_positive_rate']:.3f} ({report['false_positive_rate']*100:.1f}%){reset}  [Target: <= 5.0%]")
    print(f" False-positive cost:            {bold}{report['false_positive_cost_inr']}{reset} ({report['false_positive_cost_paise']} paise)")
    print(f" Execution Mode:                 {bold}{report['mode'].upper()}{reset}")
    print(f"{cyan}{bold}═════════════════════════════════════════════════════════════════════{reset}\n")


def run_evaluation(
    dataset_path: str | Path = "datasets/synthetic_500.json",
    mode: str = "fast",
    trust_url: str = "http://localhost:8001",
    output_path: str | Path | None = "results/eval_report.json",
    verbose: bool = False,
) -> dict[str, Any]:
    """Primary programmatic entrypoint for running evaluation."""
    data_file = Path(dataset_path)
    if not data_file.exists():
        raise FileNotFoundError(f"Dataset file not found at {data_file}")

    with open(data_file, "r", encoding="utf-8") as f:
        transactions = json.load(f)

    # Sort transactions by timestamp to ensure chronological simulation
    transactions.sort(key=lambda t: t["timestamp"])

    if mode == "fast":
        report, _ = evaluate_fast_mode(transactions, verbose=verbose)
    elif mode == "live":
        report, _ = evaluate_live_mode(transactions, trust_url=trust_url, verbose=verbose)
    else:
        raise ValueError(f"Unsupported evaluation mode '{mode}'. Choose 'fast' or 'live'.")

    print_evaluation_summary(report)

    if output_path:
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"Report successfully saved to {out_file}\n")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Nexus Trust Graph Evaluation Suite Runner (PRD §18.4, D-07)."
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default="datasets/synthetic_500.json",
        help="Path to benchmark dataset file (default: datasets/synthetic_500.json).",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["fast", "live"],
        default="fast",
        help="Evaluation execution mode (default: fast).",
    )
    parser.add_argument(
        "--trust-url",
        type=str,
        default="http://localhost:8001",
        help="FastAPI Trust Graph Service base URL for live mode (default: http://localhost:8001).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="results/eval_report.json",
        help="Output evaluation report file path (default: results/eval_report.json).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print detailed per-transaction telemetry.",
    )
    args = parser.parse_args()

    run_evaluation(
        dataset_path=args.dataset,
        mode=args.mode,
        trust_url=args.trust_url,
        output_path=args.output,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
