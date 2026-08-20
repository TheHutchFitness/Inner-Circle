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

// Common foods with per-serving macros — tapping one adds its macros to today's totals.
const FOODS: { name: string; serving: string; calories: number; protein: number; carbs: number; fats: number }[] = [
  { name: "Chicken Breast", serving: "6 oz", calories: 280, protein: 52, carbs: 0, fats: 6 },
  { name: "Ground Beef 85/15", serving: "6 oz", calories: 340, protein: 46, carbs: 0, fats: 17 },
  { name: "Salmon", serving: "6 oz", calories: 350, protein: 40, carbs: 0, fats: 20 },
  { name: "Ribeye Steak", serving: "8 oz", calories: 560, protein: 50, carbs: 0, fats: 40 },
  { name: "Whole Eggs", serving: "3 large", calories: 210, protein: 18, carbs: 2, fats: 15 },
  { name: "Egg Whites", serving: "1 cup", calories: 125, protein: 26, carbs: 2, fats: 0 },
  { name: "Whey Protein", serving: "1 scoop", calories: 120, protein: 25, carbs: 3, fats: 2 },
  { name: "Greek Yogurt (nonfat)", serving: "1 cup", calories: 130, protein: 22, carbs: 9, fats: 0 },
  { name: "White Rice (cooked)", serving: "1 cup", calories: 205, protein: 4, carbs: 45, fats: 0 },
  { name: "Brown Rice (cooked)", serving: "1 cup", calories: 215, protein: 5, carbs: 45, fats: 2 },
  { name: "Oats (dry)", serving: "1/2 cup", calories: 150, protein: 5, carbs: 27, fats: 3 },
  { name: "Sweet Potato", serving: "1 medium", calories: 115, protein: 2, carbs: 27, fats: 0 },
  { name: "White Potato", serving: "1 medium", calories: 160, protein: 4, carbs: 37, fats: 0 },
  { name: "Banana", serving: "1 medium", calories: 105, protein: 1, carbs: 27, fats: 0 },
  { name: "Apple", serving: "1 medium", calories: 95, protein: 0, carbs: 25, fats: 0 },
  { name: "Peanut Butter", serving: "2 tbsp", calories: 190, protein: 8, carbs: 6, fats: 16 },
  { name: "Almonds", serving: "1 oz", calories: 165, protein: 6, carbs: 6, fats: 14 },
  { name: "Avocado", serving: "1/2", calories: 120, protein: 1, carbs: 6, fats: 11 },
  { name: "Olive Oil", serving: "1 tbsp", calories: 120, protein: 0, carbs: 0, fats: 14 },
  { name: "Whole Wheat Bread", serving: "2 slices", calories: 160, protein: 8, carbs: 28, fats: 2 },
  { name: "Broccoli", serving: "1 cup", calories: 55, protein: 4, carbs: 11, fats: 0 },
  { name: "Tuna (canned)", serving: "1 can", calories: 120, protein: 27, carbs: 0, fats: 1 },
  { name: "Cottage Cheese", serving: "1 cup", calories: 180, protein: 25, carbs: 8, fats: 5 },
  { name: "Protein Bar", serving: "1 bar", calories: 220, protein: 20, carbs: 22, fats: 8 },
  { name: "Turkey Breast", serving: "6 oz", calories: 240, protein: 50, carbs: 0, fats: 3 },
  { name: "Pork Chop", serving: "6 oz", calories: 340, protein: 46, carbs: 0, fats: 16 },
  { name: "Tilapia", serving: "6 oz", calories: 220, protein: 44, carbs: 0, fats: 4 },
  { name: "Shrimp", serving: "6 oz", calories: 170, protein: 36, carbs: 2, fats: 2 },
  { name: "Bacon", serving: "3 slices", calories: 160, protein: 12, carbs: 0, fats: 12 },
  { name: "Pasta (cooked)", serving: "1 cup", calories: 220, protein: 8, carbs: 43, fats: 1 },
  { name: "Quinoa (cooked)", serving: "1 cup", calories: 220, protein: 8, carbs: 39, fats: 4 },
  { name: "Black Beans", serving: "1 cup", calories: 227, protein: 15, carbs: 41, fats: 1 },
  { name: "Lentils (cooked)", serving: "1 cup", calories: 230, protein: 18, carbs: 40, fats: 1 },
  { name: "Chickpeas", serving: "1 cup", calories: 270, protein: 15, carbs: 45, fats: 4 },
  { name: "Bagel", serving: "1 whole", calories: 250, protein: 10, carbs: 49, fats: 2 },
  { name: "Tortilla (flour)", serving: "1 large", calories: 150, protein: 4, carbs: 26, fats: 4 },
  { name: "Cheddar Cheese", serving: "1 oz", calories: 115, protein: 7, carbs: 1, fats: 9 },
  { name: "Whole Milk", serving: "1 cup", calories: 150, protein: 8, carbs: 12, fats: 8 },
  { name: "Skim Milk", serving: "1 cup", calories: 90, protein: 8, carbs: 12, fats: 0 },
  { name: "Orange Juice", serving: "1 cup", calories: 110, protein: 2, carbs: 26, fats: 0 },
  { name: "Blueberries", serving: "1 cup", calories: 85, protein: 1, carbs: 21, fats: 0 },
  { name: "Strawberries", serving: "1 cup", calories: 50, protein: 1, carbs: 12, fats: 0 },
  { name: "Spinach", serving: "2 cups", calories: 14, protein: 2, carbs: 2, fats: 0 },
  { name: "Mixed Nuts", serving: "1 oz", calories: 170, protein: 5, carbs: 6, fats: 15 },
  { name: "Walnuts", serving: "1 oz", calories: 185, protein: 4, carbs: 4, fats: 18 },
  { name: "Cashews", serving: "1 oz", calories: 155, protein: 5, carbs: 9, fats: 12 },
  { name: "Dark Chocolate", serving: "1 oz", calories: 170, protein: 2, carbs: 13, fats: 12 },
  { name: "Rice Cakes", serving: "2 cakes", calories: 70, protein: 1, carbs: 15, fats: 0 },
  { name: "Hummus", serving: "2 tbsp", calories: 70, protein: 2, carbs: 6, fats: 5 },
  { name: "Beef Jerky", serving: "1 oz", calories: 80, protein: 13, carbs: 5, fats: 1 },
  { name: "Mass Gainer", serving: "1 scoop", calories: 640, protein: 32, carbs: 110, fats: 8 },
  { name: "Casein Protein", serving: "1 scoop", calories: 120, protein: 24, carbs: 4, fats: 1 },
  { name: "Honey", serving: "1 tbsp", calories: 64, protein: 0, carbs: 17, fats: 0 },
  { name: "Pizza (cheese)", serving: "1 slice", calories: 285, protein: 12, carbs: 36, fats: 10 },
  { name: "Cheeseburger", serving: "1 whole", calories: 300, protein: 15, carbs: 30, fats: 14 },
];

export function NutritionCard() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"macros" | "supps">("macros");
  const [vals, setVals] = useState<Record<string, string>>({ calories: "", protein: "", carbs: "", fats: "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supps, setSupps] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [lastFood, setLastFood] = useState<string | null>(null);

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

  const addFood = (f: typeof FOODS[number]) => {
    setVals((v) => ({
      calories: String((parseInt(v.calories || "0", 10) || 0) + f.calories),
      protein: String((parseInt(v.protein || "0", 10) || 0) + f.protein),
      carbs: String((parseInt(v.carbs || "0", 10) || 0) + f.carbs),
      fats: String((parseInt(v.fats || "0", 10) || 0) + f.fats),
    }));
    setLastFood(f.name);
    setSaved(false);
  };

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
            <Pressable testID="food-add" onPress={() => setFoodOpen((o) => !o)} style={styles.addFoodBtn}>
              <Text style={styles.addFoodText}>{foodOpen ? "▲ CLOSE FOOD LIST" : "🍽 ADD A FOOD (AUTO-FILLS MACROS)"}</Text>
            </Pressable>
            {lastFood && !foodOpen && <Text style={styles.lastFood}>Added {lastFood} ✓ — totals updated</Text>}
            {foodOpen && (
              <View style={styles.foodDropdown}>
                {FOODS.map((f) => (
                  <Pressable key={f.name} testID={`food-opt-${f.name}`} onPress={() => addFood(f)} style={styles.foodRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName}>{f.name}</Text>
                      <Text style={styles.foodMeta}>{f.serving} · {f.calories} kcal · {f.protein}p / {f.carbs}c / {f.fats}f</Text>
                    </View>
                    <Text style={styles.foodAdd}>＋</Text>
                  </Pressable>
                ))}
              </View>
            )}
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
  addFoodBtn: { marginTop: spacing.md, paddingVertical: 11, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.08)" },
  addFoodText: { color: colors.success, fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  lastFood: { color: colors.success, fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 6 },
  foodDropdown: { marginTop: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, overflow: "hidden" },
  foodRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  foodName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  foodMeta: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  foodAdd: { color: colors.success, fontSize: 20, fontWeight: "900", paddingLeft: 10 },
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
