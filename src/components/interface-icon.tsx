import type { ReactNode } from "react";

const paths = {
  revenue: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18m-13 5h3" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6m-6 4h6m-6 4h3" /></>,
  incoming: <><path d="M12 3v12m-4-4 4 4 4-4M5 14v6h14v-6" /></>,
  outgoing: <><path d="M12 15V3m-4 4 4-4 4 4M5 14v6h14v-6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
  phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a13 13 0 0 1-7-7l2-2-2-5Z" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  commission: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m5 19 14-14" /></>,
  hiring: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-11h6m-3-3v6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  filters: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h.01m4 0h.01m4 0h.01" /></>,
  energy: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />,
  building: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></>,
  status: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
} satisfies Record<string, ReactNode>;

export function InterfaceIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
