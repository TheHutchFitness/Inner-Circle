import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { useResponsive, webCenter } from "@/src/lib/responsive";

type Gym = { name: string; verified: boolean; lat: number; lng: number; address?: string; members?: number; _dist?: number; external?: boolean; rating?: number };
type Loc = { lat: number; lng: number } | null;

function fmtDist(km?: number) {
  if (km == null) return "";
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

// react-native-maps is native-only; web shows the gyms as a simple list.
export function GymsMap({ gyms, userLoc = null }: { gyms: Gym[]; userLoc?: Loc }) {
  const { isDesktop } = useResponsive();
  return (
    <ScrollView contentContainerStyle={[styles.wrap, webCenter(isDesktop)]}>
      <Text style={styles.note}>🗺️ Interactive map available on the mobile app.{userLoc ? " Nearest first:" : " Locations set:"}</Text>
      <View style={isDesktop ? styles.grid : undefined}>
      {gyms.map((g, i) => (
        <View key={i} style={[styles.row, isDesktop && styles.rowGrid, g.external && styles.rowExternal]}>
          <View style={styles.rowTop}>
            <Text style={styles.name}>{g.external ? "📍 " : g.verified ? "✓ " : ""}{g.name}</Text>
            {g._dist != null && <Text style={styles.dist}>{fmtDist(g._dist)}</Text>}
          </View>
          <Text style={styles.meta}>{g.external ? `Google Maps gym${g.rating ? ` · ★ ${g.rating}` : ""}${g.address ? ` · ${g.address}` : ""}` : `${g.address || `${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}`} · ${g.members || 0} member${g.members === 1 ? "" : "s"}`}</Text>
        </View>
      ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  rowGrid: { width: "48.5%" },
  note: { color: colors.textDim, fontSize: 12, marginBottom: spacing.sm, lineHeight: 18 },
  row: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  rowExternal: { borderColor: "#8B5CF6", backgroundColor: "rgba(139,92,246,0.06)" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontWeight: "900", fontSize: 15, flex: 1 },
  dist: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800" },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
});
