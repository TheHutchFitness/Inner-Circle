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
