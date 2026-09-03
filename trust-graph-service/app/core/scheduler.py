import asyncio
import logging
from typing import Any
from app.engine.ring_detector import detect_all_rings

logger = logging.getLogger(__name__)


async def periodic_ring_detection_sweep(
    graph_manager: Any,
    interval_seconds: int = 300,
) -> None:
    """
    Background worker that runs full-graph connected component ring detection
    every `interval_seconds` (default 300s / 5 minutes, Decision D-10).
    Acquires exclusive write lock during sweep and updates cached ring registry.
    """
    logger.info(
        "Starting periodic ring detection scheduler (interval=%ds)...",
        interval_seconds,
    )
    try:
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                async with graph_manager.lock.write():
                    rings = detect_all_rings(graph_manager.graph)
                    # Clear or update active ring registry
                    graph_manager.rings = {r["ring_id"]: r for r in rings}
                logger.info("Periodic ring sweep completed: %d active ring(s) identified.", len(rings))
            except Exception as e:
                logger.error("Error during periodic ring detection sweep: %s", e, exc_info=True)
    except asyncio.CancelledError:
        logger.info("Periodic ring detection scheduler cancelled.")
        raise
