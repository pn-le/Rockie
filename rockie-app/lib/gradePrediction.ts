export const GRADES = [
  "V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12",
];

export type GradedJob = {
  id: string;
  status: string;
  created_at: string;
  grade?: string;
  result?: {
    efficiency_score: number;
    events?: {
      hip_drops: number;
      barn_doors: number;
      foot_swaps: number;
      shake_events: number;
    };
  };
};

export type GradePrediction = {
  ready: boolean;
  currentGrade: string;
  nextGrade: string | null;
  reasons: string[];
  watchOut: string | null;
  effAtMax: number;
  sendsAtMax: number;
  totalGraded: number;
};

export function computePrediction(jobs: GradedJob[]): GradePrediction | null {
  const graded = jobs.filter(
    (j) => j.grade && j.result?.efficiency_score != null && j.status === "complete"
  );
  if (graded.length < 3) return null;

  // Find current max grade (highest grade with ≥1 send at efficiency ≥55%)
  let maxIdx = -1;
  for (const j of graded) {
    const idx = GRADES.indexOf(j.grade!);
    if (idx > maxIdx && (j.result?.efficiency_score ?? 0) >= 55) maxIdx = idx;
  }
  if (maxIdx < 0) return null;

  const currentGrade = GRADES[maxIdx];
  const nextGrade = GRADES[maxIdx + 1] ?? null;

  // Sends + avg efficiency at current max (last 5 sends, per PRD readiness threshold)
  const atMax = graded
    .filter((j) => j.grade === currentGrade)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const last5 = atMax.slice(0, 5);
  const effAtMax =
    last5.reduce((s, j) => s + (j.result?.efficiency_score ?? 0), 0) / last5.length;
  const sendsAtMax = atMax.length;

  // 30d improvement rate
  const thirtyAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = jobs.filter(
    (j) => j.status === "complete" && new Date(j.created_at).getTime() > thirtyAgo
  );
  const older = jobs
    .filter(
      (j) => j.status === "complete" && new Date(j.created_at).getTime() <= thirtyAgo
    )
    .slice(-5);
  const recentAvg = recent.length
    ? recent.reduce((s, j) => s + (j.result?.efficiency_score ?? 0), 0) / recent.length
    : 0;
  const olderAvg = older.length
    ? older.reduce((s, j) => s + (j.result?.efficiency_score ?? 0), 0) / older.length
    : recentAvg;
  const improvementRate = recentAvg - olderAvg;

  // Weak point severity (recent 10 climbs with ≥3 events in any category)
  const recent10 = [...jobs].filter((j) => j.status === "complete").slice(0, 10);
  const weakCount = recent10.filter((j) => {
    const e = j.result?.events;
    return e && (e.hip_drops >= 3 || e.barn_doors >= 3 || e.shake_events >= 3);
  }).length;

  // Readiness thresholds
  const ready =
    effAtMax >= 78 &&
    improvementRate >= 5 &&
    weakCount < 3 &&
    sendsAtMax >= 3 &&
    nextGrade !== null;

  // Build reasons
  const reasons: string[] = [];
  if (effAtMax >= 78)
    reasons.push(`Efficiency at ${currentGrade} averages ${Math.round(effAtMax)}%`);
  if (improvementRate >= 5)
    reasons.push(`+${Math.round(improvementRate)} pts improvement this month`);
  if (sendsAtMax >= 3)
    reasons.push(`${sendsAtMax} sends at ${currentGrade}, solid base`);
  if (reasons.length === 0) {
    if (effAtMax > 0)
      reasons.push(
        `Efficiency at ${currentGrade} averages ${Math.round(effAtMax)}%`
      );
    if (improvementRate > 0)
      reasons.push(`+${Math.round(improvementRate)} pts trend this month`);
  }

  // Watch out: most common event type
  const totals = { hip_drops: 0, barn_doors: 0, shake_events: 0 };
  for (const j of recent10) {
    const e = j.result?.events;
    if (e) {
      totals.hip_drops += e.hip_drops ?? 0;
      totals.barn_doors += e.barn_doors ?? 0;
      totals.shake_events += e.shake_events ?? 0;
    }
  }
  const maxEvent = Math.max(totals.hip_drops, totals.barn_doors, totals.shake_events);
  let watchOut: string | null = null;
  if (maxEvent > 0) {
    if (totals.hip_drops === maxEvent)
      watchOut = "Hip drops — stay square on harder moves";
    else if (totals.barn_doors === maxEvent)
      watchOut = "Barn doors — flag earlier before committing";
    else watchOut = "Arm fatigue — work lock-off strength";
  }

  return {
    ready,
    currentGrade,
    nextGrade,
    reasons,
    watchOut,
    effAtMax,
    sendsAtMax,
    totalGraded: graded.length,
  };
}
