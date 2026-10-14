import { describeProgressKey, summarizeProgress, type ProgressKeyInfo, type ProgressSummary } from "./progress-keys";

// Client side of /api/test-progress. The runners keep writing progress to
// localStorage on every change (it is instant and works for guests); these
// helpers mirror that blob to the server for signed-in learners, throttled,
// and pick whichever copy is newer when a test is reopened.

const THROTTLE_MS = 8000;
const KEEPALIVE_LIMIT = 60_000; // browsers cap keepalive request bodies at 64 KB
const pending = new Map<string, { state: unknown; timer: number }>();
// Set after the first 401 so guests don't keep sending requests that can't succeed.
let signedOut = false;

// A finished full exam keeps every graded question, images included. The
// server copy leaves the images out: they are most of the size and the
// review still reads fine without them.
function compact(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;
  const record = state as Record<string, unknown>;
  if (!record.results || typeof record.results !== "object") return state;
  const results = Object.fromEntries(Object.entries(record.results as Record<string, unknown>).map(([step, result]) => {
    const graded = result as { results?: unknown };
    return [step, Array.isArray(graded?.results)
      ? { ...graded, results: graded.results.map((question) => ({ ...(question as object), imageData: null })) }
      : result];
  }));
  return { ...record, results };
}

function send(key: string, state: unknown, keepalive: boolean) {
  const body = JSON.stringify({ key, state: compact(state) });
  return fetch("/api/test-progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: keepalive && body.length < KEEPALIVE_LIMIT,
  }).then((res) => {
    if (res.status === 401) signedOut = true;
  }).catch(() => {});
}

/** Schedules an upload of `state` for `key`; repeated calls within the
 * throttle window just replace what will be sent. */
export function queueProgressSync(key: string, state: unknown) {
  if (signedOut) return;
  const entry = pending.get(key);
  if (entry) {
    entry.state = state;
    return;
  }
  const timer = window.setTimeout(() => { void flushProgressSync(key, false); }, THROTTLE_MS);
  pending.set(key, { state, timer });
}

/** Sends queued uploads now — on pagehide, Save & exit, etc. */
export function flushProgressSync(key?: string, keepalive = true) {
  const keys = key ? [key] : Array.from(pending.keys());
  return Promise.all(keys.map((k) => {
    const entry = pending.get(k);
    if (!entry) return Promise.resolve();
    window.clearTimeout(entry.timer);
    pending.delete(k);
    return send(k, entry.state, keepalive);
  }));
}

export function deleteServerProgress(key: string) {
  const entry = pending.get(key);
  if (entry) {
    window.clearTimeout(entry.timer);
    pending.delete(key);
  }
  if (signedOut) return;
  fetch(`/api/test-progress?key=${encodeURIComponent(key)}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function savedAtOf(state: Record<string, unknown> | null) {
  return state && typeof state.savedAt === "number" ? state.savedAt : 0;
}

/**
 * Returns the raw JSON a runner should restore for `key`, after comparing
 * this browser's copy with the server's: the newer one wins (and is written
 * back to localStorage), and a local copy of a test that was already
 * submitted elsewhere is discarded. Falls back to the local copy if the
 * server can't be reached within a few seconds.
 */
export async function resolveSavedProgress(key: string, idField: "submissionId" | "sessionId" = "submissionId"): Promise<string | null> {
  let localRaw: string | null = null;
  try { localRaw = window.localStorage.getItem(key); } catch {}
  const local = parse(localRaw);
  const localId = local && typeof local[idField] === "string" ? local[idField] as string : null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const params = new URLSearchParams({ key });
    if (localId) params.set("submissionId", localId);
    const res = await fetch(`/api/test-progress?${params}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return localRaw;
    const data = await res.json() as { progress: { state: Record<string, unknown>; savedAt: number } | null; submitted: boolean };
    let current = local;
    if (data.submitted) {
      try { window.localStorage.removeItem(key); } catch {}
      current = null;
    }
    const server = data.progress?.state ?? null;
    if (server && (!current || Math.max(savedAtOf(server), data.progress?.savedAt ?? 0) > savedAtOf(current))) {
      const raw = JSON.stringify(server);
      try { window.localStorage.setItem(key, raw); } catch {}
      return raw;
    }
    // This browser's copy is newer (saved offline, or before server sync existed).
    if (current) queueProgressSync(key, current);
    return current ? JSON.stringify(current) : null;
  } catch {
    return localRaw;
  } finally {
    window.clearTimeout(timeout);
  }
}

let reconciled = false;

/**
 * Every saved test the catalog should show: the server's list for signed-in
 * learners plus anything only this browser has. The first call per page
 * load also uploads this browser's copies (so progress saved before server
 * sync existed moves to the account) and drops local copies of tests that
 * were already submitted on another device.
 */
export async function loadProgressList(signedIn: boolean): Promise<ProgressSummary[]> {
  const local: { key: string; info: ProgressKeyInfo; state: Record<string, unknown> }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      const info = key ? describeProgressKey(key) : null;
      const state = info && key ? parse(window.localStorage.getItem(key)) : null;
      if (key && info && state) local.push({ key, info, state });
    }
  } catch {
    // storage unavailable — the server list is all there is
  }

  let server: ProgressSummary[] = [];
  const stale = new Set<string>();
  if (signedIn && !signedOut) {
    try {
      const res = reconciled
        ? await fetch("/api/test-progress", { cache: "no-store" })
        : await fetch("/api/test-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: local.slice(0, 50).map(({ key, state }) => ({ key, state: compact(state) })) }),
        });
      if (res.status === 401) signedOut = true;
      else if (res.ok) {
        const data = await res.json() as { progress: ProgressSummary[]; stale?: string[] };
        server = data.progress ?? [];
        for (const key of data.stale ?? []) {
          stale.add(key);
          try { window.localStorage.removeItem(key); } catch {}
        }
        reconciled = true;
      }
    } catch {
      // offline — fall back to this browser's copies
    }
  }

  const byKey = new Map(server.map((item) => [item.key, item]));
  for (const { key, info, state } of local) {
    if (stale.has(key) || (info.kind !== "module" && info.kind !== "full")) continue;
    const mine = summarizeProgress(key, info, state);
    const theirs = byKey.get(key);
    if (!theirs || mine.savedAt > theirs.savedAt) byKey.set(key, mine);
  }
  return Array.from(byKey.values());
}
