import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput } from "react-native";
import Svg, { Path } from "react-native-svg";
import { apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { syncHealth } from "@/src/lib/health";

// A classic ECG heartbeat trace with a heart notch in the middle — drawn once,
// sits behind the HR readouts. Purely decorative.
const ECG_PATH =
  "M0 20 H30 l6 -14 l6 28 l6 -14 H70 " +
  "C74 6 82 6 86 12 C90 6 98 6 102 12 C102 20 90 30 86 34 C82 30 70 20 70 20 " +
  "H120 l6 -14 l6 28 l6 -14 H172 H300";

function HrStat({ label, value }: { label: string; value?: number | null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statVal}>{value != null ? value : "—"}<Text style={styles.statUnit}> bpm</Text></Text>
    </View>
  );
}

export function HeartRateStrip({ token, refreshKey = 0 }: { token: string | null; refreshKey?: number }) {
  const [hr, setHr] = useState<{ current_bpm?: number | null; resting_bpm?: number | null; avg_bpm?: number | null }>({});
  const [steps, setSteps] = useState<{ steps: number; goal: number }>({ steps: 0, goal: 10000 });
  const [syncing, setSyncing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stepsInput, setStepsInput] = useState("");
  const [curInput, setCurInput] = useState("");
  const [restInput, setRestInput] = useState("");
  const [avgInput, setAvgInput] = useState("");

  const load = async () => {
    try {
      const h = await apiFetch(token, "/api/heart-rate/today");
      setHr({ current_bpm: h.current_bpm, resting_bpm: h.resting_bpm, avg_bpm: h.avg_bpm });
    } catch {}
    try {
      const s = await apiFetch(token, "/api/steps/today");
      setSteps({ steps: s.steps || 0, goal: s.goal || 10000 });
    } catch {}
  };
  useEffect(() => { load(); }, [token, refreshKey]);

  const doSync = async () => {
    setSyncing(true); setMsg(null);
    const res = await syncHealth();
    if (res.ok && res.data) {
      const body: any = {};
      if (res.data.steps != null) await apiFetch(token, "/api/steps/log", { method: "POST", body: JSON.stringify({ steps: res.data.steps }) });
      if ((res.data as any).currentBpm != null) body.current_bpm = (res.data as any).currentBpm;
      if (res.data.restingBpm != null) body.resting_bpm = res.data.restingBpm;
      if (res.data.avgBpm != null) body.avg_bpm = res.data.avgBpm;
      if (Object.keys(body).length) await apiFetch(token, "/api/heart-rate/log", { method: "POST", body: JSON.stringify(body) });
      await load();
    }
    setMsg(res.message);
    setSyncing(false);
    setTimeout(() => setMsg(null), 2600);
  };

  const saveManual = async () => {
    try {
      if (stepsInput.trim()) await apiFetch(token, "/api/steps/log", { method: "POST", body: JSON.stringify({ steps: parseInt(stepsInput, 10) || 0 }) });
      const hrBody: any = {};
      if (curInput.trim()) hrBody.current_bpm = parseInt(curInput, 10);
      if (restInput.trim()) hrBody.resting_bpm = parseInt(restInput, 10);
      if (avgInput.trim()) hrBody.avg_bpm = parseInt(avgInput, 10);
      if (Object.keys(hrBody).length) await apiFetch(token, "/api/heart-rate/log", { method: "POST", body: JSON.stringify(hrBody) });
      setEditOpen(false); setStepsInput(""); setCurInput(""); setRestInput(""); setAvgInput("");
      await load();
    } catch {}
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.lineWrap} pointerEvents="none">
        <Svg width="100%" height="40" viewBox="0 0 300 40" preserveAspectRatio="none">
          <Path d={ECG_PATH} stroke={colors.error} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </View>
      <View style={styles.stats}>
        <HrStat label="❤ CURRENT" value={hr.current_bpm} />
        <HrStat label="RESTING" value={hr.resting_bpm} />
        <HrStat label="AVG" value={hr.avg_bpm} />
      </View>

      <View style={styles.stepsRow}>
        <Pressable testID="health-sync" onPress={doSync} disabled={syncing} style={styles.sideBtn}>
          <Text style={styles.sideBtnText}>{syncing ? "…" : "⌁ SYNC"}</Text>
        </Pressable>
        <View style={styles.stepsCenter}>
          <Text style={styles.stepsIcon}>👣</Text>
          <Text testID="hr-steps" style={styles.stepsText}>{steps.steps.toLocaleString()}<Text style={styles.stepsDim}> / {steps.goal.toLocaleString()}</Text></Text>
        </View>
        <Pressable testID="health-manual" onPress={() => setEditOpen(true)} style={styles.sideBtn}>
          <Text style={styles.sideBtnText}>✎ ENTER</Text>
        </Pressable>
      </View>
      {msg && <Text testID="health-msg" style={styles.msg}>{msg}</Text>}

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>LOG STEPS & HEART RATE</Text>
            <Text style={styles.inLabel}>STEPS TODAY</Text>
            <TextInput testID="input-steps" value={stepsInput} onChangeText={setStepsInput} keyboardType="number-pad" placeholder="e.g. 8500" placeholderTextColor={colors.textDim} style={styles.input} />
            <Text style={styles.inLabel}>CURRENT HR (bpm)</Text>
            <TextInput testID="input-current" value={curInput} onChangeText={setCurInput} keyboardType="number-pad" placeholder="e.g. 72" placeholderTextColor={colors.textDim} style={styles.input} />
            <Text style={styles.inLabel}>RESTING HR (bpm)</Text>
            <TextInput testID="input-resting" value={restInput} onChangeText={setRestInput} keyboardType="number-pad" placeholder="e.g. 58" placeholderTextColor={colors.textDim} style={styles.input} />
            <Text style={styles.inLabel}>AVG HR (bpm)</Text>
            <TextInput testID="input-avg" value={avgInput} onChangeText={setAvgInput} keyboardType="number-pad" placeholder="e.g. 130" placeholderTextColor={colors.textDim} style={styles.input} />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setEditOpen(false)} style={styles.mBtn}><Text style={styles.mBtnText}>CANCEL</Text></Pressable>
              <Pressable testID="save-health" onPress={saveManual} style={[styles.mBtn, styles.mBtnPrimary]}><Text style={styles.mBtnPrimaryText}>SAVE</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, overflow: "hidden" },
  lineWrap: { opacity: 0.35, marginBottom: 2 },
  stats: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  stat: { alignItems: "center", flex: 1 },
  statLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  statVal: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 2, fontVariant: ["tabular-nums"] },
  statUnit: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
  stepsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  stepsCenter: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" },
  stepsIcon: { fontSize: 14 },
  stepsText: { color: colors.text, fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  stepsDim: { color: colors.textDim, fontSize: 11, fontWeight: "700" },
  sideBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  sideBtnText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  msg: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.sm, fontSize: 11, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modal: { width: "100%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "900", textAlign: "center", marginBottom: spacing.md },
  inLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: spacing.sm, marginBottom: 4 },
  input: { backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, fontWeight: "700" },
  modalBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  mBtn: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  mBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  mBtnPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  mBtnPrimaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
});
