import { computePrediction, GRADES, GradedJob } from "../lib/gradePrediction";

// Helpers
const RECENT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();  // 5 days ago
const OLDER  = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago

function job(
  grade: string | undefined,
  score: number,
  created_at = RECENT,
  events = { hip_drops: 0, barn_doors: 0, foot_swaps: 0, shake_events: 0 }
): GradedJob {
  return {
    id: Math.random().toString(),
    status: "complete",
    created_at,
    grade,
    result: { efficiency_score: score, events },
  };
}

// ─── Null / insufficient data ───────────────────────────────────────────────

test("returns null with no jobs", () => {
  expect(computePrediction([])).toBeNull();
});

test("returns null with fewer than 3 graded jobs", () => {
  expect(computePrediction([job("V4", 80), job("V4", 82)])).toBeNull();
});

test("returns null when all graded jobs have efficiency < 55%", () => {
  const jobs = [job("V4", 40), job("V4", 45), job("V4", 50)];
  expect(computePrediction(jobs)).toBeNull();
});

test("returns null when grades are unrecognised strings", () => {
  const jobs = [job("6b", 80), job("6b", 82), job("6b", 84)];
  expect(computePrediction(jobs)).toBeNull();
});

// ─── currentGrade detection ──────────────────────────────────────────────────

test("identifies highest grade with efficiency ≥ 55% as current max", () => {
  const jobs = [
    job("V3", 85), job("V3", 80), job("V3", 78),
    job("V4", 60),  // one send at V4 just over threshold
  ];
  const result = computePrediction(jobs);
  expect(result?.currentGrade).toBe("V4");
});

test("ignores grades with efficiency below 55%", () => {
  const jobs = [
    job("V3", 85), job("V3", 82), job("V3", 80),
    job("V5", 40),  // too inefficient — shouldn't count
  ];
  const result = computePrediction(jobs);
  expect(result?.currentGrade).toBe("V3");
});

test("nextGrade is null when at V12", () => {
  const jobs = [job("V12", 80), job("V12", 82), job("V12", 85)];
  const result = computePrediction(jobs);
  expect(result?.nextGrade).toBeNull();
});

test("nextGrade is one step up from currentGrade", () => {
  const jobs = [job("V5", 82), job("V5", 80), job("V5", 79)];
  const result = computePrediction(jobs);
  expect(result?.nextGrade).toBe("V6");
});

// ─── Readiness: all thresholds met ──────────────────────────────────────────

test("ready=true when all four thresholds are met", () => {
  // effAtMax >= 78, improvementRate >= 5, weakCount < 3, sendsAtMax >= 3
  const olderJobs = Array.from({ length: 5 }, () => job("V5", 70, OLDER));
  const recentJobs = Array.from({ length: 4 }, () => job("V5", 82, RECENT));
  const result = computePrediction([...olderJobs, ...recentJobs]);
  expect(result?.ready).toBe(true);
  expect(result?.currentGrade).toBe("V5");
  expect(result?.nextGrade).toBe("V6");
});

// ─── Readiness: individual threshold failures ────────────────────────────────

test("ready=false when effAtMax < 78", () => {
  const olderJobs = Array.from({ length: 5 }, () => job("V5", 60, OLDER));
  const recentJobs = Array.from({ length: 4 }, () => job("V5", 72, RECENT)); // avg 72 < 78
  const result = computePrediction([...olderJobs, ...recentJobs]);
  expect(result?.ready).toBe(false);
});

test("ready=false when improvement rate < 5pts", () => {
  // older avg ≈ 80, recent avg ≈ 82 — only +2pts
  const olderJobs = Array.from({ length: 5 }, () => job("V5", 80, OLDER));
  const recentJobs = Array.from({ length: 4 }, () => job("V5", 82, RECENT));
  const result = computePrediction([...olderJobs, ...recentJobs]);
  expect(result?.ready).toBe(false);
});

test("ready=false when fewer than 3 sends at current max", () => {
  const olderJobs = Array.from({ length: 5 }, () => job("V5", 70, OLDER));
  const recentJobs = [job("V5", 82, RECENT), job("V5", 80, RECENT)]; // only 2 sends
  const result = computePrediction([...olderJobs, ...recentJobs]);
  expect(result?.ready).toBe(false);
});

test("ready=false when weak point severity ≥ 3", () => {
  const olderJobs = Array.from({ length: 5 }, () => job("V5", 70, OLDER));
  const recentJobs = [
    job("V5", 82, RECENT, { hip_drops: 4, barn_doors: 0, foot_swaps: 0, shake_events: 0 }),
    job("V5", 80, RECENT, { hip_drops: 5, barn_doors: 0, foot_swaps: 0, shake_events: 0 }),
    job("V5", 79, RECENT, { hip_drops: 3, barn_doors: 0, foot_swaps: 0, shake_events: 0 }),
    // 3 climbs with ≥3 hip drops → weakCount = 3 → NOT < 3
  ];
  const result = computePrediction([...olderJobs, ...recentJobs]);
  expect(result?.ready).toBe(false);
});

// ─── effAtMax + sendsAtMax ────────────────────────────────────────────────────

test("effAtMax is average efficiency across all sends at current max grade", () => {
  const jobs = [job("V4", 80), job("V4", 90), job("V4", 70)]; // avg = 80
  const result = computePrediction(jobs);
  expect(result?.effAtMax).toBeCloseTo(80, 1);
});

test("sendsAtMax counts only jobs at current max grade", () => {
  const jobs = [
    job("V3", 85), job("V3", 82), job("V3", 80), // 3 at V3
    job("V4", 62), // 1 at V4 — this becomes currentGrade
  ];
  const result = computePrediction(jobs);
  expect(result?.currentGrade).toBe("V4");
  expect(result?.sendsAtMax).toBe(1);
});

// ─── Reasons ─────────────────────────────────────────────────────────────────

test("reasons include efficiency line when effAtMax >= 78", () => {
  const jobs = Array.from({ length: 3 }, () => job("V4", 80));
  const result = computePrediction(jobs);
  const hasEff = result?.reasons.some((r) => r.includes("Efficiency at V4"));
  expect(hasEff).toBe(true);
});

test("reasons include sends count when sendsAtMax >= 3", () => {
  const jobs = [job("V4", 80), job("V4", 82), job("V4", 84)];
  const result = computePrediction(jobs);
  const hasSends = result?.reasons.some((r) => r.includes("sends at V4"));
  expect(hasSends).toBe(true);
});

test("totalGraded reflects all graded complete jobs", () => {
  const jobs = [
    job("V3", 80), job("V4", 70), job("V5", 60),
    { id: "x", status: "failed", created_at: RECENT, grade: "V5", result: { efficiency_score: 80 } },
  ];
  const result = computePrediction(jobs);
  expect(result?.totalGraded).toBe(3); // failed job excluded
});

// ─── watchOut ────────────────────────────────────────────────────────────────

test("watchOut is null when no events in recent jobs", () => {
  const jobs = Array.from({ length: 3 }, () => job("V4", 80));
  const result = computePrediction(jobs);
  expect(result?.watchOut).toBeNull();
});

test("watchOut identifies hip drops as primary weakness", () => {
  const jobs = [
    job("V4", 80, RECENT, { hip_drops: 5, barn_doors: 1, foot_swaps: 0, shake_events: 0 }),
    job("V4", 80, RECENT, { hip_drops: 4, barn_doors: 0, foot_swaps: 0, shake_events: 0 }),
    job("V4", 80, RECENT, { hip_drops: 3, barn_doors: 0, foot_swaps: 0, shake_events: 0 }),
  ];
  const result = computePrediction(jobs);
  expect(result?.watchOut).toContain("Hip drops");
});

test("watchOut identifies barn doors as primary weakness", () => {
  const jobs = [
    job("V4", 80, RECENT, { hip_drops: 1, barn_doors: 6, foot_swaps: 0, shake_events: 0 }),
    job("V4", 80, RECENT, { hip_drops: 0, barn_doors: 4, foot_swaps: 0, shake_events: 0 }),
    job("V4", 80, RECENT, { hip_drops: 0, barn_doors: 3, foot_swaps: 0, shake_events: 0 }),
  ];
  const result = computePrediction(jobs);
  expect(result?.watchOut).toContain("Barn doors");
});

test("watchOut identifies arm fatigue as primary weakness", () => {
  const jobs = [
    job("V4", 80, RECENT, { hip_drops: 0, barn_doors: 0, foot_swaps: 0, shake_events: 7 }),
    job("V4", 80, RECENT, { hip_drops: 0, barn_doors: 0, foot_swaps: 0, shake_events: 5 }),
    job("V4", 80, RECENT, { hip_drops: 0, barn_doors: 0, foot_swaps: 0, shake_events: 3 }),
  ];
  const result = computePrediction(jobs);
  expect(result?.watchOut).toContain("Arm fatigue");
});

// ─── GRADES constant ─────────────────────────────────────────────────────────

test("GRADES array starts at V0 and ends at V12", () => {
  expect(GRADES[0]).toBe("V0");
  expect(GRADES[GRADES.length - 1]).toBe("V12");
  expect(GRADES.length).toBe(13);
});
