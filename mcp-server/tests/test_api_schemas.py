import pytest
from pydantic import ValidationError
from api import GeneratedTests, CodeFix

def test_generated_tests_happy_path():
    # (A) Happy path
    cases = ["case1", "case2", "case3"]
    model = GeneratedTests(test_cases=cases)
    assert model.test_cases == cases

def test_generated_tests_empty_list():
    # (B) Empty fields
    model = GeneratedTests(test_cases=[])
    assert model.test_cases == []

def test_generated_tests_missing_field():
    # (B) Missing fields
    with pytest.raises(ValidationError):
        GeneratedTests()

def test_generated_tests_type_mismatch():
    # (C) Type mismatch: integers instead of strings
    # Pydantic v2 strictly enforces string types for list[str]
    with pytest.raises(ValidationError):
        GeneratedTests(test_cases=[1, 2, 3])

def test_generated_tests_dict_mismatch():
    # (C) Type mismatch: passing dict instead of list
    with pytest.raises(ValidationError):
        GeneratedTests(test_cases={"case": 1})

def test_generated_tests_null_value():
    # (B) Null value
    with pytest.raises(ValidationError):
        GeneratedTests(test_cases=None)

def test_codefix_happy_path():
    # (A) Happy path for CodeFix
    model = CodeFix(fixed_code="def new(): pass", explanation="Fixed it")
    assert model.fixed_code == "def new(): pass"
    assert model.explanation == "Fixed it"

def test_codefix_missing_fields():
    # (B) Missing fields in CodeFix
    with pytest.raises(ValidationError):
        CodeFix(fixed_code="def new(): pass")
    with pytest.raises(ValidationError):
        CodeFix(explanation="Fixed it")

