"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Tells the server about once a minute that a signed-in person is using
 * BlueMind, and on which page. It powers the admin dashboard's "online now",
 * active-user and time-on-site numbers (see src/lib/activity.ts).
 *
 * Only time while the tab is visible counts, and the server caps every
 * report. A signed-out visitor gets a 401, which switches reporting off
 * until the next navigation.
 */
const PING_URL = "/api/activity/ping";
const INTERVAL_MS = 60_000;
const SKIP = new Set(["/", "/login", "/signup"]);

interface Tracker {
  path: string;
  visibleSince: number;
  disabled: boolean;
}

function visibleSeconds(tracker: Tracker, now: number): number {
  return tracker.visibleSince ? (now - tracker.visibleSince) / 1000 : 0;
}

function report(tracker: Tracker, path: string, seconds: number, useBeacon = false) {
  if (tracker.disabled || !path || SKIP.has(path)) return;
  const body = JSON.stringify({ path, seconds: Math.round(seconds) });
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(PING_URL, new Blob([body], { type: "application/json" }));
    return;
  }
  fetch(PING_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .then((response) => {
      if (response.status === 401 || response.status === 403) tracker.disabled = true;
    })
    .catch(() => {
      // Offline or the server is restarting — the next report carries on.
    });
}

export function ActivityHeartbeat() {
  const pathname = usePathname() ?? "";
  const tracker = useRef<Tracker>({ path: "", visibleSince: 0, disabled: false });

  // Credit the page being left, then start timing the new one. The zero-second
  // report marks the person as "online now" straight away.
  useEffect(() => {
    const t = tracker.current;
    const now = Date.now();
    if (t.path && t.path !== pathname) report(t, t.path, visibleSeconds(t, now));
    t.path = pathname;
    t.disabled = false;
    t.visibleSince = document.visibilityState === "visible" ? now : 0;
    report(t, t.path, 0);
  }, [pathname]);

  useEffect(() => {
    const t = tracker.current;
    function flush(useBeacon: boolean) {
      const now = Date.now();
      const seconds = visibleSeconds(t, now);
      t.visibleSince = document.visibilityState === "visible" ? now : 0;
      report(t, t.path, seconds, useBeacon);
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") flush(false);
    }, INTERVAL_MS);
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flush(true);
      } else {
        t.visibleSince = Date.now();
        report(t, t.path, 0);
      }
    }
    function onPageHide() {
      flush(true);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
