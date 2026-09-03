import asyncio
from datetime import datetime, timezone
import pytest
from app.core.lock import AsyncRWLock
from app.engine.graph_manager import GraphManager


@pytest.mark.asyncio
async def test_async_rw_lock_concurrency():
    """Verifies that AsyncRWLock permits concurrent readers and isolates exclusive writers."""
    lock = AsyncRWLock()
    active_readers = 0
    max_concurrent_readers = 0
    writer_active = False
    events = []

    async def reader(idx: int):
        nonlocal active_readers, max_concurrent_readers, writer_active
        async with lock.read():
            assert not writer_active, "Reader entered while writer was active"
            active_readers += 1
            if active_readers > max_concurrent_readers:
                max_concurrent_readers = active_readers
            events.append(f"reader_{idx}_start")
            await asyncio.sleep(0.02)
            events.append(f"reader_{idx}_end")
            active_readers -= 1

    async def writer(idx: int):
        nonlocal active_readers, writer_active
        async with lock.write():
            assert not writer_active, "Writer entered while another writer was active"
            assert active_readers == 0, f"Writer entered while {active_readers} readers active"
            writer_active = True
            events.append(f"writer_{idx}_start")
            await asyncio.sleep(0.03)
            events.append(f"writer_{idx}_end")
            writer_active = False

    # 1. Test concurrent readers execute in parallel
    await asyncio.gather(reader(1), reader(2), reader(3))
    assert max_concurrent_readers >= 2, "Expected multiple concurrent readers"

    # 2. Test writer exclusion blocks subsequent readers
    max_concurrent_readers = 0
    events.clear()

    writer_task = asyncio.create_task(writer(1))
    await asyncio.sleep(0.005)  # Let writer acquire lock
    reader_tasks = [asyncio.create_task(reader(1)), asyncio.create_task(reader(2))]

    await asyncio.gather(writer_task, *reader_tasks)

    writer_end_idx = events.index("writer_1_end")
    reader_1_start_idx = events.index("reader_1_start")
    reader_2_start_idx = events.index("reader_2_start")

    assert writer_end_idx < reader_1_start_idx, "Reader started before writer finished"
    assert writer_end_idx < reader_2_start_idx, "Reader started before writer finished"

    # 3. Test writer waits for active readers to finish
    events.clear()
    reader_task = asyncio.create_task(reader(1))
    await asyncio.sleep(0.005)  # Let reader acquire lock
    writer_task = asyncio.create_task(writer(1))

    await asyncio.gather(reader_task, writer_task)
    assert events.index("reader_1_end") < events.index("writer_1_start"), "Writer started before reader finished"


def test_node_key_formatting_and_prefix_stripping():
    """Asserts that get_node_key normalizes prefixes to {signal_type}:{signal_val} (D-03)."""
    assert GraphManager.get_node_key("email", "sha256:abc") == "email:abc"
    assert GraphManager.get_node_key("email:sha256:abc") == "email:abc"
    assert GraphManager.get_node_key("ip", "103.21.44") == "ip:103.21.44"
    assert GraphManager.get_node_key("ip:103.21.44") == "ip:103.21.44"
    assert GraphManager.get_node_key("device", "sha256:dev_xyz") == "device:dev_xyz"
    assert GraphManager.get_node_key("device:dev_xyz") == "device:dev_xyz"
    assert GraphManager.get_node_key("upi", "buyer@upi") == "upi:buyer@upi"


def test_ingest_signal_clique_creation(clean_graph_manager: GraphManager, sample_fingerprint_clean: dict):
    """Asserts that 5-signal fingerprint ingestion creates 5 nodes and 10 clique edges with weight 1.0."""
    gm = clean_graph_manager
    merchant_id = "11111111-1111-1111-1111-111111111111"
    tx_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    nodes_updated, edges_updated, _ = gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_id,
        transaction_id=tx_id,
        outcome="SUCCESS",
        amount_paise=199900,
    )

    assert nodes_updated == 5
    assert edges_updated == 10  # 5 * 4 / 2
    assert gm.graph.number_of_nodes() == 5
    assert gm.graph.number_of_edges() == 10

    # Verify nodes attributes
    for node_id in gm.graph.nodes:
        data = gm.graph.nodes[node_id]
        assert data["transaction_count"] == 1
        assert data["successful_transaction_count"] == 1
        assert data["failed_transaction_count"] == 0
        assert merchant_id in data["merchant_ids_seen"]
        assert len(data["transactions"]) == 1
        assert data["transactions"][0]["tx_id"] == tx_id

    # Verify edges attributes
    for u, v in gm.graph.edges:
        edge = gm.graph[u][v]
        assert edge["weight"] == 1.0
        assert merchant_id in edge["merchants_shared"]
        assert edge["edge_type"] == "SHARED_TRANSACTION"


def test_ingest_signal_repeat_increments_weight(clean_graph_manager: GraphManager, sample_fingerprint_clean: dict):
    """Asserts that repeated ingestion across merchants increments transaction count and edge weights."""
    gm = clean_graph_manager
    merchant_1 = "11111111-1111-1111-1111-111111111111"
    merchant_2 = "22222222-2222-2222-2222-222222222222"

    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_1,
        transaction_id="tx-001",
        outcome="SUCCESS",
        amount_paise=100000,
    )

    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_2,
        transaction_id="tx-002",
        outcome="SUCCESS",
        amount_paise=200000,
    )

    assert gm.graph.number_of_nodes() == 5
    assert gm.graph.number_of_edges() == 10

    for node_id in gm.graph.nodes:
        data = gm.graph.nodes[node_id]
        assert data["transaction_count"] == 2
        assert data["successful_transaction_count"] == 2
        assert data["failed_transaction_count"] == 0
        assert merchant_1 in data["merchant_ids_seen"]
        assert merchant_2 in data["merchant_ids_seen"]
        assert len(data["transactions"]) == 2

    for u, v in gm.graph.edges:
        edge = gm.graph[u][v]
        assert edge["weight"] == 2.0
        assert merchant_1 in edge["merchants_shared"]
        assert merchant_2 in edge["merchants_shared"]


def test_ingest_signal_tracks_failures(clean_graph_manager: GraphManager, sample_fingerprint_clean: dict):
    """Asserts that FAILED and DENIED transaction outcomes increment failed_transaction_count."""
    gm = clean_graph_manager
    merchant_id = "33333333-3333-3333-3333-333333333333"

    # Ingest FAILED transaction
    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_id,
        transaction_id="fail-001",
        outcome="FAILED",
        amount_paise=50000,
    )

    for node_id in gm.graph.nodes:
        data = gm.graph.nodes[node_id]
        assert data["transaction_count"] == 1
        assert data["failed_transaction_count"] == 1
        assert data["successful_transaction_count"] == 0

    # Ingest DENIED transaction
    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_id,
        transaction_id="deny-001",
        outcome="DENIED",
        amount_paise=50000,
    )

    for node_id in gm.graph.nodes:
        data = gm.graph.nodes[node_id]
        assert data["transaction_count"] == 2
        assert data["failed_transaction_count"] == 2
        assert data["successful_transaction_count"] == 0


def test_neighbors_1hop_and_2hop(clean_graph_manager: GraphManager):
    """Verifies that 1-hop and 2-hop neighbor separation correctly isolates adjacent and distance-2 nodes."""
    gm = clean_graph_manager
    # Manually build chain A - B - C - D
    gm.graph.add_edge("email:A", "device:B")
    gm.graph.add_edge("device:B", "ip:C")
    gm.graph.add_edge("ip:C", "upi:D")

    # For node A:
    assert gm.get_neighbors_1hop("email:A") == {"device:B"}
    assert gm.get_neighbors_2hop("email:A") == {"ip:C"}

    # For node B:
    assert gm.get_neighbors_1hop("device:B") == {"email:A", "ip:C"}
    assert gm.get_neighbors_2hop("device:B") == {"upi:D"}

    # Non-existent node
    assert gm.get_neighbors_1hop("email:NONEXISTENT") == set()
    assert gm.get_neighbors_2hop("email:NONEXISTENT") == set()


def test_get_merchant_nodes_and_stats(clean_graph_manager: GraphManager, sample_fingerprint_partial: dict):
    """Verifies retrieval of merchant-scoped nodes, ego-subgraphs, and overall stats."""
    gm = clean_graph_manager
    merchant_1 = "merch-1"
    merchant_2 = "merch-2"

    gm.ingest_signal(
        fingerprint=sample_fingerprint_partial,
        merchant_id=merchant_1,
        transaction_id="tx-part-1",
        outcome="SUCCESS",
        amount_paise=10000,
    )

    # 2 signals in sample_fingerprint_partial: email and ip
    nodes_m1 = gm.get_merchant_nodes(merchant_1)
    assert len(nodes_m1) == 2
    assert len(gm.get_merchant_nodes(merchant_2)) == 0

    stats = gm.stats()
    assert stats["node_count"] == 2
    assert stats["edge_count"] == 1
    assert stats["ring_count"] == 0

    # Subgraph and ego graph tests
    subgraph = gm.get_subgraph(nodes_m1)
    assert subgraph.number_of_nodes() == 2

    ego = gm.get_ego_graph(nodes_m1[0], radius=1)
    assert ego.number_of_nodes() == 2

    # get_node tests
    node_data = gm.get_node(nodes_m1[0])
    assert node_data is not None
    assert node_data["signal_type"] in ("email", "ip")
    assert gm.get_node("email:nonexistent") is None


def test_cytoscape_node_and_edge_serialization(sample_fingerprint_clean):
    """Verifies that serialize_node_to_cytoscape and serialize_edge_to_cytoscape format attributes correctly."""
    gm = GraphManager()
    merchant_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=merchant_id,
        transaction_id="tx-cyto-1",
        outcome="FAILED",
        amount_paise=15000,
    )

    email_hash = sample_fingerprint_clean["email_hash"]
    node_key = f"email:{email_hash}"
    node_cy = gm.serialize_node_to_cytoscape(node_key)
    assert node_cy["data"]["id"] == node_key
    assert node_cy["data"]["signal_type"] == "email"
    assert node_cy["data"]["signal_value"] == email_hash
    assert "..." in node_cy["data"]["label"]
    assert node_cy["data"]["merchants_count"] == 1
    assert node_cy["data"]["failed_transaction_count"] == 1

    edge_cy = gm.serialize_edge_to_cytoscape(node_key, "ip:192.168.1.0/24")
    assert edge_cy["data"]["source"] == node_key
    assert edge_cy["data"]["target"] == "ip:192.168.1.0/24"
    assert edge_cy["data"]["weight"] == 1.0
    assert edge_cy["data"]["merchants_shared"] == [merchant_id]


def test_cytoscape_get_merchant_subgraph_and_limit(sample_fingerprint_clean):
    """Verifies get_merchant_subgraph applies merchant filter and limits node count (D-15)."""
    from app.models.cytoscape import CytoscapeGraph

    gm = GraphManager()
    m1 = "11111111-1111-1111-1111-111111111111"
    m2 = "22222222-2222-2222-2222-222222222222"

    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=m1,
        transaction_id="tx-1",
        outcome="SUCCESS",
        amount_paise=10000,
    )
    gm.ingest_signal(
        fingerprint={"email_hash": "other@nexus.dev", "device_hash": "other_device"},
        merchant_id=m2,
        transaction_id="tx-2",
        outcome="SUCCESS",
        amount_paise=10000,
    )

    # Scoped to m1 (5 signals in clean fingerprint)
    m1_graph_data = gm.get_merchant_subgraph(merchant_id=m1, limit=50)
    m1_graph = CytoscapeGraph.model_validate(m1_graph_data)
    assert len(m1_graph.nodes) == 5
    assert len(m1_graph.edges) == 10  # 5-node complete clique = 5*4/2 = 10

    # Scoped to m2 (2 signals)
    m2_graph_data = gm.get_merchant_subgraph(merchant_id=m2, limit=50)
    m2_graph = CytoscapeGraph.model_validate(m2_graph_data)
    assert len(m2_graph.nodes) == 2
    assert len(m2_graph.edges) == 1

    # Unscoped with limit
    all_graph_limit2 = gm.get_merchant_subgraph(merchant_id=None, limit=2)
    assert len(all_graph_limit2["nodes"]) == 2

    # Limit capped at 200
    all_graph_large = gm.get_merchant_subgraph(merchant_id=None, limit=500)
    assert len(all_graph_large["nodes"]) <= 200


def test_cytoscape_get_node_profile(sample_fingerprint_clean):
    """Verifies get_node_profile compiles ego graph and neighbor summaries (D-14)."""
    from app.models.cytoscape import NodeDetailResponse

    gm = GraphManager()
    m1 = "11111111-1111-1111-1111-111111111111"
    gm.ingest_signal(
        fingerprint=sample_fingerprint_clean,
        merchant_id=m1,
        transaction_id="tx-prof-1",
        outcome="FAILED",
        amount_paise=12000,
    )

    email_hash = sample_fingerprint_clean["email_hash"]
    node_key = f"email:{email_hash}"
    profile_data = gm.get_node_profile(node_key)
    assert profile_data is not None

    # Validate against Pydantic model
    profile = NodeDetailResponse.model_validate(profile_data)
    assert profile.node_id == node_key
    assert profile.failed_transaction_count == 1
    assert profile.degree == 4  # 4 neighbors in 5-node clique
    assert len(profile.neighbors_summary) == 4
    assert len(profile.ego_graph.nodes) == 5

    # Non-existent node returns None
    assert gm.get_node_profile("email:unknown") is None
