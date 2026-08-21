import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const DONE_KEY = "diet_primer_done_v1";
const PREF_KEY = "hic_diet_pref";

const OPTS: { key: "normal" | "veg" | "keto"; icon: string; title: string; sub: string }[] = [
  { key: "normal", icon: "🍽", title: "NORMAL", sub: "Everything's on the menu" },
  { key: "veg", icon: "🥗", title: "VEGETARIAN", sub: "No meat or fish" },
  { key: "keto", icon: "🥑", title: "KETO", sub: "Low-carb, high-fat" },
];

// One-time diet question shown to a member the first time they use the app.
// Saves their choice locally so the Diet & Health food picker filters to it.
export function DietPrimer() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try { if (!(await AsyncStorage.getItem(DONE_KEY))) setVisible(true); } catch {}
    })();
  }, [user]);

  const choose = async (k: "normal" | "veg" | "keto") => {
    try {
      await AsyncStorage.setItem(PREF_KEY, k);
      await AsyncStorage.setItem(DONE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>WELCOME, ATHLETE</Text>
          <Text style={styles.title}>WHAT'S YOUR DIET?</Text>
          <Text style={styles.sub}>We'll tailor the food tracker to foods that fit you. You can change this anytime in Settings.</Text>
          {OPTS.map((o) => (
            <Pressable key={o.key} testID={`diet-primer-${o.key}`} onPress={() => choose(o.key)} style={styles.opt}>
              <Text style={styles.optIcon}>{o.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>{o.title}</Text>
                <Text style={styles.optSub}>{o.sub}</Text>
              </View>
              <Text style={styles.optArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 440, backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 3, textAlign: "center" },
  title: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  sub: { color: colors.textMid, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
  opt: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  optIcon: { fontSize: 26 },
  optTitle: { color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  optSub: { color: colors.textDim, fontSize: 12, marginTop: 2, fontWeight: "600" },
  optArrow: { color: colors.brandPrimary, fontSize: 26, fontWeight: "900" },
});
