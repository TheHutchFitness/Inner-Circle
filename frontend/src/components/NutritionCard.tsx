import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { HudSectionHeader } from "@/src/components/Hud";
import { MacroRing } from "@/src/components/MacroRing";

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
// All foods standardized to GRAMS. `grams` is the default serving size; macros are
// for that gram amount. Quantity (in grams) scales them linearly.
const FOODS: { name: string; serving: string; grams: number; calories: number; protein: number; carbs: number; fats: number }[] = [
  { name: "Chicken Breast", serving: "≈6 oz", grams: 170, calories: 280, protein: 52, carbs: 0, fats: 6 },
  { name: "Ground Beef 85/15", serving: "≈6 oz", grams: 170, calories: 340, protein: 46, carbs: 0, fats: 17 },
  { name: "Salmon", serving: "≈6 oz", grams: 170, calories: 350, protein: 40, carbs: 0, fats: 20 },
  { name: "Ribeye Steak", serving: "≈8 oz", grams: 227, calories: 560, protein: 50, carbs: 0, fats: 40 },
  { name: "Whole Eggs", serving: "≈3 large", grams: 150, calories: 210, protein: 18, carbs: 2, fats: 15 },
  { name: "Egg Whites", serving: "≈1 cup", grams: 240, calories: 125, protein: 26, carbs: 2, fats: 0 },
  { name: "Whey Protein", serving: "≈1 scoop", grams: 32, calories: 120, protein: 25, carbs: 3, fats: 2 },
  { name: "Greek Yogurt (nonfat)", serving: "≈1 cup", grams: 245, calories: 130, protein: 22, carbs: 9, fats: 0 },
  { name: "White Rice (cooked)", serving: "≈1 cup", grams: 158, calories: 205, protein: 4, carbs: 45, fats: 0 },
  { name: "Brown Rice (cooked)", serving: "≈1 cup", grams: 195, calories: 215, protein: 5, carbs: 45, fats: 2 },
  { name: "Oats (dry)", serving: "≈1/2 cup", grams: 40, calories: 150, protein: 5, carbs: 27, fats: 3 },
  { name: "Sweet Potato", serving: "≈1 medium", grams: 130, calories: 115, protein: 2, carbs: 27, fats: 0 },
  { name: "White Potato", serving: "≈1 medium", grams: 170, calories: 160, protein: 4, carbs: 37, fats: 0 },
  { name: "Banana", serving: "≈1 medium", grams: 118, calories: 105, protein: 1, carbs: 27, fats: 0 },
  { name: "Apple", serving: "≈1 medium", grams: 180, calories: 95, protein: 0, carbs: 25, fats: 0 },
  { name: "Peanut Butter", serving: "≈2 tbsp", grams: 32, calories: 190, protein: 8, carbs: 6, fats: 16 },
  { name: "Almonds", serving: "≈1 oz", grams: 28, calories: 165, protein: 6, carbs: 6, fats: 14 },
  { name: "Avocado", serving: "≈1/2", grams: 100, calories: 120, protein: 1, carbs: 6, fats: 11 },
  { name: "Olive Oil", serving: "≈1 tbsp", grams: 14, calories: 120, protein: 0, carbs: 0, fats: 14 },
  { name: "Whole Wheat Bread", serving: "≈2 slices", grams: 56, calories: 160, protein: 8, carbs: 28, fats: 2 },
  { name: "Broccoli", serving: "≈1 cup", grams: 90, calories: 55, protein: 4, carbs: 11, fats: 0 },
  { name: "Tuna (canned)", serving: "≈1 can", grams: 140, calories: 120, protein: 27, carbs: 0, fats: 1 },
  { name: "Cottage Cheese", serving: "≈1 cup", grams: 226, calories: 180, protein: 25, carbs: 8, fats: 5 },
  { name: "Protein Bar", serving: "≈1 bar", grams: 60, calories: 220, protein: 20, carbs: 22, fats: 8 },
  { name: "Turkey Breast", serving: "≈6 oz", grams: 170, calories: 240, protein: 50, carbs: 0, fats: 3 },
  { name: "Pork Chop", serving: "≈6 oz", grams: 170, calories: 340, protein: 46, carbs: 0, fats: 16 },
  { name: "Tilapia", serving: "≈6 oz", grams: 170, calories: 220, protein: 44, carbs: 0, fats: 4 },
  { name: "Shrimp", serving: "≈6 oz", grams: 170, calories: 170, protein: 36, carbs: 2, fats: 2 },
  { name: "Bacon", serving: "≈3 slices", grams: 24, calories: 160, protein: 12, carbs: 0, fats: 12 },
  { name: "Pasta (cooked)", serving: "≈1 cup", grams: 140, calories: 220, protein: 8, carbs: 43, fats: 1 },
  { name: "Quinoa (cooked)", serving: "≈1 cup", grams: 185, calories: 220, protein: 8, carbs: 39, fats: 4 },
  { name: "Black Beans", serving: "≈1 cup", grams: 172, calories: 227, protein: 15, carbs: 41, fats: 1 },
  { name: "Lentils (cooked)", serving: "≈1 cup", grams: 198, calories: 230, protein: 18, carbs: 40, fats: 1 },
  { name: "Chickpeas", serving: "≈1 cup", grams: 164, calories: 270, protein: 15, carbs: 45, fats: 4 },
  { name: "Bagel", serving: "≈1 whole", grams: 100, calories: 250, protein: 10, carbs: 49, fats: 2 },
  { name: "Tortilla (flour)", serving: "≈1 large", grams: 50, calories: 150, protein: 4, carbs: 26, fats: 4 },
  { name: "Cheddar Cheese", serving: "≈1 oz", grams: 28, calories: 115, protein: 7, carbs: 1, fats: 9 },
  { name: "Whole Milk", serving: "≈1 cup", grams: 244, calories: 150, protein: 8, carbs: 12, fats: 8 },
  { name: "Skim Milk", serving: "≈1 cup", grams: 245, calories: 90, protein: 8, carbs: 12, fats: 0 },
  { name: "Orange Juice", serving: "≈1 cup", grams: 248, calories: 110, protein: 2, carbs: 26, fats: 0 },
  { name: "Blueberries", serving: "≈1 cup", grams: 148, calories: 85, protein: 1, carbs: 21, fats: 0 },
  { name: "Strawberries", serving: "≈1 cup", grams: 152, calories: 50, protein: 1, carbs: 12, fats: 0 },
  { name: "Spinach", serving: "≈2 cups", grams: 60, calories: 14, protein: 2, carbs: 2, fats: 0 },
  { name: "Mixed Nuts", serving: "≈1 oz", grams: 28, calories: 170, protein: 5, carbs: 6, fats: 15 },
  { name: "Walnuts", serving: "≈1 oz", grams: 28, calories: 185, protein: 4, carbs: 4, fats: 18 },
  { name: "Cashews", serving: "≈1 oz", grams: 28, calories: 155, protein: 5, carbs: 9, fats: 12 },
  { name: "Dark Chocolate", serving: "≈1 oz", grams: 28, calories: 170, protein: 2, carbs: 13, fats: 12 },
  { name: "Rice Cakes", serving: "≈2 cakes", grams: 18, calories: 70, protein: 1, carbs: 15, fats: 0 },
  { name: "Hummus", serving: "≈2 tbsp", grams: 30, calories: 70, protein: 2, carbs: 6, fats: 5 },
  { name: "Beef Jerky", serving: "≈1 oz", grams: 28, calories: 80, protein: 13, carbs: 5, fats: 1 },
  { name: "Mass Gainer", serving: "≈1 scoop", grams: 165, calories: 640, protein: 32, carbs: 110, fats: 8 },
  { name: "Casein Protein", serving: "≈1 scoop", grams: 33, calories: 120, protein: 24, carbs: 4, fats: 1 },
  { name: "Honey", serving: "≈1 tbsp", grams: 21, calories: 64, protein: 0, carbs: 17, fats: 0 },
  { name: "Pizza (cheese)", serving: "≈1 slice", grams: 107, calories: 285, protein: 12, carbs: 36, fats: 10 },
  { name: "Cheeseburger", serving: "≈1 whole", grams: 110, calories: 300, protein: 15, carbs: 30, fats: 14 },
];


const RECENT_KEY = "hic_recent_foods";
type RecentFood = { name: string; grams: number; calories: number; protein: number; carbs: number; fats: number };

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
  const [foodQuery, setFoodQuery] = useState("");
  const [foodQty, setFoodQty] = useState<Record<string, number>>({});
  const [meals, setMeals] = useState<any[]>([]);
  const [mealNameOpen, setMealNameOpen] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealMult, setMealMult] = useState<Record<string, number>>({});
  const [customFoods, setCustomFoods] = useState<any[]>([]);
  const [goals, setGoals] = useState<{ calories: number; protein: number }>({ calories: 0, protein: 0 });
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalCal, setGoalCal] = useState("");
  const [goalPro, setGoalPro] = useState("");
  const [cfOpen, setCfOpen] = useState(false);
  const [cf, setCf] = useState({ name: "", grams: "", calories: "", protein: "", carbs: "", fats: "" });
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [water, setWater] = useState(0);
  const [waterGoal, setWaterGoal] = useState(3000);
  const [goalWater, setGoalWater] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(token, "/api/nutrition/today");
        setVals({ calories: String(r.calories || ""), protein: String(r.protein || ""), carbs: String(r.carbs || ""), fats: String(r.fats || "") });
        setWater(r.water_ml || 0);
      } catch {}
      try { const s = await apiFetch(token, "/api/supplements"); setSupps(s.supplements || []); } catch {}
      try { const m = await apiFetch(token, "/api/nutrition/meals"); setMeals(m.meals || []); } catch {}
      try { const cfd = await apiFetch(token, "/api/nutrition/foods"); setCustomFoods(cfd.foods || []); } catch {}
      try { const g = await apiFetch(token, "/api/nutrition/goals"); setGoals({ calories: g.calories || 0, protein: g.protein || 0 }); setGoalCal(g.calories ? String(g.calories) : ""); setGoalPro(g.protein ? String(g.protein) : ""); setWaterGoal(g.water_goal || 3000); setGoalWater(String(g.water_goal || 3000)); } catch {}
      try { const raw = await AsyncStorage.getItem(RECENT_KEY); if (raw) setRecents(JSON.parse(raw)); } catch {}
    })();
  }, [token]);

  const pushRecent = (item: RecentFood) => {
    setRecents((prev) => {
      const next = [item, ...prev.filter((r) => r.name !== item.name)].slice(0, 8);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const addRecent = (r: RecentFood) => {
    setVals((v) => ({
      calories: String((parseInt(v.calories || "0", 10) || 0) + r.calories),
      protein: String((parseInt(v.protein || "0", 10) || 0) + r.protein),
      carbs: String((parseInt(v.carbs || "0", 10) || 0) + r.carbs),
      fats: String((parseInt(v.fats || "0", 10) || 0) + r.fats),
    }));
    setLastFood(`${r.grams} g ${r.name}`);
    setSaved(false);
    pushRecent(r);
  };

  const set = (k: string, t: string) => { setVals((v) => ({ ...v, [k]: t.replace(/[^0-9]/g, "") })); setSaved(false); };

  const addFood = (f: typeof FOODS[number]) => {
    const grams = foodQty[f.name] ?? f.grams;
    const factor = grams / f.grams;
    const scaled = {
      name: f.name, grams,
      calories: Math.round(f.calories * factor),
      protein: Math.round(f.protein * factor),
      carbs: Math.round(f.carbs * factor),
      fats: Math.round(f.fats * factor),
    };
    setVals((v) => ({
      calories: String((parseInt(v.calories || "0", 10) || 0) + scaled.calories),
      protein: String((parseInt(v.protein || "0", 10) || 0) + scaled.protein),
      carbs: String((parseInt(v.carbs || "0", 10) || 0) + scaled.carbs),
      fats: String((parseInt(v.fats || "0", 10) || 0) + scaled.fats),
    }));
    setLastFood(`${grams} g ${f.name}`);
    setSaved(false);
    pushRecent(scaled);
  };

  const bumpQty = (f: typeof FOODS[number], delta: number) =>
    setFoodQty((q) => ({ ...q, [f.name]: Math.max(5, (q[f.name] ?? f.grams) + delta) }));

  const addMeal = (m: any) => {
    const mult = mealMult[m.id] ?? 1;
    setVals((v) => ({
      calories: String((parseInt(v.calories || "0", 10) || 0) + Math.round((m.calories || 0) * mult)),
      protein: String((parseInt(v.protein || "0", 10) || 0) + Math.round((m.protein || 0) * mult)),
      carbs: String((parseInt(v.carbs || "0", 10) || 0) + Math.round((m.carbs || 0) * mult)),
      fats: String((parseInt(v.fats || "0", 10) || 0) + Math.round((m.fats || 0) * mult)),
    }));
    setLastFood(`${mult}× ${m.name}`);
    setSaved(false);
  };

  const bumpMult = (id: string, delta: number) =>
    setMealMult((mm) => ({ ...mm, [id]: Math.max(0.5, Math.round(((mm[id] ?? 1) + delta) * 2) / 2) }));

  const saveGoals = async () => {
    const wg = parseInt(goalWater || "0", 10) || 0;
    const g = { calories: parseInt(goalCal || "0", 10) || 0, protein: parseInt(goalPro || "0", 10) || 0 };
    setGoals(g);
    setWaterGoal(wg);
    setGoalsOpen(false);
    try { await apiFetch(token, "/api/nutrition/goals", { method: "POST", body: JSON.stringify({ ...g, water_goal: wg }) }); } catch {}
  };

  const addWater = (delta: number) => {
    const next = Math.max(0, Math.min(20000, water + delta));
    setWater(next);
    apiFetch(token, "/api/nutrition/water", { method: "POST", body: JSON.stringify({ ml: next }) }).catch(() => {});
  };

  const addCustomFood = async () => {
    if (!cf.name.trim()) return;
    try {
      const created = await apiFetch(token, "/api/nutrition/foods", {
        method: "POST",
        body: JSON.stringify({
          name: cf.name.trim(),
          grams: parseInt(cf.grams || "100", 10) || 100,
          calories: parseInt(cf.calories || "0", 10) || 0,
          protein: parseInt(cf.protein || "0", 10) || 0,
          carbs: parseInt(cf.carbs || "0", 10) || 0,
          fats: parseInt(cf.fats || "0", 10) || 0,
        }),
      });
      setCustomFoods((cs) => [created, ...cs]);
      setCf({ name: "", grams: "", calories: "", protein: "", carbs: "", fats: "" });
      setCfOpen(false);
    } catch {}
  };

  const deleteCustomFood = async (id: string) => {
    setCustomFoods((cs) => cs.filter((c) => c.id !== id));
    try { await apiFetch(token, `/api/nutrition/foods/${id}`, { method: "DELETE" }); } catch {}
  };

  const saveMeal = async () => {
    const name = mealName.trim();
    if (!name) return;
    try {
      const m = await apiFetch(token, "/api/nutrition/meals", {
        method: "POST",
        body: JSON.stringify({
          name,
          calories: parseInt(vals.calories || "0", 10),
          protein: parseInt(vals.protein || "0", 10),
          carbs: parseInt(vals.carbs || "0", 10),
          fats: parseInt(vals.fats || "0", 10),
        }),
      });
      setMeals((ms) => [...ms, m]);
      setMealName("");
      setMealNameOpen(false);
    } catch {}
  };

  const deleteMeal = async (id: string) => {
    setMeals((ms) => ms.filter((m) => m.id !== id));
    try { await apiFetch(token, `/api/nutrition/meals/${id}`, { method: "DELETE" }); } catch {}
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
            <View style={styles.goalsBox}>
              <View style={styles.ringsRow}>
                <MacroRing label="CALORIES" value={parseInt(vals.calories || "0", 10) || 0} goal={goals.calories} unit="kcal" color={colors.success} />
                <MacroRing label="PROTEIN" value={parseInt(vals.protein || "0", 10) || 0} goal={goals.protein} unit="g" color={colors.brandPrimary} />
              </View>
              {goalsOpen ? (
                <View style={styles.goalEditRow}>
                  <TextInput testID="goal-calories" value={goalCal} onChangeText={(t) => setGoalCal(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="cal goal" placeholderTextColor={colors.textDim} style={styles.goalInput} maxLength={5} />
                  <TextInput testID="goal-protein" value={goalPro} onChangeText={(t) => setGoalPro(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="protein g" placeholderTextColor={colors.textDim} style={styles.goalInput} maxLength={4} />
                  <TextInput testID="goal-water" value={goalWater} onChangeText={(t) => setGoalWater(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="water ml" placeholderTextColor={colors.textDim} style={styles.goalInput} maxLength={5} />
                  <Pressable testID="goal-save" onPress={saveGoals} style={styles.goalSaveBtn}><Text style={styles.goalSaveText}>SET</Text></Pressable>
                </View>
              ) : (
                <Pressable testID="goal-edit" onPress={() => setGoalsOpen(true)} style={styles.goalEditToggle}>
                  <Text style={styles.goalEditText}>🎯 {goals.calories || goals.protein ? "EDIT DAILY GOALS" : "SET DAILY GOALS"}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.waterBox}>
              <MacroRing label="WATER" value={water} goal={waterGoal} unit="ml" color="#38BDF8" size={72} />
              <View style={styles.waterRight}>
                <Text style={styles.waterHint}>💧 {(water / 1000).toFixed(2)} L{waterGoal ? ` of ${(waterGoal / 1000).toFixed(1)} L` : ""}</Text>
                <View style={styles.waterBtns}>
                  <Pressable testID="water-plus-250" onPress={() => addWater(250)} style={styles.waterBtn}><Text style={styles.waterBtnT}>＋250</Text></Pressable>
                  <Pressable testID="water-plus-500" onPress={() => addWater(500)} style={styles.waterBtn}><Text style={styles.waterBtnT}>＋500</Text></Pressable>
                  <Pressable testID="water-minus-250" onPress={() => addWater(-250)} style={styles.waterBtnDim}><Text style={styles.waterBtnDimT}>−250</Text></Pressable>
                </View>
              </View>
            </View>
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
            {meals.length > 0 && (
              <View style={styles.mealsWrap}>
                <Text style={styles.mealsLabel}>MY MEALS · set portion & tap to log</Text>
                <View style={{ gap: spacing.sm }}>
                  {meals.map((m) => {
                    const mult = mealMult[m.id] ?? 1;
                    return (
                      <View key={m.id} style={styles.mealRow}>
                        <Pressable testID={`meal-add-${m.id}`} onPress={() => addMeal(m)} hitSlop={4} style={{ flex: 1 }}>
                          <Text style={styles.mealRowName} numberOfLines={1}>{m.name}</Text>
                          <Text style={styles.mealRowMeta}>{Math.round(m.calories * mult)} kcal · {Math.round(m.protein * mult)}p · tap to log</Text>
                        </Pressable>
                        <View style={styles.qtyRow}>
                          <Pressable testID={`meal-minus-${m.id}`} onPress={() => bumpMult(m.id, -0.5)} hitSlop={6} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>−</Text></Pressable>
                          <Text style={styles.qtyVal}>×{mult}</Text>
                          <Pressable testID={`meal-plus-${m.id}`} onPress={() => bumpMult(m.id, 0.5)} hitSlop={6} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>＋</Text></Pressable>
                        </View>
                        <Pressable testID={`meal-del-${m.id}`} onPress={() => deleteMeal(m.id)} hitSlop={8}>
                          <Text style={styles.mealChipX}>✕</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
            {mealNameOpen ? (
              <View style={styles.mealSaveRow}>
                <TextInput
                  testID="meal-name-input"
                  value={mealName}
                  onChangeText={setMealName}
                  placeholder="Name this meal…"
                  placeholderTextColor={colors.textDim}
                  style={styles.mealNameInput}
                  maxLength={40}
                />
                <Pressable testID="meal-save-confirm" onPress={saveMeal} style={styles.mealSaveBtn}>
                  <Text style={styles.mealSaveText}>SAVE</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable testID="meal-save" onPress={() => setMealNameOpen(true)} style={styles.mealSaveToggle}>
                <Text style={styles.mealSaveToggleText}>★ SAVE CURRENT AS A MEAL</Text>
              </Pressable>
            )}
            {recents.length > 0 && (
              <View style={styles.recentWrap}>
                <Text style={styles.recentLabel}>⏱ RECENT · tap to log again</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
                  {recents.map((r) => (
                    <Pressable key={r.name} testID={`recent-food-${r.name}`} onPress={() => addRecent(r)} style={styles.recentChip}>
                      <Text style={styles.recentChipName} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.recentChipMeta}>{r.grams}g · {r.calories} kcal</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <Pressable testID="food-add" onPress={() => setFoodOpen((o) => !o)} style={styles.addFoodBtn}>
              <Text style={styles.addFoodText}>{foodOpen ? "▲ CLOSE FOOD LIST" : "🍽 ADD A FOOD (AUTO-FILLS MACROS)"}</Text>
            </Pressable>
            {lastFood && !foodOpen && <Text style={styles.lastFood}>Added {lastFood} ✓ — totals updated</Text>}
            {foodOpen && (
              <View style={styles.foodDropdown}>
                <TextInput
                  testID="food-search"
                  value={foodQuery}
                  onChangeText={setFoodQuery}
                  placeholder="Search foods…"
                  placeholderTextColor={colors.textDim}
                  style={styles.foodSearch}
                  autoCapitalize="none"
                />
                {cfOpen ? (
                  <View style={styles.cfForm}>
                    <TextInput testID="cf-name" value={cf.name} onChangeText={(t) => setCf((s) => ({ ...s, name: t }))} placeholder="Food name" placeholderTextColor={colors.textDim} style={styles.cfName} maxLength={40} />
                    <View style={styles.cfGrid}>
                      {(["grams", "calories", "protein", "carbs", "fats"] as const).map((k) => (
                        <TextInput key={k} testID={`cf-${k}`} value={(cf as any)[k]} onChangeText={(t) => setCf((s) => ({ ...s, [k]: t.replace(/[^0-9]/g, "") }))} keyboardType="number-pad" placeholder={k === "grams" ? "grams" : k.slice(0, 4)} placeholderTextColor={colors.textDim} style={styles.cfInput} maxLength={5} />
                      ))}
                    </View>
                    <Pressable testID="cf-save" onPress={addCustomFood} style={styles.cfSaveBtn}><Text style={styles.cfSaveText}>SAVE FOOD</Text></Pressable>
                  </View>
                ) : (
                  <Pressable testID="cf-add" onPress={() => setCfOpen(true)} style={styles.cfToggle}><Text style={styles.cfToggleText}>＋ ADD CUSTOM FOOD</Text></Pressable>
                )}
                {[...customFoods.map((c) => ({ ...c, custom: true, serving: "custom" })), ...FOODS].filter((f) => !foodQuery.trim() || f.name.toLowerCase().includes(foodQuery.trim().toLowerCase())).map((f) => {
                  const g = foodQty[f.name] ?? f.grams;
                  const fac = g / f.grams;
                  return (
                    <View key={(f.custom ? "c_" : "") + f.name} style={styles.foodRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.foodName}>{f.custom ? "★ " : ""}{f.name}</Text>
                        <Text style={styles.foodMeta}>{f.serving} · {Math.round(f.calories * fac)} kcal · {Math.round(f.protein * fac)}p / {Math.round(f.carbs * fac)}c / {Math.round(f.fats * fac)}f</Text>
                      </View>
                      <View style={styles.qtyRow}>
                        <Pressable testID={`food-minus-${f.name}`} onPress={() => bumpQty(f, -25)} hitSlop={6} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>−</Text></Pressable>
                        <Text style={styles.qtyVal}>{g}g</Text>
                        <Pressable testID={`food-plus-${f.name}`} onPress={() => bumpQty(f, 25)} hitSlop={6} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>＋</Text></Pressable>
                      </View>
                      <Pressable testID={`food-opt-${f.name}`} onPress={() => addFood(f)} hitSlop={6} style={styles.foodAddBtn}>
                        <Text style={styles.foodAdd}>ADD</Text>
                      </Pressable>
                      {f.custom && (
                        <Pressable testID={`cf-del-${f.id}`} onPress={() => deleteCustomFood(f.id)} hitSlop={8} style={{ paddingLeft: 6 }}>
                          <Text style={styles.mealChipX}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
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
  recentWrap: { marginTop: spacing.md },
  recentLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6 },
  recentChip: { backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, paddingVertical: 7, paddingHorizontal: 12, minWidth: 96 },
  recentChipName: { color: colors.success, fontWeight: "800", fontSize: 12 },
  recentChipMeta: { color: colors.textDim, fontSize: 9, marginTop: 2, fontWeight: "700" },
  foodDropdown: { marginTop: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, overflow: "hidden" },
  foodSearch: { color: colors.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  mealsWrap: { marginTop: spacing.md },
  goalsBox: { marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  waterBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: "#38BDF8", backgroundColor: "rgba(56,189,248,0.07)" },
  waterRight: { flex: 1, gap: spacing.sm },
  waterHint: { color: "#7DD3FC", fontSize: 12, fontWeight: "800" },
  waterBtns: { flexDirection: "row", gap: spacing.sm },
  waterBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: "#38BDF8", backgroundColor: "rgba(56,189,248,0.12)" },
  waterBtnT: { color: "#38BDF8", fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  waterBtnDim: { paddingVertical: 9, paddingHorizontal: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  waterBtnDimT: { color: colors.textDim, fontWeight: "900", fontSize: 12 },
  ringsRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.sm },
  goalEditToggle: { paddingVertical: 8, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  goalEditText: { color: colors.text, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  goalEditRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  goalInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13 },
  goalSaveBtn: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.1)" },
  goalSaveText: { color: colors.success, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  mealRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, paddingVertical: 8, paddingHorizontal: 10 },
  mealRowName: { color: colors.warning, fontWeight: "800", fontSize: 13 },
  mealRowMeta: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  cfToggle: { paddingVertical: 9, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  cfToggleText: { color: colors.success, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  cfForm: { padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2, gap: spacing.sm },
  cfName: { backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13 },
  cfGrid: { flexDirection: "row", gap: 6 },
  cfInput: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 6, paddingVertical: 8, fontSize: 12, textAlign: "center" },
  cfSaveBtn: { paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.1)" },
  cfSaveText: { color: colors.success, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  mealsLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6 },
  mealChip: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.08)" },
  mealChipText: { color: colors.warning, fontWeight: "800", fontSize: 12 },
  mealChipX: { color: colors.warning, fontWeight: "900", fontSize: 12 },
  mealSaveToggle: { marginTop: spacing.sm, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.06)" },
  mealSaveToggleText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  mealSaveRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  mealNameInput: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  mealSaveBtn: { paddingHorizontal: spacing.lg, justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.1)" },
  mealSaveText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  foodRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  foodName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  foodMeta: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 6 },
  qtyBtn: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  qtyBtnText: { color: colors.text, fontSize: 14, fontWeight: "900" },
  qtyVal: { color: colors.text, fontSize: 11, fontWeight: "800", minWidth: 38, textAlign: "center", fontVariant: ["tabular-nums"] },
  foodAddBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.1)" },
  foodAdd: { color: colors.success, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
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
