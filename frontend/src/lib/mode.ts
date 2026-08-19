// App-mode helpers. Lite mode strips gamification/cosmetics/social and keeps
// the app as a pure tracking utility. Full mode has everything.
export function isLite(user: any): boolean {
  return !!user?.lite_mode;
}

export function modeSelected(user: any): boolean {
  return user?.mode_selected === true;
}
