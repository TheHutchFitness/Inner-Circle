import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";

// Subtle faint gym-name text sitting behind screen content. Renders nothing
// unless the athlete has associated a gym. Non-interactive.
export function GymWatermark() {
  const { user } = useAuth();
  const gym = (user?.inperson_gym || "").trim();
  if (!gym) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text numberOfLines={1} style={styles.text}>{gym.toUpperCase()}</Text>
    </View>
  );
}

// Small gym badge for a header corner.
export function GymBadge() {
  const { user } = useAuth();
  const gym = (user?.inperson_gym || "").trim();
  if (!gym) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeIcon}>🏋</Text>
      <Text numberOfLines={1} style={styles.badgeText}>{gym.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  text: {
    color: colors.text,
    opacity: 0.035,
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: 6,
    transform: [{ rotate: "-24deg" }],
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 150,
    backgroundColor: "rgba(0,42,85,0.5)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeIcon: { fontSize: 11 },
  badgeText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
});
