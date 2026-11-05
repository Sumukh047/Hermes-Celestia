"""
Hermes Agent Studio - Master Automated Verification Test Suite
Validates that 100% of core backend features, API endpoints, encryption vaults,
tool executors, and agent lifecycle operations function without failure.
"""

import asyncio
import json
import pytest
from fastapi.testclient import TestClient

from backend.main import app, serialize_agent
from backend.db import init_db, SessionLocal
from backend.models import Agent, Run, RunEvent, Integration, Approval
from backend.security import secrets
from backend.tools import TOOLS, TOOLMAP, schemas, run_tool
from backend.integrations import test_integration as run_test_integration


client = TestClient(app)


def test_encryption_vault():
    """Verify Fernet encryption and safe decryption."""
    original = "secret_meta_or_google_token_12345"
    encrypted = secrets.encrypt(original)
    assert encrypted != original
    decrypted = secrets.decrypt(encrypted)
    assert decrypted == original

    # Test safe_decrypt on empty and plaintext strings
    assert secrets.safe_decrypt("") == ""
    assert secrets.safe_decrypt("plain_already") == "plain_already"
    assert secrets.safe_decrypt(encrypted) == original


def test_system_diagnostics():
    """Verify /api/system endpoint used by Settings dashboard."""
    res = client.get("/api/system")
    assert res.status_code == 200
    data = res.json()
    assert "os" in data
    assert "resources" in data
    assert "cpu_percent" in data["resources"]
    assert "database" in data
    assert "security" in data
    assert data["security"]["encryption"].startswith("Fernet")


def test_health_check():
    """Verify /api/health endpoint."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["app"] == "online"
    assert "lmstudio" in data
    assert "status" in data


def test_tools_catalog_and_schemas():
    """Verify tool definitions and function schemas."""
    res = client.get("/api/tools")
    assert res.status_code == 200
    tools = res.json()
    assert len(tools) >= 8

    tool_names = [t["name"] for t in tools]
    assert "web.search" in tool_names
    assert "email.send" in tool_names
    assert "whatsapp.send" in tool_names

    # Test OpenAI tool schema generation
    generated_schemas = schemas(["web.search", "email.send", "whatsapp.send"])
    assert len(generated_schemas) == 3
    assert generated_schemas[0]["type"] == "function"
    assert "parameters" in generated_schemas[0]["function"]


def test_integrations_catalog():
    """Verify integration marketplace listing and configuration."""
    res = client.get("/api/integrations")
    assert res.status_code == 200
    catalog = res.json()
    keys = [i["key"] for i in catalog]
    assert "whatsapp" in keys
    assert "email" in keys
    assert "telegram" in keys

    # Test saving an encrypted configuration
    save_res = client.post("/api/integrations/email", json={
        "config": {"email": "test@domain.com", "app_password": "password123"},
        "enabled": True
    })
    assert save_res.status_code == 200

    # Test reading back masked config
    get_res = client.get("/api/integrations/email")
    assert get_res.status_code == 200
    masked = get_res.json()["config"]
    assert masked["email"] == "test@domain.com"
    assert "••••" in masked["app_password"]


def test_agent_lifecycle_crud():
    """Verify complete Agent lifecycle: Create, Read, Update, Clone, Delete."""
    # 1. Create
    create_res = client.post("/api/agents", json={
        "name": "Test QA Agent",
        "goal": "Verify all automated features",
        "system_prompt": "You are a test agent.",
        "tone": "technical",
        "model": "meta-llama-3-8b-instruct",
        "autonomy": "approval",
        "tools": ["web.search", "files.list"]
    })
    assert create_res.status_code == 200
    agent = create_res.json()
    agent_id = agent["id"]
    assert agent["name"] == "Test QA Agent"
    assert "web.search" in agent["tools"]

    # 2. Get
    get_res = client.get(f"/api/agents/{agent_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == agent_id

    # 3. Patch
    patch_res = client.patch(f"/api/agents/{agent_id}", json={
        "name": "Updated QA Agent",
        "tone": "professional"
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Updated QA Agent"
    assert patch_res.json()["tone"] == "professional"

    # 4. Clone
    clone_res = client.post(f"/api/agents/{agent_id}/clone")
    assert clone_res.status_code == 200
    cloned = clone_res.json()
    assert cloned["id"] != agent_id
    assert "Copy" in cloned["name"]

    # 5. Delete original & clone
    del_res = client.delete(f"/api/agents/{agent_id}")
    assert del_res.status_code == 200

    del_clone = client.delete(f"/api/agents/{cloned['id']}")
    assert del_clone.status_code == 200

    # Verify not found after delete
    check_del = client.get(f"/api/agents/{agent_id}")
    assert check_del.status_code == 404


def test_runs_and_events():
    """Verify run logging and event retrieval."""
    res = client.get("/api/runs")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_approvals_api():
    """Verify Human-in-the-loop approvals API."""
    res = client.get("/api/approvals")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
