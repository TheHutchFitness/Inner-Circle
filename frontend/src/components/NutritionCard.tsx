import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { HudSectionHeader } from "@/src/components/Hud";

const FIELDS: { key: string; label: string; unit: string; kb: "number-pad" }[] = [
  { key: "calories", label: "CALORIES", unit: "kcal", kb: "number-pad" },
  { key: "protein", label: "PROTEIN", unit: "g", kb: "number-pad" },
  { key: "carbs", label: "CARBS", unit: "g", kb: "number-pad" },
  { key: "fats", label: "FATS", unit: "g", kb: "number-pad" },
];

const COMMON_SUPPS = [
  "Multivitamin", "Fish Oil (Omega-3)", "Creatine Monohydrate", "Whey Protein", "Vitamin D3",
  "Magnesium", "Zinc", "Ashwagandha", "Pre-Workout", "EAAs / BCAAs", "Electrolytes", "Probiotics",
  "Collagen", "Beta-Alanine", "Citrulline Malate", "Caffeine", "Turmeric / Curcumin", "Vitamin C",
  "Melatonin", "Glutamine", "ZMA", "Greens Powder",
];

export function NutritionCard() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"macros" | "supps">("macros");
  const [vals, setVals] = useState<Record<string, string>>({ calories: "", protein: "", carbs: "", fats: "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supps, setSupps] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(token, "/api/nutrition/today");
        setVals({ calories: String(r.calories || ""), protein: String(r.protein || ""), carbs: String(r.carbs || ""), fats: String(r.fats || "") });
      } catch {}
      try { const s = await apiFetch(token, "/api/supplements"); setSupps(s.supplements || []); } catch {}
    })();
  }, [token]);

  const set = (k: string, t: string) => { setVals((v) => ({ ...v, [k]: t.replace(/[^0-9]/g, "") })); setSaved(false); };

  const toggleSupp = async (name: string) => {
    const on = !supps.includes(name);
    setSupps((s) => (on ? [...s, name] : s.filter((x) => x !== name)));
    try { await apiFetch(token, "/api/supplements", { method: "POST", body: JSON.stringify({ name, on }) }); } catch {}
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(token, "/api/nutrition/today", {
        method: "POST",
        body: JSON.stringify({
          calories: parseInt(vals.calories || "0", 10),
          protein: parseInt(vals.protein || "0", 10),
          carbs: parseInt(vals.carbs || "0", 10),
          fats: parseInt(vals.fats || "0", 10),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setBusy(false);
  };

  return (
    <View style={styles.wrap}>
      <HudSectionHeader label="TODAY'S FUEL" accent={colors.success} />
      <View style={styles.card}>
        <View style={styles.tabs}>
          <Pressable testID="nutri-tab-macros" onPress={() => setTab("macros")} style={[styles.tab, tab === "macros" && styles.tabOn]}>
            <Text style={[styles.tabText, tab === "macros" && styles.tabTextOn]}>MACROS</Text>
          </Pressable>
          <Pressable testID="nutri-tab-supps" onPress={() => setTab("supps")} style={[styles.tab, tab === "supps" && styles.tabOn]}>
            <Text style={[styles.tabText, tab === "supps" && styles.tabTextOn]}>SUPPLEMENTS</Text>
          </Pressable>
        </View>

        {tab === "macros" ? (
          <>
            <View style={styles.grid}>
              {FIELDS.map((f) => (
                <View key={f.key} style={styles.cell}>
                  <Text style={styles.label}>{f.label}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      testID={`nutri-${f.key}`}
                      value={vals[f.key]}
                      onChangeText={(t) => set(f.key, t)}
                      keyboardType={f.kb}
                      placeholder="0"
                      placeholderTextColor={colors.textDim}
                      style={styles.input}
                      maxLength={f.key === "calories" ? 5 : 4}
                    />
                    <Text style={styles.unit}>{f.unit}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Pressable testID="nutri-save" onPress={save} disabled={busy} style={[styles.saveBtn, saved && styles.savedBtn]}>
              <Text style={[styles.saveText, saved && { color: "#050508" }]}>{saved ? "SAVED ✓" : busy ? "SAVING..." : "LOG TODAY'S MACROS"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {supps.length === 0 ? (
              <Text style={styles.emptySupp}>No supplements tracked yet. Add what you take below.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {supps.map((s) => (
                  <Pressable key={s} testID={`supp-chip-${s}`} onPress={() => toggleSupp(s)} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                    <Text style={styles.chipX}>  ✕</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable testID="supp-add" onPress={() => setPickerOpen((o) => !o)} style={styles.addSuppBtn}>
              <Text style={styles.addSuppText}>{pickerOpen ? "▲ CLOSE LIST" : "＋ ADD SUPPLEMENT"}</Text>
            </Pressable>
            {pickerOpen && (
              <View style={styles.dropdown}>
                {COMMON_SUPPS.map((name) => {
                  const on = supps.includes(name);
                  return (
                    <Pressable key={name} testID={`supp-opt-${name}`} onPress={() => toggleSupp(name)} style={styles.optRow}>
                      <Text style={[styles.optText, on && { color: colors.success, fontWeight: "800" }]}>{name}</Text>
                      <Text style={[styles.optCheck, on && { color: colors.success }]}>{on ? "✓" : "＋"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: { width: "47%", flexGrow: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  label: { color: colors.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: "800" },
  inputRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  input: { flex: 1, color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"], padding: 0 },
  unit: { color: colors.textDim, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  saveBtn: { marginTop: spacing.md, paddingVertical: 13, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success },
  savedBtn: { backgroundColor: colors.success, borderColor: colors.success },
  saveText: { color: colors.success, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  tabOn: { borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.12)" },
  tabText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1.5, fontSize: 10 },
  tabTextOn: { color: colors.success },
  emptySupp: { color: colors.textDim, fontSize: 12, lineHeight: 18, paddingVertical: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.1)" },
  chipText: { color: colors.success, fontWeight: "800", fontSize: 12 },
  chipX: { color: colors.success, fontWeight: "900", fontSize: 12 },
  addSuppBtn: { marginTop: spacing.md, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  addSuppText: { color: colors.text, fontWeight: "900", letterSpacing: 1.5, fontSize: 11 },
  dropdown: { marginTop: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, overflow: "hidden" },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  optText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  optCheck: { color: colors.textDim, fontSize: 16, fontWeight: "900" },
});
