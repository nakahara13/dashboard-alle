"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Action = "view" | "edit" | "delete";
const labels = { view: "Visualizar", edit: "Editar", delete: "Excluir" };
const icons: Record<Action, ReactNode> = {
  view: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  edit: <><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
  delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
};

export function RowActions({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={`Ações de ${label}`} className="flex w-max flex-col items-stretch gap-2">{children}</div>;
}

export function RowActionButton({ action, label, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { action: Action; label: string }) {
  return <button {...props} type="button" title={`${labels[action]} ${label}`} aria-label={`${labels[action]} ${label}`} className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${action === "delete" ? "border-line bg-surface text-danger-ink hover:border-danger-ink hover:bg-danger-soft" : action === "edit" ? "border-accent-line bg-accent-soft text-accent-ink hover:bg-accent-soft/70" : "border-line bg-surface text-secondary hover:bg-muted"}`}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{icons[action]}</svg>
    <span>{children ?? labels[action]}</span>
  </button>;
}
