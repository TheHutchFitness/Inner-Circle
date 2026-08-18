import { Platform } from "react-native";

export type HealthData = { steps?: number; restingBpm?: number; avgBpm?: number };

const DEVICE_MSG =
  "Auto-sync needs Apple Health / Health Connect, which only works on a real device build. Use ✎ ENTER for now.";

// Native health modules (react-native-health-connect / HealthKit) only link in a
// custom device build. We require them statically but guard with try/catch so the
// Expo Go / web bundle keeps working and simply falls back to manual entry.
async function readNative(): Promise<HealthData | null> {
  try {
    if (Platform.OS === "android") {
      const HC = require("react-native-health-connect");
      if (!HC?.initialize) return null;
      const inited = await HC.initialize();
      if (!inited) return null;
      await HC.requestPermission([
        { accessType: "read", recordType: "Steps" },
        { accessType: "read", recordType: "RestingHeartRate" },
      ]);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const filter: any = { timeRangeFilter: { operator: "between", startTime: start.toISOString(), endTime: new Date().toISOString() } };
      const stepsRes = await HC.readRecords("Steps", filter);
      const steps = (stepsRes?.records || []).reduce((sum: number, r: any) => sum + (r.count || 0), 0);
      const rhr = await HC.readRecords("RestingHeartRate", filter);
      const restingBpm = rhr?.records?.length ? Math.round(rhr.records[rhr.records.length - 1].beatsPerMinute) : undefined;
      return { steps, restingBpm };
    }
    if (Platform.OS === "ios") {
      const HK = require("@kingstinct/react-native-healthkit");
      if (!HK) return null;
      const available = await HK.isHealthDataAvailable?.();
      if (!available) return null;
      await HK.requestAuthorization?.(["HKQuantityTypeIdentifierStepCount", "HKQuantityTypeIdentifierRestingHeartRate"], []);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const stepsSum = await HK.queryStatisticsForQuantity?.("HKQuantityTypeIdentifierStepCount", ["cumulativeSum"], start, new Date());
      const steps = stepsSum?.sumQuantity?.quantity ? Math.round(stepsSum.sumQuantity.quantity) : undefined;
      const rhrSamples = await HK.queryQuantitySamples?.("HKQuantityTypeIdentifierRestingHeartRate", { from: start, limit: 1, ascending: false });
      const restingBpm = rhrSamples?.length ? Math.round(rhrSamples[0].quantity) : undefined;
      return { steps, restingBpm };
    }
  } catch {
    return null;
  }
  return null;
}

/** Reads today's steps + resting HR from the OS health store, or degrades gracefully. */
export async function syncHealth(): Promise<{ ok: boolean; data?: HealthData; message: string }> {
  if (Platform.OS === "web") {
    return { ok: false, message: "Health sync isn't available on web — use ✎ ENTER." };
  }
  const data = await readNative();
  if (data && (data.steps != null || data.restingBpm != null)) {
    return { ok: true, data, message: Platform.OS === "ios" ? "Synced from Apple Health." : "Synced from Health Connect." };
  }
  return { ok: false, message: DEVICE_MSG };
}
