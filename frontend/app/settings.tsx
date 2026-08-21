import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { VerifyPanel } from "@/src/components/VerifyPanel";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, token, refresh, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.display_name || "");
  const [bw, setBw] = useState(String(user?.bodyweight_lb || ""));
  const [age, setAge] = useState(String(user?.age || ""));
  const [sex, setSex] = useState(user?.sex || "male");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [diet, setDiet] = useState<"normal" | "veg" | "keto">("normal");
  useEffect(() => {
    (async () => { try { const dp = await AsyncStorage.getItem("hic_diet_pref"); if (dp === "veg" || dp === "keto" || dp === "normal") setDiet(dp); } catch {} })();
  }, []);
  const setDietPref = (d: "normal" | "veg" | "keto") => { setDiet(d); AsyncStorage.setItem("hic_diet_pref", d).catch(() => {}); };

  const deleteAccount = async () => {
    if (confirmDelete.trim().toUpperCase() !== "DELETE" || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(token, "/api/auth/delete-account", { method: "POST" });
      await signOut();
      router.replace("/");
    } catch (e: any) { setMsg(e.message || "Could not delete account"); setDeleting(false); }
  };

  const save = async () => {
    try {
      await apiFetch(token, "/api/profile/update", {
        method: "PATCH",
        body: JSON.stringify({ display_name: name, bodyweight_lb: parseFloat(bw) || 0, age: parseInt(age) || 0, sex }),
      });
      await refresh();
      setMsg("Profile saved.");
    } catch (e: any) { setMsg(e.message); }
  };

  const verifySkool = async () => {
    try {
      await apiFetch(token, "/api/profile/skool-verify", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      await refresh();
      setMsg("Skool verified! You now have Circle access.");
    } catch (e: any) { setMsg(e.message); }
  };

  const removeEnhanced = async () => {
    if (user?.enhanced_removal_used) return;
    try {
      await apiFetch(token, "/api/enhanced/remove", { method: "POST" });
      await persistEnhancedFlag(false);
      await refresh();
      setMsg("Enhanced status removed from your profile.");
      if (Platform.OS === "web") setTimeout(() => reloadApp(), 500);
    } catch (e: any) { setMsg(e.message); }
  };

  const replayTour = async () => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ tour_seen: false }) });
      await refresh();
      // The TourGate overlay (root layout) reappears automatically once tour_seen flips.
    } catch (e: any) { setMsg(e.message); }
  };

  const switchMode = async (nextLite: boolean) => {
    if (!!user?.lite_mode === nextLite) return;
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ lite_mode: nextLite }) });
      await refresh();
      setMsg(nextLite ? "Switched to Lite mode." : "Switched to Full mode.");
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← BACK</Text>
        </Pressable>
        <Text style={styles.h1}>SETTINGS</Text>

        <Text style={styles.label}>DISPLAY NAME</Text>
        <TextInput testID="s-name" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.textDim} />
        <Text style={styles.label}>BODYWEIGHT (LB)</Text>
        <TextInput testID="s-bw" value={bw} onChangeText={setBw} keyboardType="numeric" style={styles.input} />
        <Text style={styles.label}>AGE</Text>
        <TextInput testID="s-age" value={age} onChangeText={setAge} keyboardType="numeric" style={styles.input} />
        <Text style={styles.label}>SEX</Text>
        <View style={styles.rowChips}>
          {["male","female","other"].map((o) => (
            <Pressable testID={`s-sex-${o}`} key={o} onPress={() => setSex(o)} style={[styles.chip, sex === o && styles.chipActive]}>
              <Text style={[styles.chipText, sex === o && styles.chipTextActive]}>{o.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>DIET PREFERENCE</Text>
        <Text style={styles.helper}>Filters the food picker in Diet & Health to foods that fit your diet.</Text>
        <View style={styles.rowChips}>
          {(["normal", "veg", "keto"] as const).map((d) => (
            <Pressable testID={`s-diet-${d}`} key={d} onPress={() => setDietPref(d)} style={[styles.chip, diet === d && styles.chipActive]}>
              <Text style={[styles.chipText, diet === d && styles.chipTextActive]}>{d === "normal" ? "NORMAL" : d === "veg" ? "VEGETARIAN" : "KETO"}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable testID="save-profile" onPress={save} style={styles.primary}>
          <Text style={styles.primaryText}>SAVE PROFILE</Text>
        </Pressable>

        <Text style={[styles.h1, { marginTop: spacing.xl }]}>SKOOL VERIFICATION</Text>
        <Text style={styles.helper}>{"Get your access code from the Hutch's Inner Circle Skool community. Members enter the code below to unlock chatrooms + AI."}</Text>
        <TextInput testID="s-skool-code" value={code} onChangeText={setCode} placeholder="Enter 4-digit code" placeholderTextColor={colors.textDim} style={styles.input} keyboardType="number-pad" maxLength={4} />
        <Pressable testID="verify-skool" onPress={verifySkool} style={styles.primary}>
          <Text style={styles.primaryText}>VERIFY MEMBERSHIP</Text>
        </Pressable>

        <Text style={[styles.h1, { marginTop: spacing.xl }]}>ACCOUNT VERIFICATION</Text>
        <Text style={styles.helper}>Verify your email to unlock photo & video sharing in the chatrooms.</Text>
        <VerifyPanel />

        {(user?.enhanced || user?.enhanced_removal_used) && (
          <>
            <Text style={[styles.h1, { marginTop: spacing.xl }]}>ENHANCED STATUS</Text>
            <Text style={styles.helper}>Remove the Enhanced tag and red theme from your profile. This can only be done once — it cannot be undone.</Text>
            <Pressable
              testID="remove-enhanced"
              onPress={removeEnhanced}
              disabled={!!user?.enhanced_removal_used}
              style={[styles.dangerBtn, user?.enhanced_removal_used && styles.dangerBtnDisabled]}
            >
              <Text style={[styles.dangerText, user?.enhanced_removal_used && styles.dangerTextDisabled]}>
                {user?.enhanced_removal_used ? "ONLY AVAILABLE ONCE" : "REMOVE ENHANCED STATUS"}
              </Text>
            </Pressable>
          </>
        )}

        <Text style={[styles.h1, { marginTop: spacing.xl }]}>APP TOUR</Text>
        <Text style={styles.helper}>Re-watch the quick intro to Quests, the Armory and Clans.</Text>
        <Pressable testID="replay-tour" onPress={replayTour} style={styles.linkBtn}>
          <Text style={styles.linkText}>🧭  REPLAY INTRO TOUR</Text>
        </Pressable>

        <Text style={[styles.h1, { marginTop: spacing.xl }]}>APP MODE</Text>
        <Text style={styles.helper}>Full unlocks games, cosmetics & chat. Lite is pure tracking with no distractions. Switch anytime.</Text>
        <View style={styles.modeRow}>
          <Pressable testID="mode-full" onPress={() => switchMode(false)} style={[styles.modeBtn, !user?.lite_mode && styles.modeBtnOn]}>
            <Text style={[styles.modeTitle, !user?.lite_mode && styles.modeTitleOn]}>◆ FULL</Text>
            <Text style={styles.modeSub}>Games, cosmetics, chat & more</Text>
          </Pressable>
          <Pressable testID="mode-lite" onPress={() => switchMode(true)} style={[styles.modeBtn, user?.lite_mode && styles.modeBtnOn]}>
            <Text style={[styles.modeTitle, user?.lite_mode && styles.modeTitleOn]}>▤ LITE</Text>
            <Text style={styles.modeSub}>Pure tracking, no distractions</Text>
          </Pressable>
        </View>

        <Text style={[styles.h1, { marginTop: spacing.xl }]}>LEGAL</Text>
        <Pressable
          testID="privacy-policy"
          onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/legal/privacy`).catch(() => {})}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>📄  PRIVACY POLICY</Text>
        </Pressable>

        {!user?.is_admin && (
          <>
            <Text style={[styles.h1, { marginTop: spacing.xl }]}>DELETE ACCOUNT</Text>
            <Text style={styles.helper}>
              Permanently delete your account and all of your data (workouts, PRs, chats, coaching, purchases).
              This cannot be undone. Type DELETE below to confirm.
            </Text>
            <TextInput
              testID="delete-confirm-input"
              value={confirmDelete}
              onChangeText={setConfirmDelete}
              placeholder="Type DELETE to confirm"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              testID="delete-account"
              onPress={deleteAccount}
              disabled={confirmDelete.trim().toUpperCase() !== "DELETE" || deleting}
              style={[styles.dangerBtn, (confirmDelete.trim().toUpperCase() !== "DELETE" || deleting) && styles.dangerBtnDisabled]}
            >
              <Text style={[styles.dangerText, (confirmDelete.trim().toUpperCase() !== "DELETE" || deleting) && styles.dangerTextDisabled]}>
                {deleting ? "DELETING..." : "DELETE MY ACCOUNT"}
              </Text>
            </Pressable>
          </>
        )}

        {msg && <Text testID="settings-msg" style={styles.msg}>{msg}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: spacing.md },
  backText: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginBottom: spacing.md },
  label: { color: colors.textDim, letterSpacing: 3, fontSize: 10, fontWeight: "700", marginTop: spacing.md },
  input: { marginTop: 4, backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  rowChips: { flexDirection: "row", gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, letterSpacing: 2, fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: colors.brandPrimary },
  primary: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  helper: { color: colors.textDim, marginBottom: spacing.sm, lineHeight: 19 },
  msg: { color: colors.brandPrimary, marginTop: spacing.md, textAlign: "center", letterSpacing: 2 },
  dangerBtn: { marginTop: spacing.md, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, backgroundColor: "rgba(255,59,48,0.08)" },
  dangerBtnDisabled: { borderColor: colors.border, backgroundColor: colors.surface2 },
  dangerText: { color: colors.error, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  dangerTextDisabled: { color: colors.textDim },
  linkBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  linkText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  modeBtnOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  modeTitle: { color: colors.textDim, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  modeTitleOn: { color: colors.brandPrimary },
  modeSub: { color: colors.textDim, fontSize: 10, marginTop: 4, lineHeight: 14 },
});
