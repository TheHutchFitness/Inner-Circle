import { useRef, useState } from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, LayoutChangeEvent } from "react-native";
import Svg, { Polygon, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
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

let _gid = 0;

// Family 1 — Primary CTA. Angled neon "esports" button: chamfered hexagon shape,
// blue→orange (or orange→blue) gradient fill, bright neon border + outer glow,
// bold italic uppercase label. Matches The Circle FLAT UI button sheet.
export function NeonButton({ label, onPress, testID, disabled, loading, variant = "blueOrange", style }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const idRef = useRef(`neon${_gid++}`);
  const gid = idRef.current;

  const orange = variant === "orangeBlue";
  const from = orange ? "#FF7A18" : "#0A84FF";
  const to = orange ? "#0A84FF" : "#FF7A18";
  const glow = orange ? "#FF7A18" : "#0A84FF";

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // chamfered hexagon: cut top-left + bottom-right corners
  const { w, h } = size;
  const c = Math.min(20, h * 0.42);
  const points = w > 0 ? `${c},0 ${w},0 ${w},${h - c} ${w - c},${h} 0,${h} 0,${c}` : "";

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      onLayout={onLayout}
      style={({ pressed }) => [styles.wrap, { shadowColor: glow }, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}
    >
      {w > 0 && (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </SvgGradient>
          </Defs>
          <Polygon points={points} fill={`url(#${gid})`} stroke="rgba(255,255,255,0.92)" strokeWidth={2} />
        </Svg>
      )}
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    elevation: 10,
  },
  pressed: { transform: [{ scale: 0.97 }], shadowRadius: 24 },
  disabled: { opacity: 0.5 },
  label: {
    color: "#fff",
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 2.5,
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
});

// re-export the token so screens can reference the accent color if needed
export { colors as _neonColors };
