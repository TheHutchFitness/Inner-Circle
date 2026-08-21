import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform, Alert, Linking, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, RANK_COLORS } from "@/src/lib/theme";
import { VerifyPanel } from "./VerifyPanel";
import { MemberSheet } from "./MemberSheet";
import { PlayerAvatar } from "./PlayerAvatar";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={st.video} nativeControls allowsFullscreen contentFit="contain" />;
}

export function ChatRoom({ room, gymName, accent, sendTextColor, placeholder, emptyText, highlightMine, bottomInset = 0 }: {
  room: "main" | "the_room" | "gym";
  gymName?: string;
  accent: string;
  sendTextColor: string;
  placeholder: string;
  emptyText?: string;
  highlightMine?: boolean;
  bottomInset?: number;
}) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [adminAction, setAdminAction] = useState<null | "pin" | "clear">(null);
  const [pinDraft, setPinDraft] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isVerified = !!(user?.email_verified || user?.phone_verified);
  const isAdmin = !!user?.is_admin;

  // For a specific gym room, thread the gym name through as a query param.
  const gymQ = room === "gym" && gymName ? `?gym=${encodeURIComponent(gymName)}` : "";

  const loadPin = async () => {
    try {
      const r = await apiFetch(token, `/api/chat/${room}/pin${gymQ}`);
      setPin(r?.pin?.text || null);
    } catch {}
  };

  const savePin = async () => {
    setAdminBusy(true);
    try {
      const r = await apiFetch(token, `/api/chat/${room}/pin${gymQ}`, { method: "POST", body: JSON.stringify({ text: pinDraft.trim() }) });
      setPin(r?.pin?.text || null);
      setAdminAction(null);
    } catch {}
    setAdminBusy(false);
  };

  const clearChat = async () => {
    setAdminBusy(true);
    try {
      await apiFetch(token, `/api/chat/${room}/clear${gymQ}`, { method: "POST" });
      await load();
      setAdminAction(null);
    } catch {}
    setAdminBusy(false);
  };

  const load = async () => {
    try {
      const rows = await apiFetch(token, `/api/chat/${room}/messages${gymQ}`);
      setMessages(rows);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  };

  useEffect(() => {
    load();
    loadPin();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [token, room, gymName]);

  const ensurePermission = async (source: "camera" | "gallery") => {
    if (Platform.OS === "web") return true;
    const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
    const req = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    let perm = await get();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await req();
      if (perm.granted) return true;
      if (perm.canAskAgain) return false; // user dismissed, can retry later
    }
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photos access needed",
      source === "camera"
        ? "Enable camera access in Settings to snap and share media in chat."
        : "Enable photo access in Settings to share media from your gallery.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  };

  const pick = async (source: "camera" | "gallery") => {
    setErr(null);
    if (!isVerified) { setVerifyOpen(true); return; }
    if (!(await ensurePermission(source))) return;
    const opts: any = { mediaTypes: ["images", "videos"], quality: 0.7, videoMaxDuration: 60 };
    let res;
    try {
      res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    } catch {
      setErr(source === "camera" ? "Camera is not available here — try the gallery." : "Could not open gallery.");
      return;
    }
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    if (asset.type === "video" && asset.duration && asset.duration > 61000) {
      setErr("Videos are capped at 1 minute — pick a shorter clip.");
      return;
    }
    setPending(asset);
  };

  const send = async () => {
    if ((!text.trim() && !pending) || sending) return;
    setSending(true);
    setErr(null);
    try {
      let media_id: string | null = null;
      if (pending) {
        const isVideo = pending.type === "video";
        const name = pending.fileName || `upload.${isVideo ? "mp4" : "jpg"}`;
        const type = pending.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
        const form = new FormData();
        if (Platform.OS === "web") {
          const blob = await (await fetch(pending.uri)).blob();
          form.append("file", blob, name);
        } else {
          form.append("file", { uri: pending.uri, name, type } as any);
        }
        const r = await fetch(`${API}/api/chat/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.detail || "Upload failed");
        }
        media_id = (await r.json()).media_id;
      }
      await apiFetch(token, `/api/chat/${room}/messages${gymQ}`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), media_id }),
      });
      setText("");
      setPending(null);
      await load();
    } catch (e: any) { setErr(e.message); }
    setSending(false);
  };

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  return (
    <>
      {(pin || isAdmin) && (
        <View style={st.pinWrap}>
          {pin && (
            <View style={st.pinBanner}>
              <Text style={st.pinIcon}>📌</Text>
              <Text style={st.pinText}>{pin}</Text>
            </View>
          )}
          {isAdmin && (
            <View style={st.adminBar}>
              <Pressable testID="chat-pin-btn" onPress={() => { setPinDraft(pin || ""); setAdminAction("pin"); }} style={st.adminBtn}>
                <Text style={st.adminBtnText}>📌 {pin ? "EDIT PIN" : "PIN A RULE"}</Text>
              </Pressable>
              <Pressable testID="chat-clear-btn" onPress={() => setAdminAction("clear")} style={[st.adminBtn, st.adminBtnDanger]}>
                <Text style={[st.adminBtnText, st.adminBtnTextDanger]}>🗑 CLEAR CHAT</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        {messages.length === 0 && !!emptyText && <Text style={st.empty}>{emptyText}</Text>}
        {messages.map((m, idx) => {
          const mine = m.user_id === user?.user_id;
          const prev = messages[idx - 1];
          const grouped = !!prev && prev.user_id === m.user_id && !prev.founder_backer === !m.founder_backer;
          const nameColor = (m.clan_role === "leader" && m.clan_color) ? m.clan_color : (RANK_COLORS[m.rank] || accent);
          const mineTint = accent + "1f";
          return (
            <View key={m.message_id} style={[st.row, mine ? st.rowMine : st.rowTheirs, grouped && st.rowGrouped]}>
              {!mine && (
                <View style={st.avatarCol}>
                  {!grouped ? (
                    <Pressable onPress={() => m.user_id && setMemberId(m.user_id)}>
                      <PlayerAvatar person={m} token={token} size={30} showEmblem={false} />
                    </Pressable>
                  ) : null}
                </View>
              )}
              <View style={{ maxWidth: "82%" }}>
                {!grouped && (
                  <View style={[st.identity, mine && st.identityMine]}>
                    <Pressable onPress={() => m.user_id && setMemberId(m.user_id)} hitSlop={6}>
                      <Text style={[st.name, { color: nameColor }]} numberOfLines={1}>{m.display_name}</Text>
                    </Pressable>
                    {typeof m.level === "number" && <Text style={st.lvl}>Lv.{m.level}</Text>}
                    {m.clan_role === "leader" && <Text style={st.badgeIcon}>👑</Text>}
                    {m.clan_role === "officer" && <Text style={st.badgeIcon}>⭐</Text>}
                    {m.founder_backer && <Text style={st.badgeIcon}>★</Text>}
                    {typeof m.founder_number === "number" && <Text style={st.founderTxt}>F#{m.founder_number}</Text>}
                    {m.skool_verified && <Text style={st.verified}>✓</Text>}
                  </View>
                )}
                <View style={[
                  st.bubble,
                  mine ? { backgroundColor: mineTint, borderColor: accent + "66", borderWidth: 1 } : st.bubbleTheirs,
                  mine ? st.bubbleMineTail : st.bubbleTheirsTail,
                  grouped && st.bubbleGrouped,
                  m.founder_backer && { borderColor: colors.warning, borderWidth: 1 },
                ]}>
                  {m.media_id && m.media_type === "image" && (
                    <Image source={{ uri: mediaUrl(m.media_id) }} style={st.image} contentFit="cover" transition={150} />
                  )}
                  {m.media_id && m.media_type === "video" && <ChatVideo uri={mediaUrl(m.media_id)} />}
                  {!!m.text && <Text style={[st.msgText, mine && st.msgTextMine]}>{m.text}</Text>}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {pending && (
        <View style={st.pendingRow}>
          {pending.type === "video" ? (
            <View style={st.pendingThumbVid}><Text style={{ fontSize: 18 }}>🎬</Text></View>
          ) : (
            <Image source={{ uri: pending.uri }} style={st.pendingThumb} contentFit="cover" />
          )}
          <Text style={st.pendingText}>{pending.type === "video" ? "Video attached · max 1 min" : "Photo attached"}</Text>
          <Pressable testID="remove-media" onPress={() => setPending(null)} hitSlop={10}>
            <Text style={st.pendingX}>✕</Text>
          </Pressable>
        </View>
      )}
      {err && <Text testID="chat-error" style={st.err}>{err}</Text>}

      <View style={[st.composerWrap, { paddingBottom: spacing.sm + bottomInset }]}>
        <View style={st.composer}>
          <Pressable testID="chat-camera" onPress={() => pick("camera")} hitSlop={8} style={st.inputIcon}>
            <Text style={st.inputIconTxt}>📷</Text>
          </Pressable>
          <Pressable testID="chat-gallery" onPress={() => pick("gallery")} hitSlop={8} style={st.inputIcon}>
            <Text style={st.inputIconTxt}>🖼️</Text>
          </Pressable>
          <TextInput
            testID="chat-input"
            style={st.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            multiline
          />
          <Pressable testID="chat-send" onPress={send} disabled={sending} style={[st.sendCircle, { backgroundColor: accent }]}>
            {sending
              ? <ActivityIndicator size="small" color={sendTextColor} />
              : <Text style={[st.sendArrow, { color: sendTextColor }]}>➤</Text>}
          </Pressable>
        </View>
      </View>

      <Modal visible={verifyOpen} transparent animationType="slide" onRequestClose={() => setVerifyOpen(false)}>
        <View style={st.modalWrap}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>VERIFY TO SHARE MEDIA</Text>
            <Text style={st.modalSub}>Photo & video sharing is locked until you verify your email or phone. Takes under a minute.</Text>
            <VerifyPanel onVerified={() => setVerifyOpen(false)} />
            <Pressable testID="verify-close" onPress={() => setVerifyOpen(false)} style={st.modalClose}>
              <Text style={st.modalCloseText}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <MemberSheet userId={memberId} visible={!!memberId} onClose={() => setMemberId(null)} />

      <Modal visible={!!adminAction} transparent animationType="fade" onRequestClose={() => setAdminAction(null)}>
        <View style={st.modalWrap}>
          <View style={st.modalCard}>
            {adminAction === "pin" ? (
              <>
                <Text style={st.modalTitle}>PIN A RULE</Text>
                <Text style={st.modalSub}>This message stays pinned to the top of this room for everyone. Leave empty and save to unpin.</Text>
                <TextInput
                  testID="pin-input"
                  style={st.pinInput}
                  value={pinDraft}
                  onChangeText={setPinDraft}
                  placeholder="Welcome! Read the rules…"
                  placeholderTextColor={colors.textDim}
                  multiline
                />
                <Pressable testID="pin-save" onPress={savePin} disabled={adminBusy} style={[st.sendBtn, { backgroundColor: accent, marginTop: spacing.md }]}>
                  {adminBusy ? <ActivityIndicator size="small" color={sendTextColor} /> : <Text style={[st.sendText, { color: sendTextColor }]}>{pinDraft.trim() ? "SAVE PIN" : "UNPIN"}</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={st.modalTitle}>CLEAR CHAT</Text>
                <Text style={st.modalSub}>This permanently deletes every message in this room. This cannot be undone.</Text>
                <Pressable testID="clear-confirm" onPress={clearChat} disabled={adminBusy} style={[st.sendBtn, { backgroundColor: colors.error, marginTop: spacing.md }]}>
                  {adminBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[st.sendText, { color: "#fff" }]}>DELETE ALL MESSAGES</Text>}
                </Pressable>
              </>
            )}
            <Pressable testID="admin-modal-close" onPress={() => setAdminAction(null)} style={st.modalClose}>
              <Text style={st.modalCloseText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40 },
  pinWrap: { backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  pinBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(251,191,36,0.10)", borderWidth: 1, borderColor: "rgba(251,191,36,0.5)", borderRadius: radius.sm, padding: spacing.sm },
  pinIcon: { fontSize: 14 },
  pinText: { flex: 1, color: "#FBBF24", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  adminBar: { flexDirection: "row", gap: spacing.sm },
  adminBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  adminBtnDanger: { borderColor: colors.error },
  adminBtnText: { color: colors.textMid, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  adminBtnTextDanger: { color: colors.error },
  pinInput: { backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: spacing.md, minHeight: 80, textAlignVertical: "top", marginTop: spacing.md },
  msg: { padding: spacing.md, backgroundColor: colors.surface2, marginBottom: spacing.sm, borderRadius: radius.sm, borderLeftWidth: 3 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  rowGrouped: { marginBottom: 3 },
  avatarCol: { width: 30 },
  identity: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3, marginLeft: 4 },
  identityMine: { justifyContent: "flex-end", marginRight: 4, marginLeft: 0 },
  name: { fontWeight: "800", fontSize: 13 },
  lvl: { color: colors.textDim, fontSize: 11, fontWeight: "700" },
  badgeIcon: { fontSize: 12 },
  founderTxt: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  verified: { color: colors.success, fontWeight: "900", fontSize: 12 },
  bubble: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.md },
  bubbleTheirs: { backgroundColor: colors.surface2 },
  bubbleTheirsTail: { borderTopLeftRadius: 5 },
  bubbleMineTail: { borderTopRightRadius: 5 },
  bubbleGrouped: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  msgText: { color: colors.textMid, lineHeight: 20, fontSize: 14.5 },
  msgTextMine: { color: colors.text },
  image: { width: 240, maxWidth: "100%", height: 200, borderRadius: radius.sm, marginBottom: 6, backgroundColor: colors.surface3 },
  video: { width: 240, maxWidth: "100%", height: 200, borderRadius: radius.sm, marginBottom: 6, backgroundColor: "#000" },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface3, borderTopWidth: 1, borderTopColor: colors.border },
  pendingThumb: { width: 40, height: 40, borderRadius: 6 },
  pendingThumbVid: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pendingText: { color: colors.textMid, flex: 1, fontSize: 12 },
  pendingX: { color: colors.error, fontSize: 18, fontWeight: "900", padding: 4 },
  err: { color: colors.error, paddingHorizontal: spacing.md, paddingVertical: 6, fontSize: 12, backgroundColor: colors.surface3 },
  composerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.surface },
  composer: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 4, gap: 2 },
  inputIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  inputIconTxt: { fontSize: 16, lineHeight: 20, textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  input: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 20, paddingHorizontal: 6, paddingTop: 5, paddingBottom: 5, minHeight: 30, maxHeight: 100, textAlignVertical: "center", includeFontPadding: false },
  sendCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sendArrow: { fontSize: 15, lineHeight: 18, fontWeight: "900", textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  sendBtn: { paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", minHeight: 44 },
  sendText: { fontWeight: "900", letterSpacing: 2 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  modalTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 16 },
  modalSub: { color: colors.textDim, marginTop: 6, marginBottom: spacing.md, lineHeight: 19 },
  modalClose: { marginTop: spacing.md, alignItems: "center", paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  modalCloseText: { color: colors.textDim, letterSpacing: 3, fontWeight: "800" },
});
