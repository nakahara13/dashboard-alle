"use client";

import { createContext, useContext, type ReactNode } from "react";

const WriteAccessContext = createContext(false);

export function AccessProvider({ canWrite, children }: { canWrite: boolean; children: ReactNode }) {
  return <WriteAccessContext.Provider value={canWrite}>{children}</WriteAccessContext.Provider>;
}

export function useCanWrite() { return useContext(WriteAccessContext); }

export function WriteAccess({ children }: { children: ReactNode }) {
  return useCanWrite() ? <>{children}</> : null;
}
