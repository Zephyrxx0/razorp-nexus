from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import networkx as nx


def detect_rings_in_subgraph(
    graph: nx.Graph,
    candidate_nodes: set[str] | list[str],
) -> list[dict[str, Any]]:
    """
    Evaluates connected components within the subgraph induced by candidate_nodes
    against strict PRD §12.3 criteria (D-11):
      1. Node count >= 3
      2. Merchant span >= 2 distinct merchants
      3. Average internal degree >= 1.5
      4. Failed/denied transactions >= 1

    Assigns risk_level: "CRITICAL" if >= 5 distinct merchants, else "HIGH".
    Resolves stable ring UUID (D-12) preserving the oldest existing UUID.
    Propagates is_known_fraud=True, trust_score=0.0, ring_id=canonical_ring_id across all nodes.
    Deduplicates failed transactions when computing blocked_amount_paise and blocked_txn_count.
    Formats Cytoscape elements for graph visualizer.
    """
    nodes_set = set(candidate_nodes)
    if len(nodes_set) < 3:
        return []

    # Ensure all candidate nodes exist in graph
    valid_nodes = [n for n in nodes_set if graph.has_node(n)]
    if len(valid_nodes) < 3:
        return []

    subgraph = graph.subgraph(valid_nodes).copy()
    components = list(nx.connected_components(subgraph))
    detected_rings: list[dict[str, Any]] = []

    for comp in components:
        # Criterion 1: >= 3 nodes (D-11)
        if len(comp) < 3:
            continue

        comp_sub = subgraph.subgraph(comp)

        # Criterion 2: >= 2 distinct merchants (D-11)
        merchants: set[str] = set()
        for node_id in comp:
            merchants.update(str(m) for m in graph.nodes[node_id].get("merchant_ids_seen", set()))
        if len(merchants) < 2:
            continue

        # Criterion 3: average degree >= 1.5 (D-11)
        degrees = [d for _, d in comp_sub.degree()]
        avg_degree = sum(degrees) / len(comp) if comp else 0.0
        if avg_degree < 1.5:
            continue

        # Criterion 4: >= 1 failed transaction on record (D-11)
        failed_txns = sum(graph.nodes[n].get("failed_transaction_count", 0) for n in comp)
        if failed_txns < 1:
            continue

        risk_level = "CRITICAL" if len(merchants) >= 5 else "HIGH"

        # Stable Ring ID resolution & merging (D-12)
        # Select the oldest / lexically first existing UUID, or generate new str(uuid4())
        existing_ring_ids = {
            str(graph.nodes[n]["ring_id"])
            for n in comp
            if graph.nodes[n].get("ring_id") is not None
        }
        if existing_ring_ids:
            canonical_ring_id = sorted(list(existing_ring_ids))[0]
        else:
            canonical_ring_id = str(uuid4())

        # Immediate Node Flagging & Metric Aggregation (D-12)
        unique_failed_tx_ids: set[str] = set()
        total_blocked_paise = 0

        for n in comp:
            node = graph.nodes[n]
            node["is_known_fraud"] = True
            node["trust_score"] = 0.0
            node["ring_id"] = canonical_ring_id

            for tx in node.get("transactions", []):
                outcome = tx.get("outcome")
                if outcome in ("DENIED", "FAILED"):
                    tx_id = str(tx.get("tx_id"))
                    if tx_id not in unique_failed_tx_ids:
                        unique_failed_tx_ids.add(tx_id)
                        total_blocked_paise += int(tx.get("amount_paise", 0))

        # Cytoscape Graph Serialization (D-13, D-16)
        cy_nodes = []
        for n in comp:
            nd = graph.nodes[n]
            sig_type = nd.get("signal_type", "unknown")
            sig_val = nd.get("signal_value", "")
            lbl = f"{sig_type}:{sig_val[:8]}..." if len(sig_val) > 8 else f"{sig_type}:{sig_val}"
            cy_nodes.append({
                "data": {
                    "id": n,
                    "label": lbl,
                    "signal_type": sig_type,
                    "signal_value": sig_val,
                    "is_known_fraud": True,
                    "trust_score": 0.0,
                    "ring_id": canonical_ring_id,
                    "merchants_count": len(nd.get("merchant_ids_seen", set())),
                    "transaction_count": nd.get("transaction_count", 0),
                    "failed_transaction_count": nd.get("failed_transaction_count", 0),
                }
            })

        cy_edges = []
        for u, v in comp_sub.edges():
            ed = graph[u][v]
            cy_edges.append({
                "data": {
                    "id": f"{u}-{v}",
                    "source": u,
                    "target": v,
                    "weight": float(ed.get("weight", 1.0)),
                    "edge_type": ed.get("edge_type", "SHARED_TRANSACTION"),
                    "merchants_shared": [str(m) for m in ed.get("merchants_shared", set())],
                }
            })

        detected_rings.append({
            "ring_id": canonical_ring_id,
            "risk_level": risk_level,
            "affected_merchants": sorted(list(merchants)),
            "member_nodes_count": len(comp),
            "blocked_txn_count": len(unique_failed_tx_ids),
            "blocked_amount_paise": total_blocked_paise,
            "detection_timestamp": datetime.now(timezone.utc).isoformat(),
            "detection_algorithm": "connected_components",
            "graph": {
                "nodes": cy_nodes,
                "edges": cy_edges,
            },
        })

    return detected_rings


def detect_all_rings(graph: nx.Graph) -> list[dict[str, Any]]:
    """Runs ring detection across all nodes in the complete graph."""
    return detect_rings_in_subgraph(graph, set(graph.nodes()))
