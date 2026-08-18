import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function CoachPrograms() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});

  const load = async () => {
    try { setRows(await apiFetch(token, "/api/custom-program/requests")); }
    catch (e: any) { setMsg(e?.message || "Coach access only"); }
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  const deliver = async (req: any) => {
    setMsg(null);
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setBusyId(req.request_id);
    try {
      const form = new FormData();
      const name = asset.name || "program.pdf";
      const type = asset.mimeType || "application/octet-stream";
      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: asset.uri, name, type } as any);
      }
      form.append("note", (notes[req.request_id] ?? req.program_note ?? "").trim());
      form.append("label", (labels[req.request_id] ?? req.program_label ?? "").trim());
      const r = await fetch(`${API}/api/custom-program/requests/${req.request_id}/deliver`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
      setMsg(`Delivered to ${req.display_name}.`);
      await load();
    } catch (e: any) { setMsg(e?.message || "Upload failed"); }
    setBusyId(null);
  };

  if (!user?.all_rooms_access) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.gateTitle}>COACH ACCESS ONLY</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backText}>BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ COACH INBOX //</Text>
        <Text style={styles.h1}>DELIVER PROGRAMS</Text>
        <Text style={styles.helper}>Every buyer&apos;s intake. Upload their finished program file and it appears in their app.</Text>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No custom-program requests yet.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.request_id} testID={`coach-req-${r.request_id}`} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.name}>{r.display_name}</Text>
                <View style={[styles.statusPill, r.status === "delivered" ? styles.pillDone : styles.pillPending]}>
                  <Text style={styles.statusText}>{(r.status || "submitted").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.meta}>{r.email}</Text>
              <Text style={styles.label}>GOALS</Text><Text style={styles.body}>{r.goals}</Text>
              {!!r.injuries && (<><Text style={styles.label}>INJURIES</Text><Text style={styles.body}>{r.injuries}</Text></>)}
              {!!r.schedule && (<><Text style={styles.label}>SCHEDULE</Text><Text style={styles.body}>{r.days_per_week ? `${r.days_per_week}x/wk · ` : ""}{r.schedule}</Text></>)}
              <Text style={styles.label}>CONTACT</Text>
              <Text style={styles.body}>{(r.contact_method || "email")}: {r.contact_value || r.email}</Text>
              {r.program_file_name && <Text style={styles.delivered}>✓ Delivered: {r.program_file_name}{r.program_label ? ` (${r.program_label})` : ""}</Text>}
              <Text style={styles.label}>VERSION LABEL (optional)</Text>
              <TextInput
                testID={`coach-label-${r.request_id}`}
                value={labels[r.request_id] ?? r.program_label ?? ""}
                onChangeText={(t) => setLabels((n) => ({ ...n, [r.request_id]: t }))}
                placeholder="e.g. Phase 2 — Hypertrophy Block"
                placeholderTextColor={colors.textDim}
                maxLength={60}
                style={styles.labelInput}
              />
              <Text style={styles.label}>PERSONAL NOTE (shown to buyer)</Text>
              <TextInput
                testID={`coach-note-${r.request_id}`}
                value={notes[r.request_id] ?? r.program_note ?? ""}
                onChangeText={(t) => setNotes((n) => ({ ...n, [r.request_id]: t }))}
                placeholder="e.g. Start week 1 light, focus on depth. Message me after session 3."
                placeholderTextColor={colors.textDim}
                multiline
                maxLength={500}
                style={styles.noteInput}
              />
              <Pressable testID={`coach-deliver-${r.request_id}`} onPress={() => deliver(r)} disabled={busyId === r.request_id} style={styles.uploadBtn}>
                {busyId === r.request_id ? <ActivityIndicator color="#001122" /> : <Text style={styles.uploadText}>{r.program_file_name ? "REPLACE PROGRAM FILE" : "UPLOAD PROGRAM FILE"}</Text>}
              </Pressable>
            </View>
          ))
        )}
        {msg && <Text style={styles.msg}>{msg}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.surface, alignItems: "center", padding: spacing.xl },
  gateTitle: { color: colors.error, fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  backBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.sm },
  backText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2 },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 15 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillPending: { backgroundColor: colors.warning },
  pillDone: { backgroundColor: colors.success },
  statusText: { color: "#050508", fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  meta: { color: colors.brandPrimary, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  label: { color: colors.textDim, letterSpacing: 2, fontSize: 9, fontWeight: "800", marginTop: spacing.sm },
  body: { color: colors.text, marginTop: 2, lineHeight: 18 },
  delivered: { color: colors.success, marginTop: spacing.sm, fontWeight: "700", fontSize: 12 },
  noteInput: { color: colors.text, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: 4, minHeight: 60, textAlignVertical: "top" },
  labelInput: { color: colors.text, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: 4, minHeight: 44 },
  uploadBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  uploadText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  msg: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, letterSpacing: 1 },
});
