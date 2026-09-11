/**
 * Where to send someone after they sign in. Login, signup and Google
 * sign-in honour a `?next=/some/path` query (a shared question link sends
 * people to /login?next=/q/<id>), but only for same-site paths — anything
 * that could leave the site (`//evil.example`, `https://…`, `/\evil`) is
 * ignored so the parameter can't be used as an open redirect.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\\]/.test(raw)) return null;
  return raw;
}

/** The validated `next` query parameter of the current page, if any. */
export function nextFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
