import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, skinImage, weaponImage } from "@/src/lib/theme";

const RARITY_COLOR: Record<string, string> = {
  legendary: "#FFD24A", mythic: "#C77DFF", exalted: "#00E5FF", eternal: "#FF3B5C", rare: "#7A5CFF",
};
const SOURCE_LABEL: Record<string, string> = { paid: "VAULT", level: "LEVEL", quest: "QUEST" };

export default function GearLocker() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"skins" | "weapons">("skins");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { setData(await apiFetch(token, "/api/gear")); } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-line */ }, [token]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2200); };

  const buy = async (item: any, kind: "skin" | "weapon") => {
    setBusy(item.id);
    try {
      // Native production build completes the $1 RevenueCat purchase here; preview/web grants directly.
      await apiFetch(token, "/api/gear/purchase", { method: "POST", body: JSON.stringify({ kind, id: item.id }) });
      flash(`Unlocked ${item.name}!`);
      await load();
    } catch (e: any) { flash(e?.message || "Purchase failed"); }
    setBusy(null);
  };

  const equip = async (item: any, kind: "skin" | "weapon", on: boolean) => {
    setBusy(item.id);
    try {
      const url = kind === "skin" ? "/api/gear/equip-skin" : "/api/gear/equip-weapon";
      const body = kind === "skin" ? { skin_id: on ? item.id : null } : { weapon_id: on ? item.id : null };
      await apiFetch(token, url, { method: "POST", body: JSON.stringify(body) });
      await load();
      await refresh();
    } catch (e: any) { flash(e?.message || "Failed"); }
    setBusy(null);
  };

  const kind: "skin" | "weapon" = tab === "skins" ? "skin" : "weapon";
  const list = data ? (tab === "skins" ? data.skins : data.weapons) : [];

  const lockText = (item: any) =>
    item.source === "quest" ? `🔒 ${item.quest_label || "Quest locked"}` : `🔒 UNLOCKS AT LV ${item.unlock_level}`;

  return (
    <View style={st.wrap}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={st.eyebrow}>▚ ARMORY //</Text>
        <Text style={st.h1}>THE ARMORY</Text>
        <Text style={st.sub}>Full-body hero skins + weapons. Earn them by leveling and clearing hard quests, or unlock premium sets for $1.</Text>

        <View style={st.tabRow}>
          <Pressable testID="gear-tab-skins" onPress={() => setTab("skins")} style={[st.tab, tab === "skins" && st.tabOn]}><Text style={[st.tabText, tab === "skins" && st.tabTextOn]}>SKINS</Text></Pressable>
          <Pressable testID="gear-tab-weapons" onPress={() => setTab("weapons")} style={[st.tab, tab === "weapons" && st.tabOn]}><Text style={[st.tabText, tab === "weapons" && st.tabTextOn]}>WEAPONS</Text></Pressable>
        </View>

        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> :
        list.map((item: any) => {
          const rc = RARITY_COLOR[item.rarity] || RARITY_COLOR.rare;
          const art = tab === "skins" ? skinImage(item.id) : weaponImage(item.id);
          const canEquip = item.unlocked || item.owned;
          return (
            <View key={item.id} testID={`gear-item-${item.id}`} style={[st.card, { borderColor: item.equipped ? colors.success : colors.border }]}>
              <View style={[st.thumb, tab === "weapons" && st.thumbWeap, { borderColor: rc }]}>
                {art ? <Image source={art} style={{ width: "100%", height: "100%" }} contentFit={tab === "skins" ? "cover" : "contain"} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{item.name}</Text>
                <Text style={st.meta}>
                  <Text style={{ color: rc }}>{(item.rarity || "").toUpperCase()}</Text>
                  <Text style={{ color: colors.textDim }}>  ·  {SOURCE_LABEL[item.source]}</Text>
                </Text>
                {canEquip ? (
                  <Pressable testID={`equip-${item.id}`} onPress={() => equip(item, kind, !item.equipped)} disabled={busy === item.id} style={[st.btn, item.equipped ? st.btnEquipped : st.btnEquip]}>
                    <Text style={[st.btnText, { color: item.equipped ? colors.success : colors.brandPrimary }]}>{busy === item.id ? "…" : item.equipped ? "✓ EQUIPPED" : "EQUIP"}</Text>
                  </Pressable>
                ) : item.source === "paid" ? (
                  <Pressable testID={`buy-${item.id}`} onPress={() => buy(item, kind)} disabled={busy === item.id} style={[st.btn, st.btnBuy]}>
                    <Text style={[st.btnText, { color: "#221900" }]}>{busy === item.id ? "…" : `UNLOCK · $${item.price_usd}`}</Text>
                  </Pressable>
                ) : (
                  <Text style={st.locked}>{lockText(item)}</Text>
                )}
              </View>
            </View>
          );
        })}
        {msg && <Text style={st.msg}>{msg}</Text>}
        {Platform.OS !== "web" && <Text style={st.finePrint}>Premium skins & weapons are one-time $1 purchases.</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.warning, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  sub: { color: colors.textMid, fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: spacing.md },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  tabOn: { borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.1)" },
  tabText: { color: colors.textDim, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  tabTextOn: { color: colors.warning },
  card: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surface2, marginBottom: spacing.md },
  thumb: { width: 66, height: 88, borderRadius: radius.sm, overflow: "hidden", borderWidth: 1, backgroundColor: "#05070C" },
  thumbWeap: { width: 66, height: 66, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontWeight: "900", fontSize: 16 },
  meta: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 3 },
  btn: { marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.sm },
  btnBuy: { backgroundColor: colors.warning },
  btnEquip: { borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  btnEquipped: { borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(57,255,20,0.1)" },
  btnText: { fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  locked: { color: colors.textDim, fontSize: 11, fontWeight: "800", marginTop: spacing.sm, letterSpacing: 0.5 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
  finePrint: { color: colors.textDim, fontSize: 10, textAlign: "center", marginTop: spacing.lg, lineHeight: 14 },
});
