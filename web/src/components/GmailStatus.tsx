"use client";

import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { GmailStatus } from "@/lib/types";
import { useApi, type ApiState } from "@/lib/useApi";

const GmailStatusContext = createContext<ApiState<GmailStatus> | null>(null);

/** One shared GET /gmail/status for the sidebar, dashboard and Gmail page. */
export function GmailStatusProvider({ children }: { children: ReactNode }) {
  const state = useApi(() => api.gmailStatus());
  return <GmailStatusContext.Provider value={state}>{children}</GmailStatusContext.Provider>;
}

export function useGmailStatus(): ApiState<GmailStatus> {
  const ctx = useContext(GmailStatusContext);
  if (!ctx) throw new Error("useGmailStatus must be used inside <GmailStatusProvider>");
  return ctx;
}
