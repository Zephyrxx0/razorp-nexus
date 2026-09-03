"""Custom domain exceptions for the Nexus Agent tool suite and pipeline."""


class NexusAgentError(Exception):
    """Base exception for all Nexus Agent errors."""


class TrustViolationError(NexusAgentError):
    """Raised when trust score < 40 at the defense-in-depth gate (RING-03)."""


class StockError(NexusAgentError):
    """Raised when catalog inventory is insufficient (ORCH-04)."""


class ProductNotFoundError(NexusAgentError):
    """Raised when product query yields no catalog match."""


class IntentValidationError(NexusAgentError):
    """Raised when intent quantity <= 0 or > 100 or email is invalid (D-01)."""


class RazorpayAdapterError(NexusAgentError):
    """Raised on payment gateway communication failure or mock error."""
