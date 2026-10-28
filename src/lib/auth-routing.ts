// Login may only return to a page on this application.
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/";
  try {
    const base = new URL("https://alle.local");
    const target = new URL(value, base);
    const path = decodeURIComponent(target.pathname);
    if (target.origin !== base.origin || /[\\\x00-\x20\x7f]/.test(path) || path.startsWith("//") || /^\/(login|api|_next)(\/|$)/.test(path)) return "/";
    return `${target.pathname}${target.search}`;
  } catch {
    return "/";
  }
}
