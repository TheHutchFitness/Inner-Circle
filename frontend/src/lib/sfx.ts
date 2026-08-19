import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SRC: Record<string, any> = {
  slash: require("../../assets/sfx/slash.wav"),
  hit: require("../../assets/sfx/hit.wav"),
  victory: require("../../assets/sfx/victory.wav"),
};

const MUSIC = [
  require("../../assets/sfx/zone0.wav"),
  require("../../assets/sfx/zone1.wav"),
  require("../../assets/sfx/zone2.wav"),
  require("../../assets/sfx/zone3.wav"),
  require("../../assets/sfx/zone4.wav"),
  require("../../assets/sfx/zone5.wav"),
];

let enabled = true;
const players: Record<string, any> = {};
let music: any = null;
let musicIdx = -1;

export async function initSfx() {
  try { const v = await AsyncStorage.getItem("hic_sfx"); enabled = v !== "0"; } catch {}
  try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
}

export async function setSfxEnabled(on: boolean) {
  enabled = on;
  try { await AsyncStorage.setItem("hic_sfx", on ? "1" : "0"); } catch {}
  if (!on) stopMusic();
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

// Looping ambient music, one track per zone-tier band (0-1 / 2-3 / 4-5).
export function startZoneMusic(zoneIndex: number) {
  if (!enabled) return;
  const idx = Math.max(0, Math.min(MUSIC.length - 1, zoneIndex || 0));
  try {
    if (music && musicIdx === idx) { music.play(); return; }
    stopMusic();
    music = createAudioPlayer(MUSIC[idx]);
    music.loop = true;
    music.volume = 0.5;
    musicIdx = idx;
    music.play();
  } catch {}
}

export function stopMusic() {
  try { if (music) { music.pause(); music.remove?.(); } } catch {}
  music = null; musicIdx = -1;
}
