import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radius } from "@/src/lib/theme";

type Tone = "blue" | "gold" | "orange" | "red";

const TONES: Record<Tone, { border: string; glow: string; text: string }> = {
  blue:   { border: "#2E6BFF", glow: "#3DA5FF", text: "#DCEBFF" },
  gold:   { border: "#C79A2E", glow: "#FFD24A", text: "#FFEFC8" },
  orange: { border: "#C7622E", glow: "#FF8A2B", text: "#FFD9B0" },
  red:    { border: "#C72E3A", glow: "#FF3D4A", text: "#FFCFD4" },
};

type Props = {
  label: string;
  onPress?: () => void;
  testID?: string;
  icon?: string;
  tone?: Tone;
  style?: ViewStyle;
};

// Family 3 — Secondary navigation button. Rounded slab, dark gradient fill,
// thin tinted neon border, icon + label. Press lifts the glow (energy ripple).
// Matches The Circle "Secondary Navigation Button Sheet".
export function NavButton({ label, onPress, testID, icon, tone = "blue", style }: Props) {
  const t = TONES[tone];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { shadowColor: t.glow }, pressed && styles.pressed, style]}
    >
      <LinearGradient colors={["#12161F", "#0A0D14"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.fill, { borderColor: t.border }]}>
        {!!icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  pressed: { shadowOpacity: 0.95, shadowRadius: 18, transform: [{ scale: 0.985 }] },
  fill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  icon: { fontSize: 16 },
  label: { fontWeight: "800", letterSpacing: 2.5, fontSize: 13 },
});
