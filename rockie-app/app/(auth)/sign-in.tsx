import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status !== "complete") {
        setError(`Sign in incomplete: ${result.status}`);
        return;
      }
      await setActive({ session: result.createdSessionId });
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0A0A0A" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "#F5F0E8", fontSize: 48, fontFamily: "Rajdhani_700Bold", letterSpacing: 2, marginBottom: 4 }}>
          ROCKIE
        </Text>
        <Text style={{ color: "#888888", fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 40 }}>
          Track your climbs. Own your progress.
        </Text>

        <TextInput
          style={{
            backgroundColor: "#141414", color: "#F5F0E8",
            borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16,
            fontSize: 15, fontFamily: "Inter_400Regular",
            marginBottom: 10, borderWidth: 1, borderColor: "#222222",
          }}
          placeholder="Email"
          placeholderTextColor="#888888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={{
            backgroundColor: "#141414", color: "#F5F0E8",
            borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16,
            fontSize: 15, fontFamily: "Inter_400Regular",
            marginBottom: 16, borderWidth: 1, borderColor: "#222222",
          }}
          placeholder="Password"
          placeholderTextColor="#888888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <Text style={{ color: "#FF1744", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={{
            backgroundColor: "#FF5C00", borderRadius: 12,
            paddingVertical: 18, alignItems: "center",
          }}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Rajdhani_700Bold", letterSpacing: 1 }}>
              SIGN IN
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24 }}>
          <Text style={{ color: "#888888", fontSize: 14, fontFamily: "Inter_400Regular" }}>No account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={{ color: "#FF5C00", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Sign up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
