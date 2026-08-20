import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform, Alert, Linking, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor, RANK_COLORS } from "@/src/lib/theme";
import { VerifyPanel } from "./VerifyPanel";
import { MemberSheet } from "./MemberSheet";
import { PlayerAvatar } from "./PlayerAvatar";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={st.video} nativeControls allowsFullscreen contentFit="contain" />;
}

export function ChatRoom({ room, accent, sendTextColor, placeholder, emptyText, highlightMine, bottomInset = 0 }: {
  room: "main" | "the_room" | "gym";
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
  const scrollRef = useRef<ScrollView>(null);

  const isVerified = !!(user?.email_verified || user?.phone_verified);

  const load = async () => {
    try {
      const rows = await apiFetch(token, `/api/chat/${room}/messages`);
      setMessages(rows);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [token, room]);

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
      await apiFetch(token, `/api/chat/${room}/messages`, {
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
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        {messages.length === 0 && !!emptyText && <Text style={st.empty}>{emptyText}</Text>}
        {messages.map((m) => {
          const av = avatarFor(m.avatar_id);
          const mine = m.user_id === user?.user_id;
          return (
            <View key={m.message_id} style={[st.msg, { borderLeftColor: m.founder_backer ? colors.warning : accent }, m.founder_backer && st.msgBackerGlow, highlightMine && mine && st.msgMine]}>
              <View style={st.msgHead}>
                <Pressable onPress={() => m.user_id && setMemberId(m.user_id)}>
                  <PlayerAvatar person={m} token={token} size={26} showEmblem={false} />
                </Pressable>
                <Pressable onPress={() => m.user_id && setMemberId(m.user_id)} hitSlop={6}>
                  <Text style={[st.msgName, m.founder_backer && st.msgNameBacker, m.clan_role === "leader" && m.clan_color ? { color: m.clan_color } : null]}>{m.display_name}</Text>
                </Pressable>
                {typeof m.level === "number" && (
                  <View style={[st.lvlChip, m.clan_color ? { borderColor: m.clan_color } : null]}>
                    <Text style={[st.lvlChipText, m.clan_color ? { color: m.clan_color } : null]}>Lv{m.level}</Text>
                  </View>
                )}
                {m.clan_role === "leader" && <Text style={st.crown}>👑</Text>}
                <Text style={[st.msgRank, { color: RANK_COLORS[m.rank] || accent }]}>{m.rank?.toUpperCase()}</Text>
                {m.founder_backer && (
                  <View style={st.backerPill}>
                    <Text style={st.backerPillText}>★ BACKER</Text>
                  </View>
                )}
                {m.skool_verified && <Text style={st.msgSkool}>✓</Text>}
              </View>
              {m.media_id && m.media_type === "image" && (
                <Image source={{ uri: mediaUrl(m.media_id) }} style={st.image} contentFit="cover" transition={150} />
              )}
              {m.media_id && m.media_type === "video" && <ChatVideo uri={mediaUrl(m.media_id)} />}
              {!!m.text && <Text style={st.msgText}>{m.text}</Text>}
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

      <View style={[st.inputRow, { borderTopColor: accent, paddingBottom: spacing.md + bottomInset }]}>
        <Pressable testID="chat-camera" onPress={() => pick("camera")} style={[st.mediaBtn, { borderColor: accent }]}>
          <Text style={st.mediaBtnText}>📷</Text>
        </Pressable>
        <Pressable testID="chat-gallery" onPress={() => pick("gallery")} style={[st.mediaBtn, { borderColor: accent }]}>
          <Text style={st.mediaBtnText}>🖼️</Text>
        </Pressable>
        <TextInput
          testID="chat-input"
          style={st.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
        />
        <Pressable testID="chat-send" onPress={send} disabled={sending} style={[st.sendBtn, { backgroundColor: accent }]}>
          {sending
            ? <ActivityIndicator size="small" color={sendTextColor} />
            : <Text style={[st.sendText, { color: sendTextColor }]}>SEND</Text>}
        </Pressable>
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
    </>
  );
}

const st = StyleSheet.create({
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40 },
  msg: { padding: spacing.md, backgroundColor: colors.surface2, marginBottom: spacing.sm, borderRadius: radius.sm, borderLeftWidth: 3 },
  msgMine: { borderLeftColor: colors.warning, backgroundColor: colors.surface3 },
  msgHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  msgEmoji: { fontSize: 16 },
  msgName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  lvlChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  lvlChipText: { color: colors.textMid, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  crown: { fontSize: 12 },
  msgRank: { fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  msgSkool: { color: colors.success, fontWeight: "900" },
  msgBacker: { color: colors.warning, fontWeight: "900" },
  msgBackerGlow: { borderLeftWidth: 3, shadowColor: colors.warning, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  msgNameBacker: { color: colors.warning },
  backerPill: { backgroundColor: "rgba(255,234,0,0.14)", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  backerPillText: { color: colors.warning, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  msgText: { color: colors.textMid, lineHeight: 19 },
  image: { width: "100%", height: 220, borderRadius: radius.sm, marginBottom: 6, backgroundColor: colors.surface3 },
  video: { width: "100%", height: 220, borderRadius: radius.sm, marginBottom: 6, backgroundColor: "#000" },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface3, borderTopWidth: 1, borderTopColor: colors.border },
  pendingThumb: { width: 40, height: 40, borderRadius: 6 },
  pendingThumbVid: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pendingText: { color: colors.textMid, flex: 1, fontSize: 12 },
  pendingX: { color: colors.error, fontSize: 18, fontWeight: "900", padding: 4 },
  err: { color: colors.error, paddingHorizontal: spacing.md, paddingVertical: 6, fontSize: 12, backgroundColor: colors.surface3 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: 8, backgroundColor: colors.surface2, borderTopWidth: 1, alignItems: "center" },
  mediaBtn: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  mediaBtnText: { fontSize: 18 },
  input: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  sendBtn: { paddingHorizontal: spacing.lg, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", minHeight: 44 },
  sendText: { fontWeight: "900", letterSpacing: 2 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  modalTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 16 },
  modalSub: { color: colors.textDim, marginTop: 6, marginBottom: spacing.md, lineHeight: 19 },
  modalClose: { marginTop: spacing.md, alignItems: "center", paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  modalCloseText: { color: colors.textDim, letterSpacing: 3, fontWeight: "800" },
});
