import pytest
from typing import Any


@pytest.fixture
def clean_graph_manager():
    """Provides a fresh, empty GraphManager instance."""
    from app.engine.graph_manager import GraphManager
    return GraphManager()


@pytest.fixture
def sample_fingerprint_clean() -> dict[str, Any]:
    """Provides a valid 5-signal test buyer fingerprint."""
    return {
        "email_hash": "72c822f1b0d27f8b510efe913f7d10a1806fcea8f29526ab3ed567795b62b65f",
        "ip_subnet": "192.168.1.0/24",
        "device_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        "upi_handle": "clean.buyer@okaxis",
        "user_agent_hash": "16241892d2966b9dd3a2726e243aced7b5a00ecd1679600a718861278f42d76f",
    }


@pytest.fixture
def sample_fingerprint_partial() -> dict[str, Any]:
    """Provides a partial fingerprint with only email and IP subnet (D-08)."""
    return {
        "email_hash": "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
        "ip_subnet": "10.0.0.0/24",
        "device_hash": None,
        "upi_handle": None,
        "user_agent_hash": None,
    }


@pytest.fixture
def sample_fingerprint_fraud() -> dict[str, Any]:
    """Provides a fingerprint corresponding to known fraudulent ring members."""
    return {
        "email_hash": "de9e6cd1e0d0acbfaa22ed66678fa12b226a47bf193a0f709235a4c14d481a58",
        "ip_subnet": "185.220.101.0/24",
        "device_hash": "8121d914e642f1dd7bb374f88f26ad4bfff2f72a4d11efe57971850611f2bccf",
        "upi_handle": "anonymous.ring1@upi",
        "user_agent_hash": "92298db214ff441d16abc0f47a4ac24a4d072cc039b50b95f9f02dbe3df7c186",
    }
