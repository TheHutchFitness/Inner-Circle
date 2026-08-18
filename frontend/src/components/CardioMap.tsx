import React from "react";
import { StyleSheet, Platform } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { colors } from "@/src/lib/theme";

export function CardioMap({ region, route }: { region: any; route: any[] }) {
  return (
    <MapView
      testID="cardio-map"
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      region={region}
      showsUserLocation
      userInterfaceStyle="dark"
    >
      {route.length > 1 && <Polyline coordinates={route} strokeColor={colors.brandPrimary} strokeWidth={5} />}
    </MapView>
  );
}
