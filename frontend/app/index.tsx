import { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { NeonButton } from "@/src/components/NeonButton";
import { GlitchImage } from "@/src/components/GlitchImage";

WebBrowser.maybeCompleteAuthSession();
const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Index() {
  const { user, loading, loginEmail, registerEmail, appleSignIn, setSession, showIntro } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);
  const apple = useCallback(async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) { setErr("Apple sign-in failed"); return; }
      const name = cred.fullName?.givenName ? `${cred.fullName.givenName}${cred.fullName.familyName ? " " + cred.fullName.familyName : ""}` : null;
      await appleSignIn({ identity_token: cred.identityToken, email: cred.email, name });
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") setErr("Apple sign-in failed");
    }
  }, [appleSignIn]);
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [sex, setSex] = useState<"male" | "female" | "other">("male");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [gym, setGym] = useState("");
  const [inpersonReq, setInpersonReq] = useState(false);
  const [gyms, setGyms] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [spots, setSpots] = useState<{ remaining: number; limit: number } | null>(null);
  const processedSessions = useRef<Set<string>>(new Set());

  // Exchange a Google callback URL's session_id for our own session_token.
  // Guarded so the same session_id is never sent twice (mobile fires 2-3 sources).
  const exchangeSession = useCallback(async (url: string | null | undefined) => {
    if (!url) return;
    const m = url.match(/[?#&]session_id=([^&#]+)/);
    if (!m) return;
    const session_id = m[1];
    if (processedSessions.current.has(session_id)) return;
    processedSessions.current.add(session_id);
    try {
      const r = await fetch(`${API}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id }),
      });
      if (!r.ok) throw new Error("Auth failed");
      const data = await r.json();
      await setSession(data.session_token, data.user);
      showIntro("login");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    } catch (e) {
      processedSessions.current.delete(session_id); // allow a retry on transient failure
      setErr("Google login failed");
    }
  }, [setSession, showIntro]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/founders/spots`);
        if (r.ok) setSpots(await r.json());
      } catch {}
      try {
        const g = await fetch(`${API}/api/gyms`);
        if (g.ok) setGyms((await g.json()).gyms || []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/(tabs)");
  }, [user, loading]);

  // Handle Google Auth callback (mobile + web)
  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") exchangeSession(window.location.href);
    } else {
      Linking.getInitialURL().then(exchangeSession);
      const sub = Linking.addEventListener("url", ({ url }) => exchangeSession(url));
      return () => sub.remove();
    }
  }, [exchangeSession]);

  const submit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      if (mode === "login") await loginEmail(email.trim(), password);
      else {
        if (!fullName.trim()) { setErr("Please enter your full legal name"); setSubmitting(false); return; }
        await registerEmail(email.trim(), password, name.trim() || email.split("@")[0], sex, referralCode.trim(), gym.trim(), inpersonReq, fullName.trim());
      }
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
      // openAuthSessionAsync may return the URL directly, or 'dismiss' with no URL
      // (common on Android) — in which case the url listener / getInitialURL in the
      // effect above catch it. Both routes funnel through the guarded exchangeSession.
      const result: any = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      await exchangeSession(result?.url);
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
          <GlitchImage
            source={require("../assets/images/login-journey.png")}
            style={styles.hero}
          />
          <LinearGradient
            colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.5)", colors.surface]}
            locations={[0.55, 0.8, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.wordmarkWrap}>
          <Text style={styles.brandMark}>WELCOME TO</Text>
          <Text style={styles.brandBig}>THE CIRCLE</Text>
          <Text style={styles.sysTagline}>◇ THE CIRCLE HAS RECOGNIZED YOU · AN EMPTY VESSEL CAN BECOME ANYTHING</Text>
        </View>

        <View style={styles.card}>
          {spots && spots.remaining > 0 && (
            <View testID="founder-banner" style={styles.founderBanner}>
              <Text style={styles.founderTitle}>★ FOUNDING BETA · FREE ACCESS</Text>
              <Text style={styles.founderSub}>
                The first {spots.limit} members unlock ALL premium features free — for life.
                Only {spots.remaining} founder spot{spots.remaining === 1 ? "" : "s"} left.
              </Text>
            </View>
          )}
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
              testID="input-full-name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Legal Name"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCapitalize="words"
            />
          )}
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
          {mode === "signup" && (
            <View style={styles.sexRow}>
              {([["male", "MALE"], ["female", "FEMALE"], ["other", "PREFER NOT"]] as const).map(([v, lbl]) => (
                <Pressable key={v} testID={`sex-${v}`} onPress={() => setSex(v)} style={[styles.sexBtn, sex === v && styles.sexBtnActive]}>
                  <Text style={[styles.sexText, sex === v && styles.sexTextActive]}>{lbl}</Text>
                </Pressable>
              ))}
            </View>
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
          {mode === "signup" && (
            <TextInput
              testID="input-referral"
              value={referralCode}
              onChangeText={setReferralCode}
              placeholder="Referral code (optional)"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          )}

          {mode === "signup" && (
            <>
              <TextInput
                testID="input-gym"
                value={gym}
                onChangeText={setGym}
                placeholder="Your gym (optional)"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {gyms.length > 0 && (
                <View style={styles.gymChips}>
                  {gyms
                    .filter((g) => !gym.trim() || g.toLowerCase().includes(gym.trim().toLowerCase()))
                    .slice(0, 6)
                    .map((g) => (
                      <Pressable key={g} testID={`gym-chip-${g}`} onPress={() => setGym(g)} style={[styles.gymChip, gym.trim().toLowerCase() === g.toLowerCase() && styles.gymChipOn]}>
                        <Text style={[styles.gymChipText, gym.trim().toLowerCase() === g.toLowerCase() && styles.gymChipTextOn]}>{g}</Text>
                      </Pressable>
                    ))}
                </View>
              )}
              <Pressable
                testID="toggle-inperson-request"
                onPress={() => setInpersonReq((v) => !v)}
                disabled={!gym.trim()}
                style={[styles.ipRow, inpersonReq && styles.ipRowOn, !gym.trim() && styles.ipRowDisabled]}
              >
                <View style={[styles.ipCheck, inpersonReq && styles.ipCheckOn]}>
                  {inpersonReq && <Text style={styles.ipCheckMark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ipTitle}>I train in-person & want coaching</Text>
                  <Text style={styles.ipSub}>{gym.trim() ? "Coach Hutch will review your request" : "Enter your gym above to enable"}</Text>
                </View>
              </Pressable>
            </>
          )}

          {err && <Text testID="auth-error" style={styles.err}>{err}</Text>}

          <NeonButton
            testID="submit-auth"
            onPress={submit}
            loading={submitting}
            label={mode === "login" ? "ENTER" : "ENLIST"}
            style={{ marginTop: spacing.md }}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable testID="btn-google" onPress={google} style={styles.googleBtn}>
            <Text style={styles.googleText}>CONTINUE WITH GOOGLE</Text>
          </Pressable>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              testID="btn-apple"
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.md}
              style={styles.appleBtn}
              onPress={apple}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  container: { paddingBottom: spacing.xl },
  heroWrap: { width: "100%", aspectRatio: 0.82, position: "relative" },
  hero: { width: "100%", height: "100%" },
  brandMark: { color: colors.brandPrimary, fontSize: 14, letterSpacing: 6, fontWeight: "700" },
  brandBig: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: 3, marginTop: 4 },
  sysTagline: { color: "#3AA0FF", fontSize: 10.5, letterSpacing: 2, fontWeight: "800", marginTop: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  wordmarkWrap: { alignItems: "center", marginTop: -8, marginBottom: spacing.md },
  tagline: { color: colors.textDim, letterSpacing: 4, marginTop: spacing.sm, fontSize: 12 },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  founderBanner: { marginBottom: spacing.lg, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.1)" },
  founderTitle: { color: colors.warning, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, textAlign: "center" },
  founderSub: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 6, textAlign: "center" },
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
  sexRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  sexBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  sexBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  sexText: { color: colors.textDim, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  sexTextActive: { color: colors.brandPrimary },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, alignItems: "center",
    borderRadius: radius.sm, marginTop: spacing.sm,
  },
  primaryBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textDim, marginHorizontal: spacing.md, letterSpacing: 2, fontSize: 12 },
  googleBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 14, alignItems: "center", borderRadius: radius.sm },
  appleBtn: { height: 48, marginTop: spacing.sm },
  googleText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2 },
  gymChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: spacing.md },
  gymChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  gymChipOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  gymChipText: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  gymChipTextOn: { color: colors.brandPrimary },
  ipRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, marginBottom: spacing.md },
  ipRowOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  ipRowDisabled: { opacity: 0.5 },
  ipCheck: { width: 24, height: 24, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  ipCheckOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  ipCheckMark: { color: "#001122", fontWeight: "900", fontSize: 14 },
  ipTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  ipSub: { color: colors.textDim, fontSize: 10, marginTop: 2 },
});
