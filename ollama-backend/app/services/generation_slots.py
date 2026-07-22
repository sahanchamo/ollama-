import asyncio


class GenerationBusyError(Exception):
    """Raised when every local-model generation slot is occupied."""


class GenerationSlots:
    """Process-local backpressure for a single Ollama worker.

    Keep the API to one worker when using this class.  A single 7B model on an
    8 GB GPU normally responds faster with one active generation than with
    several competing generations.
    """

    def __init__(self, maximum: int, wait_seconds: float) -> None:
        self._semaphore = asyncio.Semaphore(maximum)
        self.wait_seconds = wait_seconds

    async def acquire(self) -> None:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=self.wait_seconds)
        except TimeoutError as exc:
            raise GenerationBusyError from exc

    def release(self) -> None:
        self._semaphore.release()
