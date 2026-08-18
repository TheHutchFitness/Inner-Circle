import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { UnitsProvider } from "@/src/lib/units";
import { initializeRevenueCat, SubscriptionProvider, useRCIdentityBinder } from "@/src/lib/revenuecat";
import { ScanlineOverlay } from "@/src/components/ScanlineOverlay";
import { HeroIntro } from "@/src/components/HeroIntro";

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
              <StatusBar barStyle="light-content" backgroundColor="#050508" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050508" } }} />
              <ScanlineOverlay />
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
