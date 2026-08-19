import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, rarityColor, rarityLabel, skinImage, weaponImage } from "@/src/lib/theme";
import { StoreCosmetic } from "@/src/components/StoreCosmetic";

const KIND_LABEL: Record<string, string> = {
  avatar: "AVATARS", banner: "BANNERS", title: "TITLES", badge: "BADGES", background: "BACKGROUNDS", aura: "AURAS", pet: "PETS",
};

export default function Store() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"drop" | "collection">("drop");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { setData(await apiFetch(token, "/api/store")); } catch {}
    try { setGear(await apiFetch(token, "/api/gear")); } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-line */ }, [token]);

  const [gear, setGear] = useState<any>(null);
  const buyGear = async (item: any, gkind: "skin" | "weapon") => {
    setBusy(item.id);
    try {
      await apiFetch(token, "/api/gear/purchase", { method: "POST", body: JSON.stringify({ kind: gkind, id: item.id }) });
      flash(`Unlocked ${item.name}!`);
      await load();
    } catch (e: any) { flash(e?.message || "Purchase failed"); }
    setBusy(null);
  };

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2200); };

  const buy = async (item: any) => {
    setBusy(item.item_id);
    try {
      // On a production native build this is where the $1 RevenueCat purchase completes.
      // In preview/web (IAP unavailable) we grant directly so the flow is testable.
      await apiFetch(token, "/api/store/purchase", { method: "POST", body: JSON.stringify({ item_id: item.item_id }) });
      flash(`Unlocked ${item.name}!`);
      await load();
    } catch (e: any) { flash(e?.message || "Purchase failed"); }
    setBusy(null);
  };

  const equip = async (item: any, on: boolean) => {
    setBusy(item.item_id);
    try {
      await apiFetch(token, "/api/store/equip", { method: "POST", body: JSON.stringify({ kind: item.kind, item_id: on ? item.item_id : null }) });
      await load();
    } catch (e: any) { flash(e?.message || "Failed"); }
    setBusy(null);
  };

  const list = data ? (tab === "drop" ? data.live : data.collection) : [];
  const equips = data?.equips || {};
  const monthLabel = data?.month ? new Date(data.month + "-01").toLocaleString(undefined, { month: "long", year: "numeric" }) : "";

  return (
    <View style={st.wrap}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={st.eyebrow}>▚ BLACK MARKET //</Text>
        <Text style={st.h1}>THE STORE</Text>
        <Text style={st.sub}>Exclusive cosmetics — ${1} each. This month only. When {monthLabel} ends, they're gone forever.</Text>

        <Pressable testID="store-open-armory" onPress={() => router.push("/gear")} style={st.armoryBtn}>
          <Text style={st.armoryText}>⚔ THE ARMORY — HERO SKINS & WEAPONS →</Text>
        </Pressable>

        <View style={st.tabRow}>
          <Pressable testID="store-tab-drop" onPress={() => setTab("drop")} style={[st.tab, tab === "drop" && st.tabOn]}><Text style={[st.tabText, tab === "drop" && st.tabTextOn]}>{monthLabel.toUpperCase()} DROP</Text></Pressable>
          <Pressable testID="store-tab-collection" onPress={() => setTab("collection")} style={[st.tab, tab === "collection" && st.tabOn]}><Text style={[st.tabText, tab === "collection" && st.tabTextOn]}>MY ITEMS ({data?.collection?.length ?? 0})</Text></Pressable>
        </View>

        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : list.length === 0 ? (
          <Text style={st.empty}>{tab === "drop" ? "No drop live right now. Check back on the 1st." : "You haven't unlocked any exclusives yet."}</Text>
        ) : list.map((item: any) => {
          const equipped = equips[item.kind] === item.item_id;
          return (
            <View key={item.item_id} testID={`store-item-${item.item_id}`} style={st.card}>
              <StoreCosmetic item={item} size={78} />
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{item.name}</Text>
                <Text style={st.kind}>{KIND_LABEL[item.kind] || item.kind} · <Text style={{ color: rarityColor(item.rarity) }}>{rarityLabel(item.rarity)}</Text></Text>
                {!!item.description && <Text style={st.desc} numberOfLines={2}>{item.description}</Text>}
                {item.owned ? (
                  <Pressable testID={`equip-${item.item_id}`} onPress={() => equip(item, !equipped)} disabled={busy === item.item_id} style={[st.btn, equipped ? st.btnEquipped : st.btnEquip]}>
                    <Text style={[st.btnText, { color: equipped ? colors.success : colors.brandPrimary }]}>{equipped ? "✓ EQUIPPED" : "EQUIP"}</Text>
                  </Pressable>
                ) : (
                  <Pressable testID={`buy-${item.item_id}`} onPress={() => buy(item)} disabled={busy === item.item_id} style={[st.btn, st.btnBuy]}>
                    <Text style={[st.btnText, { color: "#221900" }]}>{busy === item.item_id ? "…" : `UNLOCK · $${item.price_usd}`}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {tab === "drop" && gear && (
          <>
            <Text style={st.gearHead}>⚔ HERO SKINS · THIS MONTH</Text>
            {gear.skins.filter((s: any) => s.source === "paid" && s.available && !s.owned).map((s: any) => (
              <View key={s.id} testID={`store-skin-${s.id}`} style={st.card}>
                <View style={st.gearThumb}><Image source={skinImage(s.id)} style={{ width: "100%", height: "100%" }} contentFit="cover" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{s.name}</Text>
                  <Text style={st.kind}>SKIN · <Text style={{ color: rarityColor(s.rarity) }}>{rarityLabel(s.rarity)}</Text></Text>
                  <Pressable testID={`buy-skin-${s.id}`} onPress={() => buyGear(s, "skin")} disabled={busy === s.id} style={[st.btn, st.btnBuy]}>
                    <Text style={[st.btnText, { color: "#221900" }]}>{busy === s.id ? "…" : `UNLOCK · $${s.price_usd}`}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Text style={st.gearHead}>🗡 WEAPONS</Text>
            {gear.weapons.filter((w: any) => w.source === "paid" && !w.owned).map((w: any) => (
              <View key={w.id} testID={`store-weapon-${w.id}`} style={st.card}>
                <View style={[st.gearThumb, st.gearThumbWeap]}><Image source={weaponImage(w.id)} style={{ width: "100%", height: "100%" }} contentFit="contain" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{w.name}</Text>
                  <Text style={st.kind}>WEAPON · <Text style={{ color: rarityColor(w.rarity) }}>{rarityLabel(w.rarity)}</Text></Text>
                  <Pressable testID={`buy-weapon-${w.id}`} onPress={() => buyGear(w, "weapon")} disabled={busy === w.id} style={[st.btn, st.btnBuy]}>
                    <Text style={[st.btnText, { color: "#221900" }]}>{busy === w.id ? "…" : `UNLOCK · $${w.price_usd}`}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
        {msg && <Text style={st.msg}>{msg}</Text>}
        {Platform.OS !== "web" && <Text style={st.finePrint}>Purchases are one-time and non-refundable. Limited-edition items never return.</Text>}
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
  tabText: { color: colors.textDim, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  tabTextOn: { color: colors.warning },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl, lineHeight: 20 },
  card: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginBottom: spacing.md },
  name: { color: colors.text, fontWeight: "900", fontSize: 16 },
  kind: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  desc: { color: colors.textMid, fontSize: 12, marginTop: 4, lineHeight: 16 },
  btn: { marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.sm },
  btnBuy: { backgroundColor: colors.warning },
  btnEquip: { borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  btnEquipped: { borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(57,255,20,0.1)" },
  btnText: { fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
  finePrint: { color: colors.textDim, fontSize: 10, textAlign: "center", marginTop: spacing.lg, lineHeight: 14 },
  armoryBtn: { padding: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.08)", marginBottom: spacing.md },
  armoryText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  gearHead: { color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  gearThumb: { width: 66, height: 88, borderRadius: radius.sm, overflow: "hidden", backgroundColor: "#05070C", borderWidth: 1, borderColor: colors.border },
  gearThumbWeap: { width: 66, height: 66, alignItems: "center", justifyContent: "center" },
});