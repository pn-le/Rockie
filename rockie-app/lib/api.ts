const CV_WORKER_URL = "https://rockie-production.up.railway.app";

export type AnalysisJob = {
  id: string;
  status: "queued" | "processing" | "complete" | "failed";
  result?: {
    efficiency_score: number;
    feedback_text: string;
    clips: { full?: string; crux?: string; best_sequence?: string };
    events: { hip_drops: number; barn_doors: number; foot_swaps: number; shake_events: number };
    processed_at: string;
  };
  error?: string;
};

export async function triggerAnalysis(params: {
  jobId: string;
  videoUrl: string;
  userId: string;
  sessionId?: string;
}) {
  const res = await fetch(`${CV_WORKER_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: params.jobId,
      video_url: params.videoUrl,
      user_id: params.userId,
      session_id: params.sessionId ?? null,
    }),
  });
  if (!res.ok) throw new Error(`CV worker error: ${res.status}`);
  return res.json();
}
