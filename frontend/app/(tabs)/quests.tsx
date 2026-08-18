import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, bgImage } from "@/src/lib/theme";
import { HudSectionHeader } from "@/src/components/Hud";
import { SwipeTabs } from "@/src/components/SwipeTabs";

function BossReveal({ data, onClose }: { data: { label: string; title: string }; onClose: () => void }) {
  const scale = useSharedValue(0.4);
  const glow = useSharedValue(0.4);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 7, stiffness: 120 });
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.45, { duration: 700 })), -1);
  }, []);
  const cardSt = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowSt = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={rv.wrap}>
        <Animated.View style={[rv.glow, glowSt]} />
        <Animated.View style={[rv.card, cardSt]}>
          <Text style={rv.skull}>☠</Text>
          <Text style={rv.tag}>BOSS DEFEATED</Text>
          <Text style={rv.title}>{data.title}</Text>
          <View style={rv.rewardBox}><Text style={rv.reward}>◈ {data.label}</Text></View>
          <Text style={rv.hint}>UNLOCKED · tap to continue</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
const rv = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  glow: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "#12B886", opacity: 0.4 },
  card: { alignItems: "center", padding: spacing.xl, borderRadius: radius.lg, borderWidth: 2, borderColor: "#12B886", backgroundColor: "rgba(4,20,12,0.96)", width: "100%" },
  skull: { fontSize: 66 },
  tag: { color: "#12B886", letterSpacing: 6, fontWeight: "900", fontSize: 13, marginTop: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, textAlign: "center" },
  rewardBox: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "#12B886", backgroundColor: "rgba(18,184,134,0.12)" },
  reward: { color: "#5CF0B4", fontWeight: "900", letterSpacing: 1, fontSize: 15, textAlign: "center" },
  hint: { color: colors.textDim, letterSpacing: 2, fontSize: 11, marginTop: spacing.lg },
});

const SCOPES = [
  { key: "daily", label: "DAILY" },
  { key: "weekly", label: "WEEKLY" },
  { key: "monthly", label: "MONTHLY" },
  { key: "boss", label: "☠ BOSS" },
  { key: "all", label: "ALL" },
];

function daysLeftInMonth() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

const GOAL_CHIPS = ["Lose weight", "Build muscle", "Compete in a powerlifting meet", "Bigger total", "Run faster", "Get shredded"];

export default function Quests() {
  const insets = useSafeAreaInsets();
  const { token, user, refresh } = useAuth();
  const [scope, setScope] = useState("daily");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [bossReveal, setBossReveal] = useState<{ label: string; title: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [personal, setPersonal] = useState<any>(null);
  const [goalText, setGoalText] = useState("");
  const [goalBusy, setGoalBusy] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalErr, setGoalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch(token, `/api/quests?scope=${scope}`)); } catch {}
    setLoading(false);
  }, [scope, token]);

  const loadPersonal = useCallback(async () => {
    try { setPersonal(await apiFetch(token, "/api/quests/personal")); } catch {}
  }, [token]);

  useFocusEffect(useCallback(() => { load(); loadPersonal(); }, [load, loadPersonal]));
  useEffect(() => { load(); loadPersonal(); }, [load, loadPersonal]);

  const submitGoals = async () => {
    if (goalText.trim().length < 3 || goalBusy) return;
    setGoalBusy(true); setGoalErr(null);
    try {
      await apiFetch(token, "/api/quests/goals", { method: "POST", body: JSON.stringify({ goals: goalText.trim() }) });
      await loadPersonal();
      setEditingGoals(false);
      setToast("COACH FORGED YOUR QUESTS");
      setTimeout(() => setToast(null), 2600);
    } catch (e: any) { setGoalErr(e.message); }
    setGoalBusy(false);
  };

  const completePersonal = async (q: any) => {
    try {
      const res = await apiFetch(token, "/api/quests/personal/complete", { method: "POST", body: JSON.stringify({ quest_id: q.quest_id }) });
      setToast(`QUEST COMPLETE · +${res.xp_gained} XP`);
      await refresh();
      await loadPersonal();
    } catch (e: any) { setToast(e.message); }
    setTimeout(() => setToast(null), 2600);
  };

  const claim = async (q: any) => {
    setClaiming(true);
    try {
      const res = await apiFetch(token, "/api/quests/claim", { method: "POST", body: JSON.stringify({ quest_id: q.id }) });
      await refresh();
      await load();
      setSelected(null);
      if (String(q.id).startsWith("boss")) {
        setBossReveal({ label: res.reward || q.reward_label, title: q.title });
      } else {
        setToast(`REWARD CLAIMED · ${res.reward}`);
        setTimeout(() => setToast(null), 2600);
      }
    } catch (e: any) { setToast(e.message); setTimeout(() => setToast(null), 2600); }
    setClaiming(false);
  };

  const scopes = scope === "all" ? ["daily", "weekly", "monthly", "boss"] : [scope];

  // ---------- FIRST-ENTRY GOAL INTAKE ----------
  if (personal && (personal.needs_setup || editingGoals)) {
    return (
      <SwipeTabs current="quests">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xl, padding: spacing.lg, paddingBottom: 120 }}>
          <Text style={styles.eyebrow}>▚ COACH INTAKE //</Text>
          <Text style={styles.h1}>WHAT ARE YOU CHASING?</Text>
          <Text style={styles.intakeSub}>
            Tell Coach Hutch your current goals — real life, not just gym numbers. He&apos;ll forge specific quests to get you there. Think &quot;lose 5 lb&quot;, &quot;sign up for a powerlifting meet&quot;, &quot;deadlift 500&quot;.
          </Text>
          <View style={styles.goalChipRow}>
            {GOAL_CHIPS.map((g) => (
              <Pressable testID={`goal-chip-${g}`} key={g} onPress={() => setGoalText((t) => (t ? `${t}, ${g}` : g))} style={styles.goalChip}>
                <Text style={styles.goalChipText}>+ {g}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="goal-input"
            value={goalText}
            onChangeText={setGoalText}
            placeholder="e.g. Lose 5 lb before summer, hit a 405 squat, sign up for my first meet..."
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.goalInput}
          />
          {goalErr && <Text style={styles.goalErr}>{goalErr}</Text>}
          <Pressable testID="forge-quests" onPress={submitGoals} disabled={goalBusy || goalText.trim().length < 3} style={[styles.forgeBtn, (goalBusy || goalText.trim().length < 3) && { opacity: 0.6 }]}>
            {goalBusy ? <ActivityIndicator color="#001122" /> : <Text style={styles.forgeText}>FORGE MY QUESTS</Text>}
          </Pressable>
          {goalBusy && <Text style={styles.forging}>Coach is studying your stats and writing your quests...</Text>}
          {editingGoals && !personal.needs_setup && (
            <Pressable onPress={() => setEditingGoals(false)} style={{ alignItems: "center", marginTop: spacing.md, minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: colors.textDim, letterSpacing: 2 }}>CANCEL</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </SwipeTabs>
    );
  }

  return (
    <SwipeTabs current="quests">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={bgImage(user?.active_background, user?.sex)} style={styles.questBg} contentFit="cover" />
      <LinearGradient
        colors={["rgba(5,5,8,0.55)", "rgba(5,5,8,0.82)", colors.surface]}
        locations={[0, 0.5, 0.85]}
        style={styles.questBgFade}
      />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
        <Text style={styles.eyebrow}>▚ QUEST LOG //</Text>
        <Text style={styles.h1}>QUESTS</Text>

        {personal && !personal.needs_setup && (
          <View>
            <View style={styles.pqHeader}>
              <Text style={styles.pqTitle}>◈ YOUR GOALS</Text>
              <Pressable testID="edit-goals" onPress={() => { setGoalText(personal.goals || ""); setEditingGoals(true); }} hitSlop={10}>
                <Text style={styles.pqEdit}>EDIT GOALS</Text>
              </Pressable>
            </View>
            {(personal.quests || []).filter((q: any) => q.status === "active").map((q: any) => (
              <View testID={`pq-${q.quest_id}`} key={q.quest_id} style={styles.pqCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pqCardTitle}>{q.title}</Text>
                  <Text style={styles.pqDesc}>{q.description}</Text>
                  <Text style={styles.pqMeta}>{q.timeframe} · ◈ {q.xp} XP</Text>
                </View>
                <Pressable testID={`pq-done-${q.quest_id}`} onPress={() => completePersonal(q)} style={styles.pqDone}>
                  <Text style={styles.pqDoneText}>DONE</Text>
                </Pressable>
              </View>
            ))}
            {(personal.quests || []).filter((q: any) => q.status === "completed").slice(0, 3).map((q: any) => (
              <View key={q.quest_id} style={[styles.pqCard, { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pqCardTitle}>✓ {q.title}</Text>
                  <Text style={styles.pqMeta}>COMPLETED · +{q.xp} XP</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SCOPES.map((s) => (
            <Pressable testID={`quest-scope-${s.key}`} key={s.key} onPress={() => setScope(s.key)} style={[styles.chip, scope === s.key && styles.chipActive]}>
              <Text style={[styles.chipText, scope === s.key && styles.chipTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
        ) : (
          scopes.map((sc) => (
            <View key={sc}>
              {scope === "all" && <HudSectionHeader label={`${sc.toUpperCase()} QUESTS`} />}
              {(data[sc] || []).map((q: any) => {
                const prog = q.objectives.reduce((a: number, o: any) => a + o.current / o.target, 0) / q.objectives.length;
                return (
                  <Pressable testID={`quest-${q.id}`} key={q.id} onPress={() => setSelected(q)} style={[styles.card, q.claimed && styles.cardClaimed]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.icon}>❖</Text>
                      <Text style={styles.cardTitle} numberOfLines={1}>{q.title}</Text>
                      {q.claimed ? <Text style={styles.claimed}>✓ CLAIMED</Text> : q.complete ? <Text style={styles.ready}>● READY</Text> : <Text style={styles.progPct}>{Math.round(prog * 100)}%</Text>}
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, prog * 100)}%`, backgroundColor: q.claimed ? colors.textDim : q.complete ? colors.success : colors.brandPrimary }]} /></View>
                    <View style={styles.cardFoot}>
                      <Text style={styles.reward}>◈ {q.reward_label}</Text>
                      {sc === "boss" && !q.claimed
                        ? <Text style={styles.bossTimer}>⏳ {daysLeftInMonth()}d left</Text>
                        : <Text style={styles.globalStat}>{q.global_completions} cleared · {q.global_percent}%</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {toast && <View style={[styles.toast, { bottom: insets.bottom + 80 }]}><Text style={styles.toastText}>{toast}</Text></View>}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.infoHeader}><Text style={styles.infoIcon}>❗</Text><Text style={styles.infoTitle}>QUEST INFO</Text></View>
            <Text style={styles.questArrived}>[{selected?.scope?.toUpperCase()} QUEST: {selected?.title} has arrived]</Text>
            <Text style={[styles.status, { color: selected?.complete ? colors.success : colors.error }]}>{selected?.complete ? "COMPLETED" : "INCOMPLETE"}</Text>
            <View style={styles.divider} />
            <Text style={styles.goal}>GOAL</Text>
            {(selected?.objectives || []).map((o: any, i: number) => (
              <View key={i} style={styles.objRow}>
                <Text style={styles.objLabel}>{o.label}</Text>
                <Text style={[styles.objVal, o.current >= o.target && { color: colors.success }]}>[{o.current}/{o.target}]{o.current >= o.target ? " ✓" : ""}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <Text style={styles.flavor}>{selected?.flavor}</Text>
            <View style={styles.globalBox}>
              <Text style={styles.globalLabel}>GLOBAL CLEARANCE</Text>
              <Text style={styles.globalBig}>{selected?.global_completions} players · {selected?.global_percent}%</Text>
            </View>
            <View style={styles.rewardBox}><Text style={styles.rewardBoxText}>REWARD: {selected?.reward_label}</Text></View>

            {selected?.claimed ? (
              <View style={[styles.claimBtn, { backgroundColor: colors.surface3 }]}><Text style={[styles.claimText, { color: colors.textDim }]}>ALREADY CLAIMED</Text></View>
            ) : (
              <Pressable testID="quest-claim" onPress={() => claim(selected)} disabled={!selected?.complete || claiming} style={[styles.claimBtn, (!selected?.complete) && { opacity: 0.5 }]}>
                <Text style={styles.claimText}>{claiming ? "..." : selected?.complete ? "CLAIM REWARD" : "OBJECTIVES INCOMPLETE"}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}><Text style={styles.closeText}>CLOSE</Text></Pressable>
          </View>
        </View>
      </Modal>

      {bossReveal && <BossReveal data={bossReveal} onClose={() => setBossReveal(null)} />}
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.lg },
  questBg: { position: "absolute", top: 0, left: 0, right: 0, height: 360 },
  questBgFade: { position: "absolute", top: 0, left: 0, right: 0, height: 360 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface2, flexShrink: 0 },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  chipTextActive: { color: colors.brandPrimary },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  cardClaimed: { opacity: 0.6, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { color: colors.brandPrimary, fontSize: 16 },
  cardTitle: { flex: 1, color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 15 },
  claimed: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  ready: { color: colors.success, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  progPct: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900" },
  track: { height: 6, backgroundColor: colors.surface3, borderRadius: 3, marginTop: spacing.sm, overflow: "hidden" },
  fill: { height: "100%" },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  reward: { color: colors.warning, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  globalStat: { color: colors.textDim, fontSize: 10, letterSpacing: 1 },
  bossTimer: { color: colors.warning, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  toastText: { color: "#001122", fontWeight: "900", letterSpacing: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modal: { width: "100%", backgroundColor: "#0A0E16", borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md, padding: spacing.lg },
  infoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: spacing.sm, marginBottom: spacing.md },
  infoIcon: { color: colors.brandPrimary, fontSize: 16 },
  infoTitle: { color: colors.text, fontWeight: "900", letterSpacing: 4, fontSize: 18 },
  questArrived: { color: colors.textMid, textAlign: "center", fontStyle: "italic", fontSize: 12 },
  status: { textAlign: "center", fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.md, opacity: 0.5 },
  goal: { color: colors.text, textAlign: "center", fontSize: 22, fontWeight: "900", letterSpacing: 4, marginBottom: spacing.sm },
  objRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: spacing.lg },
  objLabel: { color: colors.textMid, fontSize: 14, fontWeight: "600" },
  objVal: { color: colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
  flavor: { color: colors.textDim, textAlign: "center", fontSize: 12, lineHeight: 18 },
  globalBox: { marginTop: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  globalLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 3, fontWeight: "800" },
  globalBig: { color: colors.brandPrimary, fontSize: 16, fontWeight: "900", marginTop: 4 },
  rewardBox: { marginTop: spacing.sm, alignItems: "center" },
  rewardBoxText: { color: colors.warning, fontWeight: "900", letterSpacing: 1 },
  claimBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  claimText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  closeBtn: { alignItems: "center", padding: spacing.md },
  closeText: { color: colors.textDim, letterSpacing: 2 },
  intakeSub: { color: colors.textDim, lineHeight: 20, marginBottom: spacing.md },
  goalChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  goalChip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, backgroundColor: colors.surface2 },
  goalChipText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  goalInput: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 100, textAlignVertical: "top", lineHeight: 20 },
  goalErr: { color: colors.error, marginTop: spacing.sm },
  forgeBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, minHeight: 48, justifyContent: "center" },
  forgeText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  forging: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, fontStyle: "italic", fontSize: 12 },
  pqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  pqTitle: { color: colors.warning, fontWeight: "900", letterSpacing: 3, fontSize: 12 },
  pqEdit: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  pqCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning + "55", borderLeftWidth: 3, borderLeftColor: colors.warning },
  pqCardTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  pqDesc: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: 2 },
  pqMeta: { color: colors.warning, fontSize: 10, letterSpacing: 1, fontWeight: "800", marginTop: 4 },
  pqDone: { borderWidth: 1, borderColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  pqDoneText: { color: colors.success, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
});
