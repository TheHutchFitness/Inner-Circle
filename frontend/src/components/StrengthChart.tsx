import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { colors, spacing } from "@/src/lib/theme";

type Point = { date: string; weight: number };

export function StrengthChart({ data, color = colors.brandPrimary }: { data: Point[]; color?: string }) {
  const W = 300;
  const H = 140;
  const PAD = 10;

  if (!data || data.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Log 2+ sessions on this lift to see your curve.</Text>
      </View>
    );
  }

  const weights = data.map((d) => d.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (d.weight - min) / range) * (H - PAD * 2);
    return { x, y };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgGrad id="lg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.9" />
            <Stop offset="1" stopColor={color} stopOpacity="0.3" />
          </SvgGrad>
        </Defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <Line key={g} x1={PAD} y1={PAD + g * (H - PAD * 2)} x2={W - PAD} y2={PAD + g * (H - PAD * 2)} stroke={colors.border} strokeWidth="1" />
        ))}
        <Polyline points={polyline} fill="none" stroke="url(#lg)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={color} />
        ))}
      </Svg>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{min} lb</Text>
        <Text style={styles.axisText}>{max} lb</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 120, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, borderStyle: "dashed" },
  emptyText: { color: colors.textDim, fontSize: 12, paddingHorizontal: spacing.lg, textAlign: "center" },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { color: colors.textDim, fontSize: 10, letterSpacing: 1 },
});
