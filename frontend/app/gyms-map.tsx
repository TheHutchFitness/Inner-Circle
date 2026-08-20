import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { GymsMap } from "@/src/components/GymsMap";

// Haversine distance in km between two lat/lng points.
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function GymsMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [gyms, setGyms] = useState<any[] | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      try { const d = await apiFetch(token, "/api/gyms/map"); setGyms(d.gyms || []); }
      catch { setGyms([]); }
    })();
  }, [token]);

  const applyLocation = async () => {
    setLocating(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert("Location unavailable", "We couldn't read your location just now. Please try again.");
    }
    setLocating(false);
  };

  const nearMe = async () => {
    // Contextual permission flow — only asked when the user taps "Near Me".
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status === "granted") { await applyLocation(); return; }
    if (cur.canAskAgain) {
      Alert.alert(
        "Show gyms near you?",
        "We'll use your location once to sort the map by the training spots closest to you.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Continue",
            onPress: async () => {
              const req = await Location.requestForegroundPermissionsAsync();
              if (req.status === "granted") await applyLocation();
              else if (!req.canAskAgain) promptSettings();
            },
          },
        ],
      );
    } else {
      promptSettings();
    }
  };

  const promptSettings = () => {
    Alert.alert(
      "Location is off",
      "Enable location access in Settings to sort gyms by distance.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  };

  // Annotate with distance + sort by nearest when we have the user's location.
  const display = (() => {
    if (!gyms) return null;
    if (!userLoc) return gyms;
    return gyms
      .map((g) => ({ ...g, _dist: distanceKm(userLoc, { lat: g.lat, lng: g.lng }) }))
      .sort((a, b) => a._dist - b._dist);
  })();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="gyms-map-back" onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.title}>GYM MAP</Text>
        <Pressable testID="gyms-near-me" onPress={nearMe} hitSlop={10} style={styles.nearBtn}>
          {locating ? <ActivityIndicator color={colors.brandPrimary} /> : <Text style={[styles.nearText, userLoc && { color: colors.brandPrimary }]}>📍 NEAR ME</Text>}
        </Pressable>
      </View>
      {userLoc && <Text style={styles.sortedNote}>Sorted by distance from you</Text>}
      <View style={styles.body}>
        {display === null ? (
          <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
        ) : display.length === 0 ? (
          <View style={styles.center}><Text style={styles.empty}>No gyms on the map yet. Locations are added by the team.</Text></View>
        ) : (
          <GymsMap gyms={display} userLoc={userLoc} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 5 },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, width: 60 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  nearBtn: { width: 90, alignItems: "flex-end" },
  nearText: { color: colors.textMid, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  sortedNote: { color: colors.textDim, fontSize: 11, textAlign: "center", paddingVertical: 6, backgroundColor: colors.surface2 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  empty: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
});
