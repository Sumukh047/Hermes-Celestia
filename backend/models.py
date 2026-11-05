"""
Hermes Agent Studio - Database Models
SQLAlchemy ORM schemas for Agents, Execution Runs, Event Timelines, Integrations, and Approvals.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Boolean, DateTime, Integer, ForeignKey
from .db import Base


def utc_now() -> datetime:
    """Returns current UTC timestamp without timezone offset issues."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    """
    Studio User Account for multi-user isolation and settings preservation.
    """
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Agent(Base):
    """
    Configured AI Agent Instance.
    Supports autonomous personas, fine-grained tool bindings, visual workflow graphs,
    and tone modulation on top of any local LM Studio model.
    """
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True, default="default_user")
    name: Mapped[str] = mapped_column(String(160), index=True)
    goal: Mapped[str] = mapped_column(Text, default="")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(40), default="general")
    model: Mapped[str] = mapped_column(String(255), default="")
    autonomy: Mapped[str] = mapped_column(String(30), default="approval")  # 'suggest', 'approval', 'low_risk', 'autonomous'
    tools_json: Mapped[str] = mapped_column(Text, default="[]")
    workflow_json: Mapped[str] = mapped_column(Text, default="[]")
    memory_json: Mapped[str] = mapped_column(Text, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class Run(Base):
    """
    Immutable Execution Run record for an Agent invocation.
    Stores telemetry, execution duration, token consumption, and outcome summary.
    """
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(32), ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued")  # 'queued', 'running', 'completed', 'failed', 'stopped'
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    tool_calls: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")


class RunEvent(Base):
    """
    Fine-grained X-Ray event timeline emitted during an Agent's execution.
    Logs thoughts, planned tool actions, approval checks, tool outputs, and token streams.
    """
    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(32), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    kind: Mapped[str] = mapped_column(String(40))  # 'status', 'token', 'tool_start', 'tool_result', 'approval_required', 'error', 'complete'
    message: Mapped[str] = mapped_column(Text)
    payload: Mapped[str] = mapped_column(Text, default="{}")


class Integration(Base):
    """
    External tool integration credentials (Encrypted at rest).
    Stores service-specific tokens for WhatsApp, Email/Gmail, Telegram, Discord, Slack, etc.
    """
    __tablename__ = "integrations"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[str] = mapped_column(Text, default="{}")  # Fernet encrypted JSON string


class Approval(Base):
    """
    Human-In-The-Loop Approval request for high-risk tool execution.
    Allows users to approve or reject actions before irreversible side-effects occur.
    """
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(32), index=True)
    agent_id: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(120))  # e.g. 'whatsapp.send', 'email.send'
    details: Mapped[str] = mapped_column(Text, default="{}")  # JSON arguments of the tool call
    status: Mapped[str] = mapped_column(String(20), default="pending")  # 'pending', 'approved', 'rejected'
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Schedule(Base):
    """
    Scheduled & Recurring Autonomous Tasks.
    Supports natural language intervals, cron syntax, and automated triggers.
    """
    __tablename__ = "schedules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True, default="default_user")
    agent_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(160))
    cron_expression: Mapped[str] = mapped_column(String(80))  # e.g. '0 9 * * *', 'every 2 hours', '@daily'
    task_prompt: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str] = mapped_column(String(30), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
