"use client";

import { useEffect, useMemo, useState } from "react";
import { CoachMarkdown } from "./CoachMarkdown";

/**
 * Renders a Coach "explain"/"teach"/"photo" response as a step-through
 * slideshow instead of one long wall of text — modeled on the animated
 * slide-deck style of explainer videos (title card per step, bold key
 * numbers, arrow comparisons like "83% → 15%" called out in color, and a
 * boxed green "Final Answer" step).
 *
 * This is a real in-app UI, not a rendered video file — no video-encoding
 * pipeline exists in this stack, and building one just for this would be a
 * lot of new infrastructure for something that behaves identically to a
 * "next slide" button. This gets the same step-by-step teaching feel
 * (including an optional autoplay) without that cost.
 *
 * Parses the "## N. Title" headers the Coach prompt is instructed to
 * produce (see TUTOR_STRUCTURE in lib/groq.ts) into discrete slides. Falls
 * back to plain CoachMarkdown rendering for text with no such headers
 * (e.g. a plain "hint", which is only a sentence or two).
 */

interface Slide {
  title: string;
  body: string;
}

function parseSlides(markdown: string): Slide[] {
  const lines = markdown.split("\n");
  const slides: Slide[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];
  let sawHeader = false;

  function flush() {
    const body = buffer.join("\n").trim();
    if (currentTitle !== null) {
      slides.push({ title: currentTitle, body });
    } else if (body) {
      // Content before the first "## " header (e.g. the short "concept" or
      // "diagnosis" sentence teach/photo modes prepend) becomes its own
      // lead-in slide, like a title card.
      slides.push({ title: "Overview", body });
    }
    buffer = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      sawHeader = true;
      flush();
      currentTitle = line.slice(3).replace(/^\d+\.\s*/, "");
    } else {
      buffer.push(raw);
    }
  }
  flush();
  return sawHeader ? slides : [];
}

const BOLD_RE = /(\*\*[^*]+\*\*)/g;
const ARROW_RE = /(\d+(?:\.\d+)?%?\s*(?:→|->)\s*\d+(?:\.\d+)?%?)/g;
const ARROW_EXACT = /^\d+(?:\.\d+)?%?\s*(?:→|->)\s*\d+(?:\.\d+)?%?$/;
const CHANGE_WORD = /^(INCREASES?D?|DECREASES?D?|JUMP(?:S|ED)?|DROP(?:S|PED)?)$/i;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const boldPieces = text.split(BOLD_RE);
  boldPieces.forEach((piece, i) => {
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      const inner = piece.slice(2, -2);
      const isChangeWord = CHANGE_WORD.test(inner.trim());
      nodes.push(
        <strong
          key={`${keyPrefix}-b${i}`}
          className={isChangeWord ? "font-bold text-orange-600" : "font-semibold text-brand-navy"}
        >
          {inner}
        </strong>
      );
      return;
    }
    const arrowPieces = piece.split(ARROW_RE);
    arrowPieces.forEach((ap, j) => {
      if (!ap) return;
      if (ARROW_EXACT.test(ap.trim())) {
        nodes.push(
          <span
            key={`${keyPrefix}-a${i}-${j}`}
            className="inline-flex items-center font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded mx-0.5 whitespace-nowrap"
          >
            {ap.trim()}
          </span>
        );
      } else {
        nodes.push(<span key={`${keyPrefix}-t${i}-${j}`}>{ap}</span>);
      }
    });
  });
  return nodes;
}

function renderBody(text: string, keyPrefix: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1.5 my-2">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-sm text-brand-navy leading-relaxed">
            {renderInline(item, `${key}-li${i}`)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line.startsWith("- ") || line.startsWith("• ")) {
      listBuffer.push(line.slice(2));
    } else if (line.length === 0) {
      flushList(`${keyPrefix}-ul-${idx}`);
    } else {
      flushList(`${keyPrefix}-ul-${idx}`);
      blocks.push(
        <p key={`${keyPrefix}-p-${idx}`} className="text-sm text-brand-navy leading-relaxed mb-2 last:mb-0">
          {renderInline(line, `${keyPrefix}-p-${idx}`)}
        </p>
      );
    }
  });
  flushList(`${keyPrefix}-ul-end`);
  return <div>{blocks}</div>;
}

const AUTOPLAY_MS = 5500;

// The segment for the currently-active slide, while Autoplay is running —
// fills from 0% to 100% over the autoplay duration via a real CSS width
// transition, so it's obvious the timer is actually counting down instead
// of the UI looking frozen for 5+ seconds between slides.
function ActiveSegment({ autoplay, durationMs }: { autoplay: boolean; durationMs: number }) {
  const [pct, setPct] = useState(autoplay ? 0 : 100);

  useEffect(() => {
    if (!autoplay) {
      setPct(100);
      return;
    }
    setPct(0);
    // Double rAF: the 0% width has to actually paint before we flip to
    // 100%, or the browser collapses the two writes into one frame and
    // the transition never plays.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPct(100));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [autoplay, durationMs]);

  return (
    <div className="h-1 flex-1 rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full bg-brand-blue rounded-full"
        style={{ width: `${pct}%`, transition: autoplay ? `width ${durationMs}ms linear` : "width 0.15s ease" }}
      />
    </div>
  );
}

export function CoachSlideshow({ text }: { text: string }) {
  const slides = useMemo(() => parseSlides(text), [text]);
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    setIndex(0);
    setAutoplay(false);
  }, [text]);

  useEffect(() => {
    if (!autoplay || slides.length === 0) return;
    if (index >= slides.length - 1) {
      setAutoplay(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(slides.length - 1, i + 1)), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [autoplay, index, slides.length]);

  if (slides.length === 0) {
    // No "## " structure detected (e.g. a plain hint) — plain rendering.
    return <CoachMarkdown text={text} />;
  }

  const slide = slides[index];
  const isFinalAnswer = /final answer/i.test(slide.title);
  const isStrategy = /strategy/i.test(slide.title);

  return (
    <div className="rounded-xl border border-brand-border bg-white overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-3.5">
        {slides.map((_, i) =>
          i === index ? (
            <ActiveSegment key={i} autoplay={autoplay} durationMs={AUTOPLAY_MS} />
          ) : (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < index ? "bg-brand-blue" : "bg-slate-200"}`} />
          )
        )}
      </div>

      <div key={index} className="px-5 py-5 min-h-[180px] animate-[fadeIn_0.25s_ease]">
        <p className="text-[11px] font-semibold text-brand-blue uppercase tracking-wide mb-2">
          Step {index + 1} of {slides.length}
        </p>
        <h3 className={`font-extrabold text-lg mb-3 leading-snug ${isFinalAnswer ? "text-brand-green" : "text-brand-navy"}`}>
          {isStrategy && "⚡ "}
          {slide.title}
        </h3>
        <div className={isFinalAnswer ? "border border-brand-green bg-brand-green-light rounded-lg p-4" : ""}>
          {renderBody(slide.body, `slide-${index}`)}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-border bg-slate-50">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-xs font-semibold text-brand-navy disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
        >
          ← Back
        </button>
        <button
          onClick={() => setAutoplay((v) => !v)}
          className={`text-xs font-semibold px-2 py-1 rounded-full ${autoplay ? "text-white bg-brand-blue animate-pulse" : "text-brand-blue"}`}
        >
          {autoplay ? "❚❚ Pause" : "▶ Play through"}
        </button>
        {index < slides.length - 1 ? (
          <button onClick={() => setIndex((i) => i + 1)} className="text-xs font-semibold text-brand-navy px-2 py-1">
            Next →
          </button>
        ) : (
          <span className="text-xs text-brand-slate px-2 py-1">Done</span>
        )}
      </div>
    </div>
  );
}
