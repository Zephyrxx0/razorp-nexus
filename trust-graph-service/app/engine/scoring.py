from datetime import datetime, timezone, timedelta
from typing import Any
import math


class TrustScorer:
    """
    Deterministic 7-step trust scoring pipeline evaluating 0.0 - 100.0 trust score,
    ALLOW / REVIEW / DENY categorization, tiered subnet weighting (50% on IP subnet),
    7-day exponential half-life decay, progressive trust bonus (+5.0), and graceful
    partial fingerprint scoring.
    """

    @staticmethod
    def score_fingerprint(
        graph_manager: Any,
        fingerprint: dict[str, Any],
        merchant_id: str,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        base_score = 100.0
        risk_factors: list[str] = []
        breakdown: dict[str, float] = {
            "base_score": 100.0,
            "new_entity_penalty": 0.0,
            "fraud_neighbor_penalty": 0.0,
            "velocity_penalty": 0.0,
            "cross_merchant_penalty": 0.0,
            "ring_penalty": 0.0,
            "missing_signals_penalty": 0.0,
            "reputation_bonus": 0.0,
            "final_score": 100.0,
        }

        graph = graph_manager.graph
        node_keys = graph_manager.extract_node_keys(fingerprint)
        now = datetime.now(timezone.utc)

        # Step 1: Missing Signal Penalty (D-08)
        # Fingerprint expected to supply at least 3 signals. If < 3, -5.0 per missing signal.
        if len(node_keys) < 3:
            missing_count = 3 - len(node_keys)
            missing_penalty = -5.0 * missing_count
            breakdown["missing_signals_penalty"] = missing_penalty
            base_score += missing_penalty
            risk_factors.append(f"partial_fingerprint: {missing_count} expected signal(s) omitted")

        matched_nodes = [k for k in node_keys if graph.has_node(k)]

        # Step 2: New Entity Penalty vs Progressive Trust (D-05)
        # Deduplicate transactions across matched nodes to find unique transaction count
        unique_success_tx: set[str] = set()
        unique_failed_tx: set[str] = set()

        if not matched_nodes:
            breakdown["new_entity_penalty"] = -10.0
            base_score += breakdown["new_entity_penalty"]
            risk_factors.append("new_entity: no transaction history on record")
        else:
            for k in matched_nodes:
                for tx in graph.nodes[k].get("transactions", []):
                    tx_id = tx.get("tx_id")
                    if tx.get("outcome") in ("DENIED", "FAILED"):
                        unique_failed_tx.add(tx_id)
                    elif tx.get("outcome") == "SUCCESS":
                        unique_success_tx.add(tx_id)

            total_success = len(unique_success_tx)
            total_failed = len(unique_failed_tx)

            if total_success == 0 and total_failed == 0:
                breakdown["new_entity_penalty"] = -10.0
                base_score += breakdown["new_entity_penalty"]
                risk_factors.append("new_entity: no completed transactions on record")
            elif total_success >= 2:
                # 2 or more clean transactions drops the new entity penalty to 0.0
                breakdown["new_entity_penalty"] = 0.0
                if total_success >= 5 and total_failed == 0:
                    breakdown["reputation_bonus"] = 5.0
                    base_score += breakdown["reputation_bonus"]
            else:
                # 1 clean transaction still retains new entity penalty
                breakdown["new_entity_penalty"] = -10.0
                base_score += breakdown["new_entity_penalty"]
                risk_factors.append("new_entity: insufficient transaction history on record")

        # Step 3: Direct Known Fraud Check (PRD §12.2, D-06)
        direct_fraud_nodes = [k for k in matched_nodes if graph.nodes[k].get("is_known_fraud", False)]
        direct_fraud = len(direct_fraud_nodes) > 0
        if direct_fraud:
            all_subnet = all(graph.nodes[k].get("signal_type") == "ip" for k in direct_fraud_nodes)
            penalty_direct = -40.0 if all_subnet else -80.0
            breakdown["fraud_neighbor_penalty"] += penalty_direct
            base_score += penalty_direct
            risk_factors.append("known_fraud_node: matched signal is directly flagged for fraud")

        # Step 4: 1-Hop and 2-Hop Fraud Neighbors with Tiered Subnet Weighting (D-06)
        one_hop_fraud: set[str] = set()
        two_hop_fraud: set[str] = set()
        has_subnet_only_conn = True

        for k in matched_nodes:
            sig_type = graph.nodes[k].get("signal_type")
            for neighbor in graph.neighbors(k):
                if graph.nodes[neighbor].get("is_known_fraud", False):
                    one_hop_fraud.add(neighbor)
                    if sig_type != "ip":
                        has_subnet_only_conn = False
                for second_hop in graph.neighbors(neighbor):
                    if second_hop not in matched_nodes and second_hop != k:
                        if graph.nodes[second_hop].get("is_known_fraud", False):
                            two_hop_fraud.add(second_hop)

        two_hop_fraud -= one_hop_fraud
        tier_weight = 0.5 if has_subnet_only_conn else 1.0

        if one_hop_fraud and not direct_fraud:
            penalty_1hop = -40.0 * tier_weight * min(len(one_hop_fraud), 1)
            breakdown["fraud_neighbor_penalty"] += penalty_1hop
            base_score += penalty_1hop
            risk_factors.append(
                f"known_fraud_neighbor_1hop: {len(one_hop_fraud)} fraud entity(ies) adjacent (weight={tier_weight})"
            )

        if two_hop_fraud and not direct_fraud:
            penalty_2hop = -20.0 * tier_weight * min(len(two_hop_fraud) / 3.0, 1.0)
            breakdown["fraud_neighbor_penalty"] += penalty_2hop
            base_score += penalty_2hop
            risk_factors.append(
                f"known_fraud_neighbor_2hop: {len(two_hop_fraud)} fraud entity(ies) within 2 hops (weight={tier_weight})"
            )

        # Step 5: Sliding Velocity Penalties (60-minute window) (D-07)
        velocity_60min = 0
        merchants_24h: set[str] = set()
        t_60m = now - timedelta(minutes=60)
        t_24h = now - timedelta(hours=24)

        seen_tx_ids: set[str] = set()
        for k in matched_nodes:
            for tx in graph.nodes[k].get("transactions", []):
                tx_id = tx.get("tx_id")
                if tx_id in seen_tx_ids:
                    continue
                seen_tx_ids.add(tx_id)
                tx_ts = tx.get("timestamp")
                if tx_ts:
                    if tx_ts.tzinfo is None:
                        tx_ts = tx_ts.replace(tzinfo=timezone.utc)
                    if tx_ts >= t_60m:
                        velocity_60min += 1
                    if tx_ts >= t_24h:
                        merchants_24h.add(str(tx.get("merchant_id")))

        if velocity_60min > 10:
            breakdown["velocity_penalty"] = -25.0
            base_score += breakdown["velocity_penalty"]
            risk_factors.append(f"high_velocity: {velocity_60min} transactions in last 60 minutes")
        elif velocity_60min > 5:
            breakdown["velocity_penalty"] = -10.0
            base_score += breakdown["velocity_penalty"]
            risk_factors.append(f"elevated_velocity: {velocity_60min} transactions in last 60 minutes")

        # Step 6: Cross-Merchant Spread Penalty (24-hour window)
        if len(merchants_24h) > 5:
            breakdown["cross_merchant_penalty"] = -35.0
            base_score += breakdown["cross_merchant_penalty"]
            risk_factors.append(f"cross_merchant_spread: {len(merchants_24h)} merchants in 24h")
        elif len(merchants_24h) > 3:
            breakdown["cross_merchant_penalty"] = -15.0
            base_score += breakdown["cross_merchant_penalty"]
            risk_factors.append(f"cross_merchant_spread: {len(merchants_24h)} merchants in 24h")

        # Step 7: Ring Membership Penalty (D-12)
        active_ring_id = None
        for k in matched_nodes:
            r_id = graph.nodes[k].get("ring_id")
            if r_id:
                active_ring_id = str(r_id)
                break

        if active_ring_id:
            breakdown["ring_penalty"] = -100.0
            base_score = 0.0
            risk_factors.append(f"ring_member: node is confirmed member of fraud ring {active_ring_id}")

        # Step 8: Exponential Half-Life Decay on Past Failures (D-07)
        decay_weight = 0.0
        seen_failed_tx_ids: set[str] = set()
        for k in matched_nodes:
            for tx in graph.nodes[k].get("transactions", []):
                outcome = tx.get("outcome")
                if outcome in ("DENIED", "FAILED"):
                    tx_id = tx.get("tx_id")
                    if tx_id in seen_failed_tx_ids:
                        continue
                    seen_failed_tx_ids.add(tx_id)
                    tx_ts = tx.get("timestamp")
                    if tx_ts:
                        if tx_ts.tzinfo is None:
                            tx_ts = tx_ts.replace(tzinfo=timezone.utc)
                        delta_days = max(0.0, (now - tx_ts).total_seconds() / 86400.0)
                        decay_weight += math.pow(2.0, -delta_days / 7.0)

        if decay_weight >= 1.0 and not direct_fraud and not active_ring_id:
            decay_penalty = -min(15.0, round(15.0 * min(decay_weight, 3.0) / 3.0, 1))
            breakdown["fraud_neighbor_penalty"] += decay_penalty
            base_score += decay_penalty
            risk_factors.append(f"historical_failures: decayed risk weight {decay_weight:.2f}")

        # Step 9: Score Clamping & Decision Gating
        final_score = round(max(0.0, min(100.0, base_score)), 1)
        breakdown["final_score"] = final_score

        if final_score >= 70.0:
            decision = "ALLOW"
        elif final_score >= 40.0:
            decision = "REVIEW"
        else:
            decision = "DENY"

        return {
            "score": final_score,
            "decision": decision,
            "risk_factors": risk_factors,
            "graph_metrics": {
                "nodes_matched": len(matched_nodes),
                "known_fraud_neighbors_1hop": len(one_hop_fraud),
                "known_fraud_neighbors_2hop": len(two_hop_fraud),
                "cross_merchant_count": len(merchants_24h),
                "velocity_last_60min": velocity_60min,
                "ring_membership": active_ring_id,
            },
            "score_breakdown": breakdown,
        }
