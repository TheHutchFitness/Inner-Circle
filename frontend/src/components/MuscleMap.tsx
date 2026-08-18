import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Rect, Ellipse, Line } from "react-native-svg";
import { colors, spacing } from "@/src/lib/theme";

// Which regions light up on the FRONT vs BACK view for each muscle group.
// Keys: shoulders, upper (chest / lats), lower (abs / lower-back), arms, legs.
const FRONT: Record<string, string[]> = {
  Chest: ["upper"], Back: [], Shoulders: ["shoulders"], Arms: ["arms"],
  Core: ["lower"], Legs: ["legs"], Olympic: ["shoulders", "lower", "legs"],
};
const BACK: Record<string, string[]> = {
  Chest: [], Back: ["shoulders", "upper", "lower"], Shoulders: ["shoulders"], Arms: ["arms"],
  Core: ["lower"], Legs: ["legs"], Olympic: ["shoulders", "upper", "legs"],
};

function Body({ active, label, back }: { active: string[]; label: string; back?: boolean }) {
  const dim = colors.surface3;
  const on = (k: string) => (active.includes(k) ? colors.brandPrimary : dim);
  return (
    <View style={styles.body}>
      <Svg width={58} height={116} viewBox="0 0 70 132">
        <Circle cx={35} cy={12} r={9} fill={dim} />
        <Ellipse cx={19} cy={30} rx={9} ry={7} fill={on("shoulders")} />
        <Ellipse cx={51} cy={30} rx={9} ry={7} fill={on("shoulders")} />
        <Rect x={22} y={26} width={26} height={20} rx={6} fill={on("upper")} />
        <Rect x={24} y={47} width={22} height={22} rx={4} fill={on("lower")} />
        <Rect x={8} y={34} width={9} height={38} rx={4} fill={on("arms")} />
        <Rect x={53} y={34} width={9} height={38} rx={4} fill={on("arms")} />
        <Rect x={24} y={71} width={9} height={50} rx={4} fill={on("legs")} />
        <Rect x={37} y={71} width={9} height={50} rx={4} fill={on("legs")} />
        {back && <Line x1={35} y1={24} x2={35} y2={69} stroke={colors.surface} strokeWidth={2} />}
      </Svg>
      <Text style={styles.viewLabel}>{label}</Text>
    </View>
  );
}

export function MuscleMap({ category }: { category?: string }) {
  const front = FRONT[category || ""] || [];
  const back = BACK[category || ""] || [];
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Body active={front} label="FRONT" />
        <Body active={back} label="BACK" back />
      </View>
      <Text style={styles.caption}>TARGET: {(category || "FULL BODY").toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md },
  body: { alignItems: "center" },
  viewLabel: { color: colors.textDim, fontSize: 8, letterSpacing: 1.5, fontWeight: "800", marginTop: 2 },
  caption: { color: colors.brandPrimary, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginTop: 6 },
});
