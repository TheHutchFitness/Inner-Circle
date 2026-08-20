import React from "react";
import { StyleSheet, Platform, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors, spacing, radius } from "@/src/lib/theme";

type Gym = { name: string; verified: boolean; lat: number; lng: number; address?: string; members?: number };

function initialRegion(gyms: Gym[]) {
  if (!gyms.length) return { latitude: 20, longitude: 0, latitudeDelta: 80, longitudeDelta: 80 };
  const lats = gyms.map((g) => g.lat);
  const lngs = gyms.map((g) => g.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.5, (maxLat - minLat) * 1.6 || 4),
    longitudeDelta: Math.max(0.5, (maxLng - minLng) * 1.6 || 4),
  };
}

export function GymsMap({ gyms }: { gyms: Gym[] }) {
  return (
    <MapView
      testID="gyms-map"
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={initialRegion(gyms)}
      userInterfaceStyle="dark"
    >
      {gyms.map((g, i) => (
        <Marker
          key={i}
          testID={`gym-pin-${i}`}
          coordinate={{ latitude: g.lat, longitude: g.lng }}
          title={`${g.verified ? "✓ " : ""}${g.name}`}
          description={`${g.members || 0} member${g.members === 1 ? "" : "s"}${g.address ? ` · ${g.address}` : ""}`}
          pinColor={g.verified ? colors.brandPrimary : colors.warning}
        />
      ))}
    </MapView>
  );
}

export function GymList({ gyms }: { gyms: Gym[] }) {
  return (
    <View style={styles.wrap}>
      {gyms.map((g, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.name}>{g.verified ? "✓ " : ""}{g.name}</Text>
          <Text style={styles.meta}>{g.address || `${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}`}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  row: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  name: { color: colors.text, fontWeight: "900", fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
});
