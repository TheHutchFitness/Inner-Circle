import React from "react";
import { StyleSheet, Platform, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors, spacing, radius } from "@/src/lib/theme";

type Gym = { name: string; verified: boolean; lat: number; lng: number; address?: string; members?: number; _dist?: number; external?: boolean; rating?: number };
type Loc = { lat: number; lng: number } | null;

function fmtDist(km?: number) {
  if (km == null) return "";
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

function regionFor(gyms: Gym[], userLoc: Loc) {
  if (userLoc) return { latitude: userLoc.lat, longitude: userLoc.lng, latitudeDelta: 0.6, longitudeDelta: 0.6 };
  if (!gyms.length) return { latitude: 20, longitude: 0, latitudeDelta: 80, longitudeDelta: 80 };
  const lats = gyms.map((g) => g.lat), lngs = gyms.map((g) => g.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.5, (maxLat - minLat) * 1.6 || 4),
    longitudeDelta: Math.max(0.5, (maxLng - minLng) * 1.6 || 4),
  };
}

export function GymsMap({ gyms, userLoc = null }: { gyms: Gym[]; userLoc?: Loc }) {
  return (
    <MapView
      testID="gyms-map"
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      region={regionFor(gyms, userLoc)}
      showsUserLocation={!!userLoc}
      userInterfaceStyle="dark"
    >
      {gyms.map((g, i) => (
        <Marker
          key={i}
          testID={`gym-pin-${i}`}
          coordinate={{ latitude: g.lat, longitude: g.lng }}
          title={`${g.external ? "📍 " : g.verified ? "✓ " : ""}${g.name}`}
          description={g.external
            ? `Google Maps gym${g._dist != null ? " · " + fmtDist(g._dist) : ""}${g.rating ? ` · ★ ${g.rating}` : ""}${g.address ? ` · ${g.address}` : ""}`
            : `${g._dist != null ? fmtDist(g._dist) + " · " : ""}${g.members || 0} member${g.members === 1 ? "" : "s"}${g.address ? ` · ${g.address}` : ""}`}
          pinColor={g.external ? "#8B5CF6" : g.verified ? colors.brandPrimary : colors.warning}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  row: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  name: { color: colors.text, fontWeight: "900", fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
});
