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

export const RANK_COLORS: Record<string, string> = {
  Beginner: "#A0A5B5",
  Intermediate: "#00E5FF",
  Advanced: "#0055FF",
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
  bg_void: require("@/assets/images/bg_void.png"),
  bg_freak: require("@/assets/images/bg_freak.png"),
};

export function bgImage(id?: string) {
  return BG_IMAGES[id || "bg_default"] || BG_IMAGES.bg_default;
}
