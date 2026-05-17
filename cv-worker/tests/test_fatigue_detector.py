from unittest.mock import MagicMock
from api.services.fatigue_detector import detect_fatigue


def _make_db(scores: list[float]) -> MagicMock:
    """Build a mock Supabase client that returns the given scores."""
    db = MagicMock()
    jobs = [{"result": {"efficiency_score": s}} for s in scores]
    (
        db.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .gte.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = MagicMock(data=jobs)
    return db


def test_no_fatigue_too_few_climbs():
    db = _make_db([80, 78])
    assert detect_fatigue(db, "user1", 76) is None


def test_no_fatigue_stable_scores():
    # 4 climbs, all around 80 — no significant drop
    db = _make_db([80, 82, 81])
    result = detect_fatigue(db, "user1", 79)
    assert result is None


def test_fatigue_detected():
    # Peak was 85, last 3 climbs average 68 → drop > 15%
    db = _make_db([85, 84, 70, 68])
    result = detect_fatigue(db, "user1", 66)
    assert result is not None
    assert result["detected"] is True
    assert result["session_peak"] == 85.0
    assert result["drop_pct"] > 15
    assert result["climb_count"] == 5


def test_fatigue_exactly_at_threshold():
    # Peak 80, rolling avg = 80 * 0.85 = 68 → exactly at threshold, NOT detected
    db = _make_db([80, 79, 68, 68])
    result = detect_fatigue(db, "user1", 68)
    # rolling avg of last 3: (68+68+68)/3 = 68.0, threshold = 80*0.85 = 68.0
    # 68.0 < 68.0 is False — should NOT trigger
    assert result is None


def test_fatigue_just_below_threshold():
    # rolling avg 67.9 < threshold 68.0
    db = _make_db([80, 79, 68, 67])
    result = detect_fatigue(db, "user1", 69)
    # last 3: (68, 67, 69) avg = 68.0 — still not below
    assert result is None


def test_fatigue_drop_pct_correct():
    db = _make_db([90, 88, 65, 60])
    result = detect_fatigue(db, "user1", 58)
    assert result is not None
    # rolling avg of last 3: (65+60+58)/3 = 61.0, peak = 90
    # drop_pct = round((90-61)/90 * 100) = round(32.2) = 32
    assert result["drop_pct"] == 32


def test_empty_history_no_fatigue():
    db = _make_db([])
    assert detect_fatigue(db, "user1", 75) is None


def test_jobs_without_result_ignored():
    db = MagicMock()
    jobs = [
        {"result": None},
        {"result": {"efficiency_score": 85}},
        {"result": {"efficiency_score": 84}},
        {"result": {"efficiency_score": 83}},
    ]
    (
        db.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .gte.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = MagicMock(data=jobs)
    # Only 3 real scores + current = 4 total, no big drop
    result = detect_fatigue(db, "user1", 82)
    assert result is None
