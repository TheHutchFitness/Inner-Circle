import { Platform, useWindowDimensions } from "react-native";

// Web/desktop optimization. These helpers are inert on native (mobile app is
// unchanged): isDesktop is only ever true on web at/above the breakpoint.
export const DESKTOP_BREAKPOINT = 1280;
export const SIDEBAR_W = 236;
export const WEB_MAX_W = 1120;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  return { isWeb, isDesktop, width, height };
}

// Style fragment that centers a ScrollView's content to a max width on desktop web.
export function webCenter(isDesktop: boolean) {
  return isDesktop ? { maxWidth: WEB_MAX_W, width: "100%" as const, alignSelf: "center" as const } : null;
}
