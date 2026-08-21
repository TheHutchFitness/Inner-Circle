import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius } from "@/src/lib/theme";

type Props = {
  label: string;
  onPress?: () => void;
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "blueOrange" | "orangeBlue";
  style?: ViewStyle;
};

// On-brand primary CTA: blue→orange neon gradient with a glowing border,
// matching The Circle button sheet. Cross-platform (no native-only clipping).
export function NeonButton({ label, onPress, testID, disabled, loading, variant = "blueOrange", style }: Props) {
  const gradient = variant === "orangeBlue" ? (["#FF7A18", "#0A84FF"] as const) : (["#0A84FF", "#FF7A18"] as const);
  const glow = variant === "orangeBlue" ? "#FF7A18" : "#0A84FF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.wrap, { shadowColor: glow }, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}
    >
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.grad}>
        <View style={styles.inner}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{label}</Text>}
        </View>
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
    elevation: 10,
  },
  pressed: { transform: [{ scale: 0.97 }], shadowRadius: 20 },
  disabled: { opacity: 0.5 },
  grad: { borderRadius: radius.md, padding: 2 },
  inner: {
    borderRadius: radius.md - 1,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  label: { color: "#fff", fontWeight: "900", letterSpacing: 3, fontSize: 16, textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 4 },
});
