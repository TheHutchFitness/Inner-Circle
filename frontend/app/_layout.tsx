import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { initializeRevenueCat, SubscriptionProvider, useRCIdentityBinder } from "@/src/lib/revenuecat";
import { ScanlineOverlay } from "@/src/components/ScanlineOverlay";

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

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SubscriptionProvider>
            <RCIdentity>
              <StatusBar barStyle="light-content" backgroundColor="#050508" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050508" } }} />
              <ScanlineOverlay />
            </RCIdentity>
          </SubscriptionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
