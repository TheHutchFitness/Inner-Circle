import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { colors, spacing, radius } from "@/src/lib/theme";

type Point = { p: number; big4?: number; at?: string };

// Small sparkline of a member's strength percentile across their baseline retests,
// so the climb is a visible line. Renders nothing with fewer than 2 data points.
export function PercentileTrend({ data }: { data: Point[] }) {
  const pts = (data || []).filter((d) => typeof d?.p === "number");
  if (pts.length < 2) return null;

  const W = 300;
  const H = 96;
  const padX = 14;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const n = pts.length;
  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padY + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH;

  const poly = pts.map((d, i) => `${x(i)},${y(d.p)}`).join(" ");
  const first = pts[0].p;
  const last = pts[n - 1].p;
  const delta = last - first;
  const up = delta > 0;
  const lineColor = up ? colors.success : delta < 0 ? colors.error : colors.brandPrimary;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>📈 STRENGTH TREND</Text>
        <Text style={[styles.delta, { color: lineColor }]}>
          {up ? `↑ +${delta}%` : delta < 0 ? `↓ ${delta}%` : "→ flat"} over {n} tests
        </Text>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 50, 100].map((g) => (
          <Line key={g} x1={padX} y1={y(g)} x2={W - padX} y2={y(g)} stroke={colors.border} strokeWidth={0.5} />
        ))}
        <Polyline points={poly} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((d, i) => (
          <Circle key={i} cx={x(i)} cy={y(d.p)} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? lineColor : colors.surface} stroke={lineColor} strokeWidth={1.5} />
        ))}
        <SvgText x={x(n - 1)} y={y(last) - 8} fill={lineColor} fontSize={11} fontWeight="900" textAnchor="middle">{last}%</SvgText>
      </Svg>
      <Text style={styles.foot}>Percentile vs The Circle · retest your maxes to move the line</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.textMid, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  delta: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  foot: { color: colors.textDim, fontSize: 10, letterSpacing: 0.5, textAlign: "center", marginTop: 6 },
});
