"use client";

/**
 * Site-wide tiled diagonal text watermark ("Bluemind.uz" repeated at an
 * angle across the whole viewport) — purely decorative brand marking, not
 * anything else. Rendered via a small SVG tile turned into a CSS
 * background-image so it repeats infinitely and stays crisp at any zoom
 * level, instead of one oversized image.
 *
 * Fixed + pointer-events-none + a low z-index so it never blocks clicks or
 * text selection; sits above the plain page background but behind real
 * content (which needs `relative z-10` on its own wrapper to layer above
 * it — already true everywhere this is used).
 */
export function TextWatermarkOverlay({ dark = false, mode = "fixed" }: { dark?: boolean; mode?: "fixed" | "absolute" }) {
  const fill = dark ? "255,255,255" : "23,37,84"; // white on dark bg, navy on light bg
  const opacity = dark ? 0.09 : 0.07;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
    <text x="160" y="85" text-anchor="middle" transform="rotate(-28 160 80)"
      font-family="Arial, sans-serif" font-size="26" font-weight="700"
      fill="rgba(${fill},${opacity})">Bluemind.uz</text>
  </svg>`;
  const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return (
    <div
      aria-hidden="true"
      className={`${mode === "fixed" ? "fixed" : "absolute"} inset-0 z-0 pointer-events-none select-none`}
      style={{ backgroundImage: dataUrl, backgroundRepeat: "repeat" }}
    />
  );
}
