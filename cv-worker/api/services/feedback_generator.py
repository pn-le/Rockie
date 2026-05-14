import structlog

logger = structlog.get_logger()

# Template-based feedback — deterministic, zero latency, zero cost
# Each entry: (condition_fn, message_template)
_TEMPLATES: list[tuple] = [
    # Hip drops
    (
        lambda e: e["hip_drops"] >= 3,
        lambda e: f"Your hips dropped {e['hip_drops']} times — a sign you're not keeping your centre of gravity close to the wall. "
                  "Try to keep your hips sucked in and use your legs to push, not your arms to pull.",
    ),
    (
        lambda e: e["hip_drops"] == 1 or e["hip_drops"] == 2,
        lambda e: f"Your hips dropped {e['hip_drops']} time{'s' if e['hip_drops'] > 1 else ''} on this climb. "
                  "When your hips sag, you put more strain on your arms. Flag your foot earlier to keep your hips close.",
    ),
    # Barn doors
    (
        lambda e: e["barn_doors"] >= 2,
        lambda e: f"You barn-doored {e['barn_doors']} times — your body rotated away from the wall. "
                  "Engage your core and keep your hips square before reaching for the next hold.",
    ),
    (
        lambda e: e["barn_doors"] == 1,
        lambda _: "You barn-doored once. Drop your outside hip and use a flag to stay balanced next time you feel yourself swinging out.",
    ),
    # Foot swaps
    (
        lambda e: e["foot_swaps"] >= 4,
        lambda e: f"You repositioned your feet {e['foot_swaps']} times unnecessarily. "
                  "Try to place your feet precisely the first time — every extra move burns energy.",
    ),
    (
        lambda e: 1 <= e["foot_swaps"] <= 3,
        lambda e: f"A couple of foot repositions detected. "
                  "Before you step, look at where your foot is going and commit to the placement.",
    ),
    # Shake / pump
    (
        lambda e: e["shake_events"] >= 3,
        lambda _: "Your arms were shaking — you were getting pumped. "
                  "Find rest positions early and shake out before the crux. "
                  "Building forearm endurance will help here too.",
    ),
    (
        lambda e: e["shake_events"] in (1, 2),
        lambda _: "Some arm tension detected near the end. "
                  "Try to identify a rest position on this route and use it before the hard section.",
    ),
]

_SCORE_SUMMARY = [
    (90, "Clean send — excellent efficiency throughout."),
    (75, "Solid climb with a few rough patches."),
    (60, "Decent effort but room to clean up your movement."),
    (40, "You're working hard where you shouldn't be — focus on technique over power."),
    (0,  "This one was a battle. Break the route into sections and work each move statically."),
]


def generate_feedback(score: float, events: dict) -> str:
    """
    Generate 3–5 sentences of plain-English feedback from score + event counts.
    Template-based: deterministic, no LLM cost.
    """
    sentences: list[str] = []

    # Score summary (always first)
    for threshold, summary in _SCORE_SUMMARY:
        if score >= threshold:
            sentences.append(f"Efficiency score: {score:.0f}/100. {summary}")
            break

    # Event-driven feedback (in priority order)
    for condition, template in _TEMPLATES:
        if condition(events):
            sentences.append(template(events))
        if len(sentences) >= 4:
            break

    # Closing encouragement if all clean
    if len(sentences) == 1:
        sentences.append("No major technique issues detected. Keep climbing at this level and push to harder grades.")

    feedback = " ".join(sentences)
    logger.info("feedback.generated", score=score, sentences=len(sentences))
    return feedback
