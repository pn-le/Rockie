import { useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { computePrediction, GradePrediction } from "../../lib/gradePrediction";

type Job = {
  id: string;
  status: string;
  created_at: string;
  grade?: string;
  result?: {
    efficiency_score: number;
    feedback_text: string;
    events?: { hip_drops: number; barn_doors: number; foot_swaps: number; shake_events: number };
  };
};

function GradePredictionCard({ prediction }: { prediction: GradePrediction }) {
  return (
    <View style={{
      backgroundColor: "#141414",
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: prediction.ready ? "#FF5C0044" : "#222222",
      borderLeftWidth: 3,
      borderLeftColor: prediction.ready ? "#FF5C00" : "#2979FF",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 6 }}>
        <Feather name="trending-up" size={13} color={prediction.ready ? "#FF5C00" : "#2979FF"} />
        <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase" }}>
          GRADE PREDICTION
        </Text>
      </View>

      <Text style={{ color: "#F5F0E8", fontSize: 20, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5, marginBottom: 12 }}>
        {prediction.ready
          ? `You're ready to project ${prediction.nextGrade}`
          : `Keep building at ${prediction.currentGrade}`}
      </Text>

      <View style={{ gap: 5, marginBottom: prediction.watchOut ? 12 : 0 }}>
        {prediction.reasons.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Text style={{ color: prediction.ready ? "#00C853" : "#888888", fontSize: 12, marginTop: 1 }}>•</Text>
            <Text style={{ color: "#888888", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }}>{r}</Text>
          </View>
        ))}
        {!prediction.ready && prediction.effAtMax < 78 && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Text style={{ color: "#888888", fontSize: 12, marginTop: 1 }}>•</Text>
            <Text style={{ color: "#888888", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }}>
              Reach 78% avg efficiency at {prediction.currentGrade} ({Math.round(prediction.effAtMax)}% now)
            </Text>
          </View>
        )}
      </View>

      {prediction.watchOut && (
        <View style={{ backgroundColor: "#0A0A0A", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#222222" }}>
          <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
            WATCH OUT FOR
          </Text>
          <Text style={{ color: "#F5F0E8", fontSize: 13, fontFamily: "Inter_400Regular" }}>
            {prediction.watchOut}
          </Text>
        </View>
      )}
    </View>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "#00C853" : score >= 50 ? "#FF5C00" : "#FF1744";
  return (
    <View style={{
      backgroundColor: color + "22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: color + "55",
    }}>
      <Text style={{ color, fontSize: 13, fontFamily: "Rajdhani_700Bold" }}>
        {Math.round(score)}
      </Text>
    </View>
  );
}

export default function Home() {
  const { user } = useUser();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchJobs() {
    const { data } = await supabase
      .from("analysis_jobs")
      .select("id, status, created_at, grade, result")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setJobs(data);
  }

  useEffect(() => { fetchJobs(); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }

  const completed = jobs.filter((j) => j.status === "complete");
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, j) => s + (j.result?.efficiency_score ?? 0), 0) / completed.length)
    : null;

  const prediction = useMemo(() => computePrediction(jobs), [jobs]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#F5F0E8", fontSize: 28, fontFamily: "Rajdhani_700Bold", letterSpacing: 1.5 }}>
          ROCKIE
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#00C853" }} />
          <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_500Medium" }}>READY</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C00" />}
      >
        {/* Stats row */}
        {avgScore !== null && (
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <View style={{
              flex: 1, backgroundColor: "#141414", borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: "#222222",
            }}>
              <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                AVG SCORE
              </Text>
              <Text style={{ color: "#FF5C00", fontSize: 32, fontFamily: "Rajdhani_700Bold", lineHeight: 36 }}>
                {avgScore}<Text style={{ color: "#888888", fontSize: 16 }}>/100</Text>
              </Text>
            </View>
            <View style={{
              flex: 1, backgroundColor: "#141414", borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: "#222222",
            }}>
              <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                SESSIONS
              </Text>
              <Text style={{ color: "#F5F0E8", fontSize: 32, fontFamily: "Rajdhani_700Bold", lineHeight: 36 }}>
                {completed.length}
              </Text>
            </View>
          </View>
        )}

        {/* Grade prediction */}
        {prediction && <GradePredictionCard prediction={prediction} />}

        {/* Hero CTA */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/upload")}
          style={{
            backgroundColor: "#FF5C00",
            borderRadius: 16,
            padding: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <View>
            <Text style={{ color: "#fff", fontSize: 18, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5 }}>
              ANALYZE A CLIMB
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
              Upload or record your session
            </Text>
          </View>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center", justifyContent: "center",
          }}>
            <Feather name="plus" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Recent climbs */}
        <Text style={{ color: "#888888", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          RECENT CLIMBS
        </Text>

        {jobs.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: "#141414", alignItems: "center", justifyContent: "center",
              marginBottom: 12, borderWidth: 1, borderColor: "#222222",
            }}>
              <Feather name="video" size={24} color="#888888" />
            </View>
            <Text style={{ color: "#888888", fontSize: 15, fontFamily: "Inter_500Medium" }}>No climbs yet</Text>
            <Text style={{ color: "#444444", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 }}>
              Upload a video to get started
            </Text>
          </View>
        )}

        {jobs.map((job) => (
          <TouchableOpacity
            key={job.id}
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: job.id } })}
            style={{
              backgroundColor: "#141414",
              borderRadius: 14,
              padding: 16,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#222222",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#F5F0E8", fontSize: 14, fontFamily: "Inter_500Medium" }}>
                {new Date(job.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </Text>
              {job.result?.feedback_text && (
                <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 }} numberOfLines={1}>
                  {job.result.feedback_text}
                </Text>
              )}
              {job.status !== "complete" && (
                <Text style={{ color: job.status === "processing" ? "#FF5C00" : "#888888", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 3, textTransform: "capitalize" }}>
                  {job.status}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {job.grade && (
                <View style={{ backgroundColor: "#1E1E1E", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#333333" }}>
                  <Text style={{ color: "#F5F0E8", fontSize: 11, fontFamily: "Rajdhani_700Bold" }}>{job.grade}</Text>
                </View>
              )}
              {job.result?.efficiency_score != null && (
                <ScoreBadge score={job.result.efficiency_score} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
