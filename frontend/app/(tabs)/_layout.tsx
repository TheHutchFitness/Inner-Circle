import { Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";

const TABS = [
  { name: "index", label: "HOME", icon: "◆" },
  { name: "workout", label: "TRAIN", icon: "▲" },
  { name: "leaderboard", label: "RANK", icon: "☰" },
  { name: "quests", label: "QUESTS", icon: "❖" },
  { name: "community", label: "SOCIAL", icon: "◍" },
  { name: "profile", label: "ME", icon: "◉" },
];

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [bossAlert, setBossAlert] = useState(false);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const check = async () => {
      try {
        const d = await apiFetch(token, "/api/quests?scope=boss");
        const arr = d.boss || [];
        if (live) setBossAlert(arr.some((q: any) => q.complete && !q.claimed));
      } catch {}
    };
    check();
    const id = setInterval(check, 30000);
    return () => { live = false; clearInterval(id); };
  }, [token]);
  // Lite mode keeps the SOCIAL tab (it hosts Groups, which are open to everyone).
  const hidden = new Set<string>();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route: any, i: number) => {
        const focused = state.index === i;
        const meta = TABS.find((t) => t.name === route.name);
        if (!meta || hidden.has(route.name)) return null;
        return (
          <Pressable
            key={route.key}
            testID={`tab-${meta.name}`}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
          >
            <Text style={[styles.icon, focused && styles.iconFocus]}>{meta.icon}</Text>
            <Text style={[styles.label, focused && styles.labelFocus]}>{meta.label}</Text>
            {meta.name === "quests" && bossAlert && <View testID="boss-alert-dot" style={styles.badge} />}
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
    <View style={{ flex: 1 }}>
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface } }} tabBar={(p) => <CustomTabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="workout" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="quests" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="profile" />
    </Tabs>
    {user?.enhanced && (
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,0,40,0.10)", borderWidth: 2, borderColor: "rgba(255,40,60,0.35)" }} />
    )}
    </View>
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
  label: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  labelFocus: { color: colors.brandPrimary },
  underline: { position: "absolute", top: 0, height: 2, width: 24, backgroundColor: colors.brandPrimary },
  badge: { position: "absolute", top: 0, right: "30%", width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.surface2 },
});
