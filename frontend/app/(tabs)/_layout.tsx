import { Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";
import { useResponsive, SIDEBAR_W } from "@/src/lib/responsive";

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
  const { isDesktop } = useResponsive();
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
  const hidden = new Set<string>();

  // ---- Desktop web: fixed left sidebar (mobile keeps the bottom tab bar) ----
  if (isDesktop) {
    return (
      <View style={[styles.sidebar, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.brand}>HUTCH&apos;S{"\n"}INNER CIRCLE</Text>
        <View style={{ height: 20 }} />
        {state.routes.map((route: any, i: number) => {
          const focused = state.index === i;
          const meta = TABS.find((t) => t.name === route.name);
          if (!meta || hidden.has(route.name)) return null;
          return (
            <Pressable
              key={route.key}
              testID={`tab-${meta.name}`}
              onPress={() => navigation.navigate(route.name)}
              style={[styles.sideItem, focused && styles.sideItemOn]}
            >
              <Text style={[styles.sideIcon, focused && styles.sideIconOn]}>{meta.icon}</Text>
              <Text style={[styles.sideLabel, focused && styles.sideLabelOn]}>{meta.label}</Text>
              {meta.name === "quests" && bossAlert && <View style={styles.sideBadge} />}
            </Pressable>
          );
        })}
      </View>
    );
  }

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
  const { isDesktop } = useResponsive();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading]);
  return (
    <View style={{ flex: 1 }}>
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface, paddingLeft: isDesktop ? SIDEBAR_W : 0 } }} tabBar={(p) => <CustomTabBar {...p} />}>
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
  sidebar: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
    backgroundColor: colors.surface2, borderRightWidth: 1, borderRightColor: colors.border,
    paddingHorizontal: 14, zIndex: 50,
  },
  brand: { color: colors.brandPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 2, lineHeight: 22, paddingHorizontal: 8 },
  sideItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sideItemOn: { backgroundColor: colors.brandTertiary },
  sideIcon: { color: colors.textDim, fontSize: 18, width: 22, textAlign: "center" },
  sideIconOn: { color: colors.brandPrimary, textShadowColor: colors.brandPrimary, textShadowRadius: 8 },
  sideLabel: { color: colors.textDim, fontSize: 13, letterSpacing: 2, fontWeight: "800", flex: 1 },
  sideLabelOn: { color: colors.brandPrimary },
  sideBadge: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.surface2 },
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
