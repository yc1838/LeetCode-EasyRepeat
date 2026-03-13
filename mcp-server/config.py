from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr
from typing import Optional

class Settings(BaseSettings):
    # LLM Provider Keys
    google_api_key: Optional[SecretStr] = Field(validation_alias="GOOGLE_API_KEY", default=None)
    openai_api_key: Optional[SecretStr] = Field(validation_alias="OPENAI_API_KEY", default=None)
    anthropic_api_key: Optional[SecretStr] = Field(validation_alias="ANTHROPIC_API_KEY", default=None)
    
    # LangSmith Tracing Keys
    langchain_api_key: Optional[SecretStr] = None
    langchain_tracing_v2: bool = False
    langchain_project: Optional[str] = "LeetCode EasyRepeat"
    
    # Agent Config
    default_model: str = "gemini-2.5-flash"
    temperature: float = 0.4
    max_retries: int = 3
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore" # Ignore other vars in the .env file like E2B_API_KEY
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()
