import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "hutch_token";

type User = any;

interface AuthCtx {
  user: User | null;
  loading: boolean;
  token: string | null;
  intro: { mode: "signup" | "login" } | null;
  showIntro: (mode: "signup" | "login") => void;
  clearIntro: () => void;
  setSession: (token: string, user: User) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  appleSignIn: (payload: { identity_token: string; email?: string | null; name?: string | null }) => Promise<void>;
  registerEmail: (email: string, password: string, name: string, sex?: string, referralCode?: string, gym?: string, inpersonRequest?: boolean) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function storeToken(v: string | null) {
  if (Platform.OS === "web") {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  } else {
    if (v) await SecureStore.setItemAsync(TOKEN_KEY, v);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
async function readToken(): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [intro, setIntro] = useState<{ mode: "signup" | "login" } | null>(null);
  const tokenRef = useRef<string | null>(null);

  const showIntro = useCallback((mode: "signup" | "login") => setIntro({ mode }), []);
  const clearIntro = useCallback(() => setIntro(null), []);

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) { setUser(null); return; }
    try {
      const r = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) { await signOut(); return; }
      const u = await r.json();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  const setSession = useCallback(async (t: string, u: User) => {
    await storeToken(t);
    tokenRef.current = t;
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await storeToken(null);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  const appleSignIn = useCallback(async (payload: { identity_token: string; email?: string | null; name?: string | null }) => {
    const r = await fetch(`${API}/api/auth/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Apple sign-in failed");
    }
    const data = await r.json();
    await setSession(data.session_token, data.user);
    setIntro({ mode: "login" });
  }, [setSession]);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const r = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data = await r.json();
    await setSession(data.session_token, data.user);
    setIntro({ mode: "login" });
  }, [setSession]);

  const registerEmail = useCallback(async (email: string, password: string, name: string, sex?: string, referralCode?: string, gym?: string, inpersonRequest?: boolean) => {
    const r = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name: name, sex, referral_code: referralCode || undefined, gym: gym?.trim() || undefined, inperson_request: inpersonRequest || undefined }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Register failed");
    }
    const data = await r.json();
    await setSession(data.session_token, data.user);
    setIntro({ mode: "signup" });
  }, [setSession]);

  useEffect(() => {
    (async () => {
      const t = await readToken();
      if (t) {
        tokenRef.current = t;
        setToken(t);
        await refresh();
      }
      setLoading(false);
    })();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ user, token, loading, intro, showIntro, clearIntro, setSession, refresh, signOut, loginEmail, appleSignIn, registerEmail }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}

export async function apiFetch(token: string | null, path: string, opts: RequestInit = {}) {
  const h: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { ...opts, headers: h });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}
