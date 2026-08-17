import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";

const TABS = [
  { name: "index", label: "HQ", icon: "◆" },
  { name: "workout", label: "TRAIN", icon: "▲" },
  { name: "leaderboard", label: "RANK", icon: "☰" },
  { name: "community", label: "CIRCLE", icon: "◍" },
  { name: "profile", label: "ME", icon: "◉" },
];

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route: any, i: number) => {
        const focused = state.index === i;
        const meta = TABS.find((t) => t.name === route.name);
        if (!meta) return null;
        return (
          <Pressable
            key={route.key}
            testID={`tab-${meta.name}`}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
          >
            <Text style={[styles.icon, focused && styles.iconFocus]}>{meta.icon}</Text>
            <Text style={[styles.label, focused && styles.labelFocus]}>{meta.label}</Text>
            {focused && <View style={styles.underline} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading]);
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <CustomTabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="workout" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: "center", paddingVertical: 4 },
  icon: { color: colors.textDim, fontSize: 18, marginBottom: 2 },
  iconFocus: { color: colors.brandPrimary, textShadowColor: colors.brandPrimary, textShadowRadius: 8 },
  label: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  labelFocus: { color: colors.brandPrimary },
  underline: { position: "absolute", top: 0, height: 2, width: 24, backgroundColor: colors.brandPrimary },
});
