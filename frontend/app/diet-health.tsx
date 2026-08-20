import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing } from "@/src/lib/theme";
import { HudSectionHeader } from "@/src/components/Hud";
import { HealthCard } from "@/src/components/HealthCard";
import { NutritionCard } from "@/src/components/NutritionCard";

export default function DietHealth() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="diet-health-back" onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹ BACK</Text>
        </Pressable>
        <Text style={styles.title}>DIET & HEALTH</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <HudSectionHeader label="CONDITIONING" />
        <HealthCard token={token} />
        <NutritionCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, width: 60 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
});
