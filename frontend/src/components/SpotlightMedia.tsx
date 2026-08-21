import { useState } from "react";
import { StyleSheet, Pressable, Modal, View, Text } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { radius, colors } from "@/src/lib/theme";

// Renders a spotlight member's attached photo or video in a compact box.
// Nothing is cropped (contain fit). Photos open fullscreen on tap; videos keep
// their native fullscreen control.
export function SpotlightMedia({ uri, type }: { uri: string; type?: string | null }) {
  if (type === "video") return <SpotVideo uri={uri} />;
  return <SpotImage uri={uri} />;
}

function SpotImage({ uri }: { uri: string }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <Pressable onPress={() => setFull(true)} style={styles.box}>
        <Image source={{ uri }} style={styles.media} contentFit="contain" transition={200} />
        <View style={styles.expandBadge}><Text style={styles.expandText}>⤢</Text></View>
      </Pressable>
      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <Pressable style={styles.fullWrap} onPress={() => setFull(false)}>
          <Image source={{ uri }} style={styles.fullImg} contentFit="contain" />
          <View style={styles.closePill}><Text style={styles.closeText}>✕  TAP TO CLOSE</Text></View>
        </Pressable>
      </Modal>
    </>
  );
}

function SpotVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={styles.box}>
      <VideoView player={player} style={styles.media} contentFit="contain" nativeControls allowsFullscreen />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    height: 190,
    borderRadius: radius.sm,
    marginTop: 8,
    backgroundColor: "#000",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  media: { width: "100%", height: "100%" },
  expandBadge: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12,
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
  },
  expandText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  fullWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  fullImg: { width: "100%", height: "80%" },
  closePill: {
    position: "absolute", bottom: 48,
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.pill,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  closeText: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
