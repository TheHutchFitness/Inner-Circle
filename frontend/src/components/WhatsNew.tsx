import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/src/lib/auth";
import { NeonButton } from "@/src/components/NeonButton";
import { colors, spacing, radius } from "@/src/lib/theme";

// Bump this key whenever there's a new rundown to show everyone again.
const SEEN_KEY = "thecircle_whatsnew_v4";

const SECTIONS: { icon: string; title: string; body: string }[] = [
  { icon: "🏆", title: "PR Room", body: "Post a personal record (video or photo + your numbers). An AI powerlifting coach breaks it down and members like & comment. Each week's most-liked PR wins a Champion badge + XP." },
  { icon: "🧪", title: "Form Lab", body: "Upload a lift for a technique check. The AI coach and other members critique your form and give fixes. Weekly top form-check earns a badge too." },
  { icon: "⚖️", title: "The Judge", body: "Submit a physique photo to be scored by the AI head judge, with member critiques and a leaderboard." },
  { icon: "🗺️", title: "Journey Map", body: "A top-down RPG map with a live HUD showing your weapon, stats, HP/AC/AP. Tap any quest to see its objectives and progress, then engage bosses to rank up." },
  { icon: "🛡️", title: "Clans", body: "Join or create clans, climb clan-vs-clan XP challenges, and chat with your crew." },
  { icon: "🏋️", title: "My Gyms (up to 5)", body: "Belong to as many as 5 gyms. Set a ★ primary gym for in-person coaching, and discover gyms near you." },
  { icon: "🍎", title: "Diet & Health", body: "Track macros, calories, water, and steps with a growing food database — plus keto / vegetarian / normal filters." },
  { icon: "🏃", title: "Cardio & Timers", body: "Strava-style run history with route maps, a stopwatch, and a HIIT interval timer." },
  { icon: "📚", title: "Exercise Library", body: "Hundreds of moves including Olympic weightlifting, stretches & mobility, and plyometrics." },
  { icon: "💉", title: "The Enhanced", body: "A discreet PED / peptide protocol tracker for those who choose the Enhanced path." },
  { icon: "🌗", title: "Lite Toggle", body: "In Settings you can switch on Lite Mode — it strips the app down to the core training tools (no RPG, store, or extras) for a clean, simple experience. Toggle it back off anytime to unlock everything." },
];

export function WhatsNew() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!seen) setOpen(true);
      } catch {}
    })();
  }, [user]);

  const close = async () => {
    setOpen(false);
    try { await AsyncStorage.setItem(SEEN_KEY, "1"); } catch {}
  };

  if (!open) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>▚ WELCOME TO THE CIRCLE //</Text>
          <Text style={styles.title}>WHAT'S NEW</Text>
          <View style={styles.verPill}><Text style={styles.verText}>UPDATE 0.2</Text></View>
          <Text style={styles.sub}>Here's a quick rundown of everything the app can do.</Text>
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
            {SECTIONS.map((s) => (
              <View key={s.title} style={styles.row}>
                <Text style={styles.rowIcon}>{s.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.title}</Text>
                  <Text style={styles.rowBody}>{s.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <NeonButton testID="whatsnew-close" label="LET'S TRAIN" onPress={close} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandPrimary, padding: spacing.lg },
  eyebrow: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 26, marginTop: 2 },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  verPill: { alignSelf: "flex-start", backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  verText: { color: "#fff", fontWeight: "900", letterSpacing: 1.5, fontSize: 11 },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { fontSize: 22, width: 30, textAlign: "center" },
  rowTitle: { color: colors.text, fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  rowBody: { color: colors.textMid, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
