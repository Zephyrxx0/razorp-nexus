import asyncio
from contextlib import asynccontextmanager


class AsyncRWLock:
    """
    Async Read-Write Lock allowing multiple concurrent readers or a single exclusive writer.
    Conforms to Decision D-09 for high-concurrency graph reads and isolated mutations.
    """

    def __init__(self) -> None:
        self._readers = 0
        self._writer = False
        self._lock = asyncio.Lock()
        self._read_ready = asyncio.Condition(self._lock)
        self._write_ready = asyncio.Condition(self._lock)

    @property
    def reader_count(self) -> int:
        """Returns the number of active readers."""
        return self._readers

    @property
    def is_writing(self) -> bool:
        """Returns True if a writer currently holds the lock."""
        return self._writer

    @asynccontextmanager
    async def read(self):
        """Acquires a shared read lock, permitting concurrent readers."""
        async with self._lock:
            while self._writer:
                await self._read_ready.wait()
            self._readers += 1
        try:
            yield
        finally:
            async with self._lock:
                self._readers -= 1
                if self._readers == 0:
                    self._write_ready.notify()

    @asynccontextmanager
    async def write(self):
        """Acquires an exclusive write lock, blocking all readers and writers."""
        async with self._lock:
            while self._writer or self._readers > 0:
                await self._write_ready.wait()
            self._writer = True
        try:
            yield
        finally:
            async with self._lock:
                self._writer = False
                self._write_ready.notify()
                self._read_ready.notify_all()
