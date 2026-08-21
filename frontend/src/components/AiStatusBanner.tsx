import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

// Shows a clear "AI temporarily unavailable" notice in AI rooms (Judge, Coach,
// Form/PR critique) when the backend reports the LLM is currently degraded —
// e.g. the Universal Key balance ran out. Auto-hides once AI recovers.
// `peerReview` rooms remind members they can still post + critique each other.
export function AiStatusBanner({ label = "AI scoring", peerReview = true }: { label?: string; peerReview?: boolean }) {
  const { token } = useAuth();
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      apiFetch(token, "/api/ai/status")
        .then((d) => { if (alive) setDegraded(!!d?.degraded); })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  if (!degraded) return null;

  return (
    <View style={styles.wrap} testID="ai-outage-banner">
      <Text style={styles.icon}>⚠️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{label} is paused right now</Text>
        <Text style={styles.sub}>
          {peerReview
            ? "You can still post your lifts and critique each other — the room stays fully open. AI verdicts will return shortly."
            : "The AI Coach is catching its breath — everything else in the app works. Try again shortly."}
        </Text>
      </View>
    </View>
  );
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
  icon: { fontSize: 18 },
  title: { color: colors.warning, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  sub: { color: colors.textMid, fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 15 },
});
