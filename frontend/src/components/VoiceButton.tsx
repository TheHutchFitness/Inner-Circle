import { useRef, useState } from "react";
import { Pressable, Text, StyleSheet, Platform, Alert, Linking, ActivityIndicator } from "react-native";
import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder,
} from "expo-audio";
import { useAuth } from "@/src/lib/auth";
import { colors, radius, spacing } from "@/src/lib/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

async function transcribe(token: string | null, uri: string | null, blob: Blob | null, name: string, type: string) {
  const form = new FormData();
  if (blob) form.append("file", blob, name);
  else form.append("file", { uri, name, type } as any);
  const r = await fetch(`${API}/api/voice/transcribe`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Transcription failed"); }
  return (await r.json()).text as string;
}

function Btn({ recording, busy, onPress }: any) {
  return (
    <Pressable testID="coach-voice" onPress={onPress} disabled={busy} style={[styles.btn, recording && styles.btnRec]}>
      {busy ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Text style={styles.icon}>{recording ? "■" : "🎤"}</Text>}
    </Pressable>
  );
}

function NativeVoice({ onTranscript, onError }: any) {
  const { token } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    if (recording) {
      setRecording(false); setBusy(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("No recording captured");
        const text = await transcribe(token, uri, null, "voice.m4a", "audio/mp4");
        onTranscript(text);
      } catch (e: any) { onError?.(e.message); }
      setBusy(false);
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain === false) {
        Alert.alert("Microphone needed", "Enable microphone access in Settings to ask by voice.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
      } else { onError?.("Microphone permission denied"); }
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e: any) { onError?.(e.message || "Could not start recording"); }
  };

  return <Btn recording={recording} busy={busy} onPress={toggle} />;
}

function WebVoice({ onTranscript, onError }: any) {
  const { token } = useAuth();
  const mr = useRef<any>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    if (recording && mr.current) {
      const rec = mr.current;
      rec.onstop = async () => {
        rec.stream.getTracks().forEach((t: any) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
          const text = await transcribe(token, null, blob, "voice.webm", "audio/webm");
          onTranscript(text);
        } catch (e: any) { onError?.(e.message); }
        setBusy(false);
      };
      rec.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const mime = (window as any).MediaRecorder?.isTypeSupported?.("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new (window as any).MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e: any) => e.data?.size && chunks.current.push(e.data);
      rec.start();
      mr.current = rec;
      setRecording(true);
    } catch (e: any) { onError?.("Microphone unavailable in this browser"); }
  };

  return <Btn recording={recording} busy={busy} onPress={toggle} />;
}

export const VoiceButton = Platform.OS === "web" ? WebVoice : NativeVoice;

const styles = StyleSheet.create({
  btn: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3, marginRight: spacing.sm },
  btnRec: { borderColor: colors.error, backgroundColor: "rgba(255,0,60,0.12)" },
  icon: { fontSize: 20 },
});
