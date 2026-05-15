import { useUser, useAuth } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function SettingsRow({ icon, label, onPress, danger }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#141414",
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: "#222222",
      }}
    >
      <Feather name={icon} size={18} color={danger ? "#FF1744" : "#888888"} />
      <Text style={{
        color: danger ? "#FF1744" : "#F5F0E8",
        fontSize: 15,
        fontFamily: "Inter_500Medium",
        marginLeft: 12,
        flex: 1,
      }}>
        {label}
      </Text>
      {!danger && <Feather name="chevron-right" size={16} color="#888888" />}
    </TouchableOpacity>
  );
}

export default function Profile() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{
          color: "#F5F0E8",
          fontSize: 22,
          fontFamily: "Rajdhani_700Bold",
          letterSpacing: 1,
          marginBottom: 24,
        }}>
          PROFILE
        </Text>

        {/* Avatar + info */}
        <View style={{
          alignItems: "center",
          backgroundColor: "#141414",
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: "#222222",
        }}>
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: "#FF5C00",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}>
            <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Rajdhani_700Bold" }}>
              {initials}
            </Text>
          </View>
          <Text style={{ color: "#F5F0E8", fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            {email}
          </Text>
          <View style={{
            marginTop: 12,
            paddingHorizontal: 12,
            paddingVertical: 4,
            backgroundColor: "#1E1E1E",
            borderRadius: 20,
          }}>
            <Text style={{ color: "#888888", fontSize: 12, fontFamily: "Inter_500Medium" }}>
              FREE TIER
            </Text>
          </View>
        </View>

        {/* Settings */}
        <Text style={{
          color: "#888888",
          fontSize: 11,
          fontFamily: "Inter_500Medium",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 12,
        }}>
          ACCOUNT
        </Text>

        <SettingsRow icon="bell" label="Notifications" />
        <SettingsRow icon="lock" label="Privacy" />
        <SettingsRow icon="help-circle" label="Help & Support" />
        <SettingsRow icon="info" label="About Rockie" />

        <View style={{ height: 16 }} />

        <SettingsRow icon="log-out" label="Sign out" onPress={() => signOut()} danger />
      </ScrollView>
    </SafeAreaView>
  );
}
