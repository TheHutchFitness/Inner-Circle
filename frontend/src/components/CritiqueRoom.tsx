import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform,
  Alert, Linking, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { VerifyPanel } from "@/src/components/VerifyPanel";
import { MemberSheet } from "@/src/components/MemberSheet";
import { SpotlightMedia } from "@/src/components/SpotlightMedia";
import { NeonButton } from "@/src/components/NeonButton";
import { colors, spacing, radius, RANK_COLORS, avatarFor } from "@/src/lib/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export type RoomConfig = {
  room: "pr" | "form";
  eyebrow: string;
  title: string;
  helper: string;
  accent: string;
  coachName: string;
  ctaLabel: string;
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CritiqueRoom({ cfg }: { cfg: RoomConfig }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();

  const canAccess = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.is_founder || user?.is_admin;
  const isVerified = !!(user?.email_verified || user?.phone_verified);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const [feed, setFeed] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [view, setView] = useState<"feed" | "board">("feed");
  const [composerOpen, setComposerOpen] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [exercise, setExercise] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [bodyweight, setBodyweight] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [active, setActive] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => { try { setFeed(await apiFetch(token, `/api/rooms/${cfg.room}/feed`)); } catch {} };
  const loadBoard = async () => { try { setBoard(await apiFetch(token, `/api/rooms/${cfg.room}/leaderboard`)); } catch {} };
  useEffect(() => { if (canAccess) { load(); loadBoard(); } /* eslint-disable-next-line */ }, [canAccess]);

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  const ensurePermission = async () => {
    if (Platform.OS === "web") return true;
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.granted) return true;
      if (perm.canAskAgain) return false;
    }
    Alert.alert("Photos access needed", "Enable photo & video access in Settings to post.",
      [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
    return false;
  };

  const pick = async (kind: "image" | "video") => {
    setErr(null);
    if (!isVerified) { setVerifyOpen(true); return; }
    if (!(await ensurePermission())) return;
    let res;
    try {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === "video" ? ["videos"] : ["images"],
        quality: 0.7, videoMaxDuration: 60,
      });
    } catch { setErr("Could not open gallery."); return; }
    if (res.canceled || !res.assets?.length) return;
    setPending(res.assets[0]);
    setComposerOpen(true);
  };

  const submit = async () => {
    if (!pending || submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const isVid = (pending.type === "video") || /\.(mp4|mov|webm)$/i.test(pending.uri || "");
      const name = pending.fileName || (isVid ? "lift.mp4" : "lift.jpg");
      const type = pending.mimeType || (isVid ? "video/mp4" : "image/jpeg");
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(pending.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: pending.uri, name, type } as any);
      }
      form.append("exercise", exercise.trim());
      form.append("weight", weight.trim());
      form.append("reps", reps.trim());
      form.append("bodyweight", bodyweight.trim());
      if (caption.trim()) form.append("caption", caption.trim());
      const r = await fetch(`${API}/api/rooms/${cfg.room}/submit`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Submission failed"); }
      setPending(null); setExercise(""); setWeight(""); setReps(""); setBodyweight(""); setCaption(""); setComposerOpen(false);
      await load();
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
    } catch (e: any) { setErr(e.message); }
    setSubmitting(false);
  };

  const toggleLike = async (post: any) => {
    setFeed((f) => f.map((p) => p.post_id === post.post_id
      ? { ...p, liked: !p.liked, like_count: Math.max(0, (p.like_count || 0) + (p.liked ? -1 : 1)) } : p));
    try { await apiFetch(token, `/api/rooms/${cfg.room}/${post.post_id}/like`, { method: "POST" }); }
    catch { load(); }
  };

  const openComments = async (post: any) => {
    setActive(post); setComments([]); setCommentText("");
    try { setComments(await apiFetch(token, `/api/rooms/${cfg.room}/${post.post_id}/comments`)); } catch {}
  };

  const postComment = async () => {
    if (!commentText.trim() || posting || !active) return;
    setPosting(true);
    try {
      await apiFetch(token, `/api/rooms/${cfg.room}/${active.post_id}/comments`,
        { method: "POST", body: JSON.stringify({ text: commentText.trim() }) });
      setCommentText("");
      setComments(await apiFetch(token, `/api/rooms/${cfg.room}/${active.post_id}/comments`));
      setFeed((f) => f.map((p) => p.post_id === active.post_id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
    } catch {}
    setPosting(false);
  };

  const deleteComment = async (c: any) => {
    if (!active) return;
    setComments((list) => list.filter((x) => x.comment_id !== c.comment_id));
    setFeed((f) => f.map((p) => p.post_id === active.post_id ? { ...p, comment_count: Math.max(0, (p.comment_count || 1) - 1) } : p));
    try { await apiFetch(token, `/api/rooms/${cfg.room}/${active.post_id}/comments/${c.comment_id}`, { method: "DELETE" }); } catch {}
  };

  const deletePost = (post: any) => {
    const go = async () => {
      setFeed((f) => f.filter((p) => p.post_id !== post.post_id));
      try { await apiFetch(token, `/api/rooms/${cfg.room}/${post.post_id}`, { method: "DELETE" }); } catch {}
    };
    if (Platform.OS === "web") { if (typeof window !== "undefined" && window.confirm("Delete this post?")) go(); return; }
    Alert.alert("Delete post?", "This removes the post and its comments.",
      [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: go }]);
  };

  if (!canAccess) {
    return (
      <View style={[st.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={st.eyebrow}>MEMBERS ONLY</Text>
        <Text style={st.gateTitle}>{cfg.title} IS LOCKED</Text>
        <Text style={st.gateSub}>This room is for verified Skool members or $5/mo premium athletes.</Text>
        <Pressable testID={`${cfg.room}-paywall`} onPress={() => router.push("/paywall")} style={st.gateBtn}>
          <Text style={st.gateBtnText}>UNLOCK PREMIUM</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg }}><Text style={st.backDim}>BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 100 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={[st.eyebrow, { color: cfg.accent }]}>{cfg.eyebrow}</Text>
        <Text style={st.h1}>{cfg.title}</Text>
        <Text style={st.helper}>{cfg.helper}</Text>

        <View style={st.pickRow}>
          <Pressable testID={`${cfg.room}-pick-video`} onPress={() => pick("video")} style={[st.pickBtn, { borderColor: cfg.accent }]}>
            <Text style={[st.pickText, { color: cfg.accent }]}>🎬 UPLOAD VIDEO</Text>
          </Pressable>
          <Pressable testID={`${cfg.room}-pick-photo`} onPress={() => pick("image")} style={[st.pickBtn, { borderColor: cfg.accent }]}>
            <Text style={[st.pickText, { color: cfg.accent }]}>🖼 UPLOAD PHOTO</Text>
          </Pressable>
        </View>
        {err && <Text style={st.err}>{err}</Text>}

        <View style={st.tabs}>
          <Pressable testID={`${cfg.room}-tab-feed`} onPress={() => setView("feed")} style={[st.tab, view === "feed" && { borderColor: cfg.accent }]}>
            <Text style={[st.tabText, view === "feed" && { color: cfg.accent }]}>FEED</Text>
          </Pressable>
          <Pressable testID={`${cfg.room}-tab-board`} onPress={() => { setView("board"); loadBoard(); }} style={[st.tab, view === "board" && { borderColor: cfg.accent }]}>
            <Text style={[st.tabText, view === "board" && { color: cfg.accent }]}>🏆 WEEKLY TOP</Text>
          </Pressable>
        </View>

        {view === "board" ? (
          board.length === 0 ? (
            <Text style={st.empty}>No ranked posts this week yet — most-liked posts show here.</Text>
          ) : board.map((p) => {
            const rc = RANK_COLORS[p.rank] || colors.textMid;
            const medal = p.rank_pos === 1 ? "🥇" : p.rank_pos === 2 ? "🥈" : p.rank_pos === 3 ? "🥉" : `#${p.rank_pos}`;
            return (
              <Pressable key={p.post_id} onPress={() => { setView("feed"); setTimeout(() => openComments(p), 50); }} style={st.boardRow}>
                <Text style={[st.boardPos, { color: cfg.accent }]}>{medal}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>{p.display_name}{p.founder_backer ? " ★" : ""}</Text>
                  <Text style={[st.rank, { color: rc }]}>{p.exercise ? p.exercise.toUpperCase() : (p.rank || "").toUpperCase()}{p.weight ? ` · ${p.weight}` : ""}</Text>
                </View>
                <Text style={[st.boardLikes, { color: cfg.accent }]}>♥ {p.like_count || 0}</Text>
              </Pressable>
            );
          })
        ) : feed.length === 0 ? (
          <Text style={st.empty}>No posts yet — be the first to drop a lift and get critiqued.</Text>
        ) : feed.map((p) => {
          const rc = RANK_COLORS[p.rank] || colors.textMid;
          const mine = p.user_id === user?.user_id;
          const c = p.critique;
          return (
            <View key={p.post_id} style={st.card}>
              <View style={st.cardHead}>
                <Pressable onPress={() => setMemberId(p.user_id)} style={st.who}>
                  <Text style={st.avatar}>{avatarFor(p.avatar_id).emoji}</Text>
                  <View>
                    <Text style={st.name}>{p.display_name}{p.founder_backer ? " ★" : ""}</Text>
                    <Text style={[st.rank, { color: rc }]}>{(p.rank || "").toUpperCase()} · {timeAgo(p.created_at)}</Text>
                  </View>
                </Pressable>
                {mine && <Pressable testID={`${cfg.room}-del-${p.post_id}`} onPress={() => deletePost(p)}><Text style={st.del}>✕</Text></Pressable>}
              </View>

              {(p.exercise || p.weight || p.reps) ? (
                <Text style={st.liftLine}>
                  {p.exercise ? `${p.exercise}  ` : ""}
                  {p.weight ? `· ${p.weight} ` : ""}{p.reps ? `× ${p.reps}` : ""}
                  {p.bodyweight ? `  · BW ${p.bodyweight}` : ""}
                </Text>
              ) : null}
              {!!p.caption && <Text style={st.caption}>{p.caption}</Text>}

              {p.media_id && <SpotlightMedia uri={mediaUrl(p.media_id)} type={p.media_type} />}

              {c ? (
                <View style={[st.coach, { borderColor: cfg.accent }]}>
                  <Text style={[st.coachTag, { color: cfg.accent }]}>🏋 {cfg.coachName.toUpperCase()}{c.level ? `  ·  ${c.level}` : ""}</Text>
                  {!!c.call && <Text style={st.coachCall}>{c.call}</Text>}
                  {!!c.form && <Text style={st.coachBody}>{c.form}</Text>}
                  {!!c.programming && <Text style={st.coachNext}>▶ {c.programming}</Text>}
                </View>
              ) : (
                <Text style={st.coachPending}>Coach is reviewing… pull to refresh in a moment.</Text>
              )}

              <View style={st.actions}>
                <Pressable testID={`${cfg.room}-like-${p.post_id}`} onPress={() => toggleLike(p)} style={st.actBtn}>
                  <Text style={[st.actText, p.liked && { color: cfg.accent }]}>{p.liked ? "♥" : "♡"} {p.like_count || 0}</Text>
                </Pressable>
                <Pressable testID={`${cfg.room}-comments-${p.post_id}`} onPress={() => openComments(p)} style={st.actBtn}>
                  <Text style={st.actText}>💬 {p.comment_count || 0}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Composer */}
      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.sheetWrap}>
          <View style={st.sheet}>
            <Text style={st.sheetTitle}>ADD DETAILS</Text>
            <Text style={st.sheetSub}>Give Coach context so the critique is on-point.</Text>
            <View style={st.formRow}>
              <TextInput value={exercise} onChangeText={setExercise} placeholder="Exercise (e.g. Deadlift)" placeholderTextColor={colors.textDim} style={[st.input, { flex: 1 }]} />
            </View>
            <View style={st.formRow}>
              <TextInput value={weight} onChangeText={setWeight} placeholder="Weight (e.g. 405 lb)" placeholderTextColor={colors.textDim} style={[st.input, { flex: 1 }]} />
              <TextInput value={reps} onChangeText={setReps} placeholder="Reps" placeholderTextColor={colors.textDim} keyboardType="number-pad" style={[st.input, { width: 90 }]} />
            </View>
            <View style={st.formRow}>
              <TextInput value={bodyweight} onChangeText={setBodyweight} placeholder="Bodyweight (e.g. 200 lb)" placeholderTextColor={colors.textDim} style={[st.input, { flex: 1 }]} />
            </View>
            <View style={st.formRow}>
              <TextInput value={caption} onChangeText={setCaption} placeholder="Anything else for Coach? (optional)" placeholderTextColor={colors.textDim} style={[st.input, { flex: 1 }]} multiline />
            </View>
            {err && <Text style={st.err}>{err}</Text>}
            <NeonButton testID={`${cfg.room}-submit`} label={submitting ? "POSTING…" : cfg.ctaLabel} loading={submitting} onPress={submit} style={{ marginTop: spacing.sm }} />
            <Pressable onPress={() => { setComposerOpen(false); setPending(null); }} style={{ marginTop: spacing.md, alignItems: "center" }}>
              <Text style={st.backDim}>CANCEL</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.sheetWrap}>
          <View style={[st.sheet, { maxHeight: "80%" }]}>
            <View style={st.cmtHead}>
              <Text style={st.sheetTitle}>CRITIQUES</Text>
              <Pressable onPress={() => setActive(null)}><Text style={st.del}>✕</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {comments.length === 0 ? <Text style={st.empty}>No member critiques yet.</Text> : comments.map((c) => (
                <View key={c.comment_id} style={st.cmt}>
                  <Text style={st.avatar}>{avatarFor(c.avatar_id).emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cmtName}>{c.display_name}{c.founder_backer ? " ★" : ""} <Text style={st.cmtTime}>· {timeAgo(c.created_at)}</Text></Text>
                    <Text style={st.cmtText}>{c.text}</Text>
                  </View>
                  {(c.user_id === user?.user_id || user?.is_admin) && (
                    <Pressable onPress={() => deleteComment(c)}><Text style={st.del}>✕</Text></Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={st.cmtBar}>
              <TextInput value={commentText} onChangeText={setCommentText} placeholder="Add your critique…" placeholderTextColor={colors.textDim} style={[st.input, { flex: 1 }]} />
              <Pressable testID={`${cfg.room}-post-comment`} onPress={postComment} disabled={posting} style={[st.sendBtn, { backgroundColor: cfg.accent }]}>
                {posting ? <ActivityIndicator color="#000" /> : <Text style={st.sendText}>POST</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {verifyOpen && <VerifyPanel onVerified={() => setVerifyOpen(false)} />}
      <MemberSheet userId={memberId} visible={!!memberId} onClose={() => setMemberId(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  back: { color: colors.textMid, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.sm },
  backDim: { color: colors.textDim, fontWeight: "800", letterSpacing: 1 },
  eyebrow: { fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  h1: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 24, marginTop: 2 },
  helper: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: spacing.md, lineHeight: 17 },
  pickRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  pickBtn: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surface2 },
  pickText: { fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  err: { color: colors.error, fontSize: 12, marginBottom: spacing.sm, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surface2 },
  tabText: { color: colors.textDim, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  boardPos: { fontSize: 16, fontWeight: "900", minWidth: 34, textAlign: "center" },
  boardLikes: { fontWeight: "900", fontSize: 14 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl, fontSize: 13 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  who: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { fontSize: 22 },
  name: { color: colors.text, fontWeight: "800", fontSize: 14 },
  rank: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 1 },
  del: { color: colors.textDim, fontSize: 16, fontWeight: "900", paddingHorizontal: 6 },
  liftLine: { color: colors.text, fontWeight: "900", fontSize: 15, marginTop: spacing.sm, letterSpacing: 0.5 },
  caption: { color: colors.textMid, fontSize: 13, marginTop: 4, lineHeight: 18 },
  coach: { marginTop: spacing.sm, borderLeftWidth: 3, borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.35)", padding: spacing.md },
  coachTag: { fontWeight: "900", letterSpacing: 1, fontSize: 10 },
  coachCall: { color: colors.text, fontWeight: "900", fontSize: 14, marginTop: 6 },
  coachBody: { color: colors.textMid, fontSize: 13, marginTop: 6, lineHeight: 19 },
  coachNext: { color: colors.textMid, fontSize: 12, marginTop: 8, lineHeight: 18, fontStyle: "italic" },
  coachPending: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  actBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  actText: { color: colors.textMid, fontWeight: "800", fontSize: 14 },
  sheetWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.border },
  sheetTitle: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  sheetSub: { color: colors.textDim, fontSize: 12, marginTop: 2, marginBottom: spacing.md },
  formRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  cmtHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  cmt: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cmtName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  cmtTime: { color: colors.textDim, fontWeight: "600", fontSize: 10 },
  cmtText: { color: colors.textMid, fontSize: 13, marginTop: 2, lineHeight: 18 },
  cmtBar: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm },
  sendBtn: { borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#000", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  gate: { flex: 1, backgroundColor: colors.surface, alignItems: "center", paddingHorizontal: spacing.xl },
  gateTitle: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 22, marginTop: spacing.sm, textAlign: "center" },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.sm, lineHeight: 19 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  gateBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
});
