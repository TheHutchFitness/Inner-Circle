import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

// One-time congrats shown to a Founding Beta member (first 100 real signups).
// Dismissing writes founder_welcomed so it never returns.
export function FounderWelcome() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ founder_welcomed: true }) });
      await refresh();
    } catch { setBusy(false); }
  };

  const num = user?.founder_number;
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.spark}>⌁</Text>
        <Text style={styles.eyebrow}>FOUNDING BETA</Text>
        <Text style={styles.title}>WELCOME TO THE{"\n"}INNER CIRCLE</Text>
        <View style={styles.numWrap}>
          <Text style={styles.numLabel}>YOU ARE FOUNDER</Text>
          <Text style={styles.num}>#{num ?? "—"}</Text>
          <Text style={styles.numSub}>of the first 100</Text>
        </View>
        <Text style={styles.body}>You&apos;re one of the founding members. Every subscription &amp; Skool-gated perk is unlocked for you — for life. Now go put the work in. 💪</Text>
        <View style={styles.badgeUnlock}>
          <Text style={styles.badgeUnlockText}>★ FOUNDER BADGE UNLOCKED</Text>
        </View>
        <Pressable testID="founder-welcome-dismiss" onPress={dismiss} disabled={busy} style={styles.btn}>
          {busy ? <ActivityIndicator color="#001122" /> : <Text style={styles.btnText}>LET&apos;S GO →</Text>}
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,2,6,0.94)", alignItems: "center", justifyContent: "center", zIndex: 970, elevation: 970, padding: spacing.lg },
  card: { width: "100%", maxWidth: 420, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brandPrimary, padding: spacing.xl, alignItems: "center" },
  spark: { color: colors.brandPrimary, fontSize: 40, textShadowColor: colors.brandPrimary, textShadowRadius: 16 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 5, fontSize: 12, fontWeight: "900", marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: spacing.sm },
  numWrap: { alignItems: "center", marginVertical: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, backgroundColor: colors.surface3 },
  numLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  num: { color: colors.brandPrimary, fontSize: 52, fontWeight: "900", lineHeight: 58, textShadowColor: colors.brandPrimary, textShadowRadius: 14 },
  numSub: { color: colors.textDim, fontSize: 11, letterSpacing: 1 },
  body: { color: colors.textMid, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: spacing.md },
  badgeUnlock: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: spacing.md, marginBottom: spacing.lg, backgroundColor: "rgba(255,184,0,0.1)" },
  badgeUnlockText: { color: colors.warning, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  btn: { backgroundColor: colors.brandPrimary, paddingVertical: 15, paddingHorizontal: spacing.xl, borderRadius: radius.sm, width: "100%", alignItems: "center" },
  btnText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 15 },
});
