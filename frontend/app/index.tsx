import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

WebBrowser.maybeCompleteAuthSession();
const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Index() {
  const { user, loading, loginEmail, registerEmail, setSession } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/(tabs)");
  }, [user, loading]);

  // Handle Google Auth callback (mobile + web)
  useEffect(() => {
    const exchange = async (url: string | null) => {
      if (!url) return;
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      if (!m) return;
      const session_id = m[1];
      try {
        const r = await fetch(`${API}/api/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });
        if (!r.ok) throw new Error("Auth failed");
        const data = await r.json();
        await setSession(data.session_token, data.user);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.history.replaceState(window.history.state, "", window.location.pathname);
        }
      } catch (e) {
        setErr("Google login failed");
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") exchange(window.location.href);
    } else {
      Linking.getInitialURL().then(exchange);
      const sub = Linking.addEventListener("url", ({ url }) => exchange(url));
      return () => sub.remove();
    }
  }, []);

  const submit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      if (mode === "login") await loginEmail(email.trim(), password);
      else await registerEmail(email.trim(), password, name.trim() || email.split("@")[0]);
    } catch (e: any) {
      setErr(e.message || "Auth failed");
    } finally {
      setSubmitting(false);
    }
  };

  const google = async () => {
    setErr(null);
    const redirect = Platform.OS === "web"
      ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
    } else {
      const result: any = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      if (result?.url) {
        const m = result.url.match(/[?#&]session_id=([^&#]+)/);
        if (m) {
          try {
            const r = await fetch(`${API}/api/auth/session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: m[1] }),
            });
            if (r.ok) {
              const data = await r.json();
              await setSession(data.session_token, data.user);
            }
          } catch {}
        }
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.heroWrap}>
          <Image
            source={require("../assets/images/login-bg.png")}
            style={styles.hero}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.5)", colors.surface]}
            locations={[0.55, 0.8, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.tabRow}>
            <Pressable testID="tab-login" onPress={() => setMode("login")} style={[styles.tab, mode === "login" && styles.tabActive]}>
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>LOGIN</Text>
            </Pressable>
            <Pressable testID="tab-signup" onPress={() => setMode("signup")} style={[styles.tab, mode === "signup" && styles.tabActive]}>
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>ENLIST</Text>
            </Pressable>
          </View>

          {mode === "signup" && (
            <TextInput
              testID="input-name"
              value={name}
              onChangeText={setName}
              placeholder="Callsign / Display Name"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCapitalize="words"
            />
          )}
          <TextInput
            testID="input-email"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="input-password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            secureTextEntry
          />

          {err && <Text testID="auth-error" style={styles.err}>{err}</Text>}

          <Pressable testID="submit-auth" onPress={submit} disabled={submitting} style={styles.primaryBtn}>
            {submitting ? <ActivityIndicator color="#001122" /> : <Text style={styles.primaryBtnText}>{mode === "login" ? "ENTER" : "ENLIST"}</Text>}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable testID="btn-google" onPress={google} style={styles.googleBtn}>
            <Text style={styles.googleText}>CONTINUE WITH GOOGLE</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  container: { paddingBottom: spacing.xl },
  heroWrap: { width: "100%", aspectRatio: 1.79, position: "relative" },
  hero: { width: "100%", height: "100%" },
  brandMark: { color: colors.brandPrimary, fontSize: 14, letterSpacing: 6, fontWeight: "700" },
  brandBig: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: 3, marginTop: 4 },
  tagline: { color: colors.textDim, letterSpacing: 4, marginTop: spacing.sm, fontSize: 12 },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tabRow: { flexDirection: "row", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandTertiary, borderBottomWidth: 2, borderBottomColor: colors.brandPrimary },
  tabText: { color: colors.textDim, letterSpacing: 3, fontWeight: "700" },
  tabTextActive: { color: colors.brandPrimary },
  input: {
    backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 14, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  err: { color: colors.error, marginBottom: spacing.sm, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, alignItems: "center",
    borderRadius: radius.sm, marginTop: spacing.sm,
  },
  primaryBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textDim, marginHorizontal: spacing.md, letterSpacing: 2, fontSize: 12 },
  googleBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 14, alignItems: "center", borderRadius: radius.sm },
  googleText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2 },
});
