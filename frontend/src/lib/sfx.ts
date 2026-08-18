import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SRC: Record<string, any> = {
  slash: require("../../assets/sfx/slash.wav"),
  hit: require("../../assets/sfx/hit.wav"),
  victory: require("../../assets/sfx/victory.wav"),
};

let enabled = true;
const players: Record<string, any> = {};

export async function initSfx() {
  try { const v = await AsyncStorage.getItem("hic_sfx"); enabled = v !== "0"; } catch {}
  try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
}

export async function setSfxEnabled(on: boolean) {
  enabled = on;
  try { await AsyncStorage.setItem("hic_sfx", on ? "1" : "0"); } catch {}
}

export function isSfxEnabled() { return enabled; }

export function playSfx(name: "slash" | "hit" | "victory") {
  if (!enabled) return;
  try {
    if (!players[name]) players[name] = createAudioPlayer(SRC[name]);
    const p = players[name];
    p.seekTo(0);
    p.play();
  } catch {}
}
