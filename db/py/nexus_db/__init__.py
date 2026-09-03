"""Project Nexus Database & Cryptographic Adapter Package."""

from .client import get_pool, init_db_pool, close_db_pool
from .crypto import (
    encrypt_secret,
    decrypt_secret,
    normalize_email,
    hash_email,
    mask_ip_subnet,
    normalize_user_agent,
    hash_user_agent,
    normalize_device_id,
    hash_device_id,
    generate_maas_token,
    hash_maas_token,
    preview_maas_token,
)
from .sanitize import sanitize_audit_data
from .audit import compute_canonical_preimage, compute_entry_hash, verify_audit_chain
from .models import (
    MerchantModel,
    ProductModel,
    TransactionModel,
    AuditEntryModel,
    BuyerFingerprintModel,
    IntentParsedModel,
)

__all__ = [
    "get_pool",
    "init_db_pool",
    "close_db_pool",
    "encrypt_secret",
    "decrypt_secret",
    "normalize_email",
    "hash_email",
    "mask_ip_subnet",
    "normalize_user_agent",
    "hash_user_agent",
    "normalize_device_id",
    "hash_device_id",
    "generate_maas_token",
    "hash_maas_token",
    "preview_maas_token",
    "sanitize_audit_data",
    "compute_canonical_preimage",
    "compute_entry_hash",
    "verify_audit_chain",
    "MerchantModel",
    "ProductModel",
    "TransactionModel",
    "AuditEntryModel",
    "BuyerFingerprintModel",
    "IntentParsedModel",
]
