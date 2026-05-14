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
      await setActive({ session: result.createdSessionId });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Sign in failed");
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
        <Text className="text-zinc-400 text-base mb-10">Track your climbs. Own your progress.</Text>

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
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Sign in</Text>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-6">
          <Text className="text-zinc-500">No account? </Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-green-400">Sign up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
