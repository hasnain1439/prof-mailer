"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ACCOUNT_BLOCKED, ApiError, UNAUTHORIZED_EVENT, api, errorMessage } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Set when /auth/me failed for a reason other than "not signed in" (API down, 5xx). */
  error: string | null;
  refresh: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Pages reachable without a session; they render without the app shell. */
export const PUBLIC_PATHS = ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"] as const;

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Only same-app relative paths are allowed as a post-login destination (never another auth page). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (isPublicPath(next.split(/[?#]/)[0])) return "/";
  return next;
}

/** One GET /auth/me per page load; any API 401 afterwards signs the user out locally. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: AuthUser | null; loading: boolean; error: string | null }>({
    user: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (res) => {
        if (!cancelled) setState({ user: res.user, loading: false, error: null });
      },
      (e: unknown) => {
        if (cancelled) return;
        // A blocked account is treated as signed out (the login page explains it).
        if (e instanceof ApiError && (e.status === 401 || e.code === ACCOUNT_BLOCKED)) setState({ user: null, loading: false, error: null });
        else setState({ user: null, loading: false, error: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    const onUnauthorized = () => setState({ user: null, loading: false, error: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setNonce((n) => n + 1);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Full reload (not router.push) so no previous user's data survives in client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }, []);

  return <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
