import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Job = {
  id: string;
  status: string;
  created_at: string;
  result?: {
    efficiency_score: number;
    feedback_text: string;
    processed_at: string;
  };
};

export default function Home() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchJobs() {
    const { data } = await supabase
      .from("analysis_jobs")
      .select("id, status, created_at, result")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setJobs(data);
  }

  useEffect(() => { fetchJobs(); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }

  function statusColor(status: string) {
    if (status === "complete") return "text-green-400";
    if (status === "failed") return "text-red-400";
    if (status === "processing") return "text-yellow-400";
    return "text-zinc-400";
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
        <View>
          <Text className="text-white text-2xl font-bold">Rockie</Text>
          <Text className="text-zinc-500 text-sm">
            {user?.emailAddresses[0]?.emailAddress}
          </Text>
        </View>
        <TouchableOpacity onPress={() => signOut()}>
          <Text className="text-zinc-500 text-sm">Sign out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        className="mx-5 mb-6 bg-green-500 rounded-2xl py-5 items-center"
        onPress={() => router.push("/(tabs)/upload")}
      >
        <Text className="text-white font-bold text-lg">+ Analyze a climb</Text>
      </TouchableOpacity>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
      >
        <Text className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Recent climbs</Text>

        {jobs.length === 0 && (
          <View className="items-center py-16">
            <Text className="text-zinc-600 text-base">No climbs yet.</Text>
            <Text className="text-zinc-700 text-sm mt-1">Upload a video to get started.</Text>
          </View>
        )}

        {jobs.map((job) => (
          <TouchableOpacity
            key={job.id}
            className="bg-zinc-900 rounded-2xl p-4 mb-3"
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: job.id } })}
          >
            <View className="flex-row justify-between items-center mb-1">
              <Text className={`text-sm font-medium capitalize ${statusColor(job.status)}`}>
                {job.status}
              </Text>
              {job.result?.efficiency_score != null && (
                <Text className="text-white font-bold text-lg">
                  {Math.round(job.result.efficiency_score)}<Text className="text-zinc-500 text-sm font-normal">/100</Text>
                </Text>
              )}
            </View>
            <Text className="text-zinc-500 text-xs">
              {new Date(job.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
            {job.result?.feedback_text && (
              <Text className="text-zinc-400 text-sm mt-2" numberOfLines={2}>
                {job.result.feedback_text}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
