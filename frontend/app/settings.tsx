import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { VerifyPanel } from "@/src/components/VerifyPanel";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, token, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.display_name || "");
  const [bw, setBw] = useState(String(user?.bodyweight_lb || ""));
  const [age, setAge] = useState(String(user?.age || ""));
  const [sex, setSex] = useState(user?.sex || "male");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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
});
