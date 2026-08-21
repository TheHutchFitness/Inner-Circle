import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

// Parse "mm:ss" or "m:ss" or plain seconds -> total seconds. Empty -> 0.
function parseTime(v: string): number {
  const s = (v || "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => parseFloat(p) || 0);
    if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return Math.round(parseFloat(s) || 0);
}

// First-signup capture of starting lifts + run bests. Skippable.
// Writes baseline_set:true so it only appears once.
export function BaselineStats() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);

  const [bench, setBench] = useState("");
  const [squat, setSquat] = useState("");
  const [deadlift, setDeadlift] = useState("");
  const [ohp, setOhp] = useState("");
  const [t5k, setT5k] = useState("");
  const [t10k, setT10k] = useState("");
  const [t100m, setT100m] = useState("");

  const submit = async (skip: boolean) => {
    setBusy(skip ? "skip" : "save");
    try {
      await apiFetch(token, "/api/onboarding/baseline", {
        method: "POST",
        body: JSON.stringify(
          skip
            ? { skip: true }
            : {
                bench: parseFloat(bench) || 0,
                squat: parseFloat(squat) || 0,
                deadlift: parseFloat(deadlift) || 0,
                ohp: parseFloat(ohp) || 0,
                t_5k: parseTime(t5k),
                t_10k: parseTime(t10k),
                t_100m: parseFloat(t100m) || 0,
              }
        ),
      });
      await refresh();
    } catch {
      setBusy(null);
    }
  };

  const Lift = ({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
        <Text style={styles.unit}>lb</Text>
      </View>
    </View>
  );

  const RunField = ({ label, value, onChange, ph, hint }: { label: string; value: string; onChange: (t: string) => void; ph: string; hint: string }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={ph}
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
        <Text style={styles.unit}>{hint}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>⌁ CALIBRATE YOUR VESSEL</Text>
        <Text style={styles.title}>YOUR STARTING{"\n"}STATS</Text>
        <Text style={styles.sub}>Log your current bests so your player stats, rank and combat power start from where you really are. Every athlete begins different. You can skip any field.</Text>

        <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <Text style={styles.cardTag}>◆ THE BIG FOUR</Text>
          <Lift label="Bench Press" value={bench} onChange={setBench} />
          <Lift label="Squat" value={squat} onChange={setSquat} />
          <Lift label="Deadlift" value={deadlift} onChange={setDeadlift} />
          <Lift label="Overhead Press" value={ohp} onChange={setOhp} />
        </LinearGradient>

        <View style={[styles.card, styles.cardAlt]}>
          <Text style={[styles.cardTag, { color: colors.success }]}>▸ SPEED &amp; ENGINE</Text>
          <RunField label="Fastest 5K" value={t5k} onChange={setT5k} ph="mm:ss" hint="mm:ss" />
          <RunField label="Fastest 10K" value={t10k} onChange={setT10k} ph="mm:ss" hint="mm:ss" />
          <RunField label="Fastest 100m" value={t100m} onChange={setT100m} ph="0.0" hint="sec" />
        </View>

        <Pressable testID="baseline-save" disabled={!!busy} onPress={() => submit(false)} style={[styles.primary, !!busy && { opacity: 0.6 }]}>
          {busy === "save" ? <ActivityIndicator color="#001122" /> : <Text style={styles.primaryText}>LOCK IN MY STATS</Text>}
        </Pressable>
        <Pressable testID="baseline-skip" disabled={!!busy} onPress={() => submit(true)} style={styles.skip}>
          {busy === "skip" ? <ActivityIndicator color={colors.textDim} /> : <Text style={styles.skipText}>SKIP FOR NOW</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, zIndex: 900, elevation: 900 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "800", marginTop: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, lineHeight: 34 },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, padding: spacing.lg, marginBottom: spacing.lg },
  cardAlt: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  cardTag: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: spacing.sm },
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minWidth: 120 },
  input: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "800", paddingVertical: 10, textAlign: "right", minHeight: 44 },
  unit: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginLeft: 6, width: 34 },
  primary: { marginTop: spacing.sm, paddingVertical: 15, alignItems: "center", borderRadius: radius.sm, backgroundColor: colors.brandPrimary },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  skip: { marginTop: spacing.md, alignItems: "center", padding: spacing.md },
  skipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
});
