"""
Provider Registry & LLM Factory — LLM-Agnostic Backend.

Centralizes all provider definitions and the get_llm() factory.
All returned objects conform to LangChain's BaseChatModel interface:
  .with_structured_output(), .ainvoke(), prompt | llm, etc.
"""

from dataclasses import dataclass, field


@dataclass
class ProviderInfo:
    name: str               # "google", "openai", "ollama"
    display_name: str        # "Google Gemini", "OpenAI", "Ollama (Local)"
    requires_api_key: bool
    default_model: str
    fallback_models: list[str] = field(default_factory=list)


PROVIDERS: dict[str, ProviderInfo] = {
    "ollama": ProviderInfo(
        name="ollama",
        display_name="Ollama (Local)",
        requires_api_key=False,
        default_model="gemma3:latest",
        fallback_models=["gemma3:latest", "llama3.2:latest", "qwen2.5-coder:latest"],
    ),
    "google": ProviderInfo(
        name="google",
        display_name="Google Gemini",
        requires_api_key=True,
        default_model="gemini-2.5-flash",
        fallback_models=["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    ),
    "openai": ProviderInfo(
        name="openai",
        display_name="OpenAI",
        requires_api_key=True,
        default_model="gpt-4o-mini",
        fallback_models=["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini"],
    ),
    "anthropic": ProviderInfo(
        name="anthropic",
        display_name="Anthropic",
        requires_api_key=True,
        default_model="claude-3-5-sonnet-latest",
        fallback_models=["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    ),
}


def get_llm(provider: str, model: str, api_key: str | None = None, base_url: str | None = None):
    """
    Factory that returns a LangChain BaseChatModel.

    - Lazy-imports provider SDKs so the app doesn't crash if a library isn't installed.
    - Falls back to .env key via config.py when frontend doesn't send one.
    - Ollama: no key required, respects base_url.
    - Unknown provider → ValueError.
    """
    from config import get_settings
    settings = get_settings()

    match provider:
        case "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            env_key = settings.google_api_key.get_secret_value() if settings.google_api_key else None
            final_key = api_key or env_key
            if not final_key:
                raise ValueError("Google Gemini requires an API key. Check settings or .env.")

            return ChatGoogleGenerativeAI(
                model=model, api_key=final_key,
                temperature=0.4, max_retries=3,
            )

        case "openai":
            from langchain_openai import ChatOpenAI

            env_key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else None
            final_key = api_key or env_key
            if not final_key:
                raise ValueError("OpenAI requires an API key. Check settings or .env.")

            return ChatOpenAI(
                model=model, api_key=final_key,
                temperature=0.4, max_retries=3,
            )

        case "anthropic":
            from langchain_anthropic import ChatAnthropic

            env_key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
            final_key = api_key or env_key
            if not final_key:
                raise ValueError("Anthropic requires an API key. Check settings or .env.")

            return ChatAnthropic(
                model_name=model, api_key=final_key,
                temperature=0.4, max_retries=3,
            )

        case "ollama":
            from langchain_ollama import ChatOllama

            b_url = base_url or "http://localhost:11434"
            return ChatOllama(model=model, base_url=b_url, temperature=0.4)

        case _:
            raise ValueError(f"Unsupported provider: {provider}")
