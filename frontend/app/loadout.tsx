import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { colors, spacing, radius, TITLE_TEXT, RANK_COLORS } from "@/src/lib/theme";

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

  const load = async () => {
    try {
      const c = await apiFetch(token, "/api/cosmetics");
      setData(c);
      setFrames(c.frames || { unlocked: [] });
    } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

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

  const toggleUsePhoto = async (v: boolean) => {
    setMsg(null);
    try { await apiFetch(token, "/api/profile/loadout", { method: "POST", body: JSON.stringify({ use_photo: v }) }); await Promise.all([load(), refresh()]); }
    catch (e: any) { setMsg(e?.message || "Upload a photo first"); }
  };

  const uploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload a profile picture.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setBusy(true); setMsg(null);
    try {
      const form = new FormData();
      const name = asset.fileName || "photo.jpg";
      const type = asset.mimeType || "image/jpeg";
      if (asset.uri.startsWith("data:")) {
        const blob = await (await fetch(asset.uri)).blob();
        form.append("file", blob as any, name);
      } else {
        form.append("file", { uri: asset.uri, name, type } as any);
      }
      const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/profile/photo`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Upload failed");
      await Promise.all([load(), refresh()]);
      setMsg("Photo updated ✓");
    } catch (e: any) { setMsg(e?.message || "Upload failed"); }
    setBusy(false);
  };

  const me = {
    avatar_id: user?.avatar_id, sex: user?.sex,
    photo_media_id: data?.photo_media_id, use_photo: data?.use_photo,
    loadout: data?.loadout,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ LOADOUT //</Text>
        <Text style={styles.h1}>LOCKER</Text>

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

            <View style={styles.photoRow}>
              <Pressable testID="upload-photo" onPress={uploadPhoto} disabled={busy} style={styles.photoBtn}>
                {busy ? <ActivityIndicator color="#001122" /> : <Text style={styles.photoBtnText}>{data?.photo_media_id ? "CHANGE PHOTO" : "UPLOAD PHOTO"}</Text>}
              </Pressable>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>USE PHOTO</Text>
                <Switch value={!!data?.use_photo} onValueChange={toggleUsePhoto} disabled={!data?.photo_media_id}
                  trackColor={{ true: colors.brandPrimary, false: colors.border }} />
              </View>
            </View>
            <Text style={styles.hint}>Off = show your anime avatar. On = show your uploaded photo (everywhere).</Text>

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
