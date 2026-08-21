import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radius } from "@/src/lib/theme";

type Tone = "blue" | "orange" | "gold" | "fire" | "red";

const TONES: Record<Tone, { border: string; glow: string; text: string; fill: [string, string] }> = {
  blue:   { border: "#3DDCFF", glow: "#00C8FF", text: "#BFF3FF", fill: ["#0E2230", "#08131C"] },
  orange: { border: "#FF8A2B", glow: "#FF6A18", text: "#FFD9B0", fill: ["#2A1608", "#160B04"] },
  gold:   { border: "#FFD24A", glow: "#FFC400", text: "#FFEFC0", fill: ["#2A2208", "#161104"] },
  fire:   { border: "#FF5A2B", glow: "#FF3D18", text: "#FFC9B0", fill: ["#2A0F08", "#160604"] },
  red:    { border: "#FF3B4A", glow: "#FF2A3C", text: "#FFCFD4", fill: ["#2A0A0E", "#160406"] },
};

type Props = {
  label: string;
  onPress?: () => void;
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  tone?: Tone;
  icon?: string;
  style?: ViewStyle;
};

// Family 2 — Action button with active / inactive(disabled) / pressed states.
// Electric-bordered slab: dark gradient fill, glowing tinted border, bold italic
// label. Disabled renders a flat grey "inactive" chip. Matches The Circle sheet.
export function ActionButton({ label, onPress, testID, disabled, loading, tone = "blue", icon, style }: Props) {
  const t = TONES[tone];
  if (disabled) {
    return (
      <Pressable testID={testID} disabled style={[styles.wrap, styles.inactive, style]}>
        <Text style={[styles.label, styles.inactiveText]} numberOfLines={1}>{icon ? `${icon}  ` : ""}{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.wrap, { shadowColor: t.glow }, pressed && styles.pressed, style]}
    >
      <LinearGradient colors={t.fill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.fill, { borderColor: t.border }]}>
        {loading ? <ActivityIndicator color={t.text} /> : <Text style={[styles.label, { color: t.text, textShadowColor: t.glow }]} numberOfLines={1}>{icon ? `${icon}  ` : ""}{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 9,
  },
  pressed: { transform: [{ scale: 0.97 }], shadowRadius: 22 },
  fill: {
    borderRadius: radius.md,
    borderWidth: 2,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 2,
    fontSize: 15,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  inactive: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "#3A3F49",
    backgroundColor: "#20242C",
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveText: { color: "#7A828F", textShadowRadius: 0 },
});
