import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const FULL_FEATURES = [
  "RPG quest map & The Journey",
  "Armory skins, weapons & cosmetics",
  "Community chatrooms & The Judge",
  "The Enhanced protocol room",
  "Cosmetic store & avatar drops",
  "Everything in Lite, too",
];
const LITE_FEATURES = [
  "Workout & PR tracking",
  "Cardio, steps & nutrition logs",
  "AI Coach & AI programs",
  "Quests & leaderboards",
  "No cosmetics, store or chatrooms",
  "Clean, distraction-free utility",
];

// First-login screen: pick Lite or Full. Written to the DB via profile/update,
// which sets mode_selected so this only appears once (switchable later in Profile).
export function AppModeIntro() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const [busy, setBusy] = useState<"lite" | "full" | null>(null);

  const choose = async (lite: boolean) => {
    setBusy(lite ? "lite" : "full");
    try {
      await apiFetch(token, "/api/profile/update", {
        method: "PATCH",
        body: JSON.stringify({ lite_mode: lite }),
      });
      await refresh();
    } catch {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>⌁ CHOOSE YOUR EXPERIENCE</Text>
        <Text style={styles.title}>HOW DO YOU WANT{"\n"}TO TRAIN?</Text>
        <Text style={styles.sub}>Pick the version that fits you. You can switch anytime in Profile → App Mode.</Text>

        <Pressable testID="pick-full" disabled={!!busy} onPress={() => choose(false)}>
          <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: colors.brandPrimary }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTag, { color: colors.brandPrimary }]}>◆ FULL EXPERIENCE</Text>
              <Text style={styles.cardTagline}>RECOMMENDED</Text>
            </View>
            <Text style={styles.cardTitle}>THE FULL ARENA</Text>
            <Text style={styles.cardDesc}>The complete game — ranks, quests, armory, cosmetics, chatrooms and every feature.</Text>
            {FULL_FEATURES.map((f) => (
              <View key={f} style={styles.featRow}><Text style={[styles.check, { color: colors.brandPrimary }]}>▸</Text><Text style={styles.featText}>{f}</Text></View>
            ))}
            <View style={[styles.pickBtn, { backgroundColor: colors.brandPrimary }]}>
              {busy === "full" ? <ActivityIndicator color="#001122" /> : <Text style={[styles.pickBtnText, { color: "#001122" }]}>ENTER FULL MODE</Text>}
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable testID="pick-lite" disabled={!!busy} onPress={() => choose(true)}>
          <View style={[styles.card, styles.cardLite]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTag, { color: colors.textMid }]}>▤ LITE · UTILITY</Text>
            </View>
            <Text style={styles.cardTitle}>JUST THE TRACKER</Text>
            <Text style={styles.cardDesc}>Pure tracking. No games, cosmetics, store or chatrooms — just log and progress.</Text>
            {LITE_FEATURES.map((f) => (
              <View key={f} style={styles.featRow}><Text style={[styles.check, { color: colors.textMid }]}>▸</Text><Text style={styles.featText}>{f}</Text></View>
            ))}
            <View style={[styles.pickBtn, styles.pickBtnLite]}>
              {busy === "lite" ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.pickBtnText, { color: colors.text }]}>ENTER LITE MODE</Text>}
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, zIndex: 900, elevation: 900 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "800", marginTop: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, lineHeight: 34 },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { borderRadius: radius.md, borderWidth: 1.5, padding: spacing.lg, marginBottom: spacing.lg },
  cardLite: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTag: { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  cardTagline: { color: colors.warning, fontSize: 9, fontWeight: "900", letterSpacing: 1, backgroundColor: "rgba(245,197,66,0.12)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm },
  cardDesc: { color: colors.textMid, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: spacing.md },
  featRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  check: { fontSize: 12, fontWeight: "900" },
  featText: { color: colors.text, fontSize: 13, flex: 1 },
  pickBtn: { marginTop: spacing.md, paddingVertical: 15, alignItems: "center", borderRadius: radius.sm },
  pickBtnLite: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  pickBtnText: { fontWeight: "900", letterSpacing: 2, fontSize: 14 },
});
