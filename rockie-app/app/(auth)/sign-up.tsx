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
      await setActive({ session: result.createdSessionId });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-black"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-white text-4xl font-bold mb-2">Rockie</Text>
        <Text className="text-zinc-400 text-base mb-10">
          {step === "form" ? "Create your account." : "Check your email for a code."}
        </Text>

        {step === "form" ? (
          <>
            <TextInput
              className="bg-zinc-900 text-white rounded-xl px-4 py-4 mb-3 text-base"
              placeholder="Email"
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              className="bg-zinc-900 text-white rounded-xl px-4 py-4 mb-4 text-base"
              placeholder="Password"
              placeholderTextColor="#71717a"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text className="text-red-400 text-sm mb-3">{error}</Text> : null}
            <TouchableOpacity
              className="bg-green-500 rounded-xl py-4 items-center"
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Create account</Text>
              )}
            </TouchableOpacity>
            <View className="flex-row justify-center mt-6">
              <Text className="text-zinc-500">Already have an account? </Text>
              <Link href="/(auth)/sign-in">
                <Text className="text-green-400">Sign in</Text>
              </Link>
            </View>
          </>
        ) : (
          <>
            <TextInput
              className="bg-zinc-900 text-white rounded-xl px-4 py-4 mb-4 text-base text-center tracking-widest"
              placeholder="000000"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            {error ? <Text className="text-red-400 text-sm mb-3">{error}</Text> : null}
            <TouchableOpacity
              className="bg-green-500 rounded-xl py-4 items-center"
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Verify</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
