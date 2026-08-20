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
};

const QUESTS: Step = {
  icon: "❖",
  tag: "STEP 1 · THE JOURNEY",
  title: "RUN THE QUEST MAP",
  desc: "Complete quests on your RPG map to earn XP, rank up, and unlock milestone rewards. Boss quests drop loot when you crush them.",
  where: "Find it in the QUESTS ❖ tab.",
};
const ARMORY: Step = {
  icon: "⚔",
  tag: "STEP 2 · THE ARMORY",
  title: "GEAR UP YOUR AVATAR",
  desc: "Equip full-body skins and weapons, then style your look. Earn cosmetics from boss drops or grab exclusive pieces from the store.",
  where: "Find it in ME ◉ → THE ARMORY.",
};
const CLANS: Step = {
  icon: "◍",
  tag: "STEP 3 · CLANS",
  title: "JOIN A CLAN",
  desc: "Team up with a Clan, level it up together, and battle rival clans in monthly challenges to climb the seasonal leaderboards.",
  where: "Find it in the SOCIAL ◍ tab → GROUPS.",
};

// First-time walkthrough shown once, right after the athlete picks Lite/Full mode.
// Introduces Quests, the Armory (Full only), and Clans so brand-new members know
// where to start. Dismissing it writes tour_seen so it never returns.
export function OnboardingTour() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);

  // Armory is a Full-mode feature — skip that slide for Lite members.
  const steps: Step[] = isLite(user) ? [QUESTS, CLANS] : [QUESTS, ARMORY, CLANS];
  const step = steps[i];
  const last = i === steps.length - 1;

  const done = async (goQuests: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(token, "/api/profile/update", {
        method: "PATCH",
        body: JSON.stringify({ tour_seen: true }),
      });
      await refresh();
      if (goQuests) router.push("/(tabs)/quests");
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable testID="tour-skip" disabled={busy} onPress={() => done(false)} style={styles.skip}>
        <Text style={styles.skipText}>SKIP</Text>
      </Pressable>

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
      </View>

      <View style={styles.footer}>
        {i > 0 && (
          <Pressable testID="tour-back" disabled={busy} onPress={() => setI((n) => n - 1)} style={styles.backBtn}>
            <Text style={styles.backText}>BACK</Text>
          </Pressable>
        )}
        {last ? (
          <Pressable testID="tour-finish" disabled={busy} onPress={() => done(true)} style={styles.nextBtn}>
            {busy ? <ActivityIndicator color="#001122" /> : <Text style={styles.nextText}>ENTER THE ARENA →</Text>}
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
  footer: { flexDirection: "row", gap: spacing.sm },
  backBtn: { paddingVertical: 15, paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  nextBtn: { flex: 1, paddingVertical: 15, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
});
