import importlib
import sys
from types import ModuleType
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _install_fake_tracing_modules(register_mock, instrument_mock):
    arize_module = ModuleType("arize")
    otel_module = ModuleType("arize.otel")
    otel_module.register = register_mock
    arize_module.otel = otel_module

    openinference_module = ModuleType("openinference")
    instrumentation_module = ModuleType("openinference.instrumentation")
    langchain_module = ModuleType("openinference.instrumentation.langchain")

    class FakeLangChainInstrumentor:
        def instrument(self, tracer_provider=None):
            instrument_mock(tracer_provider=tracer_provider)

    langchain_module.LangChainInstrumentor = FakeLangChainInstrumentor
    instrumentation_module.langchain = langchain_module
    openinference_module.instrumentation = instrumentation_module

    return {
        "arize": arize_module,
        "arize.otel": otel_module,
        "openinference": openinference_module,
        "openinference.instrumentation": instrumentation_module,
        "openinference.instrumentation.langchain": langchain_module,
    }


def test_configure_tracing_registers_arize_and_langchain_once():
    register_mock = MagicMock(return_value=object())
    instrument_mock = MagicMock()
    fake_modules = _install_fake_tracing_modules(register_mock, instrument_mock)
    fake_settings = SimpleNamespace(
        arize_space_id=SimpleNamespace(get_secret_value=lambda: "space-123"),
        arize_api_key=SimpleNamespace(get_secret_value=lambda: "key-456"),
        langchain_project="LeetCode EasyRepeat",
    )

    with patch.dict(sys.modules, fake_modules):
        tracing = importlib.import_module("tracing")
        importlib.reload(tracing)

        with patch.object(tracing, "get_settings", return_value=fake_settings):
            tracer_provider = tracing.configure_tracing()
            second_call = tracing.configure_tracing()

    assert tracer_provider is register_mock.return_value
    assert second_call is tracer_provider
    register_mock.assert_called_once_with(
        space_id="space-123",
        api_key="key-456",
        project_name="LeetCode EasyRepeat",
    )
    instrument_mock.assert_called_once_with(tracer_provider=register_mock.return_value)


def test_configure_tracing_skips_when_arize_env_missing():
    tracing = importlib.import_module("tracing")
    importlib.reload(tracing)

    fake_settings = SimpleNamespace(arize_space_id=None, arize_api_key=None, langchain_project="LeetCode EasyRepeat")
    with patch.object(tracing, "get_settings", return_value=fake_settings):
        assert tracing.configure_tracing() is None


def test_api_startup_tracing_hook_invokes_configuration():
    import api
    from fastapi.testclient import TestClient

    with patch.object(api, "configure_tracing") as mock_configure:
        with TestClient(api.app):
            pass

    mock_configure.assert_called_once_with()
