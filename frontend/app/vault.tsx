import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, bgImage } from "@/src/lib/theme";

export default function Vault() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try { setData(await apiFetch(token, "/api/unlockables")); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [token]);

  const apply = async (bg: any) => {
    if (!bg.unlocked) { setMsg(`${bg.name} unlocks at Level ${bg.level}`); return; }
    try {
      await apiFetch(token, "/api/profile/set-background", { method: "POST", body: JSON.stringify({ background_id: bg.id }) });
      await refresh();
      await load();
      setMsg(`${bg.name} equipped.`);
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
      <Text style={styles.eyebrow}>REWARDS · LVL {data?.level ?? "—"}</Text>
      <Text style={styles.h1}>THE VAULT</Text>
      <Text style={styles.helper}>Level up to unlock backgrounds & widgets.</Text>

      {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <>
          <Text style={styles.section}>APP BACKGROUNDS</Text>
          <View style={styles.grid}>
            {data.backgrounds.map((bg: any) => (
              <Pressable testID={`bg-${bg.id}`} key={bg.id} onPress={() => apply(bg)} style={[styles.bgCard, bg.active && styles.bgActive, !bg.unlocked && styles.bgLocked]}>
                <View style={styles.bgPreview}>
                  <Image source={bgImage(bg.id)} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <LinearGradient colors={["transparent", "rgba(5,5,8,0.5)"]} style={StyleSheet.absoluteFill} />
                  {!bg.unlocked && <Text style={styles.lock}>🔒</Text>}
                  {bg.active && <View style={styles.activeTag}><Text style={styles.activeTagText}>ACTIVE</Text></View>}
                  {bg.perk_rank && <View style={styles.perkTag}><Text style={styles.perkTagText}>{bg.perk_rank.toUpperCase()} PERK</Text></View>}
                </View>
                <Text style={styles.bgName}>{bg.name}</Text>
                <Text style={styles.bgLvl}>{bg.unlocked ? "UNLOCKED" : `LVL ${bg.level}`}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>WIDGETS</Text>
          {data.widgets.map((w: any) => (
            <View key={w.id} style={[styles.widgetRow, !w.unlocked && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.widgetName}>{w.name} {w.unlocked ? "" : "🔒"}</Text>
                <Text style={styles.widgetDesc}>{w.desc}</Text>
              </View>
              <Text style={[styles.widgetLvl, w.unlocked && { color: colors.success }]}>{w.unlocked ? "UNLOCKED" : `LVL ${w.level}`}</Text>
            </View>
          ))}
        </>
      )}
      {msg && <Text testID="vault-msg" style={styles.msg}>{msg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 2, marginTop: 4 },
  helper: { color: colors.textDim, marginTop: 4 },
  section: { color: colors.text, letterSpacing: 4, fontWeight: "800", fontSize: 13, marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  bgCard: { width: "47%", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface2 },
  bgActive: { borderColor: colors.brandPrimary, borderWidth: 2 },
  bgLocked: { opacity: 0.6 },
  bgPreview: { height: 110, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  lock: { fontSize: 24 },
  activeTag: { position: "absolute", top: 6, right: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  activeTagText: { color: "#001122", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  perkTag: { position: "absolute", bottom: 6, left: 6, backgroundColor: colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  perkTagText: { color: "#332200", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  bgName: { color: colors.text, fontWeight: "800", paddingHorizontal: spacing.sm, paddingTop: spacing.sm, fontSize: 13 },
  bgLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, marginTop: 2 },
  widgetRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  widgetName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  widgetDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  widgetLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  msg: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.lg, letterSpacing: 2 },
});
