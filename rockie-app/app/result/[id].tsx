import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import Svg, { Circle, Line, G } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { supabase } from "../../lib/supabase";

const { width } = Dimensions.get("window");

type SkeletonFrame = {
  t: number;
  pts: [number, number][];
};

type RouteAttempt = {
  id: string;
  attempt_num: number;
  efficiency_score: number;
  processed_at: string;
};

type FatigueInfo = {
  detected: boolean;
  session_peak: number;
  rolling_avg: number;
  drop_pct: number;
  climb_count: number;
};

type Result = {
  efficiency_score: number;
  feedback_text: string;
  clips: { full?: string; crux?: string; best_sequence?: string };
  events: { hip_drops: number; barn_doors: number; foot_swaps: number; shake_events: number };
  processed_at: string;
  fatigue?: FatigueInfo | null;
  skeleton_frames?: SkeletonFrame[];
};

function ScoreRing({ score }: { score: number }) {
  const size = 160;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#00C853" : score >= 50 ? "#FF5C00" : "#FF1744";

  return (
    <View style={{ alignItems: "center", paddingVertical: 32 }}>
      <View style={{ position: "relative", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1E1E1E"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={progress}
            strokeLinecap="round"
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "#F5F0E8", fontSize: 44, fontFamily: "Rajdhani_700Bold", lineHeight: 48 }}>
            {Math.round(score)}
          </Text>
          <Text style={{ color: "#888888", fontSize: 13, fontFamily: "Inter_500Medium" }}>/ 100</Text>
        </View>
      </View>
      <Text style={{ color: "#888888", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8 }}>
        EFFICIENCY SCORE
      </Text>
    </View>
  );
}

function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = "#2979FF";
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1 }}>
          {label}
        </Text>
        <Text style={{ color: "#F5F0E8", fontSize: 12, fontFamily: "Rajdhani_700Bold" }}>
          {value}
        </Text>
      </View>
      <View style={{ height: 4, backgroundColor: "#1E1E1E", borderRadius: 2, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
      </View>
    </View>
  );
}

function EventPill({ label, count }: { label: string; count: number }) {
  const active = count > 0;
  return (
    <View style={{
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: active ? "#FF174422" : "#141414",
      borderWidth: 1,
      borderColor: active ? "#FF174466" : "#222222",
      minWidth: 80,
    }}>
      <Text style={{ color: active ? "#FF1744" : "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </Text>
      <Text style={{ color: active ? "#FF1744" : "#888888", fontSize: 22, fontFamily: "Rajdhani_700Bold" }}>
        {count}
      </Text>
    </View>
  );
}

// Ghost Mode skeleton connections
// pts indices: 0=nose, 1=Lshoulder, 2=Rshoulder, 3=Lelbow, 4=Relbow,
//              5=Lwrist, 6=Rwrist, 7=Lhip, 8=Rhip, 9=Lknee, 10=Rknee, 11=Lankle, 12=Rankle
const GHOST_CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2],
  [1, 2],
  [1, 3], [3, 5],
  [2, 4], [4, 6],
  [1, 7], [2, 8],
  [7, 8],
  [7, 9], [9, 11],
  [8, 10], [10, 12],
];

function GhostSkeleton({ frame, videoW, videoH }: { frame: SkeletonFrame; videoW: number; videoH: number }) {
  return (
    <Svg
      width={videoW}
      height={videoH}
      style={{ position: "absolute", top: 0, left: 0 }}
      pointerEvents="none"
    >
      <G opacity={0.45}>
        {GHOST_CONNECTIONS.map(([a, b], i) => {
          const [ax, ay] = frame.pts[a] ?? [0, 0];
          const [bx, by] = frame.pts[b] ?? [0, 0];
          return (
            <Line
              key={i}
              x1={ax * videoW} y1={ay * videoH}
              x2={bx * videoW} y2={by * videoH}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
        {frame.pts.map(([x, y], i) => (
          <Circle key={i} cx={x * videoW} cy={y * videoH} r={3} fill="#FFFFFF" />
        ))}
      </G>
    </Svg>
  );
}

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeClip, setActiveClip] = useState<"full" | "crux" | "best_sequence">("full");

  // Ghost Mode
  const videoRef = useRef<Video>(null);
  const [routeAttempts, setRouteAttempts] = useState<RouteAttempt[]>([]);
  const [ghostPickerVisible, setGhostPickerVisible] = useState(false);
  const [ghostFrames, setGhostFrames] = useState<SkeletonFrame[] | null>(null);
  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [videoTimeSec, setVideoTimeSec] = useState(0);

  useEffect(() => {
    supabase
      .from("analysis_jobs")
      .select("result, route_id")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data?.result) setResult(data.result as Result);
        if (data?.route_id) {
          supabase
            .from("analysis_jobs")
            .select("id, attempt_num, result")
            .eq("route_id", data.route_id)
            .eq("status", "complete")
            .neq("id", id)
            .order("attempt_num", { ascending: true })
            .then(({ data: attempts }) => {
              if (attempts && attempts.length > 0) {
                setRouteAttempts(attempts.map((j) => ({
                  id: j.id,
                  attempt_num: j.attempt_num ?? 1,
                  efficiency_score: j.result?.efficiency_score ?? 0,
                  processed_at: j.result?.processed_at ?? "",
                })));
              }
            });
        }
        setLoading(false);
      });
  }, [id]);

  const ghostFrame = useMemo(() => {
    if (!ghostEnabled || !ghostFrames || ghostFrames.length === 0) return null;
    let best = ghostFrames[0];
    for (const f of ghostFrames) {
      if (Math.abs(f.t - videoTimeSec) < Math.abs(best.t - videoTimeSec)) best = f;
    }
    return best;
  }, [ghostEnabled, ghostFrames, videoTimeSec]);

  async function selectGhostAttempt(attemptId: string) {
    setGhostPickerVisible(false);
    const { data } = await supabase
      .from("analysis_jobs")
      .select("result")
      .eq("id", attemptId)
      .single();
    const frames: SkeletonFrame[] | undefined = data?.result?.skeleton_frames;
    if (frames && frames.length > 0) {
      setGhostFrames(frames);
      setGhostEnabled(true);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#FF5C00" />
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "#888888", fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20 }}>
          No result found.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: "#FF5C00", fontFamily: "Inter_600SemiBold" }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const clipUrl = result.clips[activeClip];
  const availableClips = Object.entries(result.clips).filter(([, url]) => !!url) as [string, string][];
  const clipLabels: Record<string, string> = { full: "Full", crux: "Crux", best_sequence: "Best" };

  const totalEvents = (result.events.hip_drops ?? 0) + (result.events.barn_doors ?? 0) +
    (result.events.foot_swaps ?? 0) + (result.events.shake_events ?? 0);
  const maxEvent = Math.max(1, result.events.hip_drops, result.events.barn_doors, result.events.foot_swaps, result.events.shake_events);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      {/* Back */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="chevron-left" size={20} color="#FF5C00" />
          <Text style={{ color: "#FF5C00", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: "auto" }}>
          {result.processed_at ? new Date(result.processed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Score ring */}
        <ScoreRing score={result.efficiency_score} />

        {/* Fatigue warning */}
        {result.fatigue?.detected && (
          <View style={{
            marginHorizontal: 20, marginBottom: 20,
            backgroundColor: "#FF5C0018",
            borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: "#FF5C0066",
            borderLeftWidth: 3, borderLeftColor: "#FF5C00",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
              <Feather name="alert-triangle" size={16} color="#FF5C00" />
              <Text style={{ color: "#FF5C00", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, textTransform: "uppercase" }}>
                FATIGUE DETECTED
              </Text>
            </View>
            <Text style={{ color: "#F5F0E8", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 14 }}>
              Your efficiency has dropped {result.fatigue.drop_pct}% from your session peak. Consider resting before your next climb.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: "#0A0A0A", borderRadius: 10, padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                  PEAK
                </Text>
                <Text style={{ color: "#F5F0E8", fontSize: 22, fontFamily: "Rajdhani_700Bold" }}>
                  {result.fatigue.session_peak}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#0A0A0A", borderRadius: 10, padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                  NOW (AVG)
                </Text>
                <Text style={{ color: "#FF5C00", fontSize: 22, fontFamily: "Rajdhani_700Bold" }}>
                  {result.fatigue.rolling_avg}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#0A0A0A", borderRadius: 10, padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                  DROP
                </Text>
                <Text style={{ color: "#FF1744", fontSize: 22, fontFamily: "Rajdhani_700Bold" }}>
                  -{result.fatigue.drop_pct}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Video player */}
        {clipUrl && (
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <View style={{ position: "relative" }}>
              <Video
                ref={videoRef}
                source={{ uri: clipUrl }}
                style={{ width: width - 40, height: (width - 40) * 0.5625, borderRadius: 14 }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                  if (status.isLoaded) setVideoTimeSec(status.positionMillis / 1000);
                }}
              />
              {ghostFrame && (
                <GhostSkeleton
                  frame={ghostFrame}
                  videoW={width - 40}
                  videoH={(width - 40) * 0.5625}
                />
              )}
              {/* Ghost Mode toggle button */}
              {routeAttempts.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (ghostEnabled) {
                      setGhostEnabled(false);
                      setGhostFrames(null);
                    } else {
                      setGhostPickerVisible(true);
                    }
                  }}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    backgroundColor: ghostEnabled ? "#00E5FF22" : "#0A0A0ACC",
                    borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: ghostEnabled ? "#00E5FF" : "#333333",
                    flexDirection: "row", alignItems: "center", gap: 5,
                  }}
                >
                  <Feather name="users" size={12} color={ghostEnabled ? "#00E5FF" : "#888888"} />
                  <Text style={{
                    color: ghostEnabled ? "#00E5FF" : "#888888",
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    letterSpacing: 0.5,
                  }}>
                    {ghostEnabled ? "GHOST ON" : "GHOST MODE"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {availableClips.length > 1 && (
              <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
                {availableClips.map(([key]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setActiveClip(key as any)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: activeClip === key ? "#FF5C00" : "#141414",
                      borderWidth: 1,
                      borderColor: activeClip === key ? "#FF5C00" : "#222222",
                    }}
                  >
                    <Text style={{
                      color: activeClip === key ? "#fff" : "#888888",
                      fontSize: 13,
                      fontFamily: "Inter_600SemiBold",
                    }}>
                      {clipLabels[key] ?? key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Ghost attempt picker modal */}
        <Modal
          visible={ghostPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGhostPickerVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000000AA" }}>
            <View style={{
              backgroundColor: "#141414",
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 24,
              borderTopWidth: 1, borderColor: "#222222",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                <Feather name="users" size={16} color="#00E5FF" />
                <Text style={{ color: "#F5F0E8", fontSize: 16, fontFamily: "Rajdhani_700Bold", letterSpacing: 0.5, marginLeft: 8 }}>
                  PICK A GHOST ATTEMPT
                </Text>
              </View>
              {routeAttempts.map((attempt) => (
                <TouchableOpacity
                  key={attempt.id}
                  onPress={() => selectGhostAttempt(attempt.id)}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    backgroundColor: "#1E1E1E",
                    borderRadius: 12, padding: 16, marginBottom: 10,
                    borderWidth: 1, borderColor: "#222222",
                  }}
                >
                  <View>
                    <Text style={{ color: "#F5F0E8", fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>
                      Attempt #{attempt.attempt_num}
                    </Text>
                    <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                      {attempt.processed_at ? new Date(attempt.processed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: "#0A0A0A", borderRadius: 8,
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: "#333333",
                  }}>
                    <Text style={{ color: "#00E5FF", fontSize: 18, fontFamily: "Rajdhani_700Bold" }}>
                      {Math.round(attempt.efficiency_score)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setGhostPickerVisible(false)}
                style={{ marginTop: 8, alignItems: "center", paddingVertical: 14 }}
              >
                <Text style={{ color: "#888888", fontSize: 14, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* AI Feedback */}
        <View style={{
          marginHorizontal: 20, marginBottom: 16,
          backgroundColor: "#141414",
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: "#222222",
          borderLeftWidth: 3, borderLeftColor: "#2979FF",
        }}>
          <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            AI FEEDBACK
          </Text>
          <Text style={{ color: "#F5F0E8", fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 24 }}>
            {result.feedback_text}
          </Text>
        </View>

        {/* Events */}
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
            EVENTS DETECTED
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <EventPill label="Hip drops" count={result.events.hip_drops ?? 0} />
            <EventPill label="Barn doors" count={result.events.barn_doors ?? 0} />
            <EventPill label="Foot swaps" count={result.events.foot_swaps ?? 0} />
            <EventPill label="Arm shake" count={result.events.shake_events ?? 0} />
          </View>
        </View>

        {/* Breakdown */}
        {totalEvents > 0 && (
          <View style={{
            marginHorizontal: 20,
            backgroundColor: "#141414",
            borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: "#222222",
          }}>
            <Text style={{ color: "#888888", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>
              BREAKDOWN
            </Text>
            <BreakdownBar label="Hip drops" value={result.events.hip_drops ?? 0} max={maxEvent} />
            <BreakdownBar label="Barn doors" value={result.events.barn_doors ?? 0} max={maxEvent} />
            <BreakdownBar label="Foot swaps" value={result.events.foot_swaps ?? 0} max={maxEvent} />
            <BreakdownBar label="Arm shake" value={result.events.shake_events ?? 0} max={maxEvent} />
          </View>
        )}

        {/* Compare button */}
        {routeAttempts.length > 0 && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/compare/[id]", params: { id } })}
            style={{
              marginHorizontal: 20,
              marginTop: 16,
              backgroundColor: "#141414",
              borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: "#222222",
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: "#1E1E1E",
                alignItems: "center", justifyContent: "center",
                borderWidth: 1, borderColor: "#2979FF44",
              }}>
                <Feather name="layers" size={18} color="#2979FF" />
              </View>
              <View>
                <Text style={{ color: "#F5F0E8", fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>
                  Before / After
                </Text>
                <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                  Compare with {routeAttempts.length} previous {routeAttempts.length === 1 ? "attempt" : "attempts"}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color="#888888" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
