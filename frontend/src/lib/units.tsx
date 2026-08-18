import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type Unit = "lb" | "kg";
const KEY = "hutch_unit";
const LB_PER_KG = 2.2046226218;

interface UnitsCtx {
  unit: Unit;
  toggle: () => void;
  setUnit: (u: Unit) => void;
  toDisplay: (lb: number) => number;   // lb -> current unit value
  toLb: (val: number) => number;       // current unit value -> lb
  step: number;                        // sensible increment in current unit
  fmt: (lb: number, decimals?: number) => string;
}

const Ctx = createContext<UnitsCtx | null>(null);

async function persist(u: Unit) {
  try {
    if (Platform.OS === "web") localStorage.setItem(KEY, u);
    else await SecureStore.setItemAsync(KEY, u);
  } catch {}
}
async function read(): Promise<Unit | null> {
  try {
    if (Platform.OS === "web") return (localStorage.getItem(KEY) as Unit) || null;
    return (await SecureStore.getItemAsync(KEY)) as Unit | null;
  } catch { return null; }
}

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<Unit>("lb");
  useEffect(() => { read().then((u) => { if (u === "lb" || u === "kg") setUnitState(u); }); }, []);
  const setUnit = (u: Unit) => { setUnitState(u); persist(u); };
  const toggle = () => setUnit(unit === "lb" ? "kg" : "lb");
  const toDisplay = (lb: number) => (unit === "kg" ? lb / LB_PER_KG : lb);
  const toLb = (val: number) => (unit === "kg" ? val * LB_PER_KG : val);
  const step = unit === "kg" ? 2.5 : 5;
  const fmt = (lb: number, decimals = 0) => {
    const v = toDisplay(lb);
    return `${v.toFixed(decimals)} ${unit}`;
  };
  return <Ctx.Provider value={{ unit, toggle, setUnit, toDisplay, toLb, step, fmt }}>{children}</Ctx.Provider>;
}

export function useUnits() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUnits must be inside UnitsProvider");
  return c;
}
