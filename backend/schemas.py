"""
Hermes Agent Studio - Pydantic Request & Response Schemas
Provides strict validation, defaults, and API contract specifications.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    """Schema for initializing a new autonomous agent instance."""
    name: str = Field(..., min_length=1, max_length=160, description="Display name for the agent")
    goal: str = Field(default="", description="High-level mission objective")
    system_prompt: str = Field(default="You are a helpful local AI agent.", description="Underlying system prompt")
    tone: str = Field(default="general", description="Persona tone: general, professional, customer_support, technical, friendly, executive")
    model: str = Field(default="", description="Target model identifier in LM Studio")
    autonomy: str = Field(default="approval", description="Autonomy mode: suggest, approval, low_risk, autonomous")
    tools: List[str] = Field(default_factory=list, description="List of enabled tool keys")
    workflow: Any = Field(default_factory=list, description="Workflow graph nodes and edges")
    memory: Dict[str, Any] = Field(default_factory=lambda: {"short_term": True, "long_term": True})


class AgentPatch(BaseModel):
    """Schema for updating an existing agent."""
    name: Optional[str] = None
    goal: Optional[str] = None
    system_prompt: Optional[str] = None
    tone: Optional[str] = None
    model: Optional[str] = None
    autonomy: Optional[str] = None
    tools: Optional[List[str]] = None
    workflow: Optional[Any] = None
    memory: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class ChatRequest(BaseModel):
    """Standard message payload for agent execution or Help Bot query."""
    message: str = Field(default="", description="Input prompt or task instruction")


class ChatStreamRequest(BaseModel):
    """Payload for custom playground testing with specific models and hyperparams."""
    message: str = Field(..., description="User prompt to send to the model")
    model: Optional[str] = Field(default="", description="LM Studio model identifier")
    system_prompt: Optional[str] = Field(default="You are a helpful AI assistant.", description="System prompt")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=0.95, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(default=1024, ge=16, le=32768)


class WorkflowRequest(BaseModel):
    """AI-powered workflow generator payload."""
    goal: str = Field(..., min_length=3, description="Goal to synthesize into a React Flow graph")
    model: Optional[str] = Field(default="", description="Optional model to run synthesis on")


class GatewayConfigRequest(BaseModel):
    """Payload to configure or probe the LM Studio Gateway endpoint."""
    base_url: Optional[str] = Field(default="http://127.0.0.1:1234", description="LM Studio base URL")
    auto_detect: Optional[bool] = Field(default=False, description="Probe local network for active LM Studio")


class ModelLoadRequest(BaseModel):
    """Parameters for loading a model into LM Studio memory."""
    model: str = Field(..., description="Model ID to load")
    context_length: int = Field(default=8192, ge=512, le=1048576)
    gpu_offload: str = Field(default="auto", description="Offload ratio: 'auto', 'max', 'off', or float string")
    flash_attention: bool = Field(default=True)
    offload_kv_cache_to_gpu: bool = Field(default=True)


class ModelUnloadRequest(BaseModel):
    """Parameters for ejecting/unloading a model from LM Studio VRAM."""
    instance_id: str = Field(..., description="Instance identifier or model ID to eject from VRAM")


class IntegrationConfig(BaseModel):
    """Integration configuration payload for saving to secure vault."""
    config: Dict[str, Any] = Field(default_factory=dict, description="Credentials dictionary")
    enabled: bool = Field(default=True, description="Whether the integration is activated")


class IntegrationTestRequest(BaseModel):
    """Direct test request to verify integration credentials before saving."""
    config: Dict[str, Any] = Field(default_factory=dict, description="Credentials to test")


class ApprovalActionRequest(BaseModel):
    """Response to a Human-in-the-Loop pending action request."""
    approved: bool = Field(..., description="True to allow tool execution, False to cancel")
    comment: Optional[str] = Field(default="", description="Optional human note or feedback")


class UserSignup(BaseModel):
    """Schema for user registration."""
    username: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=3, max_length=160)
    password: str = Field(..., min_length=4, max_length=128)
    name: Optional[str] = Field(default="", max_length=160)


class UserLogin(BaseModel):
    """Schema for user authentication."""
    username_or_email: str = Field(..., min_length=2)
    password: str = Field(..., min_length=1)


class UserSettingsUpdate(BaseModel):
    """Schema for updating user profile and preferences."""
    name: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class ScheduleCreate(BaseModel):
    """Schema for creating a recurring automation task."""
    agent_id: str = Field(..., description="Target Agent ID to execute")
    name: str = Field(..., min_length=1, max_length=160)
    cron_expression: str = Field(..., description="Interval or cron syntax, e.g. '@daily', 'every 2 hours', '0 9 * * *'")
    task_prompt: str = Field(..., min_length=1, description="Prompt or instruction sent to the agent")
    enabled: bool = Field(default=True)


class SchedulePatch(BaseModel):
    """Schema for updating an existing schedule."""
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    task_prompt: Optional[str] = None
    agent_id: Optional[str] = None
    enabled: Optional[bool] = None


class ObsidianNoteCreate(BaseModel):
    """Schema for creating or saving a note in Obsidian vault."""
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(...)
    folder: Optional[str] = Field(default="")
    tags: Optional[List[str]] = Field(default_factory=list)


class MultimodalFile(BaseModel):
    """File attachment payload with base64 data."""
    name: str
    type: Optional[str] = ""
    content_base64: str


class MultimodalChatRequest(BaseModel):
    """Payload for multimodal inference and task-focused work modes."""
    prompt: str = Field(..., description="User prompt or instruction")
    mode: str = Field(default="general", description="Work mode identifier")
    model: Optional[str] = Field(default=None, description="Optional target model")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    files: Optional[List[MultimodalFile]] = Field(default_factory=list, description="Attached documents or images")
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Prior conversation history")
