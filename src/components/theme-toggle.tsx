"use client";

import { useSyncExternalStore } from "react";

const key = "alle-theme";
function subscribe(callback: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    callback();
  };
  window.addEventListener("storage", sync);
  window.addEventListener("alle-theme-change", callback);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener("alle-theme-change", callback);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  function toggle() {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(key, theme); } catch { /* Theme still works when storage is unavailable. */ }
    window.dispatchEvent(new Event("alle-theme-change"));
  }
  return <button type="button" onClick={toggle} aria-pressed={dark} aria-label="Modo noturno" title={dark ? "Ativar modo claro" : "Ativar modo noturno"} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-secondary hover:bg-muted">
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />}</svg>
  </button>;
}
