import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/src/lib/theme";

// Simple circular progress ring for a single macro (current vs goal).
export function MacroRing({ label, value, goal, unit, color, size = 84 }: {
  label: string; value: number; goal: number; unit: string; color: string; size?: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const over = goal > 0 && value > goal;
  const ringColor = over ? colors.warning : color;
  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={ringColor} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.val, over && { color: colors.warning }]}>{value}</Text>
          <Text style={styles.goal}>/ {goal || "—"}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}{unit ? ` (${unit})` : ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", flex: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  val: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  goal: { color: colors.textDim, fontSize: 10, fontWeight: "700", marginTop: -2 },
  label: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: "800", marginTop: 6 },
});
