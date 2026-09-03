"""Shared test fixtures for the nexus-agent test suite."""

import sys
from pathlib import Path
from uuid import UUID
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock

# Ensure nexus-agent and db/py are on sys.path regardless of how pytest is invoked
AGENT_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = AGENT_DIR.parent
DB_PY_DIR = WORKSPACE_DIR / "db" / "py"

for p in (str(AGENT_DIR), str(DB_PY_DIR), str(AGENT_DIR / "nexus_agent")):
    if p not in sys.path:
        sys.path.insert(0, p)

from nexus_agent.config import Settings
from nexus_db.crypto import encrypt_secret


@pytest.fixture
def test_settings() -> Settings:
    """Provides test application settings."""
    return Settings(
        nexus_razorpay_mock=True,
        google_api_key="test-key",
        database_url="postgresql://nexus_app:nexus_app_dev_secret@localhost:5432/nexus",
        trust_graph_url="http://localhost:8001",
    )


@pytest.fixture
def test_merchant_data(test_settings: Settings) -> dict:
    """Provides valid merchant test record with AES-256 encrypted razorpay_key_secret."""
    merchant_id = UUID("00000000-0000-0000-0000-000000000001")
    key_secret_raw = "sct_test_mock_secret_key_12345"
    encrypted_secret = encrypt_secret(key_secret_raw, test_settings.encryption_key)
    return {
        "id": merchant_id,
        "name": "Nexus Secure Electronics",
        "email": "merchant@nexus.local",
        "razorpay_key_id": "rzp_test_mock_12345",
        "razorpay_key_secret": encrypted_secret,
        "razorpay_webhook_secret": "whsec_mock_webhook_secret_12345",
        "is_active": True,
    }


@pytest.fixture
def test_product_data() -> dict:
    """Provides valid product test record matching CONVENTIONS and PRD."""
    merchant_id = UUID("00000000-0000-0000-0000-000000000001")
    product_id = UUID("00000000-0000-0000-0000-000000000002")
    return {
        "id": product_id,
        "merchant_id": merchant_id,
        "name": "Nexus Secure Router",
        "description": "Hardware-encrypted zero-trust secure edge router",
        "price_paise": 499900,
        "stock": 25,
        "category": "Hardware",
        "currency": "INR",
        "is_active": True,
    }


@pytest.fixture
def mock_db_pool():
    """Provides an async mock connection pool supporting transactions and queries."""
    class MockTransaction:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

    class MockConnection:
        def __init__(self):
            self.queries = []

        async def fetch(self, query, *args):
            self.queries.append((query, args))
            return []

        async def fetchrow(self, query, *args):
            self.queries.append((query, args))
            return None

        async def fetchval(self, query, *args):
            self.queries.append((query, args))
            return None

        async def execute(self, query, *args):
            self.queries.append((query, args))
            return "UPDATE 1"

        def transaction(self):
            return MockTransaction()

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

    class MockPool:
        def __init__(self):
            self.conn = MockConnection()

        def acquire(self):
            return self.conn

        async def close(self):
            pass

    return MockPool()


@pytest.fixture
def mock_trust_client():
    """Async mock fixture returning configured trust score responses (85 ALLOW, 55 REVIEW, 25 DENY, 500ms Timeout)."""
    class MockTrustGraphClient:
        def __init__(self):
            self.mode = "ALLOW"

        def set_mode(self, mode: str):
            """Mode can be ALLOW, REVIEW, DENY, or TIMEOUT."""
            self.mode = mode

        async def get_score(self, **kwargs) -> dict:
            if self.mode == "TIMEOUT":
                raise httpx.TimeoutException("Trust Graph request timed out after 500ms")
            elif self.mode == "DENY":
                return {
                    "score": 25.0,
                    "decision": "DENY",
                    "risk_factors": ["known_fraud_network", "high_velocity"],
                    "graph_metrics": {
                        "nodes_matched": 3,
                        "known_fraud_neighbors_1hop": 2,
                        "known_fraud_neighbors_2hop": 4,
                        "cross_merchant_count": 5,
                        "velocity_last_60min": 12,
                    },
                }
            elif self.mode == "REVIEW":
                return {
                    "score": 55.0,
                    "decision": "REVIEW",
                    "risk_factors": ["partial_fingerprint", "elevated_velocity"],
                    "graph_metrics": {
                        "nodes_matched": 1,
                        "known_fraud_neighbors_1hop": 0,
                        "known_fraud_neighbors_2hop": 1,
                        "cross_merchant_count": 2,
                        "velocity_last_60min": 3,
                    },
                }
            else:  # ALLOW
                return {
                    "score": 85.0,
                    "decision": "ALLOW",
                    "risk_factors": [],
                    "graph_metrics": {
                        "nodes_matched": 1,
                        "known_fraud_neighbors_1hop": 0,
                        "known_fraud_neighbors_2hop": 0,
                        "cross_merchant_count": 1,
                        "velocity_last_60min": 1,
                    },
                }

    return MockTrustGraphClient()


def test_conftest_fixtures(test_settings, test_merchant_data, test_product_data, mock_db_pool, mock_trust_client):
    """Verify all shared fixtures load and conform to domain schemas."""
    assert test_settings.nexus_razorpay_mock is True
    assert test_settings.encryption_key is not None
    assert test_merchant_data["name"] == "Nexus Secure Electronics"
    assert test_product_data["name"] == "Nexus Secure Router"
    assert test_product_data["price_paise"] == 499900
    assert mock_db_pool is not None
    assert mock_trust_client is not None
