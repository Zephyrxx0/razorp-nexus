#!/usr/bin/env python3
"""
scripts/generate_benchmark_dataset.py

Deterministic Benchmark Dataset Generator for Nexus Trust Graph Evaluation.
Generates a reproducible 500-transaction benchmark dataset (300 LEGIT, 200 FRAUD)
across 4 merchants with 3 distinct fraud ring topologies conforming to PRD §18.3,
PRD §18.4, and Phase 6 specifications (D-05, D-06).
"""

from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
import argparse
import json
import random

# Canonical synthetic merchants (>= 4 merchants per PRD §18.3 & D-06)
SYNTHETIC_MERCHANTS = [
    {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "Apex Electronics",
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Urban Threads",
    },
    {
        "id": "33333333-3333-3333-3333-333333333333",
        "name": "Gourmet Direct",
    },
    {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Nova Techwear",
    },
]

BASE_TIMESTAMP = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)


def generate_dataset(seed: int = 42) -> list[dict[str, Any]]:
    """
    Generates a deterministic 500-transaction benchmark dataset.

    Distribution:
      - 300 Legitimate transactions (294 clean, 6 borderline/false-positives)
      - 200 Fraudulent transactions across 3 coordinated rings:
          - Ring Alpha (80 txs): Device-sharing syndicate across 4 merchants (2 devices, 8 identities)
          - Ring Beta (70 txs): /24 IP Subnet cluster & high-velocity bursts (12 identities)
          - Ring Gamma (50 txs): Card/Merchant hopper syndicate sharing UPI handles & user-agents (6 identities)
    """
    rng = random.Random(seed)

    # 1. Ring Alpha: Device-Sharing Syndicate (80 txs)
    # 8 synthetic identities sharing 2 unique hardware devices across all 4 merchants
    alpha_devs = ["hw_fingerprint_ring_alpha_1", "hw_fingerprint_ring_alpha_2"]
    alpha_txs: list[dict[str, Any]] = []
    for i in range(80):
        identity_idx = i % 8
        # First 4 identities primarily share dev 0, next 4 share dev 1; identity 4 bridges both
        dev = alpha_devs[0] if identity_idx < 4 else alpha_devs[1]
        m = SYNTHETIC_MERCHANTS[i % len(SYNTHETIC_MERCHANTS)]
        # Early transaction 3 triggers deliberate payment failure signal (D-06, PRD §18.3)
        is_payment_fail = (i == 3)
        buyer = {
            "email": f"alpha_buyer_{identity_idx}@syndicate.net",
            "ip": f"103.100.50.{10 + identity_idx}",
            "ip_subnet": "103.100.50.0/24",
            "device_id": dev,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RingAlphaSyndicate/1.0",
            "upi_handle": f"alpha_{identity_idx}@okaxis",
        }
        amount = 499900 + (i * 1000)
        alpha_txs.append({
            "label": "FRAUD",
            "ring_id": "ring_alpha",
            "merchant_id": m["id"],
            "merchant_name": m["name"],
            "amount_paise": amount,
            "amount_inr": f"₹{amount / 100:,.2f}",
            "buyer": buyer,
            "simulated_outcome": "FAILED" if is_payment_fail else "SUCCESS",
            "time_offset": 60 + i * 45,
            "ring_tx_idx": i,
        })

    # 2. Ring Beta: IP Subnet Cluster & Velocity (70 txs)
    # 12 identities operating from shared /24 subnet 198.51.100.0/24
    beta_txs: list[dict[str, Any]] = []
    for i in range(70):
        identity_idx = i % 12
        m = SYNTHETIC_MERCHANTS[i % len(SYNTHETIC_MERCHANTS)]
        is_payment_fail = (i == 2)
        buyer = {
            "email": f"beta_attacker_{identity_idx}@proxycluster.org",
            "ip": f"198.51.100.{50 + identity_idx}",
            "ip_subnet": "198.51.100.0/24",
            "device_id": f"device_beta_{identity_idx % 3}",
            "user_agent": f"Mozilla/5.0 RingBetaCluster/1.{identity_idx % 2}",
            "upi_handle": f"beta_{identity_idx}@ybl",
        }
        amount = 899900 + (i * 1500)
        beta_txs.append({
            "label": "FRAUD",
            "ring_id": "ring_beta",
            "merchant_id": m["id"],
            "merchant_name": m["name"],
            "amount_paise": amount,
            "amount_inr": f"₹{amount / 100:,.2f}",
            "buyer": buyer,
            "simulated_outcome": "FAILED" if is_payment_fail else "SUCCESS",
            "time_offset": 500 + i * 35,
            "ring_tx_idx": i,
        })

    # 3. Ring Gamma: Card/Merchant Hopper Syndicate (50 txs)
    # 6 identities sharing common UPI handles & user-agents hopping across stores
    gamma_upis = ["syndicate_pay@okaxis", "quickcash@ybl"]
    gamma_txs: list[dict[str, Any]] = []
    for i in range(50):
        identity_idx = i % 6
        m = SYNTHETIC_MERCHANTS[i % len(SYNTHETIC_MERCHANTS)]
        is_payment_fail = (i == 2)
        buyer = {
            "email": f"gamma_hopper_{identity_idx}@carddrop.cc",
            "ip": f"203.0.113.{20 + identity_idx}",
            "ip_subnet": "203.0.113.0/24",
            "device_id": f"device_gamma_{identity_idx % 2}",
            "user_agent": "Mozilla/5.0 StoreHopperBot/2.0",
            "upi_handle": gamma_upis[identity_idx % 2],
        }
        amount = 1499900 + (i * 2000)
        gamma_txs.append({
            "label": "FRAUD",
            "ring_id": "ring_gamma",
            "merchant_id": m["id"],
            "merchant_name": m["name"],
            "amount_paise": amount,
            "amount_inr": f"₹{amount / 100:,.2f}",
            "buyer": buyer,
            "simulated_outcome": "FAILED" if is_payment_fail else "SUCCESS",
            "time_offset": 1000 + i * 40,
            "ring_tx_idx": i,
        })

    # 4. Legitimate Transactions (300 txs)
    # 294 true negatives + 6 borderline false-positives
    # False positives represent benign users using public terminal devices flagged via Ring Alpha
    # Each FP transaction = 199,000 paise (₹1,990.00), summing to exact ₹11,940.00 (PRD §18.4)
    fp_indices = {50, 100, 150, 200, 250, 280}
    legit_txs: list[dict[str, Any]] = []
    for i in range(300):
        m = SYNTHETIC_MERCHANTS[i % len(SYNTHETIC_MERCHANTS)]
        is_fp = i in fp_indices
        if is_fp:
            amount = 199000  # ₹1,990.00
            buyer = {
                "email": f"citizen_{i}@legitmail.in",
                "ip": f"103.21.44.{100 + (i % 20)}",
                "ip_subnet": "103.21.44.0/24",
                "device_id": alpha_devs[1],  # Public cafe terminal device flagged via syndicate
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LegitBrowser/12.0",
                "upi_handle": f"citizen_{i}@oksbi",
            }
        else:
            amount = rng.randint(49900, 2999000)  # ₹499 to ₹29,990 integer paise
            buyer = {
                "email": f"buyer_{i}@consumer.in",
                "ip": f"103.{rng.randint(10, 80)}.{rng.randint(1, 200)}.{rng.randint(1, 254)}",
                "ip_subnet": f"103.{rng.randint(10, 80)}.{rng.randint(1, 200)}.0/24",
                "device_id": f"benign_dev_{i}",
                "user_agent": f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) WebKit/{i}",
                "upi_handle": f"buyer_{i}@{rng.choice(['oksbi', 'okhdfcbank', 'icici'])}",
            }

        legit_txs.append({
            "label": "LEGIT",
            "ring_id": None,
            "merchant_id": m["id"],
            "merchant_name": m["name"],
            "amount_paise": amount,
            "amount_inr": f"₹{amount / 100:,.2f}",
            "buyer": buyer,
            "simulated_outcome": "SUCCESS",
            "time_offset": i * 15,
            "ring_tx_idx": None,
        })

    # Interleave transactions realistically by timestamp (D-06)
    all_txs = alpha_txs + beta_txs + gamma_txs + legit_txs
    all_txs.sort(key=lambda x: x["time_offset"])

    # Finalize formatted records with canonical IDs and ISO timestamps
    final_records: list[dict[str, Any]] = []
    for idx, tx in enumerate(all_txs):
        ts = BASE_TIMESTAMP + timedelta(seconds=tx["time_offset"])
        record = {
            "transaction_id": f"tx_{idx:05d}",
            "timestamp": ts.isoformat(),
            "merchant_id": tx["merchant_id"],
            "merchant_name": tx["merchant_name"],
            "label": tx["label"],
            "ring_id": tx["ring_id"],
            "amount_paise": tx["amount_paise"],
            "amount_inr": tx["amount_inr"],
            "buyer": tx["buyer"],
            "simulated_outcome": tx["simulated_outcome"],
        }
        final_records.append(record)

    return final_records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate deterministic 500-transaction benchmark dataset for Nexus evaluation."
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random number generator seed (default: 42).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="datasets/synthetic_500.json",
        help="Output file path (default: datasets/synthetic_500.json).",
    )
    args = parser.parse_args()

    dataset = generate_dataset(seed=args.seed)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"Successfully generated {len(dataset)} transactions to {out_path}")
    legit_cnt = sum(1 for t in dataset if t["label"] == "LEGIT")
    fraud_cnt = sum(1 for t in dataset if t["label"] == "FRAUD")
    print(f"Distribution: {legit_cnt} LEGIT, {fraud_cnt} FRAUD")


if __name__ == "__main__":
    main()
