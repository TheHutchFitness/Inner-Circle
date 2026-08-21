import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

// Notice shown in the AI rooms (Judge, Coach, Form/PR critique).
// - Members see "AI is not active yet" while the admin gate is OFF.
// - Admins see a subtle heads-up that AI is admin-only until they enable it.
// - Once enabled, a temporary-outage notice shows only if the LLM is degraded.
// `peerReview` rooms remind members they can still post + critique each other.
export function AiStatusBanner({ label = "AI scoring", peerReview = true }: { label?: string; peerReview?: boolean }) {
  const { token } = useAuth();
  const [st, setSt] = useState<{ active: boolean; enabled: boolean; is_admin: boolean; degraded: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      apiFetch(token, "/api/ai/status")
        .then((d) => { if (alive && d) setSt(d); })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  if (!st) return null;

  // Member, AI gate OFF → not active yet.
  if (!st.active) {
    return (
      <View style={styles.wrap} testID="ai-outage-banner">
        <Text style={styles.icon}>🔒</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{label} isn&apos;t active yet</Text>
          <Text style={styles.sub}>
            {peerReview
              ? "AI verdicts switch on once the founder run wraps and paid members start joining. Until then, post your lifts and critique each other — the room stays fully open."
              : "The AI Coach switches on once the founder run wraps and paid members start joining. Everything else in the app works as normal."}
          </Text>
        </View>
      </View>
    );
  }

  // Admin, gate still OFF → let them know members can't use it yet.
  if (st.is_admin && !st.enabled) {
    return (
      <View style={[styles.wrap, styles.wrapInfo]} testID="ai-admin-note">
        <Text style={styles.icon}>🛠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.brandPrimary }]}>AI is admin-only right now</Text>
          <Text style={styles.sub}>Members can&apos;t use {label} yet. Turn it on for everyone in Admin ▸ AI Features.</Text>
        </View>
      </View>
    );
  }

  // Enabled but the LLM is temporarily failing.
  if (st.degraded) {
    return (
      <View style={styles.wrap} testID="ai-outage-banner">
        <Text style={styles.icon}>⚙️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{label} is catching its breath</Text>
          <Text style={styles.sub}>
            {peerReview
              ? "AI verdicts are briefly unavailable — post and critique each other in the meantime."
              : "The AI Coach is briefly unavailable — everything else works. Try again shortly."}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255,176,32,0.12)",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  wrapInfo: { backgroundColor: "rgba(0,85,255,0.12)", borderColor: colors.brandPrimary },
  icon: { fontSize: 18 },
  title: { color: colors.warning, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  sub: { color: colors.textMid, fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 15 },
});
