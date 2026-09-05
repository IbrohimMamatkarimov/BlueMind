"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (el: HTMLElement, options?: Record<string, unknown>) => { destroy: () => void };
    };
  }
}

const DESMOS_API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY;

// Default position and size — near the top-left of the content area, like
// the real Digital SAT's Bluebook app (calculator opens under the header,
// left side), but larger by default so the keypad/graph aren't cramped.
const DEFAULT_POS = { x: 24, y: 96 };
const DEFAULT_SIZE = { w: 680, h: 680 };
const MIN_SIZE = { w: 380, h: 420 };

/**
 * Draggable Desmos graphing calculator panel for the Math section — matches
 * the real Digital SAT's built-in Desmos tool. Loads the Desmos JS API
 * lazily and only when opened, so it never slows down question loading.
 *
 * The panel opens near the top-left of the screen and can be dragged
 * anywhere by its title bar (mouse + touch).
 *
 * Can be used two ways:
 *  - Controlled: pass `open` + `onOpenChange` (e.g. toggled from a header
 *    button) — no trigger button is rendered.
 *  - Uncontrolled: omit both — renders its own floating trigger button.
 *
 * Requires NEXT_PUBLIC_DESMOS_API_KEY (free at https://www.desmos.com/api) —
 * without it, this renders a short setup note instead of the calculator.
 */
export function DesmosCalculator({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;

  function setOpen(next: boolean) {
    if (controlled) onOpenChange?.(next);
    else setOpenState(next);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const calcRef = useRef<{ destroy: () => void; resize?: () => void } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ---------------- Resize handling (drag from the bottom-right corner,
  // like a real desktop window) ----------------
  const [size, setSize] = useState(DEFAULT_SIZE);
  const resizeRef = useRef<{ resizing: boolean; startX: number; startY: number; startW: number; startH: number }>({
    resizing: false,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  function startResize(clientX: number, clientY: number) {
    resizeRef.current = { resizing: true, startX: clientX, startY: clientY, startW: size.w, startH: size.h };
  }

  useEffect(() => {
    function onMove(clientX: number, clientY: number) {
      if (!resizeRef.current.resizing) return;
      const w = Math.max(MIN_SIZE.w, resizeRef.current.startW + (clientX - resizeRef.current.startX));
      const h = Math.max(MIN_SIZE.h, resizeRef.current.startH + (clientY - resizeRef.current.startY));
      setSize({ w, h });
    }
    function onMouseMove(e: MouseEvent) {
      onMove(e.clientX, e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    }
    function stop() {
      resizeRef.current.resizing = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
    };
  }, [size.w, size.h]);

  // Tell Desmos to recompute its layout whenever the panel is resized — the
  // Desmos API watches window resizes but not an arbitrary container resize.
  useEffect(() => {
    calcRef.current?.resize?.();
  }, [size.w, size.h]);

  // ---------------- Drag handling ----------------
  const [pos, setPos] = useState(DEFAULT_POS);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  function clampPos(x: number, y: number, panelW = size.w, panelH = size.h) {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      x: Math.min(Math.max(0, x), Math.max(0, w - panelW)),
      y: Math.min(Math.max(0, y), Math.max(0, h - panelH)),
    };
  }

  function startDrag(clientX: number, clientY: number) {
    dragRef.current = { dragging: true, offsetX: clientX - pos.x, offsetY: clientY - pos.y };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current.dragging) return;
      setPos(clampPos(e.clientX - dragRef.current.offsetX, e.clientY - dragRef.current.offsetY));
    }
    function onMouseUp() {
      dragRef.current.dragging = false;
    }
    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current.dragging) return;
      const t = e.touches[0];
      if (!t) return;
      setPos(clampPos(t.clientX - dragRef.current.offsetX, t.clientY - dragRef.current.offsetY));
    }
    function onTouchEnd() {
      dragRef.current.dragging = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y]);

  // Reset to the default top-left position and size each time the panel is opened.
  useEffect(() => {
    if (open) {
      setPos(DEFAULT_POS);
      setSize(DEFAULT_SIZE);
    }
  }, [open]);

  // ---------------- Desmos script loading ----------------
  useEffect(() => {
    if (!open || !DESMOS_API_KEY || calcRef.current) return;

    const existing = document.getElementById("desmos-script") as HTMLScriptElement | null;

    function mount() {
      if (containerRef.current && window.Desmos && !calcRef.current) {
        calcRef.current = window.Desmos.GraphingCalculator(containerRef.current, {
          keypad: true,
          expressions: true,
          settingsMenu: false,
          zoomButtons: true,
          border: false,
        }) as { destroy: () => void; resize?: () => void };
      }
    }

    if (window.Desmos) {
      mount();
    } else if (existing) {
      existing.addEventListener("load", mount);
      existing.addEventListener("error", () => setLoadError(true));
    } else {
      const script = document.createElement("script");
      script.id = "desmos-script";
      script.src = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${DESMOS_API_KEY}`;
      script.async = true;
      script.onload = mount;
      script.onerror = () => setLoadError(true);
      document.body.appendChild(script);
    }

    return () => {
      calcRef.current?.destroy();
      calcRef.current = null;
    };
  }, [open]);

  if (!open && controlled) return null;

  return (
    <div className={controlled ? "fixed z-40" : "fixed bottom-5 right-5 z-50"} style={controlled ? { left: 0, top: 0 } : undefined}>
      {open && (
        <div
          className="fixed max-w-[95vw] max-h-[90vh] card overflow-hidden shadow-card-hover flex flex-col"
          style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
        >
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag(e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) startDrag(t.clientX, t.clientY);
            }}
            className="flex items-center justify-between px-4 py-2.5 cursor-move select-none bg-black shrink-0"
          >
            <span className="text-base font-bold text-white">Calculator</span>
            <div className="flex items-center gap-3">
              <span className="text-white text-lg leading-none tracking-widest">⋯</span>
              <button
                onClick={() => setOpen(false)}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-white/80 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>
          </div>
          {DESMOS_API_KEY && !loadError && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#3f7c3f] shrink-0">
              <span className="text-white font-extrabold text-lg tracking-tight">desmos</span>
              <span className="text-white/50">|</span>
              <span className="text-white font-semibold text-sm">Graphing Calculator</span>
              <span className="text-white/50">|</span>
              <span className="text-white/90 font-semibold text-sm">College Board Edition</span>
            </div>
          )}
          {!DESMOS_API_KEY ? (
            <div className="p-4 text-sm text-brand-slate">
              Desmos calculator isn't configured yet — add a free API key from{" "}
              <a href="https://www.desmos.com/api" target="_blank" rel="noreferrer" className="text-brand-blue underline">
                desmos.com/api
              </a>{" "}
              as <code className="text-xs">NEXT_PUBLIC_DESMOS_API_KEY</code> in your .env file.
            </div>
          ) : loadError ? (
            <div className="p-4 text-sm text-brand-red space-y-2">
              <p>Couldn't load Desmos right now.</p>
              <p className="text-xs text-brand-slate">
                This usually means the API key's allowed domains don't include the one you're testing on. Open your key
                at{" "}
                <a href="https://www.desmos.com/api" target="_blank" rel="noreferrer" className="text-brand-blue underline">
                  desmos.com/api
                </a>{" "}
                and add <code>localhost</code> (and your deployed domain) to its allowed referrers, then reload the page.
              </p>
            </div>
          ) : (
            <div ref={containerRef} className="flex-1 min-h-0 w-full" />
          )}

          {/* Resize handle — bottom-right corner, drag to change length/width */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startResize(e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) startResize(t.clientX, t.clientY);
            }}
            title="Drag to resize"
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 text-brand-slate/60 hover:text-brand-slate"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 4L4 20M20 12L12 20M20 20h-4M20 20v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
      {!controlled && (
        <button
          onClick={() => setOpen(!open)}
          className="btn-primary rounded-full h-12 px-5 shadow-card-hover text-sm font-semibold"
        >
          {open ? "Hide Calculator" : "Calculator"}
        </button>
      )}
    </div>
  );
}
