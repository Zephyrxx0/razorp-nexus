from datetime import datetime, timezone
from typing import Any
import networkx as nx

from app.core.lock import AsyncRWLock


class GraphManager:
    """
    In-memory NetworkX graph manager maintaining undirected weighted transaction graph.
    Complies with Decision D-03 (prefixed node keys), D-04 (in-memory only signal updates),
    and D-09 (async read-write concurrency).
    """

    def __init__(self) -> None:
        self.graph = nx.Graph()
        self.lock = AsyncRWLock()
        self.rings: dict[str, dict[str, Any]] = {}

    @staticmethod
    def get_node_key(signal_type: str, signal_val: str | None = None) -> str:
        """
        Formats node key as {signal_type}:{signal_val} (D-03).
        Strips any redundant 'sha256:' or '{signal_type}:' prefixes and whitespace.
        Supports single combined argument (e.g. 'email:sha256:abc') or two arguments.
        """
        if signal_val is None:
            parts = signal_type.split(":", 1)
            if len(parts) == 2:
                st, sv = parts[0], parts[1]
            else:
                st, sv = "unknown", parts[0]
        else:
            st = signal_type.strip()
            sv = str(signal_val).strip()
            if ":" in st and not sv:
                parts = st.split(":", 1)
                st, sv = parts[0], parts[1]

        st = st.strip()
        sv = sv.strip()

        # Strip redundant signal type prefix if repeated in value
        if sv.startswith(f"{st}:"):
            sv = sv[len(st) + 1:].strip()

        # Strip any sha256: prefix
        while sv.startswith("sha256:"):
            sv = sv[len("sha256:"):].strip()

        return f"{st}:{sv}"

    def extract_node_keys(self, fingerprint: dict[str, Any]) -> list[str]:
        """
        Extracts and normalizes all present fingerprint signals into prefixed node keys.
        Supports email_hash/email, ip_subnet/ip, device_hash/device_id, upi_handle, and user_agent_hash/user_agent.
        """
        keys: list[str] = []
        mapping = [
            ("email", fingerprint.get("email_hash") or fingerprint.get("email")),
            ("ip", fingerprint.get("ip_subnet") or fingerprint.get("ip")),
            ("device", fingerprint.get("device_hash") or fingerprint.get("device_id")),
            ("upi", fingerprint.get("upi_handle")),
            ("ua", fingerprint.get("user_agent_hash") or fingerprint.get("user_agent")),
        ]
        for sig_type, sig_val in mapping:
            if sig_val is not None:
                val_str = str(sig_val).strip()
                if val_str:
                    keys.append(self.get_node_key(sig_type, val_str))

        # Return ordered, unique keys
        seen = set()
        unique_keys = []
        for k in keys:
            if k not in seen:
                seen.add(k)
                unique_keys.append(k)
        return unique_keys

    def add_or_update_node(
        self,
        node_key: str,
        merchant_id: str,
        tx_record: dict[str, Any],
        is_failure: bool,
        ts: datetime,
    ) -> None:
        """Adds a new node or updates existing node transaction counters and timestamps."""
        m_id = str(merchant_id)
        if not self.graph.has_node(node_key):
            sig_type, sig_val = node_key.split(":", 1)
            self.graph.add_node(
                node_key,
                signal_type=sig_type,
                signal_value=sig_val,
                is_known_fraud=False,
                trust_score=100.0,
                ring_id=None,
                merchant_ids_seen={m_id},
                transaction_count=1,
                failed_transaction_count=1 if is_failure else 0,
                successful_transaction_count=0 if is_failure else 1,
                first_seen=ts,
                last_seen=ts,
                transactions=[tx_record],
            )
        else:
            node = self.graph.nodes[node_key]
            node["merchant_ids_seen"].add(m_id)
            node["transaction_count"] += 1
            if is_failure:
                node["failed_transaction_count"] += 1
            else:
                node["successful_transaction_count"] += 1
            node["last_seen"] = max(node.get("last_seen", ts), ts)
            if "transactions" not in node:
                node["transactions"] = []
            node["transactions"].append(tx_record)

    def add_or_update_edge(
        self,
        u: str,
        v: str,
        merchant_id: str,
        ts: datetime,
        edge_type: str = "SHARED_TRANSACTION",
    ) -> None:
        """Adds or updates an undirected weighted co-occurrence edge between nodes u and v."""
        m_id = str(merchant_id)
        if self.graph.has_edge(u, v):
            edge = self.graph[u][v]
            edge["weight"] += 1.0
            edge.setdefault("merchants_shared", set()).add(m_id)
            edge["last_seen"] = max(edge.get("last_seen", ts), ts)
        else:
            self.graph.add_edge(
                u,
                v,
                weight=1.0,
                edge_type=edge_type,
                merchants_shared={m_id},
                first_seen=ts,
                last_seen=ts,
            )

    def ingest_signal(
        self,
        fingerprint: dict[str, Any],
        merchant_id: str,
        transaction_id: str,
        outcome: str,
        amount_paise: int,
        timestamp: datetime | None = None,
    ) -> tuple[int, int]:
        """
        Ingests a transaction signal into the in-memory graph (D-04).
        Creates/updates nodes and establishes a fully connected clique across all fingerprint signals.
        Returns (nodes_updated, edges_updated).
        """
        if timestamp is None:
            ts = datetime.now(timezone.utc)
        elif timestamp.tzinfo is None:
            ts = timestamp.replace(tzinfo=timezone.utc)
        else:
            ts = timestamp

        node_keys = self.extract_node_keys(fingerprint)
        if not node_keys:
            return 0, 0

        is_failure = outcome in ("DENIED", "FAILED")
        tx_record = {
            "tx_id": str(transaction_id),
            "merchant_id": str(merchant_id),
            "outcome": outcome,
            "amount_paise": int(amount_paise),
            "timestamp": ts,
        }

        # 1. Update nodes
        nodes_updated = 0
        for k in node_keys:
            self.add_or_update_node(k, merchant_id, tx_record, is_failure, ts)
            nodes_updated += 1

        # 2. Update edges (clique among all fingerprint signals)
        edges_updated = 0
        n_keys = len(node_keys)
        for i in range(n_keys):
            for j in range(i + 1, n_keys):
                u, v = node_keys[i], node_keys[j]
                self.add_or_update_edge(u, v, merchant_id, ts)
                edges_updated += 1

        return nodes_updated, edges_updated

    # Alias conforming to instruction name
    ingest_transaction_signal = ingest_signal

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        """Returns attributes dictionary for node_id, or None if node does not exist."""
        if not self.graph.has_node(node_id):
            return None
        return dict(self.graph.nodes[node_id])

    def get_subgraph(self, node_ids: list[str] | set[str]) -> nx.Graph:
        """Returns an isolated subgraph copy containing only the specified existing nodes."""
        valid_nodes = [n for n in node_ids if self.graph.has_node(n)]
        return self.graph.subgraph(valid_nodes).copy()

    def get_ego_graph(self, node_id: str, radius: int = 1) -> nx.Graph:
        """Extracts an ego subgraph copy around node_id within given hop radius."""
        if not self.graph.has_node(node_id):
            return nx.Graph()
        return nx.ego_graph(self.graph, node_id, radius=radius, undirected=True).copy()

    def get_neighbors_1hop(self, node_id: str) -> set[str]:
        """Returns 1-hop direct neighbors for node_id."""
        if not self.graph.has_node(node_id):
            return set()
        return set(self.graph.neighbors(node_id))

    def get_neighbors_2hop(self, node_id: str) -> set[str]:
        """Returns 2-hop neighbors for node_id (excluding node_id and 1-hop neighbors)."""
        if not self.graph.has_node(node_id):
            return set()
        one_hop = set(self.graph.neighbors(node_id))
        two_hop: set[str] = set()
        for neighbor in one_hop:
            for second_hop in self.graph.neighbors(neighbor):
                if second_hop != node_id and second_hop not in one_hop:
                    two_hop.add(second_hop)
        return two_hop

    def get_merchant_nodes(self, merchant_id: str) -> list[str]:
        """Returns all node IDs that have transacted at the specified merchant."""
        m_id = str(merchant_id)
        return [
            node_id
            for node_id, data in self.graph.nodes(data=True)
            if m_id in data.get("merchant_ids_seen", set())
        ]

    def stats(self) -> dict[str, Any]:
        """Returns current graph topology statistics."""
        return {
            "node_count": self.graph.number_of_nodes(),
            "edge_count": self.graph.number_of_edges(),
            "ring_count": len(self.rings),
        }
