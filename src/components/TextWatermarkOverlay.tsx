"use client";

/** Repeated source attribution on question surfaces, above diagrams without intercepting input. */
export function TextWatermarkOverlay({ dark = false, mode = "fixed" }: { dark?: boolean; mode?: "fixed" | "absolute" }) {
  // Mid-tone ink stays visible over both a dark pane and an opaque white diagram.
  const fill = dark ? "148,163,184" : "23,37,84";
  const opacity = dark ? 0.24 : 0.10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
    <text x="160" y="85" text-anchor="middle" transform="rotate(-28 160 80)"
      font-family="Arial, sans-serif" font-size="26" font-weight="700"
      fill="rgba(${fill},${opacity})">Bluemind.uz</text>
  </svg>`;
  const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return (
    <div
      aria-hidden="true"
      data-question-watermark="true"
      className={`${mode === "fixed" ? "fixed" : "absolute"} inset-0 z-20 pointer-events-none select-none`}
      style={{ backgroundImage: dataUrl, backgroundRepeat: "repeat" }}
    />
  );
}
