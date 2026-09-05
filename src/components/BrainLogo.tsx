"use client";

/**
 * BlueMind brain mark — renders the real logo file from /public/logo.png.
 * This is the ONE brain icon used everywhere in the app — navbar, wordmark,
 * mock cards. CircuitBrainMark below is kept only as an alias so existing
 * imports don't need to change.
 */
export function BrainMark({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        // Same fix as BrainWatermark below — the logo's blues sit close to
        // the dark navy sidebar/header background, so on a dark background
        // it was blending in almost completely instead of reading as a
        // logo. Brightness+saturation boost plus a faint light glow makes
        // it pop the way it does on white.
        filter: dark ? "brightness(1.6) saturate(1.3) drop-shadow(0 0 5px rgba(255,255,255,0.25))" : undefined,
      }}
    />
  );
}

export function BrandLockup({ size = 28, dark = false, collapsed = false }: { size?: number; dark?: boolean; collapsed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BrainMark size={size} dark={dark} />
      {!collapsed && (
        <span
          className={`font-bold tracking-tight ${dark ? "text-white" : "text-brand-navy"}`}
          style={{ fontSize: size * 0.68 }}
        >
          BlueMind
        </span>
      )}
    </span>
  );
}

/** Faint oversized background watermark version of the brain mark — used on
 * mock cards (replacing the small corner icon) and site-wide on signed-in
 * pages as a subtle background texture. Purely decorative: aria-hidden,
 * no pointer events, sits behind real content.
 *
 * `dark` boosts brightness/saturation on top of the opacity you pass in —
 * the logo's blues sit close to the dark navy background hue, so opacity
 * alone left it nearly invisible in dark mode; this pushes the actual
 * pixel colors lighter so it reads as a visible watermark instead of
 * blending into the background. */
export function BrainWatermark({
  className = "",
  size = 260,
  opacity = 0.06,
  dark = false,
}: {
  className?: string;
  size?: number;
  opacity?: number;
  dark?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        opacity,
        filter: dark ? "brightness(2.2) saturate(1.4)" : undefined,
      }}
    />
  );
}

/** Alias kept so existing `import { CircuitBrainMark }` call sites (mock
 * cards) keep working without edits — same one real logo file as BrainMark. */
export function CircuitBrainMark({ size = 40 }: { size?: number }) {
  return <BrainMark size={size} />;
}
