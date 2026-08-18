export const colors = {
  surface: "#050508",
  surface2: "#12141A",
  surface3: "#1A1D26",
  text: "#FFFFFF",
  textDim: "#A0A5B5",
  textMid: "#C3C8D8",
  brand: "#0055FF",
  brandPrimary: "#00E5FF",
  brandTertiary: "#002A55",
  success: "#39FF14",
  warning: "#FFEA00",
  error: "#FF003C",
  border: "#1A1D26",
  borderStrong: "#0055FF",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };

export const AVATARS: { id: string; label: string; emoji: string; url?: string }[] = [
  { id: "avatar_ronin", label: "Ronin", emoji: "🥷" },
  { id: "avatar_kaido", label: "Kaido", emoji: "🐉" },
  { id: "avatar_titan", label: "Titan", emoji: "🗿" },
  { id: "avatar_saiyan", label: "Saiyan", emoji: "⚡️" },
  { id: "avatar_demon", label: "Demon", emoji: "👹" },
  { id: "avatar_wolf", label: "Wolf", emoji: "🐺" },
  { id: "avatar_ghost", label: "Ghost", emoji: "👻" },
  { id: "avatar_dragon", label: "Dragon", emoji: "🔥" },
  { id: "avatar_hutch", label: "Coach", emoji: "👑" },
  { id: "avatar_shinobi", label: "Shinobi", emoji: "🗡️" },
  { id: "avatar_berserker", label: "Berserker", emoji: "⚔️" },
  { id: "avatar_phoenix", label: "Phoenix", emoji: "🦅" },
  { id: "avatar_oni", label: "Oni", emoji: "😈" },
  { id: "avatar_samurai", label: "Samurai", emoji: "🎌" },
  { id: "avatar_mecha", label: "Mecha", emoji: "🤖" },
  { id: "avatar_reaper", label: "Reaper", emoji: "💀" },
  { id: "avatar_thunder", label: "Thunder God", emoji: "🌩️" },
  { id: "avatar_kraken", label: "Kraken", emoji: "🐙" },
  { id: "avatar_ace", label: "Ace", emoji: "🃏" },
  { id: "avatar_star", label: "Star Saint", emoji: "🌟" },
];

export function avatarFor(id: string) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

// AI-generated full anime-hero portraits (game character-select art)
export const AVATAR_IMAGES: Record<string, any> = {
  avatar_ronin: require("@/assets/images/av_ronin.png"),
  avatar_kaido: require("@/assets/images/av_kaido.png"),
  avatar_titan: require("@/assets/images/av_titan.png"),
  avatar_saiyan: require("@/assets/images/av_saiyan.png"),
  avatar_demon: require("@/assets/images/av_demon.png"),
  avatar_shinobi: require("@/assets/images/av_shinobi.png"),
  avatar_phoenix: require("@/assets/images/av_phoenix.png"),
  avatar_reaper: require("@/assets/images/av_reaper.png"),
  avatar_wolf: require("@/assets/images/av_wolf.png"),
  avatar_ghost: require("@/assets/images/av_ghost.png"),
  avatar_dragon: require("@/assets/images/av_dragon.png"),
  avatar_hutch: require("@/assets/images/av_hutch.png"),
  avatar_berserker: require("@/assets/images/av_berserker.png"),
  avatar_samurai: require("@/assets/images/av_samurai.png"),
  avatar_mecha: require("@/assets/images/av_mecha.png"),
  avatar_thunder: require("@/assets/images/av_thunder.png"),
  avatar_kraken: require("@/assets/images/av_kraken.png"),
  avatar_ace: require("@/assets/images/av_ace.png"),
  avatar_star: require("@/assets/images/av_star.png"),
  avatar_oni: require("@/assets/images/av_oni.png"),
};

export function avatarImage(id?: string, sex?: string) {
  if (sex === "female") return AVATAR_IMAGES_F[id || ""] || AVATAR_IMAGES[id || ""] || null;
  return AVATAR_IMAGES[id || ""] || null;
}

// Female character-select portraits (shown when account sex is female)
export const AVATAR_IMAGES_F: Record<string, any> = {
  avatar_ronin: require("@/assets/images/av_ronin_f.png"),
  avatar_kaido: require("@/assets/images/av_kaido_f.png"),
  avatar_titan: require("@/assets/images/av_titan_f.png"),
  avatar_saiyan: require("@/assets/images/av_saiyan_f.png"),
  avatar_demon: require("@/assets/images/av_demon_f.png"),
  avatar_shinobi: require("@/assets/images/av_shinobi_f.png"),
  avatar_phoenix: require("@/assets/images/av_phoenix_f.png"),
  avatar_reaper: require("@/assets/images/av_reaper_f.png"),
  avatar_wolf: require("@/assets/images/av_wolf_f.png"),
  avatar_ghost: require("@/assets/images/av_ghost_f.png"),
  avatar_dragon: require("@/assets/images/av_dragon_f.png"),
  avatar_berserker: require("@/assets/images/av_berserker_f.png"),
  avatar_samurai: require("@/assets/images/av_samurai_f.png"),
  avatar_mecha: require("@/assets/images/av_mecha_f.png"),
  avatar_thunder: require("@/assets/images/av_thunder_f.png"),
  avatar_kraken: require("@/assets/images/av_kraken_f.png"),
  avatar_ace: require("@/assets/images/av_ace_f.png"),
  avatar_star: require("@/assets/images/av_star_f.png"),
  avatar_oni: require("@/assets/images/av_oni_f.png"),
};

export function hasAvatarArt(id?: string) {
  return !!AVATAR_IMAGES[id || ""];
}

// Holographic card frames unlocked by rank (higher rank = fancier frame)
export const CARD_FRAMES: Record<string, { name: string; colors: [string, string, string]; border: string; glow: string }> = {
  Beginner:     { name: "STEEL FRAME",     colors: ["#2A2F3A", "#0A0C12", "#050508"], border: "#3A4152", glow: "#4A5568" },
  Intermediate: { name: "CYAN FRAME",      colors: ["#00E5FF55", "#0A0C12", "#050508"], border: "#00E5FF", glow: "#00E5FF" },
  Advanced:     { name: "COBALT FRAME",    colors: ["#0055FF66", "#0A0C12", "#050508"], border: "#0055FF", glow: "#0055FF" },
  Vanguard:     { name: "VANGUARD FRAME",  colors: ["#4C6FFF66", "#0A0C16", "#050508"], border: "#4C6FFF", glow: "#4C6FFF" },
  Warrior:      { name: "WARRIOR FRAME",   colors: ["#E08A2B66", "#140C04", "#050508"], border: "#E08A2B", glow: "#E08A2B" },
  Boss:         { name: "BOSS FRAME",      colors: ["#12B88666", "#04140C", "#050508"], border: "#12B886", glow: "#12B886" },
  Elite:        { name: "GILDED FRAME",    colors: ["#FFEA0066", "#0A0C12", "#050508"], border: "#FFEA00", glow: "#FFEA00" },
  Freak:        { name: "CRIMSON PRIME",   colors: ["#FF003C66", "#12040A", "#050508"], border: "#FF003C", glow: "#FF003C" },
};

// Rank ladder — each rank spans 10 app levels
export const RANK_ORDER = ["Beginner", "Intermediate", "Advanced", "Vanguard", "Warrior", "Boss", "Elite", "Freak"];
export function rankIndex(rank?: string) {
  const i = RANK_ORDER.indexOf(rank || "Beginner");
  return i < 0 ? 0 : i;
}

export function frameFor(rank?: string) {
  return CARD_FRAMES[rank || "Beginner"] || CARD_FRAMES.Beginner;
}

export const CLASS_TIER_COLORS: Record<string, string> = {
  E: "#8A8F9E", D: "#A0A5B5", C: "#00E5FF", B: "#0055FF", A: "#FFEA00", S: "#FF003C",
};

export const RANK_COLORS: Record<string, string> = {
  Beginner: "#A0A5B5",
  Intermediate: "#00E5FF",
  Advanced: "#0055FF",
  Vanguard: "#4C6FFF",
  Warrior: "#E08A2B",
  Boss: "#12B886",
  Elite: "#FFEA00",
  Freak: "#FF003C",
};

export function fmtWeight(w: number) {
  return `${Math.round(w)} lb`;
}

export const BACKGROUNDS: Record<string, string[]> = {
  bg_default: ["#002A55", "#12141A"],
  bg_cyber: ["#001A33", "#003A5C"],
  bg_toxic: ["#0A2A00", "#12141A"],
  bg_inferno: ["#2A0010", "#12141A"],
  bg_vanguard: ["#0A2A66", "#050914"],
  bg_warrior: ["#3A1E00", "#140A00"],
  bg_boss: ["#052A1A", "#04120C"],
  bg_void: ["#1A0033", "#050508"],
  bg_freak: ["#330000", "#0A0000"],
};

export function bgColors(id?: string): [string, string] {
  const c = BACKGROUNDS[id || "bg_default"] || BACKGROUNDS.bg_default;
  return [c[0], c[1]];
}

// AI-generated anime hero / gym background art (one per tier)
export const BG_IMAGES: Record<string, any> = {
  bg_default: require("@/assets/images/bg_default.png"),
  bg_cyber: require("@/assets/images/bg_cyber.png"),
  bg_toxic: require("@/assets/images/bg_toxic.png"),
  bg_inferno: require("@/assets/images/bg_inferno.png"),
  bg_vanguard: require("@/assets/images/bg_vanguard.png"),
  bg_warrior: require("@/assets/images/bg_warrior.png"),
  bg_boss: require("@/assets/images/bg_boss.png"),
  bg_void: require("@/assets/images/bg_void.png"),
  bg_freak: require("@/assets/images/bg_freak.png"),
};

export function bgImage(id?: string, sex?: string) {
  if (sex === "female") return BG_IMAGES_F[id || "bg_default"] || BG_IMAGES[id || "bg_default"] || BG_IMAGES.bg_default;
  return BG_IMAGES[id || "bg_default"] || BG_IMAGES.bg_default;
}

// Female tier backgrounds (shown when account sex is female)
export const BG_IMAGES_F: Record<string, any> = {
  bg_default: require("@/assets/images/bg_default_f.png"),
  bg_cyber: require("@/assets/images/bg_cyber_f.png"),
  bg_toxic: require("@/assets/images/bg_toxic_f.png"),
  bg_inferno: require("@/assets/images/bg_inferno_f.png"),
  bg_vanguard: require("@/assets/images/bg_vanguard_f.png"),
  bg_warrior: require("@/assets/images/bg_warrior_f.png"),
  bg_boss: require("@/assets/images/bg_boss_f.png"),
  bg_void: require("@/assets/images/bg_void_f.png"),
  bg_freak: require("@/assets/images/bg_freak_f.png"),
};
