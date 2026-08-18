import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { LogBox, StatusBar, View, StyleSheet, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { UnitsProvider } from "@/src/lib/units";
import { initializeRevenueCat, SubscriptionProvider, useRCIdentityBinder } from "@/src/lib/revenuecat";
import { ScanlineOverlay } from "@/src/components/ScanlineOverlay";
import { HeroIntro } from "@/src/components/HeroIntro";
import { isEnhancedPalette, applyEnhancedPalette, colors } from "@/src/lib/theme";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

const queryClient = new QueryClient();

function RCIdentity({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  useRCIdentityBinder(user?.user_id);
  return <>{children}</>;
}

function IntroGate() {
  const { intro, user, clearIntro } = useAuth();
  if (!intro || !user) return null;
  return <HeroIntro user={user} mode={intro.mode} onDone={clearIntro} />;
}

// Keeps the red palette in sync with the logged-in athlete's Enhanced status.
// Web reloads once (fast, safe) so every StyleSheet re-evaluates red; native
// applies the palette in-memory (new screens render red) to avoid reload loops.
function EnhancedSync() {
  const { user } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (!user) return;
    const want = !!user.enhanced;
    const have = isEnhancedPalette();
    if (want === have) { persistEnhancedFlag(want); return; }
    if (done.current) return;
    done.current = true;
    (async () => {
      await persistEnhancedFlag(want);   // write flag BEFORE reload so boot applies red
      if (want) applyEnhancedPalette();
      if (Platform.OS === "web") reloadApp();
    })();
  }, [user?.enhanced, user?.user_id]);
  return null;
}

// Subtle app-wide crimson wash for Enhanced athletes.
function EnhancedTint() {
  const { user } = useAuth();
  if (!(user?.enhanced || isEnhancedPalette())) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,24,44,0.07)" }]} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SubscriptionProvider>
            <RCIdentity>
              <UnitsProvider>
              <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
              <EnhancedTint />
              <ScanlineOverlay />
              <EnhancedSync />
              <IntroGate />
              </UnitsProvider>
            </RCIdentity>
          </SubscriptionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
