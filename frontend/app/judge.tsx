import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform,
  Alert, Linking, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, RANK_COLORS, avatarFor } from "@/src/lib/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;
const CATEGORIES: [string, string][] = [
  ["Symmetry", "symmetry"], ["Conditioning", "conditioning"], ["Size", "size"], ["Posing", "posing"],
];

function scoreColor(v: number) {
  if (v >= 8) return colors.success;
  if (v >= 6) return colors.brandPrimary;
  if (v >= 4) return colors.warning;
  return colors.error;
}

function Critique({ c }: { c: any }) {
  if (!c) {
    return <Text style={st.pending}>The Judge couldn&apos;t score this one — try a clearer, well-lit physique photo.</Text>;
  }
  return (
    <View style={st.critique}>
      <View style={st.overallRow}>
        <Text style={st.overallLabel}>THE JUDGE&apos;S SCORE</Text>
        <Text style={[st.overall, { color: scoreColor(c.overall) }]}>{c.overall.toFixed(1)}<Text style={st.outOf}>/10</Text></Text>
      </View>
      {CATEGORIES.map(([label, key]) => {
        const v = c[key] ?? 0;
        return (
          <View key={key} style={st.catRow}>
            <Text style={st.catLabel}>{label.toUpperCase()}</Text>
            <View style={st.catBar}><View style={[st.catFill, { width: `${(v / 10) * 100}%`, backgroundColor: scoreColor(v) }]} /></View>
            <Text style={[st.catVal, { color: scoreColor(v) }]}>{v.toFixed(1)}</Text>
          </View>
        );
      })}
      {!!c.notes && <Text style={st.notes}>&ldquo;{c.notes}&rdquo;</Text>}
    </View>
  );
}

export default function Judge() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();

  const canJudge = isSubscribed || user?.skool_verified || user?.all_rooms_access;

  const [feed, setFeed] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [view, setView] = useState<"feed" | "board">("feed");
  const [pending, setPending] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [active, setActive] = useState<any>(null); // submission open in comments modal
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => { try { setFeed(await apiFetch(token, "/api/judge/feed")); } catch {} };
  const loadBoard = async () => { try { setBoard(await apiFetch(token, "/api/judge/leaderboard")); } catch {} };
  useEffect(() => { if (canJudge) { load(); loadBoard(); } /* eslint-disable-next-line */ }, [canJudge]);

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  const ensurePermission = async (source: "camera" | "gallery") => {
    if (Platform.OS === "web") return true;
    const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
    const req = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    let perm = await get();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await req();
      if (perm.granted) return true;
      if (perm.canAskAgain) return false;
    }
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photos access needed",
      source === "camera" ? "Enable camera access in Settings to shoot your physique." : "Enable photo access in Settings to submit from your gallery.",
      [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
    );
    return false;
  };

  const pick = async (source: "camera" | "gallery") => {
    setErr(null);
    if (!(await ensurePermission(source))) return;
    const opts: any = { mediaTypes: ["images"], quality: 0.7 };
    let res;
    try {
      res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    } catch {
      setErr(source === "camera" ? "Camera unavailable here — try the gallery." : "Could not open gallery.");
      return;
    }
    if (res.canceled || !res.assets?.length) return;
    setPending(res.assets[0]);
  };

  const submit = async () => {
    if (!pending || submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const name = pending.fileName || "physique.jpg";
      const type = pending.mimeType || "image/jpeg";
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(pending.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: pending.uri, name, type } as any);
      }
      if (caption.trim()) form.append("caption", caption.trim());
      const r = await fetch(`${API}/api/judge/submit`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Submission failed"); }
      setPending(null); setCaption("");
      await load();
      await loadBoard();
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
    } catch (e: any) { setErr(e.message); }
    setSubmitting(false);
  };

  const openComments = async (sub: any) => {
    setActive(sub); setComments([]); setCommentText("");
    try { setComments(await apiFetch(token, `/api/judge/${sub.submission_id}/comments`)); } catch {}
  };

  const postComment = async () => {
    if (!commentText.trim() || posting || !active) return;
    setPosting(true);
    try {
      await apiFetch(token, `/api/judge/${active.submission_id}/comments`, {
        method: "POST", body: JSON.stringify({ text: commentText.trim() }),
      });
      setCommentText("");
      setComments(await apiFetch(token, `/api/judge/${active.submission_id}/comments`));
      setFeed((f) => f.map((s) => s.submission_id === active.submission_id ? { ...s, comment_count: (s.comment_count || 0) + 1 } : s));
    } catch {}
    setPosting(false);
  };

  if (!canJudge) {
    return (
      <View style={[st.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={st.eyebrow}>MEMBERS ONLY</Text>
        <Text style={st.gateTitle}>THE JUDGE IS LOCKED</Text>
        <Text style={st.gateSub}>Physique judging is for verified Skool members or $5/mo premium athletes.</Text>
        <Pressable testID="judge-paywall" onPress={() => router.push("/paywall")} style={st.gateBtn}>
          <Text style={st.gateBtnText}>UNLOCK PREMIUM</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg }}><Text style={st.backDim}>BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={st.eyebrow}>▚ POSING DAIS //</Text>
        <Text style={st.h1}>THE JUDGE</Text>
        <Text style={st.helper}>Submit your physique. Get scored by the AI head judge. Members critique too.</Text>

        <View style={st.submitCard}>
          <Text style={st.submitTitle}>STEP ON STAGE</Text>
          {pending ? (
            <>
              <Image source={{ uri: pending.uri }} style={st.preview} contentFit="cover" />
              <TextInput
                testID="judge-caption" value={caption} onChangeText={setCaption}
                placeholder="Add context (pose, weeks out)…" placeholderTextColor={colors.textDim} style={st.captionInput}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable testID="judge-clear" onPress={() => setPending(null)} style={[st.btn, st.btnGhost]}>
                  <Text style={st.btnGhostText}>REMOVE</Text>
                </Pressable>
                <Pressable testID="judge-submit" onPress={submit} disabled={submitting} style={[st.btn, st.btnPrimary, { flex: 1 }]}>
                  {submitting ? <ActivityIndicator color="#001122" /> : <Text style={st.btnPrimaryText}>SUBMIT TO THE JUDGE</Text>}
                </Pressable>
              </View>
              {submitting && <Text style={st.judging}>The Judge is deliberating…</Text>}
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="judge-camera" onPress={() => pick("camera")} style={[st.btn, st.btnGhost, { flex: 1 }]}>
                <Text style={st.btnGhostText}>📷 CAMERA</Text>
              </Pressable>
              <Pressable testID="judge-gallery" onPress={() => pick("gallery")} style={[st.btn, st.btnGhost, { flex: 1 }]}>
                <Text style={st.btnGhostText}>🖼️ GALLERY</Text>
              </Pressable>
            </View>
          )}
          {err && <Text style={st.err}>{err}</Text>}
        </View>

        <View style={st.viewToggle}>
          <Pressable testID="judge-view-feed" onPress={() => setView("feed")} style={[st.viewBtn, view === "feed" && st.viewBtnActive]}>
            <Text style={[st.viewBtnText, view === "feed" && st.viewBtnTextActive]}>THE LINEUP</Text>
          </Pressable>
          <Pressable testID="judge-view-board" onPress={() => { setView("board"); loadBoard(); }} style={[st.viewBtn, view === "board" && st.viewBtnActive]}>
            <Text style={[st.viewBtnText, view === "board" && st.viewBtnTextActive]}>🏆 TOP THIS WEEK</Text>
          </Pressable>
        </View>

        {view === "board" ? (
          board.length === 0 ? (
            <Text style={st.empty}>No scored physiques this week yet. Submit one to top the board.</Text>
          ) : (
            board.map((b) => {
              const rc = RANK_COLORS[b.rank] || colors.brandPrimary;
              const medal = b.rank_pos === 1 ? "🥇" : b.rank_pos === 2 ? "🥈" : b.rank_pos === 3 ? "🥉" : `#${b.rank_pos}`;
              return (
                <View key={b.submission_id} testID={`judge-board-${b.rank_pos}`} style={st.boardRow}>
                  <Text style={st.boardPos}>{medal}</Text>
                  <Image source={{ uri: mediaUrl(b.media_id) }} style={st.boardThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={st.boardName}>{b.display_name} {b.founder_backer ? "★" : ""}</Text>
                    <Text style={[st.cardRank, { color: rc }]}>{b.rank?.toUpperCase()}</Text>
                  </View>
                  <Text style={[st.boardScore, { color: scoreColor(b.overall) }]}>{b.overall.toFixed(1)}</Text>
                </View>
              );
            })
          )
        ) : feed.length === 0 ? (
          <Text style={st.empty}>No physiques on stage yet. Be the first to be judged.</Text>
        ) : (
          feed.map((s) => {
            const rc = RANK_COLORS[s.rank] || colors.brandPrimary;
            return (
              <View key={s.submission_id} testID={`judge-sub-${s.submission_id}`} style={st.card}>
                <View style={st.cardHead}>
                  <Text style={st.cardEmoji}>{avatarFor(s.avatar_id).emoji}</Text>
                  <Text style={st.cardName}>{s.display_name} {s.founder_backer ? <Text style={{ color: colors.warning }}>★</Text> : null}</Text>
                  <Text style={[st.cardRank, { color: rc }]}>{s.rank?.toUpperCase()}</Text>
                </View>
                <Image source={{ uri: mediaUrl(s.media_id) }} style={st.subImage} contentFit="cover" transition={150} />
                {!!s.caption && <Text style={st.caption}>{s.caption}</Text>}
                <Critique c={s.critique} />
                <Pressable testID={`judge-comments-${s.submission_id}`} onPress={() => openComments(s)} style={st.commentBtn}>
                  <Text style={st.commentBtnText}>💬 CRITIQUES ({s.comment_count || 0})</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalWrap}>
          <View style={[st.modalCard, { paddingBottom: spacing.md + insets.bottom }]}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>MEMBER CRITIQUES</Text>
              <Pressable testID="judge-modal-close" onPress={() => setActive(null)} hitSlop={10}><Text style={st.modalX}>✕</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {comments.length === 0 ? (
                <Text style={st.empty}>No critiques yet. Drop the first one.</Text>
              ) : comments.map((c) => (
                <View key={c.comment_id} style={st.comment}>
                  <View style={st.commentHead}>
                    <Text style={st.cardEmoji}>{avatarFor(c.avatar_id).emoji}</Text>
                    <Text style={st.commentName}>{c.display_name} {c.founder_backer ? <Text style={{ color: colors.warning }}>★</Text> : null}</Text>
                    <Text style={[st.cardRank, { color: RANK_COLORS[c.rank] || colors.brandPrimary }]}>{c.rank?.toUpperCase()}</Text>
                  </View>
                  <Text style={st.commentText}>{c.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={st.commentInputRow}>
              <TextInput
                testID="judge-comment-input" value={commentText} onChangeText={setCommentText}
                placeholder="Give your critique…" placeholderTextColor={colors.textDim} style={st.commentInput}
              />
              <Pressable testID="judge-comment-post" onPress={postComment} disabled={posting} style={st.commentSend}>
                {posting ? <ActivityIndicator size="small" color="#001122" /> : <Text style={st.commentSendText}>POST</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center" },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  gateTitle: { color: colors.error, fontSize: 26, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm, textAlign: "center" },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  backDim: { color: colors.textDim, letterSpacing: 2, fontWeight: "800" },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4, lineHeight: 18 },
  submitCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  submitTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", fontSize: 12, marginBottom: spacing.md },
  preview: { width: "100%", height: 260, borderRadius: radius.sm, backgroundColor: colors.surface3, marginBottom: spacing.md },
  captionInput: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  btn: { paddingVertical: 14, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, minHeight: 48 },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  btnGhostText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  judging: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, letterSpacing: 2 },
  err: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  section: { color: colors.text, fontSize: 14, letterSpacing: 4, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.md },
  viewToggle: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  viewBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  viewBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  viewBtnText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  viewBtnTextActive: { color: colors.brandPrimary },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  boardPos: { width: 34, textAlign: "center", fontSize: 16, fontWeight: "900", color: colors.text },
  boardThumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  boardName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  boardScore: { fontSize: 22, fontWeight: "900" },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: spacing.lg },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  cardEmoji: { fontSize: 18 },
  cardName: { color: colors.text, fontWeight: "800", letterSpacing: 1, flex: 1 },
  cardRank: { fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  subImage: { width: "100%", height: 320, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  caption: { color: colors.textMid, marginTop: spacing.sm, lineHeight: 19 },
  critique: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surface3, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.warning },
  overallRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  overallLabel: { color: colors.warning, letterSpacing: 2, fontSize: 10, fontWeight: "800" },
  overall: { fontSize: 30, fontWeight: "900" },
  outOf: { color: colors.textDim, fontSize: 14, fontWeight: "700" },
  catRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  catLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "700", width: 92 },
  catBar: { flex: 1, height: 6, backgroundColor: colors.surface, borderRadius: 3, overflow: "hidden" },
  catFill: { height: "100%" },
  catVal: { width: 32, textAlign: "right", fontWeight: "900", fontSize: 12 },
  notes: { color: colors.text, marginTop: spacing.md, fontStyle: "italic", lineHeight: 20 },
  pending: { color: colors.textDim, marginTop: spacing.md, fontStyle: "italic", lineHeight: 19 },
  commentBtn: { marginTop: spacing.md, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, minHeight: 44, justifyContent: "center" },
  commentBtnText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  modalTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  modalX: { color: colors.textDim, fontSize: 20, fontWeight: "900" },
  comment: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  commentHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  commentName: { color: colors.text, fontWeight: "800", fontSize: 13, flex: 1 },
  commentText: { color: colors.textMid, marginTop: 4, lineHeight: 19 },
  commentInputRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center" },
  commentInput: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  commentSend: { paddingHorizontal: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", minHeight: 44 },
  commentSendText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
