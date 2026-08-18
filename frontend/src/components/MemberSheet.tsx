import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor, avatarImage, RANK_COLORS, loadoutTitle } from "@/src/lib/theme";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";

const LIFTS: [string, string][] = [["bench", "BENCH"], ["squat", "SQUAT"], ["deadlift", "DEAD"], ["ohp", "OHP"]];

export function MemberSheet({ userId, visible, onClose }: { userId: string | null; visible: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const [m, setM] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true); setM(null);
    apiFetch(token, `/api/users/${userId}/public`)
      .then(setM)
      .catch(() => setM(null))
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const rankColor = m ? (RANK_COLORS[m.rank] || colors.brandPrimary) : colors.brandPrimary;
  const portrait = m ? avatarImage(m.avatar_id, m.sex) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, m?.founder_backer && styles.sheetBacker]} onPress={() => {}}>
          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} />
          ) : !m ? (
            <Text style={styles.err}>Couldn&apos;t load this member.</Text>
          ) : (
            <>
              <View style={[styles.portraitWrap, m.founder_backer && styles.portraitBacker, { borderColor: m.founder_backer ? colors.warning : rankColor }]}>
                {m.use_photo && m.photo_media_id ? (
                  <Image source={{ uri: `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chat/media/${m.photo_media_id}?token=${token}` }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : portrait ? (
                  <Image source={portrait} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : (
                  <Text style={styles.emoji}>{avatarFor(m.avatar_id).emoji}</Text>
                )}
              </View>
              <Text style={[styles.name, m.founder_backer && { color: colors.warning }]}>{m.display_name}</Text>
              <Text style={[styles.rank, { color: rankColor }]}>{m.rank?.toUpperCase()} · LV {m.level}</Text>
              {!!loadoutTitle(m.loadout) && <Text style={styles.mtitle}>❰ {loadoutTitle(m.loadout)} ❱</Text>}

              <View style={styles.badges}>
                {m.founder_backer && <View style={styles.bBacker}><Text style={styles.bBackerText}>★ FOUNDING BACKER</Text></View>}
                {m.skool_verified && <View style={styles.bSkool}><Text style={styles.bSkoolText}>✓ SKOOL</Text></View>}
              </View>

              <View style={styles.prGrid}>
                {LIFTS.map(([k, label]) => (
                  <View key={k} style={styles.prCell}>
                    <Text style={styles.prLabel}>{label}</Text>
                    <Text style={styles.prVal}>{m.prs?.[k] || 0}<Text style={styles.prUnit}> lb</Text></Text>
                  </View>
                ))}
              </View>

              <View style={styles.statRow}>
                <Stat label="TOTAL" value={`${m.total_lift} lb`} />
                <Stat label="LOGS" value={`${m.workouts_logged}`} />
                <Stat label="BADGES" value={`${m.badges_count}`} />
              </View>
            </>
          )}
          <Pressable testID="member-sheet-close" onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  sheetBacker: { borderColor: colors.warning },
  err: { color: colors.textDim, marginVertical: spacing.xl },
  portraitWrap: { width: 110, height: 110, borderRadius: radius.md, overflow: "hidden", borderWidth: 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  portraitBacker: { shadowColor: colors.warning, shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, borderWidth: 2.5 },
  emoji: { fontSize: 54 },
  name: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: spacing.md },
  rank: { fontSize: 12, letterSpacing: 2, fontWeight: "800", marginTop: 4 },
  mtitle: { color: colors.warning, fontSize: 10, letterSpacing: 3, fontWeight: "800", marginTop: 6 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" },
  bBacker: { backgroundColor: colors.warning, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  bBackerText: { color: "#221900", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  bSkool: { backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  bSkoolText: { color: "#002200", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  prGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg, width: "100%" },
  prCell: { flexBasis: "48%", flexGrow: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  prLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  prVal: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 2 },
  prUnit: { color: colors.textDim, fontSize: 11, fontWeight: "700" },
  statRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: spacing.lg },
  stat: { alignItems: "center" },
  statValue: { color: colors.text, fontWeight: "900", fontSize: 16 },
  statLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  closeBtn: { marginTop: spacing.xl, paddingVertical: spacing.md, minHeight: 44, justifyContent: "center", alignItems: "center", alignSelf: "stretch", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  closeText: { color: colors.textDim, letterSpacing: 3, fontWeight: "800" },
});
