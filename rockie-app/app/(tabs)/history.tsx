import { useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Job = {
  id: string;
  status: string;
  created_at: string;
  result?: { efficiency_score: number; events: Record<string, number> };
};

function MiniBar({ score }: { score: number }) {
  const color = score >= 75 ? "#00C853" : score >= 50 ? "#FF5C00" : "#FF1744";
  return (
    <View style={{ height: 4, backgroundColor: "#222222", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
      <View style={{ width: `${score}%`, backgroundColor: color, height: "100%", borderRadius: 2 }} />
    </View>
  );
}

export default function Progress() {
  const { user } = useUser();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchJobs() {
    const { data } = await supabase
      .from("analysis_jobs")
      .select("id, status, created_at, result")
      .eq("user_id", user?.id)
      .eq("status", "complete")
      .order("created_at", { ascending: false });
    if (data) setJobs(data);
  }

  useEffect(() => { fetchJobs(); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }

  const avgScore = jobs.length
    ? Math.round(jobs.reduce((s, j) => s + (j.result?.efficiency_score ?? 0), 0) / jobs.length)
    : null;

  const best = jobs.length
    ? Math.max(...jobs.map((j) => j.result?.efficiency_score ?? 0))
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C00" />}
      >
        <Text style={{
          color: "#F5F0E8", fontSize: 28, fontFamily: "Rajdhani_700Bold",
          letterSpacing: 1.5, paddingTop: 8, paddingBottom: 20,
        }}>
          PROGRESS
        </Text>

        {/* Stats cards */}
        {avgScore !== null && (
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <View style={{
              flex: 1, backgroundColor: "#141414", borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: "#222222",
            }}>
              <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
                AVG SCORE
              </Text>
              <Text style={{ color: "#FF5C00", fontSize: 36, fontFamily: "Rajdhani_700Bold", lineHeight: 40 }}>
                {avgScore}
                <Text style={{ color: "#888888", fontSize: 16 }}>/100</Text>
              </Text>
            </View>
            <View style={{ gap: 12, flex: 1 }}>
              <View style={{
                flex: 1, backgroundColor: "#141414", borderRadius: 16, padding: 12,
                borderWidth: 1, borderColor: "#222222",
              }}>
                <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  SESSIONS
                </Text>
                <Text style={{ color: "#F5F0E8", fontSize: 28, fontFamily: "Rajdhani_700Bold" }}>
                  {jobs.length}
                </Text>
              </View>
              <View style={{
                flex: 1, backgroundColor: "#141414", borderRadius: 16, padding: 12,
                borderWidth: 1, borderColor: "#222222",
              }}>
                <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  BEST
                </Text>
                <Text style={{ color: "#00C853", fontSize: 28, fontFamily: "Rajdhani_700Bold" }}>
                  {Math.round(best ?? 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Score trend (simple bar chart) */}
        {jobs.length > 1 && (
          <View style={{
            backgroundColor: "#141414", borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: "#222222", marginBottom: 20,
          }}>
            <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
              SCORE TREND
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 60 }}>
              {[...jobs].reverse().slice(-12).map((job, i) => {
                const score = job.result?.efficiency_score ?? 0;
                const color = score >= 75 ? "#00C853" : score >= 50 ? "#FF5C00" : "#FF1744";
                return (
                  <View key={job.id} style={{ flex: 1, justifyContent: "flex-end" }}>
                    <View style={{
                      height: Math.max(4, (score / 100) * 56),
                      backgroundColor: color,
                      borderRadius: 3,
                      opacity: i === jobs.length - 1 ? 1 : 0.6,
                    }} />
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Climb list */}
        <Text style={{ color: "#888888", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          ALL SESSIONS
        </Text>

        {jobs.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <Feather name="bar-chart-2" size={32} color="#333333" style={{ marginBottom: 12 }} />
            <Text style={{ color: "#888888", fontSize: 15, fontFamily: "Inter_500Medium" }}>
              No completed climbs yet
            </Text>
          </View>
        )}

        {jobs.map((job) => {
          const score = job.result?.efficiency_score ?? 0;
          const color = score >= 75 ? "#00C853" : score >= 50 ? "#FF5C00" : "#FF1744";
          return (
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
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: "#888888", fontSize: 13, fontFamily: "Inter_400Regular" }}>
                  {new Date(job.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </Text>
                <Text style={{ color, fontSize: 24, fontFamily: "Rajdhani_700Bold" }}>
                  {Math.round(score)}
                  <Text style={{ color: "#888888", fontSize: 13 }}>/100</Text>
                </Text>
              </View>
              <MiniBar score={score} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
