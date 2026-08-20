import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

type Gym = { name: string; verified: boolean; lat: number; lng: number; address?: string; members?: number };

// react-native-maps is native-only; web shows the gyms as a simple list.
export function GymsMap({ gyms }: { gyms: Gym[] }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.note}>🗺️ Interactive map available on the mobile app. Locations set:</Text>
      {gyms.map((g, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.name}>{g.verified ? "✓ " : ""}{g.name}</Text>
          <Text style={styles.meta}>{g.address || `${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}`} · {g.members || 0} member{g.members === 1 ? "" : "s"}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function GymList({ gyms }: { gyms: Gym[] }) {
  return <GymsMap gyms={gyms} />;
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  note: { color: colors.textDim, fontSize: 12, marginBottom: spacing.sm, lineHeight: 18 },
  row: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  name: { color: colors.text, fontWeight: "900", fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
});
