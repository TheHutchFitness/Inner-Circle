import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator } from "react-native";
import { apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { syncHealth } from "@/src/lib/health";

export function HealthCard({ token, onChange }: { token: string | null; onChange?: () => void }) {
  const [steps, setSteps] = useState(0);
  const [goal, setGoal] = useState(10000);
  const [hr, setHr] = useState<{ resting_bpm?: number | null; avg_bpm?: number | null }>({});
  const [sprints, setSprints] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [stepsInput, setStepsInput] = useState("");
  const [restInput, setRestInput] = useState("");
  const [avgInput, setAvgInput] = useState("");

  const load = async () => {
    try {
      const [s, h, sp] = await Promise.all([
        apiFetch(token, "/api/steps/today"),
        apiFetch(token, "/api/heart-rate/today"),
        apiFetch(token, "/api/sprint/me"),
      ]);
      setSteps(s.steps || 0); setGoal(s.goal || 10000);
      setHr({ resting_bpm: h.resting_bpm, avg_bpm: h.avg_bpm });
      setSprints(sp.sprints || {});
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [token]);

  const saveManual = async () => {
    try {
      if (stepsInput.trim()) await apiFetch(token, "/api/steps/log", { method: "POST", body: JSON.stringify({ steps: parseInt(stepsInput, 10) || 0 }) });
      const hrBody: any = {};
      if (restInput.trim()) hrBody.resting_bpm = parseInt(restInput, 10);
      if (avgInput.trim()) hrBody.avg_bpm = parseInt(avgInput, 10);
      if (Object.keys(hrBody).length) await apiFetch(token, "/api/heart-rate/log", { method: "POST", body: JSON.stringify(hrBody) });
      setEditOpen(false); setStepsInput(""); setRestInput(""); setAvgInput("");
      setMsg("Saved.");
      await load(); onChange?.();
    } catch (e: any) { setMsg(e.message); }
  };

  const doSync = async () => {
    setSyncing(true); setMsg(null);
    const res = await syncHealth();
    if (res.ok && res.data) {
      const body: any = {};
      if (res.data.steps != null) await apiFetch(token, "/api/steps/log", { method: "POST", body: JSON.stringify({ steps: res.data.steps }) });
      if (res.data.restingBpm != null) body.resting_bpm = res.data.restingBpm;
      if (res.data.avgBpm != null) body.avg_bpm = res.data.avgBpm;
      if (Object.keys(body).length) await apiFetch(token, "/api/heart-rate/log", { method: "POST", body: JSON.stringify(body) });
      await load(); onChange?.();
    }
    setMsg(res.message);
    setSyncing(false);
  };

  const pct = Math.min(1, steps / (goal || 10000));

  if (loading) return <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} />;

  return (
    <View style={styles.card}>
      <View style={styles.stepsHead}>
        <View>
          <Text style={styles.stepsLabel}>DAILY STEPS</Text>
          <Text testID="steps-value" style={styles.stepsValue}>{steps.toLocaleString()}<Text style={styles.stepsGoal}> / {goal.toLocaleString()}</Text></Text>
        </View>
        <Text style={styles.stepsPct}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, pct * 100)}%` }]} /></View>

      <View style={styles.hrRow}>
        <View style={styles.hrCell}><Text style={styles.hrLabel}>❤ RESTING</Text><Text style={styles.hrVal}>{hr.resting_bpm != null ? `${hr.resting_bpm}` : "—"}<Text style={styles.hrUnit}> bpm</Text></Text></View>
        <View style={styles.hrCell}><Text style={styles.hrLabel}>♥ AVG HR</Text><Text style={styles.hrVal}>{hr.avg_bpm != null ? `${hr.avg_bpm}` : "—"}<Text style={styles.hrUnit}> bpm</Text></Text></View>
      </View>

      <View style={styles.hrRow}>
        <View style={styles.hrCell}><Text style={styles.hrLabel}>⚡ 40-YARD</Text><Text style={styles.hrVal}>{sprints["40yd"] != null ? `${sprints["40yd"].toFixed(2)}` : "—"}<Text style={styles.hrUnit}> s</Text></Text></View>
        <View style={styles.hrCell}><Text style={styles.hrLabel}>⚡ 100M</Text><Text style={styles.hrVal}>{sprints["100m"] != null ? `${sprints["100m"].toFixed(2)}` : "—"}<Text style={styles.hrUnit}> s</Text></Text></View>
      </View>

      {msg && <Text testID="health-msg" style={styles.msg}>{msg}</Text>}

      <View style={styles.btnRow}>
        <Pressable testID="health-sync" onPress={doSync} disabled={syncing} style={[styles.btn, styles.btnPrimary]}>
          <Text style={styles.btnPrimaryText}>{syncing ? "SYNCING..." : "⌁ SYNC HEALTH"}</Text>
        </Pressable>
        <Pressable testID="health-manual" onPress={() => setEditOpen(true)} style={styles.btn}>
          <Text style={styles.btnText}>✎ ENTER</Text>
        </Pressable>
      </View>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>LOG CONDITIONING</Text>
            <Text style={styles.inLabel}>STEPS TODAY</Text>
            <TextInput testID="input-steps" value={stepsInput} onChangeText={setStepsInput} keyboardType="number-pad" placeholder="e.g. 8500" placeholderTextColor={colors.textDim} style={styles.input} />
            <Text style={styles.inLabel}>RESTING HR (bpm)</Text>
            <TextInput testID="input-resting" value={restInput} onChangeText={setRestInput} keyboardType="number-pad" placeholder="e.g. 58" placeholderTextColor={colors.textDim} style={styles.input} />
            <Text style={styles.inLabel}>AVG HR (bpm)</Text>
            <TextInput testID="input-avg" value={avgInput} onChangeText={setAvgInput} keyboardType="number-pad" placeholder="e.g. 130" placeholderTextColor={colors.textDim} style={styles.input} />
            <View style={styles.btnRow}>
              <Pressable onPress={() => setEditOpen(false)} style={styles.btn}><Text style={styles.btnText}>CANCEL</Text></Pressable>
              <Pressable testID="save-health" onPress={saveManual} style={[styles.btn, styles.btnPrimary]}><Text style={styles.btnPrimaryText}>SAVE</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  stepsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  stepsLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  stepsValue: { color: colors.text, fontSize: 24, fontWeight: "900", marginTop: 2, fontVariant: ["tabular-nums"] },
  stepsGoal: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  stepsPct: { color: colors.brandPrimary, fontSize: 20, fontWeight: "900" },
  track: { height: 8, backgroundColor: colors.surface3, borderRadius: 4, overflow: "hidden", marginTop: spacing.sm },
  fill: { height: "100%", backgroundColor: colors.brandPrimary },
  hrRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  hrCell: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  hrLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  hrVal: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  hrUnit: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  msg: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, fontSize: 12, lineHeight: 17 },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  btnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  btnPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  btnPrimaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modal: { width: "100%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "900", textAlign: "center", marginBottom: spacing.md },
  inLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: spacing.sm, marginBottom: 4 },
  input: { backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, fontWeight: "700" },
});
