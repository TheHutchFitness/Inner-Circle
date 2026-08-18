import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Rect, Ellipse } from "react-native-svg";
import { colors, spacing } from "@/src/lib/theme";

// Front-view silhouette with the target muscle group highlighted.
// (Front view is a simplification; the caption states the actual target.)
const REGIONS: Record<string, string[]> = {
  Chest: ["chest"],
  Back: ["chest", "shoulders"],
  Shoulders: ["shoulders"],
  Arms: ["arms"],
  Core: ["core"],
  Legs: ["legs"],
  Olympic: ["shoulders", "core", "legs"],
};

export function MuscleMap({ category }: { category?: string }) {
  const active = REGIONS[category || ""] || [];
  const on = (k: string) => (active.includes(k) ? colors.brandPrimary : colors.surface3);
  const dim = colors.surface3;
  return (
    <View style={styles.wrap}>
      <Svg width={70} height={132} viewBox="0 0 70 132">
        {/* head */}
        <Circle cx={35} cy={12} r={9} fill={dim} />
        {/* shoulders */}
        <Ellipse cx={19} cy={30} rx={9} ry={7} fill={on("shoulders")} />
        <Ellipse cx={51} cy={30} rx={9} ry={7} fill={on("shoulders")} />
        {/* chest */}
        <Rect x={22} y={26} width={26} height={20} rx={6} fill={on("chest")} />
        {/* core */}
        <Rect x={24} y={47} width={22} height={22} rx={4} fill={on("core")} />
        {/* arms */}
        <Rect x={8} y={34} width={9} height={38} rx={4} fill={on("arms")} />
        <Rect x={53} y={34} width={9} height={38} rx={4} fill={on("arms")} />
        {/* legs */}
        <Rect x={24} y={71} width={9} height={50} rx={4} fill={on("legs")} />
        <Rect x={37} y={71} width={9} height={50} rx={4} fill={on("legs")} />
      </Svg>
      <Text style={styles.caption}>TARGET: {(category || "FULL BODY").toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xs },
  caption: { color: colors.brandPrimary, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginTop: 4 },
});
