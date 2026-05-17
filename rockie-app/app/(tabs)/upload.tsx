import { useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { triggerAnalysis } from "../../lib/api";

type Step = "idle" | "uploading" | "processing" | "done" | "error";

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={{ height: 3, backgroundColor: "#1E1E1E", borderRadius: 2, width: "100%", overflow: "hidden" }}>
      <View style={{
        height: "100%",
        width: `${progress}%`,
        backgroundColor: "#FF5C00",
        borderRadius: 2,
      }} />
    </View>
  );
}

export default function Upload() {
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [routeName, setRouteName] = useState("");
  const [grade, setGrade] = useState("");

  async function pickAndAnalyze() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow access to your photo library to pick a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: 300,
    });
    if (result.canceled) return;
    await runAnalysis(result.assets[0].uri);
  }

  async function recordAndAnalyze() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Allow camera access to record a climb.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        videoMaxDuration: 300,
        quality: 1,
      });
      if (result.canceled) return;
      await runAnalysis(result.assets[0].uri);
    } catch {
      Alert.alert("Camera unavailable", "Use 'Pick from library' to select a video instead.");
    }
  }

  async function runAnalysis(localUri: string) {
    if (!user) return;
    setStep("uploading");
    setProgress(10);
    setStatusText("Preparing upload…");
    setErrorMsg("");

    try {
      const id = `${user.id}-${Date.now()}`;

      const objectPath = `${user.id}/${id}.mp4`;

      setProgress(25);
      setStatusText("Uploading video…");
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("climb-videos")
        .upload(objectPath, arrayBuffer, { contentType: "video/mp4", upsert: true });
      if (uploadError) throw uploadError;

      setProgress(55);
      setStatusText("Getting signed URL…");
      const { data: signedData, error: signError } = await supabase.storage
        .from("climb-videos")
        .createSignedUrl(objectPath, 3600);
      if (signError || !signedData) throw signError ?? new Error("Failed to get signed URL");

      setProgress(70);
      setStatusText("Queuing analysis…");

      let routeId: string | null = null;
      let attemptNum = 1;
      const trimmedName = routeName.trim();
      if (trimmedName) {
        const { data: existingRoute } = await supabase
          .from("routes")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", trimmedName)
          .single();
        if (existingRoute) {
          routeId = existingRoute.id;
          const { count } = await supabase
            .from("analysis_jobs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("route_id", routeId);
          attemptNum = (count ?? 0) + 1;
        } else {
          const { data: newRoute } = await supabase
            .from("routes")
            .insert({ user_id: user.id, name: trimmedName })
            .select("id")
            .single();
          routeId = newRoute?.id ?? null;
        }
      }

      await supabase.from("analysis_jobs").insert({
        id,
        user_id: user.id,
        video_url: signedData.signedUrl,
        status: "queued",
        ...(routeId && { route_id: routeId, attempt_num: attemptNum }),
        ...(grade && { grade }),
      });

      await triggerAnalysis({ jobId: id, videoUrl: signedData.signedUrl, userId: user.id });

      setProgress(85);
      setStep("processing");
      setStatusText("Analyzing your climb…");
      pollJob(id);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Something went wrong");
      setStep("error");
    }
  }

  async function pollJob(id: string) {
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
    setStatusText("");
    setErrorMsg("");
    setRouteName("");
    setGrade("");
  }

  if (step !== "idle") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        {(step === "uploading" || step === "processing") && (
          <View style={{ alignItems: "center", width: "100%" }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: "#141414",
              alignItems: "center", justifyContent: "center",
              marginBottom: 24,
              borderWidth: 1, borderColor: "#FF5C00",
            }}>
              <Feather name={step === "uploading" ? "upload-cloud" : "cpu"} size={28} color="#FF5C00" />
            </View>
            <Text style={{ color: "#F5F0E8", fontSize: 22, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5, marginBottom: 8 }}>
              {step === "uploading" ? "UPLOADING" : "ANALYZING"}
            </Text>
            <Text style={{ color: "#888888", fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 32, textAlign: "center" }}>
              {statusText}
            </Text>
            <View style={{ width: "100%", marginBottom: 12 }}>
              <ProgressBar progress={step === "processing" ? 100 : progress} />
            </View>
            {step === "uploading" && (
              <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                {progress}% complete
              </Text>
            )}
            {step === "processing" && (
              <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                This takes about 30–60 seconds
              </Text>
            )}
          </View>
        )}

        {step === "error" && (
          <View style={{ alignItems: "center", width: "100%" }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: "#FF174422",
              alignItems: "center", justifyContent: "center",
              marginBottom: 24,
              borderWidth: 1, borderColor: "#FF1744",
            }}>
              <Feather name="alert-circle" size={28} color="#FF1744" />
            </View>
            <Text style={{ color: "#FF1744", fontSize: 22, fontFamily: "Rajdhani_700Bold", marginBottom: 8 }}>
              SOMETHING WENT WRONG
            </Text>
            <Text style={{ color: "#888888", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 32 }}>
              {errorMsg}
            </Text>
            <TouchableOpacity
              onPress={reset}
              style={{
                backgroundColor: "#141414", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14,
                borderWidth: 1, borderColor: "#222222",
              }}
            >
              <Text style={{ color: "#F5F0E8", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
        <Text style={{ color: "#F5F0E8", fontSize: 32, fontFamily: "Rajdhani_700Bold", letterSpacing: 1, marginBottom: 6 }}>
          ANALYZE A CLIMB
        </Text>
        <Text style={{ color: "#888888", fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 32, lineHeight: 22 }}>
          Record or pick a video. We'll score your technique and show you what to fix.
        </Text>

        {/* Optional route name */}
        <TextInput
          value={routeName}
          onChangeText={setRouteName}
          placeholder="Route name (optional)"
          placeholderTextColor="#444444"
          style={{
            backgroundColor: "#141414",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: routeName.trim() ? "#FF5C0066" : "#222222",
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: "#F5F0E8",
            fontSize: 15,
            fontFamily: "Inter_400Regular",
            marginBottom: 24,
          }}
        />

        {/* Grade picker */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            GRADE (OPTIONAL)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {["V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"].map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGrade(grade === g ? "" : g)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: grade === g ? "#FF5C00" : "#141414",
                    borderWidth: 1,
                    borderColor: grade === g ? "#FF5C00" : "#222222",
                  }}
                >
                  <Text style={{
                    color: grade === g ? "#fff" : "#888888",
                    fontSize: 13,
                    fontFamily: "Rajdhani_700Bold",
                    letterSpacing: 0.5,
                  }}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Record button */}
        <TouchableOpacity
          onPress={recordAndAnalyze}
          style={{
            backgroundColor: "#FF5C00",
            borderRadius: 16,
            paddingVertical: 20,
            paddingHorizontal: 24,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center", justifyContent: "center",
            marginRight: 14,
          }}>
            <Feather name="video" size={20} color="#fff" />
          </View>
          <View>
            <Text style={{ color: "#fff", fontSize: 17, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5 }}>
              RECORD A CLIMB
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular" }}>
              Use your camera
            </Text>
          </View>
        </TouchableOpacity>

        {/* Library button */}
        <TouchableOpacity
          onPress={pickAndAnalyze}
          style={{
            backgroundColor: "#141414",
            borderRadius: 16,
            paddingVertical: 20,
            paddingHorizontal: 24,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#222222",
          }}
        >
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: "#1E1E1E",
            alignItems: "center", justifyContent: "center",
            marginRight: 14,
            borderWidth: 1, borderColor: "#222222",
          }}>
            <Feather name="film" size={20} color="#888888" />
          </View>
          <View>
            <Text style={{ color: "#F5F0E8", fontSize: 17, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5 }}>
              PICK FROM LIBRARY
            </Text>
            <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}>
              Choose an existing video
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={{ color: "#444444", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24 }}>
          Max 5 minutes · MP4 or MOV
        </Text>
      </View>
    </SafeAreaView>
  );
}
