import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Share, Platform } from "react-native";
import * as ExpoLinking from "expo-linking";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ChatRoom } from "@/src/components/ChatRoom";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";

export function GroupsPanel() {
  const { token, user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [myCount, setMyCount] = useState(0);
  const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState<"home" | "chat">("home");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [ann, setAnn] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<any>(null);

  const loadList = async () => {
    try { const d = await apiFetch(token, "/api/groups"); setList(d.groups || []); setCanCreate(d.can_create); setMyCount(d.my_group_count || 0); } catch {}
    try { setChallenge(await apiFetch(token, "/api/group-challenge")); } catch {}
    setLoading(false);
  };
  const openGroup = async (id: string) => {
    try { setSel(await apiFetch(token, `/api/groups/${id}`)); setTab("home"); } catch (e: any) { setMsg(e?.message); }
  };
  useEffect(() => { loadList(); }, [token]);

  const act = async (path: string, body?: any) => {
    try {
      await apiFetch(token, path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      if (sel) await openGroup(sel.id);
      await loadList();
    } catch (e: any) { setMsg(e?.message || "Failed"); }
  };
  const create = async () => {
    if (!name.trim()) { setMsg("Name required"); return; }
    try { const g = await apiFetch(token, "/api/groups", { method: "POST", body: JSON.stringify({ name: name.trim(), description: desc.trim() }) }); setCreating(false); setName(""); setDesc(""); await loadList(); openGroup(g.id); }
    catch (e: any) { setMsg(e?.message || "Failed"); }
  };

  const shareInvite = async () => {
    if (!sel) return;
    try {
      const r = await apiFetch(token, `/api/groups/${sel.id}/invite-code`);
      const ref = user?.user_id ? `?ref=${user.user_id}` : "";
      const url = ExpoLinking.createURL(`/clan/${r.code}${ref}`);
      const message = `Join my clan "${r.name}" on Hutch's Inner Circle:\n${url}`;
      if (Platform.OS === "web") {
        try { await (navigator as any).clipboard.writeText(url); setMsg("Invite link copied!"); }
        catch { setMsg(url); }
        return;
      }
      await Share.share({ message });
    } catch (e: any) { setMsg(e?.message || "Couldn't create invite link"); }
  };

  if (loading) return <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />;

  // ---------- Group detail (home page) ----------
  if (sel) {
    const canEdit = sel.can_edit;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.detailHead}>
          <Pressable testID="group-back" onPress={() => setSel(null)}><Text style={styles.back}>‹ GROUPS</Text></Pressable>
          <View style={styles.segRow}>
            <Pressable testID="group-tab-home" onPress={() => setTab("home")} style={[styles.seg, tab === "home" && styles.segOn]}><Text style={[styles.segT, tab === "home" && styles.segTOn]}>HOME</Text></Pressable>
            {sel.role === "member" || sel.role === "creator" ? (
              <Pressable testID="group-tab-chat" onPress={() => setTab("chat")} style={[styles.seg, tab === "chat" && styles.segOn]}><Text style={[styles.segT, tab === "chat" && styles.segTOn]}>CHAT</Text></Pressable>
            ) : null}
          </View>
        </View>

        {tab === "chat" ? (
          <ChatRoom key={sel.id} room={`group:${sel.id}`} accent={sel.color || colors.brandPrimary} sendTextColor="#001122" placeholder={`Talk with ${sel.name}...`} highlightMine />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
            <Text style={[styles.gName, { color: sel.color || colors.text }]}>{sel.badge ? sel.badge + " " : ""}{sel.name}</Text>
            <Text style={[styles.gLvl, { color: sel.color || colors.brandPrimary }]}>◈ LEVEL {sel.level} · {sel.title} · {sel.member_count} member{sel.member_count === 1 ? "" : "s"}</Text>
            {sel.champion_title ? <Text style={styles.champLine}>🏆 CLAN CHAMPION · {sel.champion_title}</Text> : null}
            <View style={styles.progWrap}>
              <View style={styles.progBar}>
                <View style={[styles.progFill, { width: `${Math.min(100, Math.round(((sel.xp_into_level || 0) / (sel.xp_for_next || 1000)) * 100))}%`, backgroundColor: sel.color || colors.brandPrimary }]} />
              </View>
              <Text style={styles.progText}>
                {sel.xp_into_level || 0} / {sel.xp_for_next || 1000} XP · {sel.xp} total
                {sel.next_tier ? `  →  Lv ${sel.next_tier.level} unlocks ${sel.next_tier.badge || ""} ${sel.next_tier.title}` : "  ·  MAX TIER 🏆"}
              </Text>
            </View>
            <Text style={styles.gDesc}>{sel.description || "No description yet."}</Text>
            <Text style={styles.gCreator}>Led by {sel.creator_name}</Text>

            {sel.role === "none" && (
              <Pressable testID="group-join" onPress={() => act(`/api/groups/${sel.id}/join`)} style={styles.primaryBtn}><Text style={styles.primaryBtnT}>REQUEST TO JOIN</Text></Pressable>
            )}
            {sel.role === "pending" && <View style={styles.pendPill}><Text style={styles.pendT}>⏳ REQUEST PENDING</Text></View>}
            {sel.role === "member" && (
              <Pressable testID="group-leave" onPress={() => act(`/api/groups/${sel.id}/leave`)} style={styles.leaveBtn}><Text style={styles.leaveT}>LEAVE GROUP</Text></Pressable>
            )}

            {/* Announcements */}
            <Text style={styles.section}>📣 ANNOUNCEMENTS</Text>
            {canEdit && (
              <View style={styles.annBox}>
                <TextInput testID="ann-input" value={ann} onChangeText={setAnn} placeholder="Post an announcement…" placeholderTextColor={colors.textDim} style={styles.input} multiline />
                <Pressable testID="ann-post" onPress={async () => { if (ann.trim()) { await act(`/api/groups/${sel.id}/announce`, { text: ann.trim() }); setAnn(""); } }} style={styles.smallBtn}><Text style={styles.smallBtnT}>POST</Text></Pressable>
              </View>
            )}
            {(sel.announcements || []).length === 0 ? <Text style={styles.dim}>No announcements yet.</Text> :
              sel.announcements.map((a: any) => (
                <View key={a.id} style={styles.annRow}><Text style={styles.annText}>{a.text}</Text><Text style={styles.annMeta}>{a.author} · {new Date(a.created_at).toLocaleDateString()}</Text></View>
              ))}

            {/* Pending requests (editors) */}
            {canEdit && (sel.pending || []).length > 0 && (
              <>
                <Text style={styles.section}>⏳ JOIN REQUESTS</Text>
                {sel.pending.map((p: any) => (
                  <View key={p.user_id} style={styles.memRow}>
                    <PlayerAvatar person={p} token={token} size={32} />
                    <Text style={styles.memName}>{p.display_name}</Text>
                    <Pressable testID={`approve-${p.user_id}`} onPress={() => act(`/api/groups/${sel.id}/approve`, { user_id: p.user_id })} style={styles.smallBtn}><Text style={styles.smallBtnT}>APPROVE</Text></Pressable>
                    <Pressable testID={`deny-${p.user_id}`} onPress={() => act(`/api/groups/${sel.id}/deny`, { user_id: p.user_id })} style={styles.xBtn}><Text style={styles.xT}>✕</Text></Pressable>
                  </View>
                ))}
              </>
            )}

            {/* Invite (editors) */}
            {canEdit && (
              <>
                <Pressable testID="share-invite" onPress={shareInvite} style={[styles.primaryBtn, { marginTop: spacing.md }]}>
                  <Text style={styles.primaryBtnT}>🔗 SHARE INVITE LINK</Text>
                </Pressable>
                <Text style={styles.inviteHint}>Anyone who opens your link joins {sel.name} instantly — no approval needed.</Text>
                <View style={styles.annBox}>
                  <TextInput testID="invite-input" value={invite} onChangeText={setInvite} placeholder="Or invite a member by name…" placeholderTextColor={colors.textDim} style={styles.input} autoCapitalize="none" />
                  <Pressable testID="invite-btn" onPress={async () => { if (invite.trim()) { await act(`/api/groups/${sel.id}/invite`, { display_name: invite.trim() }); setInvite(""); } }} style={styles.smallBtn}><Text style={styles.smallBtnT}>INVITE</Text></Pressable>
                </View>
              </>
            )}

            {/* Members */}
            <Text style={styles.section}>👥 MEMBERS ({sel.member_count})</Text>
            {(sel.members || []).map((m: any) => (
              <View key={m.user_id} style={styles.memRow}>
                <PlayerAvatar person={m} token={token} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memName}>{m.display_name}{m.user_id === sel.creator_id ? " 👑" : ""}</Text>
                  <Text style={styles.memRank}>{m.rank}</Text>
                </View>
                {canEdit && m.user_id !== sel.creator_id && (
                  <Pressable testID={`remove-${m.user_id}`} onPress={() => act(`/api/groups/${sel.id}/remove`, { user_id: m.user_id })} style={styles.xBtn}><Text style={styles.xT}>✕</Text></Pressable>
                )}
              </View>
            ))}
            {msg && <Text style={styles.err}>{msg}</Text>}
          </ScrollView>
        )}
      </View>
    );
  }

  // ---------- Group list ----------
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
      {canCreate ? (
        creating ? (
          <View style={styles.annBox}>
            <TextInput testID="grp-name" value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.textDim} style={styles.input} />
            <TextInput testID="grp-desc" value={desc} onChangeText={setDesc} placeholder="Description (optional)" placeholderTextColor={colors.textDim} style={styles.input} multiline />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="grp-create" onPress={create} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryBtnT}>CREATE GROUP</Text></Pressable>
              <Pressable onPress={() => setCreating(false)} style={[styles.leaveBtn, { flex: 1 }]}><Text style={styles.leaveT}>CANCEL</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable testID="new-group" onPress={() => { setCreating(true); setMsg(null); }} style={styles.primaryBtn}><Text style={styles.primaryBtnT}>＋ CREATE A GROUP</Text></Pressable>
        )
      ) : (
        <Text style={styles.dim}>Groups can be created by Founders & premium members. You can still join up to 2 groups.</Text>
      )}
      {msg && <Text style={styles.err}>{msg}</Text>}

      {/* Group (Clan) Challenge */}
      {challenge?.active ? (
        <View style={styles.chalBox}>
          <View style={styles.chalHead}>
            <Text style={styles.chalTitle}>🏆 {challenge.active.title}</Text>
            <Text style={styles.chalDays}>{challenge.active.days_left}d left</Text>
          </View>
          <Text style={styles.chalSub}>Clan vs clan — the group that earns the most XP wins. Winner's clan gets +{challenge.active.reward_xp} XP and every member earns the Clan Champion badge.</Text>
          {(challenge.standings || []).length === 0 ? (
            <Text style={styles.dim}>No XP earned yet — log workouts to climb!</Text>
          ) : (challenge.standings || []).slice(0, 5).map((s: any, i: number) => {
            const mine = (challenge.my_group_ids || []).includes(s.id);
            return (
              <View key={s.id} style={[styles.chalRow, mine && styles.chalRowMine]}>
                <Text style={[styles.chalRank, i === 0 && { color: "#FBBF24" }]}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</Text>
                <Text style={[styles.chalName, { color: s.color }]} numberOfLines={1}>{s.badge ? s.badge + " " : ""}{s.name}{mine ? " (you)" : ""}</Text>
                <Text style={styles.chalXp}>+{s.gained} XP</Text>
              </View>
            );
          })}
        </View>
      ) : challenge?.last?.winner_name ? (
        <View style={styles.chalBoxDim}>
          <Text style={styles.chalLast}>🏆 Last clash — <Text style={{ color: colors.brandPrimary }}>{challenge.last.winner_name}</Text> won {challenge.last.title}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>ALL GROUPS ({list.length})</Text>
      {list.length === 0 ? <Text style={styles.dim}>No groups yet. Be the first to start one!</Text> :
        list.map((g) => (
          <Pressable key={g.id} testID={`group-${g.id}`} onPress={() => openGroup(g.id)} style={[styles.groupCard, { borderColor: g.color || colors.borderStrong }]}>
            <View style={[styles.gcBadge, { borderColor: g.color || colors.border }]}>
              <Text style={[styles.gcBadgeT, { color: g.color || colors.brandPrimary }]}>{g.badge ? g.badge : g.level}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gcName}>{g.name}{g.role === "creator" ? " 👑" : g.role === "member" ? " ✓" : ""}</Text>
              <Text style={[styles.gcMeta, { color: g.color || colors.textDim }]}>◈ Lv {g.level} · {g.title} · {g.member_count} member{g.member_count === 1 ? "" : "s"}</Text>
            </View>
            <Text style={[styles.gcArrow, { color: g.color || colors.brandPrimary }]}>›</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  detailHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  segRow: { flexDirection: "row", gap: 6 },
  seg: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  segOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  segT: { color: colors.textDim, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  segTOn: { color: colors.brandPrimary },
  gName: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 1 },
  gLvl: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", marginTop: 4 },
  progWrap: { marginTop: spacing.sm },
  progBar: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  progFill: { height: "100%", borderRadius: 4 },
  progText: { color: colors.textDim, fontSize: 10, fontWeight: "700", marginTop: 5, letterSpacing: 0.3 },
  champLine: { color: "#FBBF24", fontSize: 11, fontWeight: "900", letterSpacing: 0.5, marginTop: 4 },
  chalBox: { backgroundColor: "rgba(251,191,36,0.08)", borderRadius: radius.md, borderWidth: 1, borderColor: "#FBBF24", padding: spacing.md, marginTop: spacing.md },
  chalBoxDim: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md },
  chalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chalTitle: { color: "#FBBF24", fontWeight: "900", fontSize: 14, letterSpacing: 0.5, flex: 1 },
  chalDays: { color: colors.text, fontWeight: "900", fontSize: 11, backgroundColor: colors.surface3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  chalSub: { color: colors.textMid, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: spacing.sm },
  chalRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  chalRowMine: { backgroundColor: "rgba(110,231,249,0.06)" },
  chalRank: { width: 30, color: colors.textDim, fontWeight: "900", fontSize: 13, textAlign: "center" },
  chalName: { flex: 1, fontWeight: "900", fontSize: 13 },
  chalXp: { color: colors.text, fontWeight: "800", fontSize: 12 },
  chalLast: { color: colors.textMid, fontSize: 12, fontWeight: "700" },
  gDesc: { color: colors.textMid, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
  gCreator: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  section: { color: colors.textDim, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: spacing.lg, marginBottom: spacing.sm },
  primaryBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 13, alignItems: "center", marginTop: spacing.md },
  primaryBtnT: { color: "#001122", fontWeight: "900", letterSpacing: 1 },
  leaveBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingVertical: 13, alignItems: "center", marginTop: spacing.md },
  leaveT: { color: colors.error, fontWeight: "900", letterSpacing: 1 },
  pendPill: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingVertical: 11, alignItems: "center", marginTop: spacing.md },
  pendT: { color: colors.warning, fontWeight: "900" },
  annBox: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, fontSize: 14 },
  smallBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, alignItems: "center" },
  smallBtnT: { color: "#001122", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  xBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10 },
  xT: { color: colors.error, fontWeight: "900" },
  annRow: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary, padding: spacing.md, marginBottom: spacing.sm },
  annText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  annMeta: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  memRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  memName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  memRank: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  groupCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm },
  gcBadge: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  gcBadgeT: { fontWeight: "900", fontSize: 14 },
  gcName: { color: colors.text, fontWeight: "900", fontSize: 15 },
  gcMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  gcArrow: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900" },
  dim: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
  inviteHint: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: spacing.sm },
  err: { color: colors.error, marginTop: spacing.sm, textAlign: "center" },
});
