import asyncio
import pytest
from app.core.lock import AsyncRWLock


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
