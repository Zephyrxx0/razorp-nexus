import hashlib
import os
import re
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt_secret(
    plaintext: str,
    key_hex: str,
    custom_iv_hex: str | None = None,
) -> str:
    """Encrypt a plaintext secret using AES-256-GCM.

    Outputs format: ${iv_hex}:${auth_tag_hex}:${ciphertext_hex} (D-13).
    """
    key = bytes.fromhex(key_hex)
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")

    iv = bytes.fromhex(custom_iv_hex) if custom_iv_hex else os.urandom(12)
    if len(iv) != 12:
        raise ValueError("IV must be 12 bytes (24 hex characters)")

    aesgcm = AESGCM(key)
    # In cryptography.io AESGCM, encrypt appends the 16-byte auth tag to ciphertext
    enc = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ciphertext = enc[:-16]
    tag = enc[-16:]

    return f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt_secret(payload: str, key_hex: str) -> str:
    """Decrypt an AES-256-GCM payload formatted as ${iv_hex}:${auth_tag_hex}:${ciphertext_hex}."""
    parts = payload.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted payload format. Expected iv:auth_tag:ciphertext")

    iv_hex, tag_hex, ct_hex = parts
    key = bytes.fromhex(key_hex)
    iv = bytes.fromhex(iv_hex)
    tag = bytes.fromhex(tag_hex)
    ciphertext = bytes.fromhex(ct_hex)

    aesgcm = AESGCM(key)
    # AESGCM.decrypt expects ciphertext + auth_tag concatenated
    decrypted = aesgcm.decrypt(iv, ciphertext + tag, None)
    return decrypted.decode("utf-8")


def normalize_email(email: str) -> str:
    """Normalize email by trimming and lowercasing (D-14)."""
    return email.strip().lower()


def hash_email(email: str) -> str:
    """Compute SHA-256 hex digest of normalized email (D-07, D-14)."""
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


def mask_ip_subnet(ip: str) -> str:
    """Mask IPv4 address to /24 subnet (x.y.z.0/24) (D-14)."""
    s = ip.strip()
    match = re.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$", s)
    if match:
        return f"{match.group(1)}.{match.group(2)}.{match.group(3)}.0/24"
    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.0/24$", s):
        return s
    return s


def normalize_user_agent(ua: str) -> str:
    """Normalize User-Agent by trimming and collapsing internal whitespace (D-14)."""
    return re.sub(r"\s+", " ", ua.strip())


def hash_user_agent(ua: str) -> str:
    """Compute SHA-256 hex digest of normalized User-Agent (D-14)."""
    return hashlib.sha256(normalize_user_agent(ua).encode("utf-8")).hexdigest()


def normalize_device_id(device_id: str) -> str:
    """Normalize Device ID by trimming and lowercasing."""
    return device_id.strip().lower()


def hash_device_id(device_id: str) -> str:
    """Compute SHA-256 hex digest of normalized Device ID."""
    return hashlib.sha256(normalize_device_id(device_id).encode("utf-8")).hexdigest()


def hash_maas_token(token: str) -> str:
    """Compute SHA-256 hex digest of MaaS Bearer token (D-15)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def preview_maas_token(token: str) -> str:
    """Generate display preview of MaaS token (e.g. maas_live_e3b0...b855) (D-15)."""
    if len(token) < 18:
        return token
    return f"{token[:14]}...{token[-4:]}"


def generate_maas_token() -> tuple[str, str, str]:
    """Generate a new MaaS token and return (token, hash, preview) (D-15)."""
    hex_chars = secrets.token_hex(16)
    token = f"maas_live_{hex_chars}"
    token_hash = hash_maas_token(token)
    preview = preview_maas_token(token)
    return token, token_hash, preview
