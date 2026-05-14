import { useUser } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import { supabase } from "../../lib/supabase";
import { triggerAnalysis } from "../../lib/api";

type UploadStep = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

export default function Upload() {
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function pickAndAnalyze() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: 300,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await runAnalysis(asset.uri);
  }

  async function recordAndAnalyze() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 300,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await runAnalysis(asset.uri);
  }

  async function runAnalysis(localUri: string) {
    if (!user) return;
    setStep("uploading");
    setProgress(0);
    setErrorMsg("");

    try {
      const id = `${user.id}-${Date.now()}`;
      setJobId(id);

      // Upload to Supabase Storage
      const objectPath = `${user.id}/${id}.mp4`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) throw new Error("Video file not found");

      const fileContent = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Uint8Array.from(atob(fileContent), (c) => c.charCodeAt(0));

      setProgress(30);
      const { error: uploadError } = await supabase.storage
        .from("climb-videos")
        .upload(objectPath, bytes, { contentType: "video/mp4", upsert: true });
      if (uploadError) throw uploadError;

      setProgress(60);

      // Get signed URL
      const { data: signedData, error: signError } = await supabase.storage
        .from("climb-videos")
        .createSignedUrl(objectPath, 3600);
      if (signError || !signedData) throw signError ?? new Error("Failed to get signed URL");

      setProgress(80);

      // Create job record
      await supabase.from("analysis_jobs").insert({
        id,
        user_id: user.id,
        video_url: signedData.signedUrl,
        status: "queued",
      });

      // Trigger CV worker
      await triggerAnalysis({
        jobId: id,
        videoUrl: signedData.signedUrl,
        userId: user.id,
      });

      setProgress(100);
      setStep("queued");

      // Poll for completion
      pollJob(id);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Something went wrong");
      setStep("error");
    }
  }

  async function pollJob(id: string) {
    setStep("processing");
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from("analysis_jobs")
        .select("status")
        .eq("id", id)
        .single();

      if (data?.status === "complete") {
        clearInterval(interval);
        setStep("done");
        router.push({ pathname: "/result/[id]", params: { id } });
      } else if (data?.status === "failed" || attempts > 60) {
        clearInterval(interval);
        setErrorMsg("Analysis failed. Please try again.");
        setStep("error");
      }
    }, 5000);
  }

  function reset() {
    setStep("idle");
    setProgress(0);
    setJobId(null);
    setErrorMsg("");
  }

  if (step !== "idle") {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        {(step === "uploading" || step === "queued" || step === "processing") && (
          <>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text className="text-white text-lg font-semibold mt-6">
              {step === "uploading" ? `Uploading… ${progress}%` : "Analyzing your climb…"}
            </Text>
            <Text className="text-zinc-500 text-sm mt-2 text-center">
              {step === "uploading"
                ? "Sending your video to Rockie."
                : "This takes about 30–60 seconds."}
            </Text>
          </>
        )}
        {step === "error" && (
          <>
            <Text className="text-red-400 text-xl font-bold mb-3">Something went wrong</Text>
            <Text className="text-zinc-400 text-sm text-center mb-8">{errorMsg}</Text>
            <TouchableOpacity className="bg-zinc-800 rounded-xl px-6 py-3" onPress={reset}>
              <Text className="text-white font-medium">Try again</Text>
            </TouchableOpacity>
          </>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center px-6">
        <Text className="text-white text-3xl font-bold mb-2">Analyze a climb</Text>
        <Text className="text-zinc-400 text-base mb-10">
          Record or pick a video. We'll score your technique and show you what to fix.
        </Text>

        <TouchableOpacity
          className="bg-green-500 rounded-2xl py-5 items-center mb-4"
          onPress={recordAndAnalyze}
        >
          <Text className="text-white font-bold text-base">📹  Record a climb</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-zinc-900 border border-zinc-700 rounded-2xl py-5 items-center"
          onPress={pickAndAnalyze}
        >
          <Text className="text-white font-medium text-base">🎞  Pick from library</Text>
        </TouchableOpacity>

        <Text className="text-zinc-600 text-xs text-center mt-8">
          Max 5 minutes · MP4 or MOV
        </Text>
      </View>
    </SafeAreaView>
  );
}
