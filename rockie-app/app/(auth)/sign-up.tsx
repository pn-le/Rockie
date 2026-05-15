import { useSignUp } from "@clerk/clerk-expo";
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

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "verify">("form");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== "complete") {
        setError(`Sign up incomplete: ${result.status}`);
        return;
      }
      await setActive({ session: result.createdSessionId });
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: "#141414", color: "#F5F0E8",
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 15, fontFamily: "Inter_400Regular",
    marginBottom: 10, borderWidth: 1, borderColor: "#222222",
  };

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
          {step === "form" ? "Create your account." : "Check your email for a code."}
        </Text>

        {step === "form" ? (
          <>
            <TextInput
              style={inputStyle}
              placeholder="Email"
              placeholderTextColor="#888888"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={{ ...inputStyle, marginBottom: 16 }}
              placeholder="Password"
              placeholderTextColor="#888888"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={{ color: "#FF1744", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 }}>{error}</Text> : null}
            <TouchableOpacity
              style={{ backgroundColor: "#FF5C00", borderRadius: 12, paddingVertical: 18, alignItems: "center" }}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="white" /> : (
                <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Rajdhani_700Bold", letterSpacing: 1 }}>CREATE ACCOUNT</Text>
              )}
            </TouchableOpacity>
            <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24 }}>
              <Text style={{ color: "#888888", fontSize: 14, fontFamily: "Inter_400Regular" }}>Already have an account? </Text>
              <Link href="/(auth)/sign-in">
                <Text style={{ color: "#FF5C00", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Sign in</Text>
              </Link>
            </View>
          </>
        ) : (
          <>
            <TextInput
              style={{ ...inputStyle, textAlign: "center", letterSpacing: 8, fontSize: 24, marginBottom: 16 }}
              placeholder="000000"
              placeholderTextColor="#888888"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            {error ? <Text style={{ color: "#FF1744", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 }}>{error}</Text> : null}
            <TouchableOpacity
              style={{ backgroundColor: "#FF5C00", borderRadius: 12, paddingVertical: 18, alignItems: "center" }}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="white" /> : (
                <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Rajdhani_700Bold", letterSpacing: 1 }}>VERIFY</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
