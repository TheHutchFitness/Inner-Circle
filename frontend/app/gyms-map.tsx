import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing } from "@/src/lib/theme";
import { GymsMap } from "@/src/components/GymsMap";

export default function GymsMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [gyms, setGyms] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try { const d = await apiFetch(token, "/api/gyms/map"); setGyms(d.gyms || []); }
      catch { setGyms([]); }
    })();
  }, [token]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="gyms-map-back" onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.title}>GYM MAP</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={styles.body}>
        {gyms === null ? (
          <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
        ) : gyms.length === 0 ? (
          <View style={styles.center}><Text style={styles.empty}>No gyms on the map yet. Locations are added by the team.</Text></View>
        ) : (
          <GymsMap gyms={gyms} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 5 },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, width: 50 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  empty: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
});
