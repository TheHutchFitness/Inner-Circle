import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Platform } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription, rcEnabled } from "@/src/lib/revenuecat";
import { colors, spacing, radius, RANK_COLORS, avatarFor, avatarImage } from "@/src/lib/theme";

const BACKER_FALLBACK_PRICE = "$25.00";

function findBackerPkg(offerings: any) {
  const cur = offerings?.current;
  if (!cur) return null;
  return (
    cur.availablePackages?.find(
      (p: any) =>
        p.identifier === "backer" ||
        p.identifier === "founder_backer" ||
        p.product?.identifier === "founder_backer"
    ) || null
  );
}

function Avatar({ id, sex, size = 34 }: { id: string; sex?: string; size?: number }) {
  const img = avatarImage(id, sex);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 4 }]}>
      {img ? (
        <Image source={img} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{avatarFor(id).emoji}</Text>
      )}
    </View>
  );
}

function BackerCard({ b, index, isMe }: { b: any; index: number; isMe?: boolean }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withDelay(
      index * 60,
      withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [index]);
  const starStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + glow.value * 0.45,
    transform: [{ scale: 1 + glow.value * 0.18 }],
  }));
  const rc = RANK_COLORS[b.rank] || colors.warning;
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify()}
      testID={`backer-${index}`}
      style={[styles.backerCard, isMe && styles.backerCardMe]}
    >
      <Animated.Text style={[styles.backerCardStar, starStyle]}>★</Animated.Text>
      <Avatar id={b.avatar_id} sex={b.sex} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.backerCardName} numberOfLines={1}>{b.display_name}</Text>
        <Text style={[styles.backerCardRank, { color: rc }]}>{(b.rank || "").toUpperCase()}</Text>
      </View>
      {isMe && <Text style={styles.backerYouTag}>YOU</Text>}
    </Animated.View>
  );
}

export default function Founders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const { offerings, hasBackerEntitlement, purchase, isPurchasing, identityReady } = useSubscription();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"founders" | "backers">("founders");
  const [msg, setMsg] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const pkg = findBackerPkg(offerings);
  const price = pkg?.product?.priceString || BACKER_FALLBACK_PRICE;

  const load = async () => {
    try { setData(await apiFetch(token, "/api/founders")); } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  // Backer status is granted server-side only after RevenueCat confirms the purchase
  // via its webhook — retry briefly to cover webhook lag.
  const syncBack = async (attempts = 5): Promise<boolean> => {
    for (let i = 0; i < attempts; i++) {
      try {
        await apiFetch(token, "/api/founders/back", { method: "POST" });
        return true;
      } catch (e: any) {
        const m = String(e?.message || e).toLowerCase();
        if (!m.includes("not verified") && !m.includes("402")) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    return false;
  };

  const back = async () => {
    setMsg(null);
    if (!pkg) { setMsg("Backing isn't available yet — please try again shortly."); return; }
    try {
      await purchase(pkg);
      setMsg("Verifying your purchase…");
      const ok = await syncBack();
      await refresh();
      await load();
      setTab("backers");
      if (ok) { setMsg(null); setCelebrate(true); }
      else setMsg("Purchase received — we're still confirming it with the store. Your backer badge will appear shortly.");
    } catch (e: any) {
      if (!String(e?.message || e).includes("userCancelled")) setMsg(e?.message || "Purchase failed");
    }
  };

  const isBacker = data?.me?.is_backer || hasBackerEntitlement;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ HALL OF FOUNDERS //</Text>
        <Text style={styles.h1}>FOUNDERS</Text>
        <Text style={styles.helper}>The first {data?.founder_limit ?? 100} to answer the call — locked in forever.</Text>

        {data?.me?.is_founder && (
          <LinearGradient colors={[colors.brandTertiary, colors.surface2]} style={styles.meCard}>
            <Text style={styles.meLabel}>YOUR STANDING</Text>
            <Text style={styles.meNumber}>FOUNDER #{data.me.number}</Text>
            {isBacker && <Text style={styles.meBacker}>★ DEVELOPMENT BACKER</Text>}
          </LinearGradient>
        )}

        <View style={styles.tabRow}>
          <Pressable testID="founders-tab-list" onPress={() => setTab("founders")} style={[styles.tabBtn, tab === "founders" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === "founders" && styles.tabBtnTextActive]}>FIRST 100</Text>
          </Pressable>
          <Pressable testID="founders-tab-backers" onPress={() => setTab("backers")} style={[styles.tabBtn, tab === "backers" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === "backers" && styles.tabBtnTextActive]}>BACKERS ({data?.backers?.length ?? 0})</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : tab === "founders" ? (
          data?.founders?.length ? (
            data.founders.map((f: any) => {
              const rc = RANK_COLORS[f.rank] || colors.brandPrimary;
              return (
                <View key={f.number} testID={`founder-${f.number}`} style={styles.row}>
                  <Text style={styles.num}>#{f.number}</Text>
                  <Avatar id={f.avatar_id} sex={f.sex} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{f.display_name}</Text>
                    <Text style={[styles.rank, { color: rc }]}>{f.rank.toUpperCase()}</Text>
                  </View>
                  {f.is_backer && <Text style={styles.backerStar}>★</Text>}
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>No founders yet. Be the first to enlist.</Text>
          )
        ) : (
          <>
            <Text style={styles.sectionNote}>Athletes who chipped in toward future development. Respect.</Text>
            {(() => {
              const raw = data?.backers ?? [];
              // Pin the current user's own backer card to the very top with a highlight
              const meCard = isBacker && user
                ? { display_name: user.display_name || "You", avatar_id: user.avatar_id, sex: user.sex, rank: user.rank }
                : null;
              const others = meCard
                ? raw.filter((b: any) => b.display_name !== meCard.display_name)
                : raw;
              const list = meCard ? [meCard, ...others] : others;
              return list.length ? (
                <View style={styles.backerList}>
                  {list.map((b: any, i: number) => (
                    <BackerCard key={i} b={b} index={i} isMe={!!meCard && i === 0} />
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>No backers yet. Be the first to fuel the build.</Text>
              );
            })()}
          </>
        )}

        {isBacker ? (
          <View style={styles.thanksCard}>
            <Text style={styles.thanksText}>✓ YOU&apos;RE A DEVELOPMENT BACKER — THANK YOU</Text>
            {!!data?.me?.receipt?.order_number && (
              <Text style={styles.thanksOrder}>ORDER {data.me.receipt.order_number} · {data.me.receipt.amount}</Text>
            )}
          </View>
        ) : (
          <View style={styles.supportCard}>
            <Text style={styles.supportTitle}>BACK THE BUILD</Text>
            <Text style={styles.supportBody}>
              Chip in toward future features & improvements. Your name goes up in the Backers hall forever.
            </Text>
            <Pressable
              testID="founders-back"
              onPress={back}
              disabled={isPurchasing || !identityReady}
              style={[styles.primary, (!identityReady || isPurchasing) && { opacity: 0.6 }]}
            >
              {isPurchasing ? <ActivityIndicator color="#001122" /> : <Text style={styles.primaryText}>BECOME A BACKER — {price}</Text>}
            </Pressable>
            {!pkg && <Text style={styles.simulated}>Offer syncing… the product may still be setting up.</Text>}
            {!rcEnabled && <Text style={styles.simulated}>Simulated in web preview.</Text>}
          </View>
        )}

        {msg && <Text testID="founders-msg" style={styles.msg}>{msg}</Text>}
      </ScrollView>

      <Modal visible={celebrate} transparent animationType="fade" onRequestClose={() => setCelebrate(false)}>
        <View style={styles.celebrateWrap}>
          <View style={styles.celebrateCard}>
            <Text style={styles.celebrateStar}>★</Text>
            <Text style={styles.celebrateTitle}>YOU&apos;RE A BACKER</Text>
            <Text style={styles.celebrateBody}>Thank you for fueling the build. Your name is now etched into the Backers hall — forever.</Text>
            {!!data?.me?.receipt?.order_number && (
              <View style={styles.celebrateReceipt}>
                <Text style={styles.celebrateReceiptRow}>ORDER #</Text>
                <Text style={styles.celebrateReceiptNum}>{data.me.receipt.order_number}</Text>
                <Text style={styles.celebrateReceiptAmt}>{data.me.receipt.amount} · PAID</Text>
              </View>
            )}
            <Pressable testID="celebrate-close" onPress={() => setCelebrate(false)} style={styles.celebrateBtn}>
              <Text style={styles.celebrateBtnText}>LET&apos;S GO</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4, lineHeight: 18 },
  meCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center" },
  meLabel: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 10, fontWeight: "800" },
  meNumber: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: 2, marginTop: 4 },
  meBacker: { color: colors.warning, letterSpacing: 2, fontWeight: "800", fontSize: 12, marginTop: 6 },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  tabBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  tabBtnText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  tabBtnTextActive: { color: colors.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  num: { color: colors.brandPrimary, fontWeight: "900", fontSize: 13, width: 40, letterSpacing: 1 },
  avatar: { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  name: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  rank: { fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  backerStar: { color: colors.warning, fontSize: 16 },
  sectionNote: { color: colors.textDim, fontSize: 12, marginBottom: spacing.md, lineHeight: 17 },
  backerWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  backerChip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.06)" },
  backerName: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  backerList: { gap: spacing.sm },
  backerCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: "rgba(255,234,0,0.35)",
    backgroundColor: "rgba(255,234,0,0.05)",
  },
  backerCardMe: {
    borderColor: colors.warning, borderWidth: 2,
    backgroundColor: "rgba(255,234,0,0.12)",
    shadowColor: colors.warning, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  backerCardStar: { color: colors.warning, fontSize: 22, width: 26, textAlign: "center" },
  backerCardName: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 14 },
  backerCardRank: { fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  backerYouTag: {
    color: "#221900", backgroundColor: colors.warning, fontWeight: "900", fontSize: 10,
    letterSpacing: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, overflow: "hidden",
  },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl },
  supportCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.05)" },
  supportTitle: { color: colors.warning, letterSpacing: 3, fontWeight: "900", fontSize: 14 },
  supportBody: { color: colors.textMid, marginTop: 6, lineHeight: 19 },
  primary: { marginTop: spacing.lg, backgroundColor: colors.warning, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#221900", fontWeight: "900", letterSpacing: 2 },
  simulated: { color: colors.textDim, textAlign: "center", marginTop: spacing.sm, fontSize: 11, letterSpacing: 1 },
  thanksCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.success, alignItems: "center" },
  thanksText: { color: "#002200", fontWeight: "900", letterSpacing: 1, fontSize: 12, textAlign: "center" },
  thanksOrder: { color: "#003300", fontWeight: "800", letterSpacing: 1, fontSize: 10, textAlign: "center", marginTop: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  msg: { color: colors.warning, textAlign: "center", marginTop: spacing.md, letterSpacing: 1 },
  celebrateWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  celebrateCard: { width: "100%", backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, padding: spacing.xl, alignItems: "center" },
  celebrateStar: { color: colors.warning, fontSize: 64, fontWeight: "900" },
  celebrateTitle: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm, textAlign: "center" },
  celebrateBody: { color: colors.textMid, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  celebrateReceipt: { marginTop: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: "rgba(255,234,0,0.06)", alignSelf: "stretch" },
  celebrateReceiptRow: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  celebrateReceiptNum: { color: colors.warning, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  celebrateReceiptAmt: { color: colors.text, fontSize: 11, letterSpacing: 1, fontWeight: "800", marginTop: 4 },
  celebrateBtn: { marginTop: spacing.xl, backgroundColor: colors.warning, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  celebrateBtnText: { color: "#221900", fontWeight: "900", letterSpacing: 3 },
});
