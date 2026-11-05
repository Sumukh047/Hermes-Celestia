"""
Hermes Agent Studio - LM Studio Client & Gateway Manager
Provides high-resilience connectivity to LM Studio instances running locally or across LAN.
Supports auto-endpoint discovery, fallback probing, REST API v1 model catalogs,
and token-to-token streaming with tool call extraction.
"""

import asyncio
import json
import logging
import socket
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

logger = logging.getLogger("hermes_agent_studio.lmstudio")


def get_local_ip_candidates() -> List[str]:
    """Discover potential local network IP addresses for LM Studio fallback discovery."""
    candidates = ["127.0.0.1", "localhost", "[::1]"]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        # Connect to public DNS to discover primary local network interface IP
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        if local_ip and local_ip not in candidates:
            candidates.append(local_ip)
    except Exception:
        pass
    return candidates


class LMStudio:
    """
    Robust client for LM Studio.
    Handles OpenAI-compatible /v1 endpoints as well as LM Studio /api/v1 endpoints.
    Includes auto-discovery across local loopback and LAN interfaces.
    """

    def __init__(self, base_url: str = "http://127.0.0.1:1234", key: str = ""):
        self.set_base_url(base_url)
        self.key = key

    def set_base_url(self, base_url: str):
        """Update base URL and standardize paths."""
        self.base = base_url.rstrip("/")
        self.v1 = self.base + "/v1"
        self.api_v1 = self.base + "/api/v1"

    def headers(self) -> Dict[str, str]:
        """Generate request headers with optional API key."""
        h = {"Content-Type": "application/json"}
        if self.key:
            h["Authorization"] = f"Bearer {self.key}"
        return h

    async def auto_discover_endpoint(self, preferred_port: int = 1234) -> Optional[str]:
        """
        Probe candidate URLs to find where LM Studio is actively listening.
        Checks current base, 127.0.0.1, localhost, and local LAN IP.
        """
        candidate_bases = [self.base]
        for ip in get_local_ip_candidates():
            cand = f"http://{ip}:{preferred_port}"
            if cand not in candidate_bases:
                candidate_bases.append(cand)

        async with httpx.AsyncClient(timeout=1.5) as client:
            for cand in candidate_bases:
                try:
                    r = await client.get(f"{cand}/v1/models")
                    if r.status_code == 200:
                        logger.info(f"Auto-discovered active LM Studio gateway at: {cand}")
                        self.set_base_url(cand)
                        return cand
                except Exception:
                    continue
        return None

    async def health(self) -> Dict[str, Any]:
        """
        Comprehensive health check.
        Returns connection state, active gateway URL, loaded models, and latency.
        """
        start = time.perf_counter()
        # 1. Try current base URL
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self.v1}/models", headers=self.headers())
                if r.status_code == 200:
                    latency = round((time.perf_counter() - start) * 1000, 1)
                    data = r.json()
                    models_list = data.get("data", []) if isinstance(data, dict) else []
                    return {
                        "connected": True,
                        "base_url": self.base,
                        "latency_ms": latency,
                        "models": models_list,
                        "loaded_count": len(models_list)
                    }
        except Exception:
            pass

        # 2. Try auto-discovery fallback
        discovered = await self.auto_discover_endpoint()
        if discovered:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    r = await client.get(f"{self.v1}/models", headers=self.headers())
                    if r.status_code == 200:
                        latency = round((time.perf_counter() - start) * 1000, 1)
                        data = r.json()
                        models_list = data.get("data", []) if isinstance(data, dict) else []
                        return {
                            "connected": True,
                            "base_url": self.base,
                            "latency_ms": latency,
                            "models": models_list,
                            "loaded_count": len(models_list)
                        }
            except Exception as e:
                return {
                    "connected": False,
                    "base_url": self.base,
                    "models": [],
                    "error": str(e)
                }

        return {
            "connected": False,
            "base_url": self.base,
            "models": [],
            "error": f"LM Studio not reachable at {self.base}. Make sure Local Server is started in LM Studio on port 1234."
        }

    async def models(self) -> List[Dict[str, Any]]:
        """
        Get all active / loaded models via OpenAI /v1/models endpoint.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.v1}/models", headers=self.headers())
                if r.status_code == 200:
                    data = r.json()
                    return data.get("data", []) if isinstance(data, dict) else []
        except Exception:
            # Try auto-discovery fallback
            discovered = await self.auto_discover_endpoint()
            if discovered:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.get(f"{self.v1}/models", headers=self.headers())
                    if r.status_code == 200:
                        data = r.json()
                        return data.get("data", []) if isinstance(data, dict) else []
        return []

    async def loaded(self) -> Dict[str, Any]:
        """
        Get all models visible to LM Studio via /api/v1/models (REST API v1).
        This includes all downloaded models on disk and currently loaded instances.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.api_v1}/models", headers=self.headers())
                if r.status_code == 200:
                    return r.json()
        except Exception:
            pass
        return {}

    async def get_unified_catalog(self) -> Dict[str, Any]:
        """
        Merges /v1/models (currently loaded) and /api/v1/models (downloaded on disk)
        into a unified, comprehensive catalog with load status badges and specs.
        """
        active_models = await self.models()
        disk_catalog = await self.loaded()

        raw_models = disk_catalog.get("models", []) if isinstance(disk_catalog, dict) else []
        active_ids = {m.get("id") for m in active_models if isinstance(m, dict) and "id" in m}
        unified_list: List[Dict[str, Any]] = []

        # Build comprehensive lookup map from disk models
        disk_map = {}
        for dm in raw_models:
            if not isinstance(dm, dict):
                continue
            for k in [dm.get("key"), dm.get("id"), dm.get("display_name")]:
                if k:
                    disk_map[k] = dm
            for v in dm.get("variants", []):
                if v:
                    disk_map[v] = dm

        # 1. Add all active models first, enriched with disk metadata
        for m in active_models:
            mid = m.get("id", "")
            dm = disk_map.get(mid)
            if not dm:
                for k, v in disk_map.items():
                    if mid in k or k in mid:
                        dm = v
                        break

            max_ctx = 131072
            current_ctx = 32768
            arch = ""
            quant = ""
            size = 0
            caps = {}
            disp = mid

            if dm:
                max_ctx = dm.get("max_context_length") or max_ctx
                disp = dm.get("display_name") or disp
                arch = dm.get("architecture") or arch
                quant = dm.get("quantization", {}).get("name", "") if isinstance(dm.get("quantization"), dict) else str(dm.get("quantization") or "")
                size = dm.get("size_bytes") or size
                caps = dm.get("capabilities") or caps
                loaded_instances = dm.get("loaded_instances", [])
                if loaded_instances and isinstance(loaded_instances, list):
                    cfg = loaded_instances[0].get("config", {})
                    if cfg and "context_length" in cfg:
                        current_ctx = cfg["context_length"]

            unified_list.append({
                "id": mid,
                "display_name": disp,
                "loaded": True,
                "type": "llm",
                "object": m.get("object", "model"),
                "status": "ready",
                "max_context_length": max_ctx,
                "current_context_length": current_ctx,
                "architecture": arch,
                "quantization": quant,
                "size_bytes": size,
                "capabilities": caps
            })

        # 2. Add downloaded models from disk catalog that are not loaded
        for dm in raw_models:
            if not isinstance(dm, dict):
                continue
            key = dm.get("key") or dm.get("display_name") or dm.get("id") or ""
            # Don't duplicate if already in active list
            if key not in active_ids and dm.get("id") not in active_ids:
                quant_name = dm.get("quantization", {}).get("name", "") if isinstance(dm.get("quantization"), dict) else str(dm.get("quantization") or "")
                unified_list.append({
                    "id": key,
                    "display_name": dm.get("display_name", key),
                    "loaded": False,
                    "type": dm.get("type", "llm"),
                    "architecture": dm.get("architecture", ""),
                    "quantization": quant_name,
                    "size_bytes": dm.get("size_bytes", 0),
                    "status": "available_on_disk",
                    "max_context_length": dm.get("max_context_length") or 32768,
                    "current_context_length": None,
                    "capabilities": dm.get("capabilities", {})
                })

        return {
            "gateway_url": self.base,
            "connected": len(active_models) > 0 or len(raw_models) > 0,
            "active_models": active_models,
            "models": unified_list,
            "total_count": len(unified_list),
            "loaded_count": len(active_models)
        }

    async def load(
        self,
        model: str,
        context_length: int = 8192,
        gpu_offload: str = "auto",
        flash_attention: bool = True,
        kv_gpu: bool = True
    ) -> Dict[str, Any]:
        """Load a specific model into LM Studio memory with advanced offloading configs."""
        # Cleanly unload any previous instances of this model first to prevent VRAM duplication
        try:
            disk_cat = await self.loaded()
            for dm in disk_cat.get("models", []):
                for k in [dm.get("key"), dm.get("id"), dm.get("display_name")]:
                    if k == model and dm.get("loaded_instances"):
                        for inst in dm.get("loaded_instances", []):
                            inst_id = inst.get("id")
                            if inst_id:
                                try:
                                    await self.unload(inst_id)
                                except Exception:
                                    pass
        except Exception:
            pass

        payload = {
            "model": model,
            "context_length": context_length,
            "flash_attention": flash_attention,
            "offload_kv_cache_to_gpu": kv_gpu,
            "echo_load_config": True
        }

        async with httpx.AsyncClient(timeout=180.0) as client:
            r = await client.post(f"{self.api_v1}/models/load", headers=self.headers(), json=payload)
            r.raise_for_status()
            return r.json()

    async def unload(self, instance_id: str) -> Dict[str, Any]:
        """Eject/unload a loaded model from LM Studio VRAM memory."""
        payload = {"instance_id": instance_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{self.api_v1}/models/unload", headers=self.headers(), json=payload)
            r.raise_for_status()
            return r.json()

    async def stream(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float = 0.7,
        top_p: float = 0.95,
        max_tokens: int = 1024,
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream chat completions token-by-token from LM Studio.
        Extracts content chunks, tool_calls deltas, and performance metrics.
        """
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": True
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{self.v1}/chat/completions", headers=self.headers(), json=payload) as r:
                if r.status_code >= 400:
                    err_msg = (await r.aread()).decode(errors="replace")
                    raise RuntimeError(f"LM Studio API Error ({r.status_code}): {err_msg}")

                started = time.perf_counter()
                first = True

                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        yield {"type": "done"}
                        continue
                    try:
                        o = json.loads(raw)
                    except Exception:
                        continue

                    if first:
                        first = False
                        yield {"type": "meta", "ttft": time.perf_counter() - started}

                    ch = (o.get("choices") or [{}])[0]
                    delta = ch.get("delta") or {}

                    if delta.get("reasoning_content"):
                        yield {"type": "thought", "text": delta["reasoning_content"]}
                    if delta.get("content"):
                        yield {"type": "token", "text": delta["content"]}
                    if delta.get("tool_calls"):
                        yield {"type": "tool_calls", "data": delta["tool_calls"]}
                    if ch.get("finish_reason"):
                        yield {"type": "finish", "reason": ch["finish_reason"]}

    async def one_shot(self, model: str, messages: List[Dict[str, Any]], **kw) -> str:
        """Helper to collect an entire non-streaming response as string."""
        out = ""
        async for e in self.stream(model, messages, **kw):
            if e["type"] == "token":
                out += e["text"]
        return out
