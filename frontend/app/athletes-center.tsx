import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";
import { rankIndex } from "@/src/lib/theme";
import { setPendingWorkout } from "@/src/lib/pendingWorkout";

const POPULAR_SPLITS = [
  "Push/Pull/Legs",
  "Upper/Lower",
  "Full Body",
  "Bro Split (Body Part)",
  "Arnold Split",
  "Push/Pull",
  "PHUL (Power Hypertrophy Upper Lower)",
  "PHAT (Power Hypertrophy Adaptive Training)",
  "5/3/1 Powerlifting",
  "Hybrid Athlete (Lift + Cardio)",
];

export default function AthletesCenter() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const canAI = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.athletes_center_access || user?.is_founder;
  const canRank = rankIndex(user?.rank) >= 2 || user?.all_rooms_access || user?.athletes_center_access;

  const [goal, setGoal] = useState("Powerbuilding");
  const [split, setSplit] = useState("Push/Pull/Legs");
  const [splitOpen, setSplitOpen] = useState(false);
  const [days, setDays] = useState("5");
  const [experience, setExperience] = useState("Advanced");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [program, setProgram] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<"build" | "history">("build");

  const loadHistory = async () => {
    try { setHistory(await apiFetch(token, "/api/ai/programs")); } catch {}
  };
  useEffect(() => {
    if (canRank && canAI) loadHistory();
  }, [canRank, canAI]);

  const build = async () => {
    setLoading(true); setErr(null); setProgram(null); setSessions([]);
    try {
      const res = await apiFetch(token, "/api/ai/build-workout", {
        method: "POST",
        body: JSON.stringify({ goal, split, days_per_week: parseInt(days) || 4, experience, notes }),
      });
      setProgram(res.program_text);
      setSessions(res.sessions || []);
      await loadHistory();
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  const sendToLogger = (session: any) => {
    if (!session) return;
    setPendingWorkout(session);
    router.push("/(tabs)/workout");
  };

  if (!canRank) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.eyebrow}>ACCESS DENIED</Text>
        <Text style={styles.gateTitle}>ADVANCED RANK REQUIRED</Text>
        <Text style={styles.gateSub}>Athlete&apos;s Center unlocks at Advanced (1500 XP). Keep grinding, log workouts, chase PRs.</Text>
        <Pressable onPress={() => router.back()} style={styles.gateBtn}><Text style={styles.gateBtnText}>BACK</Text></Pressable>
      </View>
    );
  }

  if (!canAI) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.eyebrow}>PREMIUM ONLY</Text>
        <Text style={styles.gateTitle}>AI COACH LOCKED</Text>
        <Text style={styles.gateSub}>The AI programming layer requires an active $5/mo membership or verified Skool status.</Text>
        <Pressable testID="ac-paywall" onPress={() => router.push("/paywall")} style={styles.gateBtn}><Text style={styles.gateBtnText}>UNLOCK PREMIUM</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>AI COMMAND</Text>
        <Text style={styles.h1}>ATHLETE&apos;S CENTER</Text>
        <Text style={styles.helper}>Coach Hutch builds a custom protocol based on your stats.</Text>

        <View style={styles.tabRow}>
          <Pressable testID="ac-tab-build" onPress={() => setTab("build")} style={[styles.tabBtn, tab === "build" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === "build" && styles.tabBtnTextActive]}>BUILD NEW</Text>
          </Pressable>
          <Pressable testID="ac-tab-history" onPress={() => setTab("history")} style={[styles.tabBtn, tab === "history" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === "history" && styles.tabBtnTextActive]}>HISTORY ({history.length})</Text>
          </Pressable>
        </View>

        {tab === "build" ? (
          <>
        <Field label="GOAL"><TextInput testID="ai-goal" value={goal} onChangeText={setGoal} style={styles.input} placeholderTextColor={colors.textDim}/></Field>
        <Field label="SPLIT PREFERENCE">
          <Pressable testID="ai-split" onPress={() => setSplitOpen(true)} style={[styles.input, styles.dropdown]}>
            <Text style={styles.dropdownValue}>{split}</Text>
            <Text style={styles.dropdownCaret}>▾</Text>
          </Pressable>
        </Field>
        <Field label="DAYS PER WEEK"><TextInput testID="ai-days" value={days} onChangeText={setDays} keyboardType="numeric" style={styles.input}/></Field>
        <Field label="EXPERIENCE"><TextInput testID="ai-exp" value={experience} onChangeText={setExperience} style={styles.input}/></Field>
        <Field label="NOTES / INJURIES"><TextInput testID="ai-notes" value={notes} onChangeText={setNotes} style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]} multiline placeholder="Anything Coach should know" placeholderTextColor={colors.textDim}/></Field>

        <Pressable testID="ai-generate" onPress={build} disabled={loading} style={styles.primary}>
          {loading ? <ActivityIndicator color="#001122"/> : <Text style={styles.primaryText}>GENERATE PROTOCOL</Text>}
        </Pressable>

        {err && <Text style={styles.err}>{err}</Text>}

        {program && (
          <View style={styles.output}>
            <Text style={styles.outputTitle}>YOUR CUSTOM PROTOCOL</Text>
            <Text style={styles.outputBody}>{program}</Text>
            {sessions.length > 0 && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.daysHeader}>PUSH A DAY TO THE LOGGER</Text>
                {sessions.map((s: any, i: number) => (
                  <Pressable testID={`send-day-${i}`} key={i} onPress={() => sendToLogger(s)} style={styles.dayBtn}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayName}>{(s.name || `DAY ${i + 1}`).toUpperCase()}</Text>
                      <Text style={styles.dayMeta}>{(s.exercises || []).length} exercises</Text>
                    </View>
                    <Text style={styles.daySend}>▲ SEND</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
          </>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            {history.length === 0 ? (
              <Text style={styles.helper}>No saved protocols yet. Build one to see it here.</Text>
            ) : (
              history.map((h) => (
                <View testID={`ac-history-${h.program_id}`} key={h.program_id} style={styles.histCard}>
                  <Pressable onPress={() => { setProgram(h.program_text); setSessions(h.sessions || []); setTab("build"); }}>
                    <Text style={styles.histTitle}>{h.request?.goal?.toUpperCase() || "PROTOCOL"} · {h.request?.split}</Text>
                    <Text style={styles.histMeta}>{h.request?.days_per_week}x/wk · {new Date(h.created_at).toLocaleDateString()}</Text>
                    <Text numberOfLines={2} style={styles.histPreview}>{h.program_text}</Text>
                    <Text style={styles.histView}>TAP TO VIEW →</Text>
                  </Pressable>
                  {(h.sessions || []).length > 0 && (
                    <View style={styles.histDays}>
                      {h.sessions.map((s: any, i: number) => (
                        <Pressable testID={`send-hist-${h.program_id}-${i}`} key={i} onPress={() => sendToLogger(s)} style={styles.histDayChip}>
                          <Text style={styles.histDayChipText}>▲ {(s.name || `DAY ${i + 1}`).toUpperCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={splitOpen} transparent animationType="fade" onRequestClose={() => setSplitOpen(false)}>
        <Pressable style={styles.modalWrap} onPress={() => setSplitOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT SPLIT</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {POPULAR_SPLITS.map((s) => (
                <Pressable
                  testID={`split-opt-${s}`}
                  key={s}
                  onPress={() => { setSplit(s); setSplitOpen(false); }}
                  style={[styles.splitOpt, split === s && styles.splitOptActive]}
                >
                  <Text style={[styles.splitOptText, split === s && { color: colors.brandPrimary }]}>{s}</Text>
                  {split === s && <Text style={{ color: colors.brandPrimary }}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: any) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center" },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  gateTitle: { color: colors.error, fontSize: 26, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm, textAlign: "center" },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textDim, marginTop: 4, marginBottom: spacing.md },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  tabBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  tabBtnText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  tabBtnTextActive: { color: colors.brandPrimary },
  histCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  histTitle: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  histMeta: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, marginTop: 2, fontWeight: "700" },
  histPreview: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm, lineHeight: 17 },
  histView: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: spacing.sm },
  sendBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  sendBtnSm: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm },
  sendBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  daysHeader: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 11, fontWeight: "800", marginBottom: spacing.sm },
  dayBtn: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, marginBottom: spacing.sm },
  dayName: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  dayMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  daySend: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  histDays: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  histDayChip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  histDayChipText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, fontSize: 10 },
  label: { color: colors.textDim, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  input: { marginTop: 4, backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  primary: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  err: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  output: { marginTop: spacing.xl, backgroundColor: colors.surface2, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  outputTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", marginBottom: spacing.md },
  outputBody: { color: colors.text, lineHeight: 22, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  dropdownValue: { color: colors.text },
  dropdownCaret: { color: colors.brandPrimary, fontSize: 14 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", fontSize: 12, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  splitOpt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 44 },
  splitOptActive: { backgroundColor: "rgba(34,211,238,0.06)" },
  splitOptText: { color: colors.textMid, fontWeight: "700" },
});
