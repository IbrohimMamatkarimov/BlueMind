"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainMark } from "./BrainLogo";

/**
 * Full-screen blue confetti + brain-emoji burst, fired once per `trigger`
 * change (increment a counter and pass it in to re-fire). Pure CSS/DOM —
 * no external confetti library needed. Auto-clears itself after the
 * animation finishes, and respects prefers-reduced-motion via globals.css.
 */
export function Celebration({ trigger }: { trigger: number }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), 3200);
    return () => clearTimeout(t);
  }, [trigger]);

  const pieces = useMemo(() => {
    const shapes = ["brain", "square", "circle"] as const;
    const blues = ["#2563eb", "#1d4ed8", "#60a5fa", "#93c5fd", "#1e40af"];
    return Array.from({ length: 70 }, (_, i) => {
      const shape = shapes[i % shapes.length];
      return {
        id: i,
        left: Math.random() * 100,
        // Near-zero, tiny jitter only — pieces should pop essentially all at
        // once (a "boom"), not trickle in over half a second.
        delay: Math.random() * 0.06,
        duration: 2.4 + Math.random() * 1.4,
        size: shape === "brain" ? 16 + Math.random() * 12 : 6 + Math.random() * 8,
        spin: 360 + Math.random() * 540,
        color: blues[i % blues.length],
        shape,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-8vh",
            width: p.size,
            height: p.size,
            background: p.shape === "brain" ? undefined : p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "square" ? 3 : undefined,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            ["--confetti-spin" as string]: `${p.spin}deg`,
          }}
        >
          {p.shape === "brain" ? <BrainMark size={p.size} /> : null}
        </span>
      ))}
    </div>
  );
}
