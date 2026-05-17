import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  GestureResponderEvent,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { supabase } from "../../lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIDEO_W = Math.floor(SCREEN_WIDTH / 2);
const VIDEO_H = Math.floor(VIDEO_W * 0.5625);

type ClipResult = {
  efficiency_score: number;
  clips: { full?: string; crux?: string; best_sequence?: string };
  events: { hip_drops: number; barn_doors: number; foot_swaps: number; shake_events: number };
  processed_at: string;
};

type RouteAttempt = {
  id: string;
  attempt_num: number;
  efficiency_score: number;
  processed_at: string;
};

function DeltaStat({
  label,
  current,
  past,
  lowerIsBetter = false,
}: {
  label: string;
  current: number;
  past: number;
  lowerIsBetter?: boolean;
}) {
  const delta = Math.round(current - past);
  const improved = delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const color = improved === null ? "#888888" : improved ? "#00C853" : "#FF5C00";
  const arrow: "arrow-up" | "arrow-down" | null =
    improved === null ? null : improved ? "arrow-up" : "arrow-down";
  const text = delta === 0 ? "—" : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          color: "#888888",
          fontSize: 9,
          fontFamily: "Inter_500Medium",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 4,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        {arrow && <Feather name={arrow} size={10} color={color} />}
        <Text style={{ color, fontSize: 16, fontFamily: "Rajdhani_700Bold" }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentResult, setCurrentResult] = useState<ClipResult | null>(null);
  const [routeAttempts, setRouteAttempts] = useState<RouteAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<RouteAttempt | null>(null);
  const [pastResult, setPastResult] = useState<ClipResult | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);

  const leftRef = useRef<Video>(null);
  const rightRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);

  useEffect(() => {
    supabase
      .from("analysis_jobs")
      .select("result, route_id")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data?.result) setCurrentResult(data.result as ClipResult);
        if (data?.route_id) {
          supabase
            .from("analysis_jobs")
            .select("id, attempt_num, result")
            .eq("route_id", data.route_id)
            .eq("status", "complete")
            .neq("id", id)
            .order("attempt_num", { ascending: true })
            .then(({ data: attempts }) => {
              if (attempts) {
                setRouteAttempts(
                  attempts.map((j) => ({
                    id: j.id,
                    attempt_num: j.attempt_num ?? 1,
                    efficiency_score: j.result?.efficiency_score ?? 0,
                    processed_at: j.result?.processed_at ?? "",
                  }))
                );
              }
            });
        }
        setLoading(false);
      });
  }, [id]);

  async function selectAttempt(attempt: RouteAttempt) {
    setLoadingPast(true);
    setSelectedAttempt(attempt);
    setPositionMs(0);
    setIsPlaying(false);
    const { data } = await supabase
      .from("analysis_jobs")
      .select("result")
      .eq("id", attempt.id)
      .single();
    if (data?.result) setPastResult(data.result as ClipResult);
    setLoadingPast(false);
  }

  function resetSelection() {
    setSelectedAttempt(null);
    setPastResult(null);
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
  }

  async function handleSeek(x: number) {
    const ms = Math.max(0, Math.min(durationMs, (x / trackWidth) * durationMs));
    setPositionMs(ms);
    await Promise.all([
      leftRef.current?.setPositionAsync(ms),
      rightRef.current?.setPositionAsync(ms),
    ]);
  }

  async function togglePlay() {
    if (isPlaying) {
      await Promise.all([leftRef.current?.pauseAsync(), rightRef.current?.pauseAsync()]);
      setIsPlaying(false);
    } else {
      await Promise.all([leftRef.current?.playAsync(), rightRef.current?.playAsync()]);
      setIsPlaying(true);
    }
  }

  function handleRightStatus(status: AVPlaybackStatus) {
    if (status.isLoaded) {
      setPositionMs(status.positionMillis);
      if (status.durationMillis && status.durationMillis > 0) {
        setDurationMs(status.durationMillis);
      }
      if (status.didJustFinish) setIsPlaying(false);
    }
  }

  const scrubHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => handleSeek(e.nativeEvent.locationX),
    onResponderMove: (e: GestureResponderEvent) => handleSeek(e.nativeEvent.locationX),
  };

  const scrubPct = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const thumbLeft = scrubPct * trackWidth - 8;

  const bestClip = (r: ClipResult | null) =>
    r?.clips?.full ?? r?.clips?.crux ?? r?.clips?.best_sequence ?? null;

  const formatDate = (iso: string) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator size="large" color="#FF5C00" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Feather name="chevron-left" size={20} color="#FF5C00" />
          <Text style={{ color: "#FF5C00", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
            Back
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            color: "#F5F0E8",
            fontSize: 15,
            fontFamily: "Rajdhani_700Bold",
            letterSpacing: 1,
            marginLeft: 16,
          }}
        >
          BEFORE / AFTER
        </Text>
        {selectedAttempt && (
          <TouchableOpacity onPress={resetSelection} style={{ marginLeft: "auto" }}>
            <Text
              style={{ color: "#888888", fontSize: 13, fontFamily: "Inter_500Medium" }}
            >
              Change
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Attempt picker */}
        {!selectedAttempt && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text
              style={{
                color: "#888888",
                fontSize: 11,
                fontFamily: "Inter_500Medium",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              SELECT A PREVIOUS ATTEMPT
            </Text>
            {routeAttempts.length === 0 && (
              <Text
                style={{
                  color: "#888888",
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 22,
                }}
              >
                No other attempts found for this route. Upload another climb with the same
                route name to compare.
              </Text>
            )}
            {routeAttempts.map((attempt) => (
              <TouchableOpacity
                key={attempt.id}
                onPress={() => selectAttempt(attempt)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#141414",
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: "#222222",
                }}
              >
                <View>
                  <Text
                    style={{
                      color: "#F5F0E8",
                      fontSize: 15,
                      fontFamily: "Inter_600SemiBold",
                      marginBottom: 4,
                    }}
                  >
                    Attempt #{attempt.attempt_num}
                  </Text>
                  <Text
                    style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}
                  >
                    {formatDate(attempt.processed_at)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: "#F5F0E8",
                      fontSize: 28,
                      fontFamily: "Rajdhani_700Bold",
                      lineHeight: 32,
                    }}
                  >
                    {Math.round(attempt.efficiency_score)}
                  </Text>
                  <Text
                    style={{
                      color: "#888888",
                      fontSize: 9,
                      fontFamily: "Inter_400Regular",
                      letterSpacing: 1,
                    }}
                  >
                    EFFICIENCY
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Split view */}
        {selectedAttempt && (
          <>
            {loadingPast ? (
              <View style={{ alignItems: "center", paddingVertical: 64 }}>
                <ActivityIndicator color="#FF5C00" />
              </View>
            ) : (
              <>
                {/* Column labels */}
                <View style={{ flexDirection: "row", paddingBottom: 6 }}>
                  <View style={{ width: VIDEO_W, paddingHorizontal: 10 }}>
                    <Text
                      style={{
                        color: "#888888",
                        fontSize: 10,
                        fontFamily: "Inter_600SemiBold",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      BEFORE
                    </Text>
                    <Text
                      style={{
                        color: "#888888",
                        fontSize: 11,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {formatDate(selectedAttempt.processed_at)} ·{" "}
                      {Math.round(selectedAttempt.efficiency_score)}%
                    </Text>
                  </View>
                  <View style={{ width: VIDEO_W, paddingHorizontal: 10 }}>
                    <Text
                      style={{
                        color: "#F5F0E8",
                        fontSize: 10,
                        fontFamily: "Inter_600SemiBold",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      AFTER
                    </Text>
                    <Text
                      style={{
                        color: "#F5F0E8",
                        fontSize: 11,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {formatDate(currentResult?.processed_at ?? "")} ·{" "}
                      {Math.round(currentResult?.efficiency_score ?? 0)}%
                    </Text>
                  </View>
                </View>

                {/* Videos */}
                <View style={{ flexDirection: "row" }}>
                  <View
                    style={{
                      width: VIDEO_W,
                      height: VIDEO_H,
                      backgroundColor: "#141414",
                    }}
                  >
                    {bestClip(pastResult) ? (
                      <Video
                        ref={leftRef}
                        source={{ uri: bestClip(pastResult)! }}
                        style={{ width: VIDEO_W, height: VIDEO_H }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isPlaying}
                      />
                    ) : (
                      <View
                        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                      >
                        <Feather name="video-off" size={20} color="#444444" />
                      </View>
                    )}
                  </View>

                  <View
                    style={{ width: 1, height: VIDEO_H, backgroundColor: "#333333" }}
                  />

                  <View
                    style={{
                      width: VIDEO_W - 1,
                      height: VIDEO_H,
                      backgroundColor: "#141414",
                    }}
                  >
                    {bestClip(currentResult) ? (
                      <Video
                        ref={rightRef}
                        source={{ uri: bestClip(currentResult)! }}
                        style={{ width: VIDEO_W - 1, height: VIDEO_H }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isPlaying}
                        onPlaybackStatusUpdate={handleRightStatus}
                      />
                    ) : (
                      <View
                        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                      >
                        <Feather name="video-off" size={20} color="#444444" />
                      </View>
                    )}
                  </View>
                </View>

                {/* Scrubber + play/pause */}
                <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                  <View
                    style={{ height: 32, justifyContent: "center" }}
                    onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                    {...scrubHandlers}
                  >
                    <View
                      style={{
                        height: 4,
                        backgroundColor: "#1E1E1E",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.round(scrubPct * 100)}%`,
                          backgroundColor: "#FF5C00",
                          borderRadius: 2,
                        }}
                      />
                    </View>
                    <View
                      style={{
                        position: "absolute",
                        left: thumbLeft,
                        top: "50%",
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: "#FF5C00",
                        marginTop: -8,
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 12,
                      gap: 8,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleSeek(Math.max(0, positionMs - 5000))}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "#141414",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "#222222",
                      }}
                    >
                      <Feather name="rewind" size={16} color="#888888" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={togglePlay}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: "#FF5C00",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather
                        name={isPlaying ? "pause" : "play"}
                        size={22}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        handleSeek(Math.min(durationMs, positionMs + 5000))
                      }
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "#141414",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "#222222",
                      }}
                    >
                      <Feather name="fast-forward" size={16} color="#888888" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Stats diff */}
                {currentResult && pastResult && (
                  <View
                    style={{
                      marginHorizontal: 20,
                      marginTop: 16,
                      backgroundColor: "#141414",
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: "#222222",
                    }}
                  >
                    <Text
                      style={{
                        color: "#888888",
                        fontSize: 10,
                        fontFamily: "Inter_500Medium",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        marginBottom: 16,
                      }}
                    >
                      IMPROVEMENT
                    </Text>
                    <View style={{ flexDirection: "row" }}>
                      <DeltaStat
                        label="Efficiency"
                        current={currentResult.efficiency_score}
                        past={pastResult.efficiency_score}
                      />
                      <View style={{ width: 1, backgroundColor: "#222222" }} />
                      <DeltaStat
                        label="Hip drops"
                        current={currentResult.events?.hip_drops ?? 0}
                        past={pastResult.events?.hip_drops ?? 0}
                        lowerIsBetter
                      />
                      <View style={{ width: 1, backgroundColor: "#222222" }} />
                      <DeltaStat
                        label="Barn doors"
                        current={currentResult.events?.barn_doors ?? 0}
                        past={pastResult.events?.barn_doors ?? 0}
                        lowerIsBetter
                      />
                      <View style={{ width: 1, backgroundColor: "#222222" }} />
                      <DeltaStat
                        label="Arm shake"
                        current={currentResult.events?.shake_events ?? 0}
                        past={pastResult.events?.shake_events ?? 0}
                        lowerIsBetter
                      />
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
