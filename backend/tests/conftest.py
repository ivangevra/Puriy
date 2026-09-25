import os
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault(
    'DATABASE_URL',
    'sqlite:///' + str(Path(tempfile.mkdtemp()) / 'test.db'),
)
os.environ.setdefault('ADMIN_TOKEN', 'test-only-admin-token-long-enough')
os.environ.setdefault('ALLOW_ADMIN_TOKEN_FOR_TESTS', 'true')


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from backend.main import app

    with TestClient(app) as c:
        yield c
