import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/lib/theme";

// react-native-maps is native-only; web shows a placeholder.
export function CardioMap({ route }: { region: any; route: any[] }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.text}>Live map available on the mobile app.{route.length > 1 ? ` Tracking ${route.length} points.` : ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  icon: { fontSize: 48, marginBottom: spacing.md },
  text: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
});
