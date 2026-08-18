import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/theme";

type Stats = { strength: number; power: number; speed: number; endurance: number; grit: number };
const AXES: { key: keyof Stats; label: string }[] = [
  { key: "strength", label: "STR" },
  { key: "power", label: "PWR" },
  { key: "speed", label: "SPD" },
  { key: "endurance", label: "END" },
  { key: "grit", label: "GRT" },
];

export function RadarChart({ stats, color = colors.brandPrimary, size = 220 }: { stats?: Stats; color?: string; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 26;
  const n = AXES.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, r: number) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  const s = stats || { strength: 0, power: 0, speed: 0, endurance: 0, grit: 0 };
  const values = AXES.map((a) => Math.max(0, Math.min(100, s[a.key])) / 100);

  const rings = [0.25, 0.5, 0.75, 1];
  const gridPoly = (r: number) => AXES.map((_, i) => point(i, R * r).join(",")).join(" ");
  const dataPoly = values.map((v, i) => point(i, R * v).join(",")).join(" ");

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {rings.map((r, idx) => (
          <Polygon key={idx} points={gridPoly(r)} fill="none" stroke={colors.border} strokeWidth={1} />
        ))}
        {AXES.map((_, i) => {
          const [x, y] = point(i, R);
          return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={colors.border} strokeWidth={1} />;
        })}
        <Polygon points={dataPoly} fill={color + "44"} stroke={color} strokeWidth={2.5} />
        {values.map((v, i) => {
          const [x, y] = point(i, R * v);
          return <Circle key={i} cx={x} cy={y} r={3.5} fill={color} />;
        })}
        {AXES.map((a, i) => {
          const [x, y] = point(i, R + 16);
          return (
            <SvgText key={a.key} x={x} y={y + 4} fill={colors.textMid} fontSize={11} fontWeight="bold" textAnchor="middle">
              {a.label}
            </SvgText>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        {AXES.map((a) => (
          <View key={a.key} style={styles.legendItem}>
            <Text style={styles.legendLabel}>{a.label}</Text>
            <Text style={[styles.legendVal, { color }]}>{Math.round(s[a.key])}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 },
  legendItem: { alignItems: "center", minWidth: 42 },
  legendLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  legendVal: { fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
