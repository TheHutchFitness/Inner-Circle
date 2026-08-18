import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
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

function Avatar({ id, size = 34 }: { id: string; size?: number }) {
  const img = avatarImage(id);
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

export default function Founders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, refresh } = useAuth();
  const { offerings, hasBackerEntitlement, purchase, isPurchasing, identityReady } = useSubscription();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"founders" | "backers">("founders");
  const [msg, setMsg] = useState<string | null>(null);

  const pkg = findBackerPkg(offerings);
  const price = pkg?.product?.priceString || BACKER_FALLBACK_PRICE;

  const load = async () => {
    try { setData(await apiFetch(token, "/api/founders")); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const back = async () => {
    setMsg(null);
    if (!pkg) { setMsg("Backing isn't available yet — please try again shortly."); return; }
    try {
      await purchase(pkg);
      await apiFetch(token, "/api/founders/back", { method: "POST" });
      await refresh();
      await load();
      setTab("backers");
      setMsg("You're a backer — thank you for fueling the build.");
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
                  <Avatar id={f.avatar_id} />
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
            {data?.backers?.length ? (
              <View style={styles.backerWrap}>
                {data.backers.map((b: any, i: number) => (
                  <View key={i} testID={`backer-${i}`} style={styles.backerChip}>
                    <Avatar id={b.avatar_id} size={26} />
                    <Text style={styles.backerName}>{b.display_name}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>No backers yet. Be the first to fuel the build.</Text>
            )}
          </>
        )}

        {isBacker ? (
          <View style={styles.thanksCard}>
            <Text style={styles.thanksText}>✓ YOU&apos;RE A DEVELOPMENT BACKER — THANK YOU</Text>
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
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl },
  supportCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.05)" },
  supportTitle: { color: colors.warning, letterSpacing: 3, fontWeight: "900", fontSize: 14 },
  supportBody: { color: colors.textMid, marginTop: 6, lineHeight: 19 },
  primary: { marginTop: spacing.lg, backgroundColor: colors.warning, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#221900", fontWeight: "900", letterSpacing: 2 },
  simulated: { color: colors.textDim, textAlign: "center", marginTop: spacing.sm, fontSize: 11, letterSpacing: 1 },
  thanksCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.success, alignItems: "center" },
  thanksText: { color: "#002200", fontWeight: "900", letterSpacing: 1, fontSize: 12, textAlign: "center" },
  msg: { color: colors.warning, textAlign: "center", marginTop: spacing.md, letterSpacing: 1 },
});
