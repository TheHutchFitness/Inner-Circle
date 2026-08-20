import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Linking } from "react-native";
import { apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

// Universal links: on a phone these open the installed TikTok / Instagram app,
// and fall back to the mobile website (or browser on web) when the app is absent.
export const tiktokUrl = (h: string) => `https://www.tiktok.com/@${h}`;
export const instagramUrl = (h: string) => `https://www.instagram.com/${h}`;
export const youtubeUrl = (h: string) => `https://www.youtube.com/@${h}`;

const open = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

/** Read-only tappable chips (used on other members' profiles). */
export function SocialLinksBar({
  tiktok,
  instagram,
  youtube,
  align = "center",
}: {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  align?: "center" | "flex-start";
}) {
  const tt = (tiktok || "").trim();
  const ig = (instagram || "").trim();
  const yt = (youtube || "").trim();
  if (!tt && !ig && !yt) return null;
  return (
    <View style={[styles.barRow, { justifyContent: align }]}>
      {!!tt && (
        <Pressable testID="social-tiktok-link" onPress={() => open(tiktokUrl(tt))} style={styles.chip}>
          <Text style={styles.chipIcon}>🎵</Text>
          <Text style={styles.chipText}>@{tt}</Text>
        </Pressable>
      )}
      {!!ig && (
        <Pressable testID="social-instagram-link" onPress={() => open(instagramUrl(ig))} style={styles.chip}>
          <Text style={styles.chipIcon}>📸</Text>
          <Text style={styles.chipText}>@{ig}</Text>
        </Pressable>
      )}
      {!!yt && (
        <Pressable testID="social-youtube-link" onPress={() => open(youtubeUrl(yt))} style={styles.chip}>
          <Text style={styles.chipIcon}>▶️</Text>
          <Text style={styles.chipText}>@{yt}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Editable socials for the signed-in athlete's own player card. */
export function SocialLinksEditor({
  token,
  tiktok,
  instagram,
  youtube,
  onSaved,
}: {
  token: string | null;
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [tt, setTt] = useState(tiktok || "");
  const [ig, setIg] = useState(instagram || "");
  const [yt, setYt] = useState(youtube || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTt(tiktok || "");
    setIg(instagram || "");
    setYt(youtube || "");
  }, [tiktok, instagram, youtube]);

  const dirty = tt.trim() !== (tiktok || "").trim() || ig.trim() !== (instagram || "").trim() || yt.trim() !== (youtube || "").trim();

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(token, "/api/profile/update", {
        method: "PATCH",
        body: JSON.stringify({ social_tiktok: tt.trim(), social_instagram: ig.trim(), social_youtube: yt.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      if (onSaved) await onSaved();
    } catch {}
    setBusy(false);
  };

  return (
    <View style={styles.editWrap}>
      <Text style={styles.editLabel}>SOCIAL LINKS</Text>
      <View style={styles.inputRow}>
        <Text style={styles.inputIcon}>🎵</Text>
        <Text style={styles.at}>@</Text>
        <TextInput
          testID="social-tiktok-input"
          value={tt}
          onChangeText={setTt}
          placeholder="tiktok username"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.inputIcon}>📸</Text>
        <Text style={styles.at}>@</Text>
        <TextInput
          testID="social-instagram-input"
          value={ig}
          onChangeText={setIg}
          placeholder="instagram username"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.inputIcon}>▶️</Text>
        <Text style={styles.at}>@</Text>
        <TextInput
          testID="social-youtube-input"
          value={yt}
          onChangeText={setYt}
          placeholder="youtube handle"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      {dirty && (
        <Pressable testID="social-save" onPress={save} disabled={busy} style={styles.saveBtn}>
          <Text style={styles.saveText}>{busy ? "SAVING..." : "SAVE LINKS"}</Text>
        </Pressable>
      )}
      {saved && <Text style={styles.savedMsg}>Links saved ✓</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface3,
  },
  chipIcon: { fontSize: 13 },
  chipText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12 },
  editWrap: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  editLabel: { color: colors.textDim, fontSize: 9, fontWeight: "800", letterSpacing: 2, marginBottom: 6 },
  inputRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, marginBottom: 6,
  },
  inputIcon: { fontSize: 13, marginRight: 5 },
  at: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  input: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 7, paddingHorizontal: 2 },
  saveBtn: {
    paddingVertical: 8, alignItems: "center", borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)",
  },
  saveText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  savedMsg: { color: colors.success, fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 5 },
});
