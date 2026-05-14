import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "../../lib/supabase";

const { width } = Dimensions.get("window");

type Result = {
  efficiency_score: number;
  feedback_text: string;
  clips: { full?: string; crux?: string; best_sequence?: string };
  events: { hip_drops: number; barn_doors: number; foot_swaps: number; shake_events: number };
  processed_at: string;
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <View className="items-center py-8">
      <View
        style={{
          width: 140,
          height: 140,
          borderRadius: 70,
          borderWidth: 8,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 40, fontWeight: "bold" }}>
          {Math.round(score)}
        </Text>
        <Text style={{ color: "#71717a", fontSize: 14 }}>/100</Text>
      </View>
      <Text className="text-zinc-400 text-sm mt-3">Efficiency Score</Text>
    </View>
  );
}

function EventPill({ label, count, bad }: { label: string; count: number; bad: boolean }) {
  const active = count > 0 && bad;
  return (
    <View className={`rounded-xl px-3 py-2 mr-2 mb-2 ${active ? "bg-red-950 border border-red-800" : "bg-zinc-900"}`}>
      <Text className={`text-xs font-medium ${active ? "text-red-400" : "text-zinc-500"}`}>
        {label}
      </Text>
      <Text className={`text-lg font-bold ${active ? "text-red-300" : "text-zinc-400"}`}>
        {count}
      </Text>
    </View>
  );
}

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeClip, setActiveClip] = useState<"full" | "crux" | "best_sequence">("full");

  useEffect(() => {
    supabase
      .from("analysis_jobs")
      .select("result")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data?.result) setResult(data.result as Result);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#22c55e" />
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        <Text className="text-zinc-400 text-base text-center">No result found.</Text>
        <TouchableOpacity className="mt-6" onPress={() => router.back()}>
          <Text className="text-green-400">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const clipUrl = result.clips[activeClip];
  const availableClips = Object.entries(result.clips).filter(([, url]) => !!url) as [string, string][];

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center px-5 pt-2 pb-2">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-green-400 text-base">← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
        <ScoreRing score={result.efficiency_score} />

        {/* Clip player */}
        {clipUrl && (
          <View className="mx-5 mb-4">
            <Video
              source={{ uri: clipUrl }}
              style={{ width: width - 40, height: (width - 40) * 0.56, borderRadius: 16 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
            />
            {availableClips.length > 1 && (
              <View className="flex-row mt-3">
                {availableClips.map(([key]) => (
                  <TouchableOpacity
                    key={key}
                    className={`mr-2 px-4 py-2 rounded-xl ${activeClip === key ? "bg-green-500" : "bg-zinc-900"}`}
                    onPress={() => setActiveClip(key as any)}
                  >
                    <Text className={`text-sm font-medium ${activeClip === key ? "text-white" : "text-zinc-400"}`}>
                      {key === "best_sequence" ? "Best" : key.charAt(0).toUpperCase() + key.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Feedback */}
        <View className="mx-5 mb-4 bg-zinc-900 rounded-2xl p-4">
          <Text className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Feedback</Text>
          <Text className="text-white text-base leading-6">{result.feedback_text}</Text>
        </View>

        {/* Events */}
        <View className="mx-5 mb-8">
          <Text className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Events detected</Text>
          <View className="flex-row flex-wrap">
            <EventPill label="Hip drops" count={result.events.hip_drops} bad />
            <EventPill label="Barn doors" count={result.events.barn_doors} bad />
            <EventPill label="Foot swaps" count={result.events.foot_swaps} bad />
            <EventPill label="Arm shake" count={result.events.shake_events} bad />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
