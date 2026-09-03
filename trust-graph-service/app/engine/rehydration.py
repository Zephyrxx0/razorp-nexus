import asyncio
import json
import logging
from typing import Any
import asyncpg
from app.engine.ring_detector import detect_all_rings

logger = logging.getLogger(__name__)


async def rehydrate_from_db(graph_manager: Any, db_pool: Any, days: int = 30) -> int:
    """
    Queries historical transactions from PostgreSQL over the rolling window (default 30 days)
    ordered chronologically (ASC) to rehydrate in-memory graph state (D-01).
    Acquires exclusive write lock on graph_manager and runs detect_all_rings upon completion.
    """
    query = """
        SELECT id, merchant_id, buyer_fingerprint, amount_paise, status, created_at
        FROM transactions
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        ORDER BY created_at ASC;
    """

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, str(int(days)))

    async with graph_manager.lock.write():
        for row in rows:
            fp = row["buyer_fingerprint"]
            if isinstance(fp, str):
                fp = json.loads(fp)
            graph_manager.ingest_signal(
                fingerprint=fp,
                merchant_id=str(row["merchant_id"]),
                transaction_id=str(row["id"]),
                outcome=row["status"],
                amount_paise=int(row["amount_paise"]),
                timestamp=row["created_at"],
            )

        detected_rings = detect_all_rings(graph_manager.graph)
        for ring in detected_rings:
            graph_manager.rings[ring["ring_id"]] = ring

    logger.info(
        "Successfully rehydrated %d transactions into Trust Graph (%d rings detected).",
        len(rows),
        len(detected_rings),
    )
    return len(rows)


async def soft_start_rehydration_loop(
    graph_manager: Any,
    get_pool_func: Any,
    retry_interval: float = 5.0,
    days: int = 30,
) -> None:
    """
    Attempts to connect and rehydrate graph on startup.
    If PostgreSQL connection fails or pool is unavailable, catches connection errors,
    logs a soft-start warning, and runs a background polling loop retrying every
    `retry_interval` seconds until successful (D-02).
    """
    try:
        pool = await get_pool_func()
        if pool is not None:
            await rehydrate_from_db(graph_manager, pool, days=days)
            return
    except (asyncpg.PostgresError, OSError, ConnectionRefusedError, Exception) as exc:
        logger.warning(
            "PostgreSQL not available at startup. Booting with empty graph (soft-start mode). Error: %s",
            exc,
        )

    while True:
        await asyncio.sleep(retry_interval)
        try:
            pool = await get_pool_func()
            if pool is not None:
                await rehydrate_from_db(graph_manager, pool, days=days)
                logger.info("Background rehydration succeeded after initial soft-start retry.")
                break
        except Exception as retry_exc:
            logger.debug(
                "Background rehydration retry failed: %s; retrying in %.1fs...",
                retry_exc,
                retry_interval,
            )
