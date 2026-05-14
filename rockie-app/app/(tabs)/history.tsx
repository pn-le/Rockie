import { useUser } from "@clerk/clerk-expo";
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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <View className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
      <View style={{ width: `${score}%`, backgroundColor: color, height: "100%", borderRadius: 99 }} />
    </View>
  );
}

export default function History() {
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

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="px-5 pt-2 pb-4">
        <Text className="text-white text-2xl font-bold">History</Text>
      </View>

      {avgScore != null && (
        <View className="mx-5 mb-4 bg-zinc-900 rounded-2xl p-4 flex-row items-center justify-between">
          <View>
            <Text className="text-zinc-400 text-xs uppercase tracking-widest">Avg score</Text>
            <Text className="text-white text-3xl font-bold mt-1">{avgScore}<Text className="text-zinc-500 text-lg font-normal">/100</Text></Text>
          </View>
          <View className="items-end">
            <Text className="text-zinc-400 text-xs uppercase tracking-widest">Climbs</Text>
            <Text className="text-white text-3xl font-bold mt-1">{jobs.length}</Text>
          </View>
        </View>
      )}

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
      >
        {jobs.length === 0 && (
          <View className="items-center py-16">
            <Text className="text-zinc-600 text-base">No completed climbs yet.</Text>
          </View>
        )}

        {jobs.map((job) => (
          <TouchableOpacity
            key={job.id}
            className="bg-zinc-900 rounded-2xl p-4 mb-3"
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: job.id } })}
          >
            <View className="flex-row justify-between items-center">
              <Text className="text-zinc-400 text-sm">
                {new Date(job.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </Text>
              <Text className="text-white font-bold text-xl">
                {Math.round(job.result?.efficiency_score ?? 0)}
                <Text className="text-zinc-500 text-sm font-normal">/100</Text>
              </Text>
            </View>
            <ScoreBar score={job.result?.efficiency_score ?? 0} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
