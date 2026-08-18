import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { HudSectionHeader } from "@/src/components/Hud";
import { SwipeTabs } from "@/src/components/SwipeTabs";

const SCOPES = [
  { key: "daily", label: "DAILY" },
  { key: "weekly", label: "WEEKLY" },
  { key: "monthly", label: "MONTHLY" },
  { key: "all", label: "ALL" },
];

export default function Quests() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const [scope, setScope] = useState("daily");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch(token, `/api/quests?scope=${scope}`)); } catch {}
    setLoading(false);
  }, [scope, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const claim = async (q: any) => {
    setClaiming(true);
    try {
      const res = await apiFetch(token, "/api/quests/claim", { method: "POST", body: JSON.stringify({ quest_id: q.id }) });
      setToast(`REWARD CLAIMED · ${res.reward}`);
      await refresh();
      await load();
      setSelected(null);
    } catch (e: any) { setToast(e.message); }
    setClaiming(false);
    setTimeout(() => setToast(null), 2600);
  };

  const scopes = scope === "all" ? ["daily", "weekly", "monthly"] : [scope];

  return (
    <SwipeTabs current="quests">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
        <Text style={styles.eyebrow}>▚ QUEST LOG //</Text>
        <Text style={styles.h1}>QUESTS</Text>

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
                      <Text style={styles.globalStat}>{q.global_completions} cleared · {q.global_percent}%</Text>
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
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.lg },
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
});
