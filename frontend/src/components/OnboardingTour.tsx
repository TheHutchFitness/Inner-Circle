import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { isLite } from "@/src/lib/mode";
import { colors, spacing, radius } from "@/src/lib/theme";

type Step = {
  icon: string;
  tag: string;
  title: string;
  desc: string;
  where: string;
  target: "home" | "train" | "rank" | "quests" | "social" | "me" | "topright";
};

// ---- Full-mode walkthrough: every tab + home rooms + level locks + config ----
const S_HOME: Step = { icon: "◆", tag: "TAB 1 · HOME", title: "YOUR COMMAND CENTER", desc: "Your dashboard — rank, level, XP, streak and quick shortcuts to every room. The card up top tracks your progress as you train.", where: "Bottom bar → HOME", target: "home" };
const S_TRAIN: Step = { icon: "🏋", tag: "TAB 2 · TRAIN", title: "LOG YOUR LIFTS", desc: "Start and log workouts, track your sets and reps, and hit new PRs. Everything you log feeds your rank and the leaderboards.", where: "Bottom bar → TRAIN", target: "train" };
const S_RANK: Step = { icon: "◈", tag: "TAB 3 · RANK", title: "CLIMB THE BOARDS", desc: "Seasonal leaderboards for strength and cardio. See exactly where you stand against the whole Circle and chase the top spots.", where: "Bottom bar → RANK", target: "rank" };
const S_QUESTS: Step = { icon: "❖", tag: "TAB 4 · QUESTS", title: "RUN THE JOURNEY MAP", desc: "Complete quests on your RPG map to earn XP, rank up and unlock milestone rewards. Boss quests drop loot when you crush them.", where: "Bottom bar → QUESTS", target: "quests" };
const S_SOCIAL: Step = { icon: "◍", tag: "TAB 5 · SOCIAL", title: "CHAT & CLANS", desc: "Chat rooms (ALL + your gym) to talk with the Circle, plus GROUPS where you join a clan and battle rivals in monthly challenges.", where: "Bottom bar → SOCIAL", target: "social" };
const S_ME: Step = { icon: "◉", tag: "TAB 6 · ME", title: "PROFILE & ARMORY", desc: "Your player card, combat stats, PRs and badges. Tap THE ARMORY to equip full-body skins and weapons and style your avatar.", where: "Bottom bar → ME", target: "me" };
const S_ROOMS: Step = { icon: "⌂", tag: "ON THE HOME TAB", title: "ROOMS & TOOLS", desc: "Scroll the Home tab for your rooms: Gym Map, Diet & Health (macros + food log), Cardio GPS, the AI Coach, In-Person Coaching and Founders.", where: "HOME → scroll to ROOMS", target: "home" };
const S_LOCKS: Step = { icon: "🔒", tag: "UNLOCKABLES", title: "SOME ROOMS UNLOCK BY RANK", desc: "A few rooms show a 🔒 until you level up: ATHLETE'S CENTER opens at Advanced+, THE ROOM at Elite+, and THE JUDGE for members. Keep training and they'll open automatically.", where: "HOME → rooms marked 🔒", target: "home" };
const S_MODE: Step = { icon: "◆", tag: "TOP-RIGHT SWITCH", title: "LITE vs FULL MODE", desc: "The little pill at the top-right of every screen flips between FULL (games, cosmetics & chat) and LITE (pure tracking, no distractions). Switch whenever you like.", where: "Any screen → top-right pill", target: "topright" };
const S_CONFIG: Step = { icon: "⚙", tag: "SETTINGS", title: "CONFIG & HELP", desc: "Tap ⚙ CONFIG on the ME tab for settings — switch modes, set your gender and macro goals, manage your account, and REPLAY THIS TOUR anytime you need a refresher.", where: "ME → ⚙ CONFIG (top-right)", target: "me" };

// ---- Lite-mode walkthrough: tracking-focused, game rooms hidden ----
const L_HOME: Step = { icon: "◆", tag: "TAB 1 · HOME", title: "YOUR DASHBOARD", desc: "Your home base — level, streak and quick shortcuts to your tracking tools. Everything you need is one tap away.", where: "Bottom bar → HOME", target: "home" };
const L_DIET: Step = { icon: "🥗", tag: "ON THE HOME TAB", title: "DIET & HEALTH", desc: "Log meals and macros from a big food list, save your go-to meals, set daily calorie & protein goals, and track steps and conditioning.", where: "HOME → DIET & HEALTH", target: "home" };
const L_CARDIO: Step = { icon: "🛰", tag: "ON THE HOME TAB", title: "CARDIO GPS", desc: "Track your runs and rides with live pace, distance and elevation, and log them to your history.", where: "HOME → CARDIO GPS TRACKER", target: "home" };

const TABS: [Step["target"], string, string][] = [
  ["home", "HOME", "◆"],
  ["train", "TRAIN", "🏋"],
  ["rank", "RANK", "◈"],
  ["quests", "QUESTS", "❖"],
  ["social", "SOCIAL", "◍"],
  ["me", "ME", "◉"],
];

// First-time walkthrough shown once, right after the athlete picks Lite/Full mode.
// Comprehensive tour of every tab, the home rooms, level-locked rooms, the mode
// switch, and Config so brand-new members never have to ask where things are.
// Dismissing it writes tour_seen so it never returns (replayable from Settings).
export function OnboardingTour() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);

  const lite = isLite(user);
  const steps: Step[] = lite
    ? [L_HOME, S_TRAIN, L_DIET, L_CARDIO, S_MODE, S_CONFIG]
    : [S_HOME, S_TRAIN, S_RANK, S_QUESTS, S_SOCIAL, S_ME, S_ROOMS, S_LOCKS, S_MODE, S_CONFIG];
  const step = steps[i];
  const last = i === steps.length - 1;

  const done = async (goStart: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(token, "/api/profile/update", {
        method: "PATCH",
        body: JSON.stringify({ tour_seen: true }),
      });
      await refresh();
      if (goStart) router.push(lite ? "/(tabs)" : "/(tabs)/quests");
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable testID="tour-skip" disabled={busy} onPress={() => done(false)} style={styles.skip}>
        <Text style={styles.skipText}>SKIP</Text>
      </Pressable>

      {step.target === "topright" && (
        <View style={styles.topPointer} pointerEvents="none">
          <Text style={styles.topPointerText}>UP HERE ↗</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.eyebrow}>⌁ WELCOME TO THE INNER CIRCLE</Text>

        <LinearGradient
          colors={[colors.brandTertiary, colors.surface2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{step.icon}</Text>
          </View>
          <Text style={styles.tag}>{step.tag}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.desc}>{step.desc}</Text>
          <View style={styles.whereRow}>
            <Text style={styles.whereText}>{step.where}</Text>
          </View>
        </LinearGradient>

        <View style={styles.dots}>
          {steps.map((_, idx) => (
            <View key={idx} style={[styles.dot, idx === i && styles.dotOn]} />
          ))}
        </View>
        <Text style={styles.counter}>{i + 1} / {steps.length}</Text>
      </View>

      {step.target !== "topright" && (
        <View style={styles.tabStrip} pointerEvents="none">
          {TABS.map(([key, label, glyph]) => {
            const on = step.target === key;
            return (
              <View key={key} style={styles.tabCell}>
                <Text style={[styles.tabArrow, !on && { opacity: 0 }]}>▼</Text>
                <View style={[styles.tabItem, on && styles.tabItemOn]}>
                  <Text style={[styles.tabGlyph, on && styles.tabGlyphOn]}>{glyph}</Text>
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.footer}>
        {i > 0 && (
          <Pressable testID="tour-back" disabled={busy} onPress={() => setI((n) => n - 1)} style={styles.backBtn}>
            <Text style={styles.backText}>BACK</Text>
          </Pressable>
        )}
        {last ? (
          <Pressable testID="tour-finish" disabled={busy} onPress={() => done(true)} style={styles.nextBtn}>
            {busy ? <ActivityIndicator color="#001122" /> : <Text style={styles.nextText}>{lite ? "START TRAINING →" : "ENTER THE ARENA →"}</Text>}
          </Pressable>
        ) : (
          <Pressable testID="tour-next" disabled={busy} onPress={() => setI((n) => n + 1)} style={styles.nextBtn}>
            <Text style={styles.nextText}>NEXT →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, zIndex: 950, elevation: 950, paddingHorizontal: spacing.lg },
  skip: { position: "absolute", top: spacing.lg, right: spacing.lg, zIndex: 10, padding: spacing.sm },
  skipText: { color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  body: { flex: 1, justifyContent: "center" },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "800", marginBottom: spacing.lg, textAlign: "center" },
  card: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, padding: spacing.lg, alignItems: "center" },
  iconWrap: { width: 88, height: 88, borderRadius: 44, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  icon: { color: colors.brandPrimary, fontSize: 44, textShadowColor: colors.brandPrimary, textShadowRadius: 12 },
  tag: { color: colors.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, textAlign: "center" },
  desc: { color: colors.textMid, fontSize: 14, lineHeight: 21, marginTop: spacing.md, textAlign: "center" },
  whereRow: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, width: "100%", alignItems: "center" },
  whereText: { color: colors.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brandPrimary, width: 22 },
  counter: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 2, textAlign: "center", marginTop: spacing.sm },
  topPointer: { position: "absolute", top: spacing.lg + 30, right: spacing.lg, zIndex: 10, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  topPointerText: { color: "#001122", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  tabStrip: { flexDirection: "row", marginBottom: spacing.md, paddingHorizontal: 4 },
  tabCell: { flex: 1, alignItems: "center" },
  tabArrow: { color: colors.brandPrimary, fontSize: 14, marginBottom: 2, textShadowColor: colors.brandPrimary, textShadowRadius: 8 },
  tabItem: { alignItems: "center", paddingVertical: 8, paddingHorizontal: 2, borderRadius: radius.sm, width: "100%", borderWidth: 1, borderColor: "transparent" },
  tabItemOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  tabGlyph: { color: colors.textDim, fontSize: 15 },
  tabGlyphOn: { color: colors.brandPrimary },
  tabLabel: { color: colors.textDim, fontSize: 8, fontWeight: "800", letterSpacing: 0.5, marginTop: 3 },
  tabLabelOn: { color: colors.brandPrimary },
  footer: { flexDirection: "row", gap: spacing.sm },
  backBtn: { paddingVertical: 15, paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  nextBtn: { flex: 1, paddingVertical: 15, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
});
