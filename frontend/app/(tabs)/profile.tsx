import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, AVATARS, RANK_COLORS, fmtWeight } from "@/src/lib/theme";
import { StrengthChart } from "@/src/components/StrengthChart";

const LIFT_TABS = [["BENCH","bench"],["SQUAT","squat"],["DEAD","deadlift"],["OHP","ohp"]];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, token, refresh, signOut } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [chart, setChart] = useState<any>(null);
  const [liftTab, setLiftTab] = useState("bench");

  useEffect(() => {
    (async () => {
      try { setChart(await apiFetch(token, "/api/progress/chart")); } catch {}
    })();
  }, [token]);

  if (!user) return null;
  const av = avatarFor(user.avatar_id);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank];

  const pickAvatar = async (avatar_id: string) => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ avatar_id }) });
      await refresh();
    } catch {}
    setAvatarOpen(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <Text style={[styles.eyebrow, { paddingHorizontal: spacing.lg }]}>DIGITAL DOSSIER</Text>
      <Text style={[styles.h1, { paddingHorizontal: spacing.lg }]}>PROFILE</Text>

      <View style={styles.heroCard}>
        <Pressable testID="change-avatar" onPress={() => setAvatarOpen(true)} style={[styles.bigAvatar, { borderColor: rankColor }]}>
          <Text style={styles.bigEmoji}>{av.emoji}</Text>
        </Pressable>
        <Text style={styles.name}>{user.display_name}</Text>
        <Text style={[styles.rankTag, { color: rankColor }]}>{rank.toUpperCase()} · LVL {user.level}</Text>
        <View style={styles.badgeRow}>
          {isSubscribed && <View style={[styles.pill, { backgroundColor: colors.warning }]}><Text style={styles.pillText}>★ PREMIUM</Text></View>}
          {user.skool_verified && <View style={[styles.pill, { backgroundColor: colors.success }]}><Text style={styles.pillText}>✓ SKOOL</Text></View>}
        </View>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.info}><Text style={styles.infoL}>BODYWEIGHT</Text><Text style={styles.infoV}>{user.bodyweight_lb} lb</Text></View>
        <View style={styles.info}><Text style={styles.infoL}>AGE</Text><Text style={styles.infoV}>{user.age}</Text></View>
        <View style={styles.info}><Text style={styles.infoL}>XP</Text><Text style={styles.infoV}>{user.xp}</Text></View>
        <View style={styles.info}><Text style={styles.infoL}>STREAK</Text><Text style={styles.infoV}>{user.streak_days}d</Text></View>
      </View>

      <Text style={styles.section}>PR VAULT</Text>
      <View style={styles.grid}>
        {[["BENCH","bench"],["SQUAT","squat"],["DEADLIFT","deadlift"],["OHP","ohp"]].map(([label, key]) => (
          <View key={key} style={styles.prCard}>
            <Text style={styles.prLabel}>{label}</Text>
            <Text style={styles.prValue}>{fmtWeight(user.prs?.[key] || 0)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>STRENGTH CURVE</Text>
      <View style={styles.chartCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartTabs}>
          {LIFT_TABS.map(([label, key]) => (
            <Pressable testID={`chart-tab-${key}`} key={key} onPress={() => setLiftTab(key)} style={[styles.chartChip, liftTab === key && styles.chartChipActive]}>
              <Text style={[styles.chartChipText, liftTab === key && styles.chartChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <StrengthChart data={chart?.[liftTab] || []} color={colors.brandPrimary} />
      </View>

      <Text style={styles.section}>MILESTONE BADGES</Text>
      <View style={styles.badgeGrid}>
        {(user.badges || []).length === 0 ? (
          <Text style={styles.emptyBadges}>Hit 135, 225, 315+ to earn badges.</Text>
        ) : (
          (user.badges || []).map((b: string) => (
            <View key={b} style={styles.badgeCard}>
              <Text style={styles.badgeText}>{b.replace("_", " ").toUpperCase()}</Text>
            </View>
          ))
        )}
      </View>

      <Pressable testID="open-settings" onPress={() => router.push("/settings")} style={styles.actionBtn}>
        <Text style={styles.actionText}>EDIT PROFILE + SKOOL</Text>
      </Pressable>
      <Pressable testID="open-paywall-profile" onPress={() => router.push("/paywall")} style={styles.actionBtn}>
        <Text style={styles.actionText}>MANAGE PREMIUM</Text>
      </Pressable>
      <Pressable testID="sign-out" onPress={signOut} style={[styles.actionBtn, { borderColor: colors.error }]}>
        <Text style={[styles.actionText, { color: colors.error }]}>SIGN OUT</Text>
      </Pressable>

      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT AVATAR</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map((a) => (
                <Pressable testID={`avatar-${a.id}`} key={a.id} onPress={() => pickAvatar(a.id)} style={[styles.avOpt, user.avatar_id === a.id && styles.avOptSel]}>
                  <Text style={{ fontSize: 32 }}>{a.emoji}</Text>
                  <Text style={styles.avOptLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setAvatarOpen(false)} style={styles.modalClose}><Text style={{ color: colors.textDim, letterSpacing: 2 }}>CLOSE</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  heroCard: { alignItems: "center", padding: spacing.lg, marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  bigAvatar: { width: 100, height: 100, borderRadius: radius.md, borderWidth: 3, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  bigEmoji: { fontSize: 54 },
  name: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: spacing.sm, letterSpacing: 1 },
  rankTag: { fontSize: 12, fontWeight: "800", letterSpacing: 3, marginTop: 4 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#001122", fontWeight: "900", fontSize: 10, letterSpacing: 2 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  info: { flex: 1, minWidth: "45%", backgroundColor: colors.surface2, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  infoL: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  infoV: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 4 },
  section: { color: colors.text, letterSpacing: 4, fontWeight: "800", fontSize: 13, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  chartCard: { marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  chartTabs: { gap: spacing.sm, paddingBottom: spacing.md },
  chartChip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface3, flexShrink: 0 },
  chartChipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chartChipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
  chartChipTextActive: { color: colors.brandPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  prCard: { width: "48%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  prLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  prValue: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 4 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.lg },
  badgeCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong },
  badgeText: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  emptyBadges: { color: colors.textDim, paddingHorizontal: spacing.lg },
  actionBtn: { marginTop: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm },
  actionText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", textAlign: "center", marginBottom: spacing.md },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.md },
  avOpt: { width: "28%", alignItems: "center", padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  avOptSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  avOptLabel: { color: colors.textDim, fontSize: 10, marginTop: 4, letterSpacing: 1 },
  modalClose: { alignItems: "center", marginTop: spacing.lg },
});
