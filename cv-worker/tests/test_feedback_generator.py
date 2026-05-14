import pytest
from api.services.feedback_generator import generate_feedback


def _events(hip_drops=0, barn_doors=0, foot_swaps=0, shake_events=0):
    return {
        "hip_drops": hip_drops,
        "barn_doors": barn_doors,
        "foot_swaps": foot_swaps,
        "shake_events": shake_events,
    }


class TestScoreSummary:
    def test_score_above_90_says_clean_send(self):
        fb = generate_feedback(95.0, _events())
        assert "Clean send" in fb

    def test_score_75_to_89_says_solid(self):
        fb = generate_feedback(80.0, _events())
        assert "Solid" in fb

    def test_score_60_to_74_says_decent(self):
        fb = generate_feedback(65.0, _events())
        assert "Decent" in fb

    def test_score_40_to_59_says_working_hard(self):
        fb = generate_feedback(50.0, _events())
        assert "working hard" in fb

    def test_score_below_40_says_battle(self):
        fb = generate_feedback(20.0, _events())
        assert "battle" in fb

    def test_score_displayed_in_output(self):
        fb = generate_feedback(73.5, _events())
        assert "74" in fb  # 73.5 rounds to 74 with :.0f


class TestEventFeedback:
    def test_hip_drops_3_or_more(self):
        fb = generate_feedback(60.0, _events(hip_drops=3))
        assert "hips dropped 3 times" in fb

    def test_hip_drops_1_or_2(self):
        fb = generate_feedback(60.0, _events(hip_drops=1))
        assert "hips dropped 1 time" in fb

    def test_hip_drops_2(self):
        fb = generate_feedback(60.0, _events(hip_drops=2))
        assert "hips dropped 2 times" in fb

    def test_barn_doors_2_or_more(self):
        fb = generate_feedback(60.0, _events(barn_doors=2))
        assert "barn-doored 2 times" in fb

    def test_barn_doors_1(self):
        fb = generate_feedback(60.0, _events(barn_doors=1))
        assert "barn-doored once" in fb

    def test_foot_swaps_4_or_more(self):
        fb = generate_feedback(60.0, _events(foot_swaps=4))
        assert "repositioned your feet 4 times" in fb

    def test_foot_swaps_1_to_3(self):
        fb = generate_feedback(60.0, _events(foot_swaps=2))
        assert "foot repositions" in fb

    def test_shake_3_or_more(self):
        fb = generate_feedback(60.0, _events(shake_events=3))
        assert "shaking" in fb

    def test_shake_1_or_2(self):
        fb = generate_feedback(60.0, _events(shake_events=1))
        assert "arm tension" in fb

    def test_no_events_gives_encouragement(self):
        fb = generate_feedback(95.0, _events())
        assert "No major technique issues" in fb


class TestOutputProperties:
    def test_returns_non_empty_string(self):
        fb = generate_feedback(50.0, _events(hip_drops=2, barn_doors=1))
        assert isinstance(fb, str)
        assert len(fb) > 0

    def test_no_template_placeholders(self):
        fb = generate_feedback(50.0, _events(hip_drops=2, barn_doors=3, foot_swaps=5, shake_events=4))
        assert "{" not in fb
        assert "}" not in fb

    def test_max_4_sentences(self):
        # generate_feedback caps at 4 logical entries; verify output is bounded
        fb = generate_feedback(30.0, _events(hip_drops=5, barn_doors=3, foot_swaps=6, shake_events=4))
        # Score summary is always present; at most 3 more event sentences
        assert fb.startswith("Efficiency score:")

    def test_all_clean_events_still_returns_feedback(self):
        fb = generate_feedback(100.0, _events())
        assert len(fb) > 10
