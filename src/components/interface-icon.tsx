import type { ReactNode } from "react";

const paths = {
  revenue: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18m-13 5h3" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6m-6 4h6m-6 4h3" /></>,
  incoming: <><path d="M12 3v12m-4-4 4 4 4-4M5 14v6h14v-6" /></>,
  outgoing: <><path d="M12 15V3m-4 4 4-4 4 4M5 14v6h14v-6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
  commission: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m5 19 14-14" /></>,
  hiring: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-11h6m-3-3v6" /></>,
} satisfies Record<string, ReactNode>;

export function InterfaceIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
