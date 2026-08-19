import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { colors, spacing, radius, TITLE_TEXT, RANK_COLORS, bgImage } from "@/src/lib/theme";

const SLOT_LABELS: Record<string, string> = { emblem: "EMBLEM", aura: "AURA", title: "TITLE" };

export default function Loadout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [frames, setFrames] = useState<{ unlocked: string[]; active?: string }>({ unlocked: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [unlock, setUnlock] = useState<any>(null);

  const load = async () => {
    try {
      const c = await apiFetch(token, "/api/cosmetics");
      setData(c);
      setFrames(c.frames || { unlocked: [] });
    } catch {}
    try { setUnlock(await apiFetch(token, "/api/unlockables")); } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  const applyBg = async (bg: any) => {
    if (!bg.unlocked) { setMsg(`${bg.name} unlocks at Level ${bg.level}`); return; }
    try {
      await apiFetch(token, "/api/profile/set-background", { method: "POST", body: JSON.stringify({ background_id: bg.id }) });
      await Promise.all([load(), refresh()]);
      setMsg(`${bg.name} equipped.`);
    } catch (e: any) { setMsg(e?.message || "Locked"); }
  };

  const equip = async (slot: string, id: string) => {
    setMsg(null);
    try {
      await apiFetch(token, "/api/profile/loadout", { method: "POST", body: JSON.stringify({ [slot]: id }) });
      await Promise.all([load(), refresh()]);
    } catch (e: any) { setMsg(e?.message || "Locked — keep leveling up"); }
  };

  const setFrame = async (f: string) => {
    try { await apiFetch(token, "/api/profile/set-frame", { method: "POST", body: JSON.stringify({ frame: f }) }); await Promise.all([load(), refresh()]); } catch (e: any) { setMsg(e?.message || "Locked"); }
  };

  const me = {
    avatar_id: user?.avatar_id, sex: user?.sex,
    equipped_skin: user?.equipped_skin,
    loadout: data?.loadout,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ INVENTORY //</Text>
        <Text style={styles.h1}>INVENTORY</Text>

        <View style={styles.navRow}>
          <Pressable testID="locker-open-store" onPress={() => router.push("/store")} style={styles.navBtn}>
            <Text style={styles.navBtnText}>🛒 STORE</Text>
          </Pressable>
          <Pressable testID="locker-open-armory" onPress={() => router.push("/gear")} style={styles.navBtn}>
            <Text style={styles.navBtnText}>⚔ ARMORY</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <View style={styles.preview}>
              <PlayerAvatar person={me} token={token} size={110} square />
              <Text style={styles.previewName}>{user?.display_name}</Text>
              {!!TITLE_TEXT[data?.loadout?.title || "ti_none"] && (
                <Text style={styles.previewTitle}>{TITLE_TEXT[data.loadout.title]}</Text>
              )}
            </View>

            {(["emblem", "aura", "title"] as const).map((slot) => (
              <View key={slot} style={styles.section}>
                <Text style={styles.sectionTitle}>{SLOT_LABELS[slot]}</Text>
                <View style={styles.chips}>
                  {(data?.catalog?.[slot] || []).map((it: any) => {
                    const active = (data?.loadout?.[slot]) === it.id;
                    return (
                      <Pressable
                        key={it.id}
                        testID={`equip-${it.id}`}
                        disabled={!it.owned}
                        onPress={() => equip(slot, it.id)}
                        style={[styles.chip, active && styles.chipActive, !it.owned && styles.chipLocked,
                          slot === "aura" && it.color ? { borderColor: it.color } : null]}
                      >
                        <Text style={[styles.chipText, active && { color: colors.brandPrimary }]}>
                          {slot === "emblem" ? `${it.icon || "∅"} ` : ""}{it.name}{!it.owned ? ` 🔒L${it.level}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FRAME</Text>
              <View style={styles.chips}>
                {frames.unlocked.map((f) => {
                  const active = (frames.active || "") === f;
                  return (
                    <Pressable key={f} testID={`equip-frame-${f}`} onPress={() => setFrame(f)}
                      style={[styles.chip, active && styles.chipActive, { borderColor: RANK_COLORS[f] || colors.border }]}>
                      <Text style={[styles.chipText, active && { color: colors.brandPrimary }]}>{f}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {unlock && (
              <>
                <Text style={styles.sectionTitle}>APP BACKGROUNDS</Text>
                <View style={styles.bgGrid}>
                  {unlock.backgrounds.map((bg: any) => (
                    <Pressable testID={`bg-${bg.id}`} key={bg.id} onPress={() => applyBg(bg)} style={[styles.bgCard, bg.active && styles.bgActive, !bg.unlocked && styles.bgLocked]}>
                      <View style={styles.bgPreview}>
                        <Image source={bgImage(bg.id, user?.sex)} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <LinearGradient colors={["transparent", "rgba(5,5,8,0.5)"]} style={StyleSheet.absoluteFill} />
                        {!bg.unlocked && <Text style={styles.bgLock}>🔒</Text>}
                        {bg.active && <View style={styles.activeTag}><Text style={styles.activeTagText}>ACTIVE</Text></View>}
                      </View>
                      <Text style={styles.bgName}>{bg.name}</Text>
                      <Text style={styles.bgLvl}>{bg.unlocked ? "UNLOCKED" : `LVL ${bg.level}`}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>WIDGETS</Text>
                {unlock.widgets.map((w: any) => (
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

            {!!msg && <Text style={styles.msg}>{msg}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.lg },
  navRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  navBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.08)", minHeight: 44, justifyContent: "center" },
  navBtnText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  bgGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  bgCard: { width: "47%", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface2 },
  bgActive: { borderColor: colors.brandPrimary, borderWidth: 2 },
  bgLocked: { opacity: 0.6 },
  bgPreview: { height: 100, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bgLock: { fontSize: 24 },
  activeTag: { position: "absolute", top: 6, right: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  activeTagText: { color: "#001122", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bgName: { color: colors.text, fontWeight: "800", paddingHorizontal: spacing.sm, paddingTop: spacing.sm, fontSize: 13 },
  bgLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, marginTop: 2 },
  widgetRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  widgetName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  widgetDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  widgetLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  preview: { alignItems: "center", marginBottom: spacing.lg },
  previewName: { color: colors.text, fontWeight: "900", fontSize: 18, letterSpacing: 1, marginTop: spacing.md },
  previewTitle: { color: colors.warning, fontSize: 11, letterSpacing: 3, fontWeight: "800", marginTop: 4 },
  photoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  photoBtn: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: "center", minHeight: 44, justifyContent: "center" },
  photoBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toggleLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  hint: { color: colors.textDim, fontSize: 11, marginTop: spacing.sm, lineHeight: 16 },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 13, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface2 },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipLocked: { opacity: 0.4 },
  chipText: { color: colors.text, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.lg, letterSpacing: 1 },
});
