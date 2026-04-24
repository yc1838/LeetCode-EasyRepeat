"""Optional Arize tracing bootstrap for the MCP server."""

from __future__ import annotations

from functools import lru_cache

from config import get_settings


@lru_cache(maxsize=1)
def configure_tracing():
    """Register Arize tracing when credentials are present.

    Returns the tracer provider when tracing is enabled, otherwise None.
    The function is cached so startup hooks can call it safely more than once.
    """
    settings = get_settings()
    space_id = settings.arize_space_id.get_secret_value() if settings.arize_space_id else None
    api_key = settings.arize_api_key.get_secret_value() if settings.arize_api_key else None

    if not space_id or not api_key:
        return None

    try:
        from arize.otel import register
        from openinference.instrumentation.langchain import LangChainInstrumentor
    except ImportError as exc:
        print(f"[Tracing] Arize tracing unavailable: {exc}")
        return None

    tracer_provider = register(
        space_id=space_id,
        api_key=api_key,
        project_name=settings.langchain_project or "LeetCode EasyRepeat",
    )
    LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
    print("[Tracing] Arize tracing enabled")
    return tracer_provider
