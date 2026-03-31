"""Tests for eval judge rubric hardening — ensuring the rubric constrains
scores to discrete 0-1 values and contains explicit anti-hallucination
instructions that prevent the judge from scoring outside the valid range."""

import pytest

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.eval_prompts import (
    FIX_QUALITY_RUBRIC,
    EXPLANATION_QUALITY_RUBRIC,
)


# ───────────── Happy-path: required structure ─────────────

class TestRubricContainsValidScoreTiers:
    """Both rubrics must list exactly the allowed discrete score values."""

    def test_fix_rubric_lists_all_five_tiers(self):
        for tier in ["1.0", "0.75", "0.5", "0.25", "0.0"]:
            assert tier in FIX_QUALITY_RUBRIC, (
                f"FIX_QUALITY_RUBRIC is missing score tier {tier}"
            )

    def test_explanation_rubric_lists_all_five_tiers(self):
        for tier in ["1.0", "0.75", "0.5", "0.25", "0.0"]:
            assert tier in EXPLANATION_QUALITY_RUBRIC, (
                f"EXPLANATION_QUALITY_RUBRIC is missing score tier {tier}"
            )


class TestRubricContainsTemplateSlots:
    """Both rubrics must contain {inputs}, {outputs}, {reference_outputs}."""

    def test_fix_rubric_template_slots(self):
        assert "{inputs}" in FIX_QUALITY_RUBRIC
        assert "{outputs}" in FIX_QUALITY_RUBRIC
        assert "{reference_outputs}" in FIX_QUALITY_RUBRIC

    def test_explanation_rubric_template_slots(self):
        assert "{inputs}" in EXPLANATION_QUALITY_RUBRIC
        assert "{outputs}" in EXPLANATION_QUALITY_RUBRIC
        assert "{reference_outputs}" in EXPLANATION_QUALITY_RUBRIC


# ───────────── Anti-hallucination: explicit constraints ─────────────

class TestRubricAntiHallucinationInstructions:
    """The rubrics must contain explicit instructions that prevent the
    judge model from scoring outside the 0–1 discrete range.  This was
    the root cause of deepseek-r1:8b returning 10.0, 45.0, 100.0."""

    def test_fix_rubric_prohibits_percentages(self):
        rubric_lower = FIX_QUALITY_RUBRIC.lower()
        assert "never" in rubric_lower and "percentage" in rubric_lower, (
            "FIX_QUALITY_RUBRIC must explicitly prohibit percentages"
        )

    def test_fix_rubric_prohibits_values_outside_range(self):
        rubric_lower = FIX_QUALITY_RUBRIC.lower()
        assert "do not" in rubric_lower or "never" in rubric_lower, (
            "FIX_QUALITY_RUBRIC must explicitly forbid out-of-range values"
        )

    def test_fix_rubric_forces_discrete_output(self):
        """The rubric must say 'only these values' or equivalent."""
        rubric_lower = FIX_QUALITY_RUBRIC.lower()
        assert "only" in rubric_lower and ("these values" in rubric_lower or "one of" in rubric_lower), (
            "FIX_QUALITY_RUBRIC must constrain output to discrete values"
        )

    def test_explanation_rubric_prohibits_percentages(self):
        rubric_lower = EXPLANATION_QUALITY_RUBRIC.lower()
        assert "never" in rubric_lower and "percentage" in rubric_lower, (
            "EXPLANATION_QUALITY_RUBRIC must explicitly prohibit percentages"
        )

    def test_explanation_rubric_prohibits_values_outside_range(self):
        rubric_lower = EXPLANATION_QUALITY_RUBRIC.lower()
        assert "do not" in rubric_lower or "never" in rubric_lower, (
            "EXPLANATION_QUALITY_RUBRIC must explicitly forbid out-of-range values"
        )

    def test_explanation_rubric_forces_discrete_output(self):
        rubric_lower = EXPLANATION_QUALITY_RUBRIC.lower()
        assert "only" in rubric_lower and ("these values" in rubric_lower or "one of" in rubric_lower), (
            "EXPLANATION_QUALITY_RUBRIC must constrain output to discrete values"
        )


# ──── Boundary: the rubric should not contain misleading instructions ────

class TestRubricDoesNotContainMisleadingInstructions:
    """The rubric must NOT contain words like 'continuous', '0 to 100',
    or 'percentage' that might encourage the judge to use the wrong scale."""

    def test_fix_rubric_no_continuous_keyword(self):
        assert "continuous" not in FIX_QUALITY_RUBRIC.lower(), (
            "FIX_QUALITY_RUBRIC must not mention 'continuous' scoring"
        )

    def test_fix_rubric_no_0_to_100_scale(self):
        assert "0 to 100" not in FIX_QUALITY_RUBRIC, (
            "FIX_QUALITY_RUBRIC must not suggest a 0-100 scale"
        )

    def test_explanation_rubric_no_continuous_keyword(self):
        assert "continuous" not in EXPLANATION_QUALITY_RUBRIC.lower(), (
            "EXPLANATION_QUALITY_RUBRIC must not mention 'continuous' scoring"
        )

    def test_explanation_rubric_no_0_to_100_scale(self):
        assert "0 to 100" not in EXPLANATION_QUALITY_RUBRIC, (
            "EXPLANATION_QUALITY_RUBRIC must not suggest a 0-100 scale"
        )
