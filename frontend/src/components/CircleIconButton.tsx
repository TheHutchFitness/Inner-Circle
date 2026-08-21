import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Tone = "blue" | "orange" | "gold";

const TONES: Record<Tone, { ring: string; glow: string }> = {
  blue:   { ring: "#3DDCFF", glow: "#00C8FF" },
  orange: { ring: "#FF8A2B", glow: "#FF5A18" },
  gold:   { ring: "#FFD24A", glow: "#FFC400" },
};

type Props = {
  icon: string;
  onPress?: () => void;
  testID?: string;
  tone?: Tone;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
};

// Family 4 — Circular icon button. Dark metallic core with a glowing energy ring
// (blue lightning / orange fire / gold spark). Matches The Circle icon sheet.
export function CircleIconButton({ icon, onPress, testID, tone = "blue", size = 48, disabled, style }: Props) {
  const t = TONES[tone];
  const dim = size;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { width: dim, height: dim, borderRadius: dim / 2, shadowColor: t.glow },
        styles.wrap,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={["#1B1F28", "#0A0D14"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.core, { width: dim, height: dim, borderRadius: dim / 2, borderColor: t.ring }]}
      >
        <Text style={[styles.icon, { fontSize: dim * 0.42 }]}>{icon}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  pressed: { transform: [{ scale: 0.92 }], shadowRadius: 18 },
  disabled: { opacity: 0.45 },
  core: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  icon: { textAlign: "center" },
});
