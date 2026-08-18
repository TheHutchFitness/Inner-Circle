import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

type Ex = { name: string; category: string };

export function ExerciseLibraryModal({
  visible, onClose, onAdd, token,
}: { visible: boolean; onClose: () => void; onAdd: (names: string[]) => void; token: string | null }) {
  const [library, setLibrary] = useState<Ex[]>([]);
  const [custom, setCustom] = useState<Ex[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try { const r = await apiFetch(token, "/api/exercises"); setLibrary(r.library || []); setCustom(r.custom || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { if (visible) { setSel([]); setQ(""); setNewName(""); load(); } }, [visible]);

  const all = useMemo(() => [...custom, ...library], [library, custom]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) => !term || e.name.toLowerCase().includes(term));
  }, [all, q]);
  const grouped = useMemo(() => {
    const g: Record<string, Ex[]> = {};
    for (const e of filtered) { (g[e.category] = g[e.category] || []).push(e); }
    return g;
  }, [filtered]);

  const toggle = (name: string) => setSel((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const createCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await apiFetch(token, "/api/exercises/custom", { method: "POST", body: JSON.stringify({ name }) });
      setCustom(r.custom || []);
      setSel((s) => (s.includes(name) ? s : [...s, name]));
      setNewName("");
    } catch {}
    setCreating(false);
  };

  const confirm = () => { if (sel.length) onAdd(sel); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>EXERCISE LIBRARY</Text>
            <Pressable testID="lib-close" onPress={onClose}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          <TextInput
            testID="lib-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search exercises..."
            placeholderTextColor={colors.textDim}
            style={styles.search}
            autoCapitalize="none"
          />

          <View style={styles.createRow}>
            <TextInput
              testID="lib-new-name"
              value={newName}
              onChangeText={setNewName}
              placeholder="Add your own exercise"
              placeholderTextColor={colors.textDim}
              style={styles.createInput}
            />
            <Pressable testID="lib-create" onPress={createCustom} disabled={creating || !newName.trim()} style={[styles.createBtn, !newName.trim() && { opacity: 0.5 }]}>
              <Text style={styles.createBtnText}>{creating ? "..." : "+ ADD"}</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
              {Object.keys(grouped).length === 0 && <Text style={styles.empty}>No matches. Add it as a custom exercise above.</Text>}
              {Object.entries(grouped).map(([cat, items]) => (
                <View key={cat}>
                  <Text style={styles.cat}>{cat.toUpperCase()}</Text>
                  {items.map((e) => {
                    const on = sel.includes(e.name);
                    return (
                      <Pressable testID={`lib-ex-${e.name}`} key={e.name} onPress={() => toggle(e.name)} style={[styles.row, on && styles.rowOn]}>
                        <Text style={[styles.rowName, on && styles.rowNameOn]}>{e.name}</Text>
                        <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable testID="lib-confirm" onPress={confirm} style={[styles.confirmBtn, !sel.length && { opacity: 0.5 }]} disabled={!sel.length}>
            <Text style={styles.confirmText}>ADD {sel.length > 0 ? `${sel.length} ` : ""}EXERCISE{sel.length === 1 ? "" : "S"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  sheet: { height: "88%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "900", fontSize: 15 },
  close: { color: colors.textDim, fontSize: 22, paddingHorizontal: 6 },
  search: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, marginBottom: spacing.sm },
  createRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  createInput: { flex: 1, backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 },
  createBtn: { justifyContent: "center", paddingHorizontal: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  createBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1 },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: spacing.lg },
  cat: { color: colors.textDim, letterSpacing: 3, fontWeight: "800", fontSize: 11, marginTop: spacing.md, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  rowOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  rowName: { color: colors.text, fontWeight: "600", flex: 1 },
  rowNameOn: { color: colors.brandPrimary, fontWeight: "800" },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  checkMark: { color: "#001122", fontWeight: "900" },
  confirmBtn: { backgroundColor: colors.brandPrimary, paddingVertical: 16, alignItems: "center", borderRadius: radius.sm, marginTop: spacing.sm },
  confirmText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
