import re
from typing import Any
from .crypto import (
    hash_email,
    mask_ip_subnet,
    hash_user_agent,
    hash_device_id,
)

SECRET_KEY_PATTERN = re.compile(
    r"^(key_secret|razorpay_key_secret|secret|password|authorization|private_key|api_key)$",
    re.IGNORECASE,
)
SAFE_TOKEN_PATTERN = re.compile(r"(_hash|_preview)$", re.IGNORECASE)
EMAIL_KEY_PATTERN = re.compile(r"email", re.IGNORECASE)
IP_KEY_PATTERN = re.compile(r"^(ip|client_ip|ip_address|remote_addr)$", re.IGNORECASE)
UA_KEY_PATTERN = re.compile(r"user_agent|useragent", re.IGNORECASE)
DEVICE_KEY_PATTERN = re.compile(r"device_id|deviceid", re.IGNORECASE)

IP_VALUE_PATTERN = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")
EMAIL_VALUE_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def sanitize_audit_data(data: Any) -> Any:
    """Recursively sanitize audit payload data:

    - Redacts raw merchant secrets / passwords / tokens
    - Converts emails to SHA-256 hashes
    - Truncates IP addresses to /24 subnets
    - Hashes User-Agent and Device ID strings
    (D-07, PRD §15.3)
    """
    if data is None:
        return None

    if isinstance(data, list):
        return [sanitize_audit_data(item) for item in data]

    if not isinstance(data, dict):
        return data

    sanitized: dict[str, Any] = {}

    for key, value in data.items():
        if value is None:
            sanitized[key] = None
            continue

        # 1. Redact secrets
        if SECRET_KEY_PATTERN.match(key) and not SAFE_TOKEN_PATTERN.search(key):
            sanitized[key] = "[REDACTED]"
            continue

        if key.lower() == "maas_token" and not SAFE_TOKEN_PATTERN.search(key):
            sanitized[key] = "[REDACTED]"
            continue

        # 2. Dicts and Lists recurse
        if isinstance(value, (dict, list)):
            sanitized[key] = sanitize_audit_data(value)
            continue

        if isinstance(value, str):
            # 3. Email sanitization
            if EMAIL_KEY_PATTERN.search(key) and not SAFE_TOKEN_PATTERN.search(key):
                sanitized[key] = hash_email(value)
                continue
            if EMAIL_VALUE_PATTERN.match(value.strip()):
                sanitized[key] = hash_email(value)
                continue

            # 4. IP sanitization
            if IP_KEY_PATTERN.match(key):
                sanitized[key] = mask_ip_subnet(value)
                continue
            if IP_VALUE_PATTERN.match(value.strip()):
                sanitized[key] = mask_ip_subnet(value)
                continue

            # 5. User-Agent sanitization
            if UA_KEY_PATTERN.search(key) and not SAFE_TOKEN_PATTERN.search(key):
                sanitized[key] = hash_user_agent(value)
                continue

            # 6. Device ID sanitization
            if DEVICE_KEY_PATTERN.search(key) and not SAFE_TOKEN_PATTERN.search(key):
                sanitized[key] = hash_device_id(value)
                continue

        sanitized[key] = value

    return sanitized
