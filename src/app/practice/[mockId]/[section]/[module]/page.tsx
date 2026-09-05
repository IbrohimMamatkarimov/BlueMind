"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DesmosCalculator } from "@/components/DesmosCalculator";
import { MathText } from "@/components/MathText";
import { Celebration } from "@/components/Celebration";
import { BrainMark } from "@/components/BrainLogo";
import { CoachSlideshow } from "@/components/CoachSlideshow";
import { CoachMarkdown } from "@/components/CoachMarkdown";
import { AdminQuestionEditModal } from "@/components/AdminQuestionEditModal";
import { AdminAiPasteModal } from "@/components/AdminAiPasteModal";
import { FormatToolbar } from "@/components/FormatToolbar";
import { TextWatermarkOverlay } from "@/components/TextWatermarkOverlay";

interface Choice {
  id: string;
  text: string;
  imageData?: string | null;
}
interface Question {
  id: string;
  domain: string;
  skill: string;
  difficulty: string;
  passageText?: string | null;
  imageData?: string | null;
  questionText: string;
  choices: Choice[];
  questionType: "multiple_choice" | "spr";
}
interface GradedQuestion {
  questionId: string;
  questionText: string;
  imageData?: string | null;
  choices: Choice[];
  skill: string;
  difficulty: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  rationale: string;
  explanation: string;
}

type CoachMode = "strategy" | "explain";

const SELECTION_COLORS = [
  { id: "yellow", hex: "#facc15" },
  { id: "blue", hex: "#3b82f6" },
  { id: "red", hex: "#ef4444" },
  { id: "green", hex: "#22c55e" },
] as const;

/** Strips "Text:" / "Text 1:" / "Text 2:" labels from a passage before it's
 * shown on the left — internal scaffolding from the question bank, not
 * something a student needs to read. Strips every occurrence, not just a
 * leading one, since Cross-Text Connections passages have a second label
 * partway through. */
function stripTextLabel(text: string): string {
  return text.replace(/\bText(?:\s*\d+)?\s*:\s*/gi, "").trim();
}

/**
 * Some Reading & Writing question banks don't have a distinct passageText
 * field — the stimulus sentence and the actual "Which choice...?" prompt
 * are both baked into one questionText string. This splits them apart so
 * the passage/stimulus can go on the left and only the actual question
 * sentence shows on the right, instead of duplicating the whole block.
 * Works regardless of whether the prompt sentence comes first or last.
 */
function splitPromptFromPassage(text: string): { passage: string; prompt: string } {
  const qIdx = text.lastIndexOf("?");
  if (qIdx !== -1) {
    let start = 0;
    for (let i = qIdx - 1; i >= 0; i--) {
      if (text[i] === "." || text[i] === "\n") {
        start = i + 1;
        break;
      }
    }
    const prompt = text.slice(start, qIdx + 1).trim();
    const passage = (text.slice(0, start) + text.slice(qIdx + 1)).replace(/\n+/g, " ").trim();
    if (prompt && passage) return { passage, prompt };
  }
  // Fallback for prompts with no "?" (e.g. "...most nearly means") — take
  // the last sentence as the prompt.
  const sentences = text.split(/(?<=[.?])\s+(?=[A-Z])/);
  if (sentences.length > 1) {
    const prompt = sentences[sentences.length - 1].trim();
    const passage = sentences.slice(0, -1).join(" ").replace(/\n+/g, " ").trim();
    return { passage, prompt };
  }
  return { passage: "", prompt: text.trim() };
}

/** Pulls the first curly- or straight-quoted phrase out of a question
 * prompt (e.g. “As used in the text, what does the phrase “reaching across
 * to” most nearly mean?”) so it can be underlined where it appears in the
 * passage — matching real Bluebook's convention for vocab-in-context and
 * reference questions. Returns null if the prompt has no quoted phrase. */
function extractQuotedPhrase(text: string): string | undefined {
  const match = text.match(/[“"]([^”"]{2,80})[”"]/);
  return match ? match[1] : undefined;
}

/** Renders passage text as real paragraphs (split on blank lines), indenting
 * any paragraph that opens with a quotation mark — matching how Bluebook
 * sets off quoted dialogue within a literary excerpt. Falls back to a
 * single block for one-paragraph passages (the common case: a single
 * grammar sentence).
 *
 * Also respects the SIZE of the gap you type: one blank line between two
 * paragraphs gives the normal paragraph gap, but typing an extra blank
 * line (two blank lines / 3+ newlines in a row) adds visibly more space —
 * previously any run of newlines collapsed to the exact same gap no
 * matter how much space was actually typed, so extra spacing looked like
 * it "wasn't applying" when editing. */
function PassageText({ text, underline, className = "" }: { text: string; underline?: string; className?: string }) {
  const parts = text.split(/(\n+)/);
  const paragraphs: { text: string; gapBefore: number }[] = [];
  let pendingGap = 0;
  for (const part of parts) {
    if (/^\n+$/.test(part)) {
      pendingGap = part.length;
      continue;
    }
    if (part.trim().length === 0) continue;
    paragraphs.push({ text: part, gapBefore: pendingGap });
    pendingGap = 0;
  }
  if (paragraphs.length <= 1) {
    return <MathText text={text} underline={underline} className={className} />;
  }
  return (
    <div className={className}>
      {paragraphs.map((p, i) => {
        const isQuoted = /^[“"‘']/.test(p.text.trim());
        // 1 newline = a normal paragraph break (the default mb-3 handles
        // it); 2+ blank lines (3+ newlines) is a deliberately bigger gap.
        const extraGap = i > 0 && p.gapBefore >= 3 ? "mt-6" : "";
        return (
          <p key={i} className={`mb-3 last:mb-0 ${extraGap} ${isQuoted ? "pl-6" : ""}`}>
            <MathText text={p.text.trim()} underline={underline} />
          </p>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Highlightable — select any text inside to highlight it; click a
   highlight to remove it. Self-contained (own ref/state) so it can wrap
   multiple independent regions (left passage, right prompt+choices)
   without them stepping on each other. */
/* ---------------------------------------------------------------------- */

function Highlightable({
  children,
  className = "",
  enabled = true,
}: {
  children: React.ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const pendingRangeRef = useRef<Range | null>(null);
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);

  function closePopup() {
    setPopup(null);
    pendingRangeRef.current = null;
  }

  // Click anywhere outside the floating popup while it's open closes it
  // without applying anything — same behavior as Google Docs/Notion's
  // selection toolbar.
  useEffect(() => {
    if (!popup) return;
    function onDocMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        closePopup();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup]);

  // Releasing the mouse on a real (non-collapsed) selection opens the
  // floating color/underline popup right above it — nothing is applied
  // yet, matching a real annotation tool: select, then choose what to do
  // with the selection, rather than auto-committing to one fixed color.
  function onMouseUp() {
    if (!enabled) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) return;

    // Bail if the selection touches any interactive element (answer choice
    // buttons, inputs, etc). extractContents()+insertNode() later physically
    // moves DOM nodes out from under React — if one of those nodes is a
    // React-managed button, React's fiber tree goes out of sync with the
    // real DOM and the whole choices list renders garbled on the next
    // re-render. Highlighting only ever applies to plain passage/prompt
    // text, matching real Bluebook.
    const interactiveSelector = "button, input, [role='button']";
    const container =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    if (container?.closest(interactiveSelector) || container?.querySelector(interactiveSelector)) {
      sel.removeAllRanges();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    pendingRangeRef.current = range.cloneRange();
    setPopup({ x: rect.left + rect.width / 2, y: rect.top });
  }

  function applyColor(hex: string) {
    const range = pendingRangeRef.current;
    if (!range) return;
    try {
      const mark = document.createElement("mark");
      mark.style.backgroundColor = hex;
      mark.className = "rounded-sm cursor-pointer";
      mark.title = "Click to remove highlight";
      // extractContents + insertNode (not surroundContents) because a
      // selection routinely spans multiple sibling nodes here — MathText
      // splits text into separate fragments per line/math span, and
      // surroundContents throws on any selection that isn't fully inside
      // one single node.
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
    } catch {
      // selection was somehow invalid — skip rather than corrupt the DOM
    }
    window.getSelection()?.removeAllRanges();
    closePopup();
  }

  function applyUnderline() {
    const range = pendingRangeRef.current;
    if (!range) return;
    try {
      const u = document.createElement("u");
      u.className = "cursor-pointer decoration-2";
      u.title = "Click to remove underline";
      const contents = range.extractContents();
      u.appendChild(contents);
      range.insertNode(u);
    } catch {
      // selection was somehow invalid — skip rather than corrupt the DOM
    }
    window.getSelection()?.removeAllRanges();
    closePopup();
  }

  // Clicking an existing highlight or underline removes it (unwraps the
  // mark/u element back to plain text).
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const wrapper = target.closest("mark, u");
    if (wrapper && wrapper.parentNode) {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
      parent.removeChild(wrapper);
      parent.normalize?.();
    }
  }

  return (
    <div ref={ref} onMouseUp={onMouseUp} onClick={onClick} className={`relative select-text ${className}`}>
      {children}
      {popup && (
        <div
          ref={popupRef}
          onMouseUp={(e) => e.stopPropagation()}
          className="fixed z-50 flex items-center gap-1.5 bg-white border border-brand-border rounded-full px-2 py-1.5 shadow-card-hover"
          style={{ left: popup.x, top: popup.y - 46, transform: "translateX(-50%)" }}
        >
          {SELECTION_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => applyColor(c.hex)}
              style={{ backgroundColor: c.hex }}
              title={`Highlight (${c.id})`}
              className="w-6 h-6 rounded-full hover:scale-110 transition-transform"
            />
          ))}
          <span className="w-px h-4 bg-brand-border mx-0.5" />
          <button
            onClick={applyUnderline}
            title="Underline"
            className="w-7 h-7 rounded-full border border-brand-border flex items-center justify-center text-xs font-bold underline text-brand-navy hover:bg-slate-50"
          >
            U
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Icons                                                                   */
/* ---------------------------------------------------------------------- */

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FlagIcon({ filled }: { filled: boolean }) {
  // Bookmark-ribbon shape (rectangle with a V notch cut into the bottom) —
  // matches the real Bluebook "Mark for Review" icon, not a flag-on-a-pole.
  return (
    <svg width="13" height="15" viewBox="0 0 24 28" fill="none" aria-hidden="true">
      <path
        d="M5 3h14a1 1 0 011 1v20l-8-5.5L4 24V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}
function KebabIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CalculatorIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7.5" y="5.5" width="9" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.2" cy="13" r="0.9" fill="currentColor" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" />
      <circle cx="15.8" cy="13" r="0.9" fill="currentColor" />
      <circle cx="8.2" cy="16.5" r="0.9" fill="currentColor" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" />
      <circle cx="15.8" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
function ReferenceIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function HighlightIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 14.5L14 7l3 3-7.5 7.5H6.5v-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M12.5 8.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 1118.5 10c0 5.3-6.5 11-6.5 11z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function SquareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function EliminatorIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
        ABC
      </text>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StopwatchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 13l3-3M9 2h6M12 2v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function FlagRedIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 3v18M5 4h11l-2.5 3.5L16 11H5"
        stroke="#ef4444"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#ef4444"
      />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </svg>
  );
}
function CheckSmallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function WarningIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}
function EditPencilIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l11-11-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Answer choice row — letter badge on left, eliminator target on right    */
/* ---------------------------------------------------------------------- */

function AnnotateIcon({ size = 20 }: { size?: number }) {
  // An actual highlighter marker (angled barrel + broad chisel tip + a
  // color swatch on the tip), not a pencil — matches what a "highlight
  // text" tool should look like.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.5 3.5l6 6-7.8 7.8-6.9 1.1 1.1-6.9 7.6-8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M13 6l5 5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.6 12.9l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 21h7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function MoonIcon({ size = 20 }: { size?: number }) {
  // Half-moon / dark-mode toggle icon.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.2A8.5 8.5 0 119.8 3.5a7 7 0 0010.7 10.7z"
        fill="currentColor"
      />
    </svg>
  );
}
function FullscreenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ExitFullscreenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9h4a1 1 0 001-1V4M20 9h-4a1 1 0 01-1-1V4M4 15h4a1 1 0 011 1v4M20 15h-4a1 1 0 00-1 1v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
}
function ExpandCornerIcon() {
  // Two arrowheads pointing diagonally away from each other (↖ + ↘), the
  // universal "expand this panel" glyph — not a corner-bracket/resize icon.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4L13 11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 20H4v-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20l7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function CompressCornerIcon() {
  // Same two arrowheads, pointing inward instead of outward.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4v5H4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9l7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 20v-5h5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15l-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function FilledCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function OutlineCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ChoiceRow({
  letter,
  text,
  imageData,
  selected,
  crossedOut,
  eliminatorMode,
  onSelect,
  onToggleCrossOut,
}: {
  letter: string;
  text: string;
  imageData?: string | null;
  selected: boolean;
  crossedOut: boolean;
  eliminatorMode: boolean;
  onSelect: () => void;
  onToggleCrossOut: () => void;
}) {
  const hasText = text.trim().length > 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="button"
        tabIndex={crossedOut ? -1 : 0}
        onClick={() => !crossedOut && onSelect()}
        onKeyDown={(e) => {
          if (!crossedOut && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-disabled={crossedOut}
        className={`relative flex-1 flex items-center gap-3.5 text-left px-5 py-4 rounded-lg border transition-colors cursor-pointer overflow-hidden ${
          selected
            ? "border-brand-blue bg-brand-blue-light"
            : crossedOut
              ? "border-brand-border bg-slate-100"
              : "border-brand-border hover:border-amber-400 hover:bg-amber-50"
        } ${crossedOut ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-sm font-bold ${
            selected
              ? "bg-brand-blue border-brand-blue text-white"
              : crossedOut
                ? "border-brand-slate/50 text-brand-slate bg-white"
                : "border-brand-navy text-brand-navy bg-white"
          }`}
        >
          {letter}
        </span>
        {/* An image-only choice (no text entered alongside it) renders just
            the image — no empty text line taking up space beside it. A
            choice with both shows the image above the text. */}
        <span className={`flex-1 min-w-0 ${crossedOut ? "text-brand-slate" : "text-brand-navy"}`}>
          {imageData && (
            <img
              src={imageData}
              alt={`Choice ${letter}`}
              className={`max-w-full h-auto rounded-md border border-brand-border/60 ${hasText ? "mb-2 max-h-40" : "max-h-48"}`}
            />
          )}
          {hasText && (
            <span className="text-base font-normal leading-snug">
              <MathText text={text} mathOnly />
            </span>
          )}
        </span>
        {/* Full-width strike line across the whole choice box — matches the
            real Bluebook eliminator look, not just a line through the text. */}
        {crossedOut && (
          <span className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-px bg-brand-slate/70 pointer-events-none" />
        )}
      </div>
      {/* Eliminator target — only present while Eliminator mode (the header
          ABC toggle) is turned on, matching the real Bluebook UI exactly:
          no circles at all when it's off, a lettered circle next to every
          choice once it's on. */}
      {eliminatorMode &&
        (crossedOut ? (
          <button
            type="button"
            onClick={onToggleCrossOut}
            title="Restore choice"
            className="shrink-0 text-xs font-semibold text-brand-blue border border-brand-blue rounded-full px-3 py-1.5 hover:bg-brand-blue-light whitespace-nowrap"
          >
            Undo
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCrossOut}
            title="Cross out choice"
            className="shrink-0 w-7 h-7 rounded-full border border-brand-border text-brand-slate hover:bg-slate-50 flex items-center justify-center text-[11px] font-semibold"
          >
            {letter}
          </button>
        ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

const REFERENCE_SHAPES: { label: string; formulas: string[]; svg: React.ReactNode }[] = [
  {
    label: "Circle",
    formulas: ["A = πr²", "C = 2πr"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <circle cx="50" cy="45" r="32" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="50" cy="45" r="1.8" fill="currentColor" />
        <line x1="50" y1="45" x2="82" y2="45" stroke="currentColor" strokeWidth="1.3" />
        <text x="64" y="41" fontSize="9" fill="currentColor" fontStyle="italic">r</text>
      </svg>
    ),
  },
  {
    label: "Rectangle",
    formulas: ["A = ℓw"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <rect x="18" y="25" width="64" height="38" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="46" y="20" fontSize="9" fill="currentColor" fontStyle="italic">ℓ</text>
        <text x="86" y="48" fontSize="9" fill="currentColor" fontStyle="italic">w</text>
      </svg>
    ),
  },
  {
    label: "Triangle",
    formulas: ["A = ½ bh"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <polygon points="20,65 80,65 55,20" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="55" y1="20" x2="55" y2="65" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
        <rect x="52" y="60" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="58" y="45" fontSize="9" fill="currentColor" fontStyle="italic">h</text>
        <text x="46" y="78" fontSize="9" fill="currentColor" fontStyle="italic">b</text>
      </svg>
    ),
  },
  {
    label: "Right triangle",
    formulas: ["c² = a² + b²"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <polygon points="20,65 80,65 20,20" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="20" y="58" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="12" y="46" fontSize="9" fill="currentColor" fontStyle="italic">a</text>
        <text x="46" y="78" fontSize="9" fill="currentColor" fontStyle="italic">b</text>
        <text x="52" y="40" fontSize="9" fill="currentColor" fontStyle="italic">c</text>
      </svg>
    ),
  },
  {
    label: "Special right triangles",
    formulas: ["30-60-90 → x, x√3, 2x", "45-45-90 → s, s, s√2"],
    svg: (
      <svg viewBox="0 0 200 90" className="w-full h-20">
        <polygon points="15,65 95,65 15,15" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="15" y="58" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="50" y="78" fontSize="8" fill="currentColor">x√3</text>
        <text x="6" y="42" fontSize="8" fill="currentColor">x</text>
        <text x="55" y="36" fontSize="8" fill="currentColor">2x</text>
        <text x="22" y="62" fontSize="7" fill="currentColor">60°</text>
        <text x="18" y="24" fontSize="7" fill="currentColor">30°</text>

        <polygon points="120,65 180,65 180,15" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="172" y="58" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="145" y="78" fontSize="8" fill="currentColor">s</text>
        <text x="186" y="42" fontSize="8" fill="currentColor">s</text>
        <text x="140" y="38" fontSize="8" fill="currentColor">s√2</text>
        <text x="130" y="62" fontSize="7" fill="currentColor">45°</text>
        <text x="166" y="24" fontSize="7" fill="currentColor">45°</text>
      </svg>
    ),
  },
  {
    label: "Rectangular box",
    formulas: ["V = ℓwh"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <polygon points="18,55 18,25 55,25 55,55" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <polygon points="18,25 30,15 67,15 55,25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <polygon points="55,25 67,15 67,45 55,55" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="5" y="42" fontSize="8" fill="currentColor" fontStyle="italic">h</text>
        <text x="32" y="66" fontSize="8" fill="currentColor" fontStyle="italic">ℓ</text>
        <text x="70" y="32" fontSize="8" fill="currentColor" fontStyle="italic">w</text>
      </svg>
    ),
  },
  {
    label: "Cylinder",
    formulas: ["V = πr²h"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <ellipse cx="50" cy="22" rx="25" ry="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="25" y1="22" x2="25" y2="62" stroke="currentColor" strokeWidth="1.6" />
        <line x1="75" y1="22" x2="75" y2="62" stroke="currentColor" strokeWidth="1.6" />
        <path d="M25,62 A25,8 0 0 0 75,62" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M25,62 A25,8 0 0 1 75,62" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2,2" />
        <text x="78" y="45" fontSize="8" fill="currentColor" fontStyle="italic">h</text>
        <text x="50" y="20" fontSize="7" fill="currentColor" fontStyle="italic">r</text>
      </svg>
    ),
  },
  {
    label: "Sphere",
    formulas: ["V = ⁴⁄₃πr³"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <circle cx="50" cy="45" r="28" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="50" cy="45" rx="28" ry="9" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
        <line x1="50" y1="45" x2="78" y2="45" stroke="currentColor" strokeWidth="1.3" />
        <text x="62" y="41" fontSize="8" fill="currentColor" fontStyle="italic">r</text>
      </svg>
    ),
  },
  {
    label: "Cone",
    formulas: ["V = ⅓πr²h"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <ellipse cx="50" cy="62" rx="25" ry="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="25" y1="62" x2="50" y2="14" stroke="currentColor" strokeWidth="1.6" />
        <line x1="75" y1="62" x2="50" y2="14" stroke="currentColor" strokeWidth="1.6" />
        <line x1="50" y1="14" x2="50" y2="62" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
        <text x="53" y="40" fontSize="8" fill="currentColor" fontStyle="italic">h</text>
        <text x="33" y="66" fontSize="7" fill="currentColor" fontStyle="italic">r</text>
      </svg>
    ),
  },
  {
    label: "Pyramid",
    formulas: ["V = ⅓ℓwh"],
    svg: (
      <svg viewBox="0 0 100 90" className="w-full h-20">
        <polygon points="18,60 55,68 82,55 45,48" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="45" y1="48" x2="50" y2="12" stroke="currentColor" strokeWidth="1.6" />
        <line x1="18" y1="60" x2="50" y2="12" stroke="currentColor" strokeWidth="1.6" />
        <line x1="82" y1="55" x2="50" y2="12" stroke="currentColor" strokeWidth="1.6" />
        <line x1="55" y1="68" x2="50" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
        <text x="52" y="32" fontSize="8" fill="currentColor" fontStyle="italic">h</text>
      </svg>
    ),
  },
];

const REFERENCE_FACTS_TEXT = [
  "The number of degrees of arc in a circle is 360.",
  "The number of radians of arc in a circle is 2π.",
  "The sum of the measures in degrees of the angles of a triangle is 180.",
];

export default function GuestPracticePage({
  params,
}: {
  params: { mockId: string; section: string; module: string };
}) {
  const { mockId, section: sectionParam, module: moduleParam } = params;
  const section = decodeURIComponent(sectionParam);
  // Question Bank practice sets reuse this exact exam screen at
  // /practice/qbank/<section>/<setId>: the third segment is the set id
  // instead of a module number, questions load from the set endpoint, and
  // grading records per-question bank history instead of a module result.
  const isBank = mockId === "qbank";
  const setId = isBank ? moduleParam : null;
  const module = (isBank ? 1 : Number(moduleParam)) as 1 | 2;
  const moduleSuffix = isBank ? "" : ` — Module ${module}`;
  const moduleDot = isBank ? "" : ` · Module ${module}`;
  const examPath = `/practice/${mockId}/${encodeURIComponent(section)}/${isBank ? setId : module}`;
  const loadUrl = isBank
    ? `/api/qbank/sets/${setId}`
    : `/api/public/module?mockId=${mockId}&section=${encodeURIComponent(section)}&module=${module}`;
  const gradeUrl = isBank ? `/api/qbank/sets/${setId}/grade` : "/api/public/module/grade";
  const isMath = section === "Math";
  const sectionNumber = section === "Reading and Writing" ? 1 : 2;

  // Full realistic Mocks (the default — what "Start Practice" on a mock
  // card launches) hide the difficulty tag and per-question stopwatch to
  // match the real Bluebook UI. Only an explicit ?mode=practice link (a
  // lighter drilling flow) shows them as a study aid. Read directly from
  // window.location instead of useSearchParams so this fully-client page
  // doesn't need a Suspense boundary.
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [reviewMode, setReviewMode] = useState<boolean | null>(null); // null = not yet read from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsPracticeMode(params.get("mode") === "practice");
    setReviewMode(params.get("review") === "1");
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moduleEmpty, setModuleEmpty] = useState(false);
  const [mockTitle, setMockTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Full length of this module/set — the "5 minutes left" warning only makes
  // sense when the sitting is longer than that (a 1-question bank set is 2 min).
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ total: number; correctCount: number; accuracyPct: number; results: GradedQuestion[] } | null>(
    null
  );

  // Congrats brain button — always visible on the results screen so you can
  // fire the blue-brain confetti burst any time you tap it. When the score
  // clears the bar (more than 20 correct in Math, more than 25 in Reading &
  // Writing) the burst also fires automatically the moment results load.
  const [celebrateTrigger, setCelebrateTrigger] = useState(0);
  const autoCelebratedRef = useRef(false);
  function celebrate() {
    setCelebrateTrigger((t) => t + 1);
  }

  // Signed-in state — gates the AI Coach, supplies the name in the bottom bar
  const [signedIn, setSignedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setSignedIn(!!data.user);
        setUserName(data.user?.name ?? null);
        setIsAdminUser(!!data.user?.isAdmin);
      })
      .catch(() => setSignedIn(false));
  }, []);

  // AI coach — slide-in drawer, header-triggered, locked for guests
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachText, setCoachText] = useState<string | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode | null>(null);

  // Chrome
  const [timerHidden, setTimerHidden] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [moduleReviewOpen, setModuleReviewOpen] = useState(false);
  // Real-time answer key preview inside Module Review — grades in the
  // background against the live answers the moment this screen opens, so
  // the grid can show correct/incorrect immediately rather than waiting
  // for the final "Submit Module". This is a preview only: it never writes
  // anywhere and doesn't end the test — answers can still be changed after
  // seeing it, same as everything else on this screen.
  const [previewGrading, setPreviewGrading] = useState<Record<string, GradedQuestion> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [crossedOut, setCrossedOut] = useState<Record<string, string[]>>({});
  const [eliminatorMode, setEliminatorMode] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  // R&W "Highlight" toggle — off by default; text only auto-highlights on
  // selection while this is turned on, matching a real highlighter tool
  // rather than always-on selection highlighting.
  const [highlightMode, setHighlightMode] = useState(false);

  // Appearance popover — line-height / font-size steps applied to both
  // panes via a CSS var, plus fullscreen (real Fullscreen API) and a
  // focused-pane mode that expands just the passage or just the question
  // to full width (the little corner expand icons in each pane).
  //
  // Dark mode reads the SAME persisted preference as the rest of the app
  // (bluemind-app-theme, owned by AppShell/Sidebar) so it stays in sync
  // everywhere — including this page's own results/review screen below,
  // which previously had no dark-mode support at all. Defaults to light
  // ("sun mode") on a first-ever visit, same as the dashboard.
  const [darkMode, setDarkModeState] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("bluemind-app-theme");
    setDarkModeState(stored === "1");
  }, []);
  function setDarkMode(next: boolean) {
    setDarkModeState(next);
    try {
      window.localStorage.setItem("bluemind-app-theme", next ? "1" : "0");
    } catch {
      // best-effort persistence — the toggle still works for this session either way
    }
  }
  const [fontStep] = useState(0); // -1, 0, 1, 2 — kept fixed at default now that the size picker is gone
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusedPane, setFocusedPane] = useState<"left" | "right" | null>(null);
  const examRootRef = useRef<HTMLDivElement>(null);
  // Bumped up from the original [14,15,17,19] scale — the passage/question
  // text read noticeably smaller and more cramped than the reference exam
  // UI this is modeled on, which uses a visibly larger, roomier type size
  // throughout.
  const fontSizePx = [14, 16, 18, 20][fontStep + 1] ?? 16;

  // Draggable split between the two panes — the corner expand/collapse
  // buttons still snap to preset 80/20 splits, but dragging the divider
  // itself sets any width in between. Percent of the row's width the left
  // pane takes; the right pane is simply 100 minus this.
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState(45);
  const [isDraggingPane, setIsDraggingPane] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ dragging: boolean; left: number; width: number }>({ dragging: false, left: 0, width: 0 });
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  function startPaneDrag(e: React.MouseEvent) {
    if (!splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    dragStateRef.current = { dragging: true, left: rect.left, width: rect.width };
    setFocusedPane(null); // dragging manually overrides any expand/collapse preset
    setIsDraggingPane(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragStateRef.current.dragging) return;
      const { left, width } = dragStateRef.current;
      if (width <= 0) return;
      const pct = Math.min(75, Math.max(20, ((e.clientX - left) / width) * 100));
      setLeftPaneWidthPct(pct);
    }
    function onUp() {
      if (!dragStateRef.current.dragging) return;
      dragStateRef.current.dragging = false;
      setIsDraggingPane(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Pause is unlimited, but shows how long you've been paused (matching
  // the reference UI's "Pause 2:00" label) — counts up while paused,
  // resets the instant you resume.
  const [pausedSeconds, setPausedSeconds] = useState(0);
  useEffect(() => {
    if (!timerPaused) {
      setPausedSeconds(0);
      return;
    }
    const t = setInterval(() => setPausedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerPaused]);
  const pausedTimeStr = `${Math.floor(pausedSeconds / 60)}:${String(pausedSeconds % 60).padStart(2, "0")}`;

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      examRootRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Report-a-problem popover — anyone (guest or signed in) can flag a
  // question as wrong/broken/unclear; goes to the admin Reports tab. Shared
  // between the exam-taking view (kebab menu) and the results view (per
  // question card) via reportQuestionId, which tracks which question the
  // open modal is currently reporting.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportQuestionId, setReportQuestionId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"wrong_answer" | "typo" | "unclear" | "broken" | "other">("wrong_answer");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  // "Leave this test?" confirmation — shown from the kebab menu instead of
  // navigating straight away. Progress is saved to localStorage (works for
  // guests and signed-in users alike, no backend attempt-record needed for
  // this quick-practice flow) keyed to this exact mock/section/module, and
  // restored automatically if the student comes back to the same module
  // before finishing or explicitly deleting it.
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [restoredProgress, setRestoredProgress] = useState(false);
  const progressKey = `bluemind_progress_${mockId}_${section}_${isBank ? setId : module}`;

  // One-time "5 minutes left" warning — fires once when the countdown
  // crosses the 5-minute mark, not on every render/re-check, and never
  // fires again once dismissed or once it's already fired this session.
  const [showFiveMinWarning, setShowFiveMinWarning] = useState(false);
  const firedFiveMinWarningRef = useRef(false);
  useEffect(() => {
    if (firedFiveMinWarningRef.current) return;
    if (loading || results || secondsLeft <= 0 || secondsLeft > 300 || totalSeconds <= 300) return;
    firedFiveMinWarningRef.current = true;
    setShowFiveMinWarning(true);
  }, [secondsLeft, loading, results, totalSeconds]);

  function saveProgressToStorage() {
    try {
      window.localStorage.setItem(
        progressKey,
        JSON.stringify({ answers, marked, crossedOut, secondsLeft, index, savedAt: Date.now() })
      );
    } catch {
      // localStorage can throw in private browsing / storage-full edge
      // cases — saving progress is best-effort, never blocks leaving.
    }
  }

  function handleKeepTesting() {
    setLeaveModalOpen(false);
  }

  function handleSaveAndExit() {
    saveProgressToStorage();
    window.location.href = isBank ? "/practice/browse" : signedIn ? "/mocks" : "/";
  }

  function handleLeaveAndDelete() {
    try {
      window.localStorage.removeItem(progressKey);
    } catch {
      // nothing to clean up if storage isn't available
    }
    window.location.href = isBank ? "/practice/browse" : signedIn ? "/mocks" : "/";
  }

  function openReport(questionId: string) {
    setReportQuestionId(questionId);
    setReportOpen(true);
  }

  // ---- Admin: edit this exact question in place, live in the exam view ----
  // Saves straight through to the shared question bank via the same
  // PATCH endpoint the /admin panel's edit form uses, so the change is
  // immediate and permanent for every student — not a local-only preview.
  // Also doubles as "create" mode (adminCreateMode) so an admin landing on
  // a brand-new, empty module from Mocks → Manage Questions can add the
  // first question directly inside the real exam UI, instead of a
  // separate disconnected form.
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [adminCreateMode, setAdminCreateMode] = useState(false);
  const [insertAfterQuestionId, setInsertAfterQuestionId] = useState<string | null | undefined>(undefined); // undefined = not inserting, null = insert at very front, string = insert after that question
  const [aiPasteOpen, setAiPasteOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editHasPassage, setEditHasPassage] = useState(false);
  const [editPassageText, setEditPassageText] = useState("");
  const [editImageData, setEditImageData] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editChoices, setEditChoices] = useState<Choice[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<"multiple_choice" | "spr">("multiple_choice");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editPassageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editQuestionTextareaRef = useRef<HTMLTextAreaElement>(null);

  function blankEditFields() {
    setEditPassageText("");
    setEditImageData(null);
    setEditQuestionText("");
    setEditChoices([
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ]);
    setEditCorrectAnswer("");
    setEditExplanation("");
    setEditQuestionType("multiple_choice");
  }

  function openAdminCreate() {
    setAdminCreateMode(true);
    setEditingQuestionId(null);
    setInsertAfterQuestionId(undefined);
    setEditError(null);
    blankEditFields();
    setAdminEditOpen(true);
  }

  // Opens the same create modal, but saving will INSERT the new question
  // at this exact position (shifting every later question's number by
  // one) instead of appending to the end — the fix for "AI skipped a
  // question and everything after it is off by one now". Pass null to
  // insert as the very first question in the module.
  function openAdminInsert(afterQuestionId: string | null) {
    setAdminCreateMode(true);
    setEditingQuestionId(null);
    setInsertAfterQuestionId(afterQuestionId);
    setEditError(null);
    blankEditFields();
    setAdminEditOpen(true);
  }

  // Switches the modal between multiple-choice and grid-in (SPR) modes.
  // The choices-vs-numeric-input UI below reads editQuestionType (not the
  // original current.questionType), so this actually takes effect —
  // previously there was no way to change a question's type at all here,
  // and even clearing every choice left it silently still tagged
  // multiple_choice with an empty array instead of becoming a real grid-in
  // question.
  function toggleEditQuestionType(next: "multiple_choice" | "spr") {
    setEditQuestionType(next);
    if (next === "multiple_choice" && editChoices.length === 0) {
      setEditChoices([
        { id: "A", text: "" },
        { id: "B", text: "" },
        { id: "C", text: "" },
        { id: "D", text: "" },
      ]);
    }
  }

  // Takes an explicit questionId rather than relying on "current" (the
  // in-progress exam question) so this same editor works from the results
  // page too — fixing a wrong correct-answer key after seeing which
  // students got a question wrong, not just while still taking the test.
  async function openAdminEdit(questionId: string) {
    setAdminCreateMode(false);
    setEditingQuestionId(questionId);
    setAdminEditOpen(true);
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/questions/${questionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load this question");
      setEditHasPassage(data.passageText !== null && data.passageText !== undefined);
      setEditPassageText(data.passageText ?? "");
      setEditImageData(data.imageData ?? null);
      setEditQuestionText(data.questionText);
      setEditChoices(data.choices);
      setEditCorrectAnswer(data.correctAnswer);
      setEditExplanation(data.explanation);
      setEditQuestionType(data.questionType);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't load this question");
    } finally {
      setEditLoading(false);
    }
  }

  // Downscale + compress a pasted/uploaded passage image before saving —
  // same reasoning as the Coach photo flow: a chart/graph screenshot only
  // ever needs to be legible at the size it renders on screen, not at
  // full camera/screenshot resolution, and a smaller payload means a
  // faster save and a faster page load for every student after.
  function processPassageImageFile(file: File) {
    const MAX_EDGE = 1200;
    const TARGET_BYTES = 400_000;
    const MIN_QUALITY = 0.5;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setEditImageData(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.85;
        let out = canvas.toDataURL("image/jpeg", quality);
        let bytes = Math.round((out.length * 3) / 4);
        while (bytes > TARGET_BYTES && quality > MIN_QUALITY) {
          quality = Math.max(MIN_QUALITY, quality - 0.1);
          out = canvas.toDataURL("image/jpeg", quality);
          bytes = Math.round((out.length * 3) / 4);
        }
        setEditImageData(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handlePassageImagePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      e.preventDefault();
      processPassageImageFile(file);
    }
  }

  function handlePassageImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processPassageImageFile(file);
  }

  // Same downscale/compress approach as the passage image, but a smaller
  // target size — an answer-choice figure (a small graph, a diagram) is
  // displayed much smaller than a full passage image, so there's no reason
  // to keep it as large.
  function processChoiceImageFile(choiceIndex: number, file: File) {
    const MAX_EDGE = 700;
    const TARGET_BYTES = 180_000;
    const MIN_QUALITY = 0.5;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setEditChoices((prev) => prev.map((c, i) => (i === choiceIndex ? { ...c, imageData: dataUrl } : c)));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.85;
        let out = canvas.toDataURL("image/jpeg", quality);
        let bytes = Math.round((out.length * 3) / 4);
        while (bytes > TARGET_BYTES && quality > MIN_QUALITY) {
          quality = Math.max(MIN_QUALITY, quality - 0.1);
          out = canvas.toDataURL("image/jpeg", quality);
          bytes = Math.round((out.length * 3) / 4);
        }
        setEditChoices((prev) => prev.map((c, i) => (i === choiceIndex ? { ...c, imageData: out } : c)));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleChoiceImageUpload(choiceIndex: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processChoiceImageFile(choiceIndex, file);
  }

  // Refetches this module's live question list from the public endpoint —
  // used after creating a question (including the very first one, which
  // transitions the page out of the "no questions yet" admin empty state)
  // so the newly saved content shows immediately without a full page reload.
  async function refetchModule(jumpTo?: number | "last") {
    const res = await fetch(loadUrl);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to refresh questions");
    setMockTitle(data.mockTitle);
    setQuestions(data.questions);
    setLoadError(null);
    if (secondsLeft === 0 && data.minutes) setSecondsLeft(data.minutes * 60);
    if (jumpTo === "last") setIndex(Math.max(0, data.questions.length - 1));
    else if (typeof jumpTo === "number") setIndex(Math.min(Math.max(0, jumpTo), Math.max(0, data.questions.length - 1)));
  }

  async function saveAdminEdit() {
    setSavingEdit(true);
    setEditError(null);
    try {
      if (adminCreateMode) {
        if (!editQuestionText.trim()) throw new Error("Question text is required");
        // Auto-classify domain/skill/difficulty — same convenience the Mocks
        // page's paste-and-structure flow already has, so admins adding a
        // one-off question here don't need to know the taxonomy either.
        let domain = "Uncategorized";
        let skill = "Uncategorized";
        let difficulty: "Easy" | "Medium" | "Hard" = "Medium";
        try {
          const cRes = await fetch("/api/admin/questions/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              section,
              questionText: editQuestionText.trim(),
              passageText: editPassageText.trim() || undefined,
            }),
          });
          if (cRes.ok) {
            const c = await cRes.json();
            domain = c.domain;
            skill = c.skill;
            difficulty = c.difficulty;
          }
        } catch {
          // keep the Uncategorized/Medium fallback — never block saving on this
        }

        const res = await fetch("/api/admin/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mockId,
            section,
            module,
            domain,
            skill,
            difficulty,
            passageText: editPassageText.trim() || null,
            imageData: editImageData,
            questionText: editQuestionText.trim(),
            choices: editQuestionType === "spr" ? [] : editChoices,
            correctAnswer: editCorrectAnswer || (editQuestionType === "spr" ? editCorrectAnswer : editChoices[0]?.id ?? "A"),
            questionType: editQuestionType,
            rationale: "—",
            explanation: editExplanation.trim() || "—",
            ...(insertAfterQuestionId !== undefined ? { insertAfterId: insertAfterQuestionId } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save");
        const insertIdx =
          insertAfterQuestionId === undefined
            ? "last"
            : insertAfterQuestionId === null
              ? 0
              : questions.findIndex((q) => q.id === insertAfterQuestionId) + 1;
        setInsertAfterQuestionId(undefined);
        await refetchModule(insertIdx);
        setAdminEditOpen(false);
        return;
      }

      if (!editingQuestionId) return;
      const body: Record<string, unknown> = {
        questionText: editQuestionText,
        explanation: editExplanation,
        passageText: editPassageText.trim() || null,
        imageData: editImageData,
        questionType: editQuestionType,
        choices: editQuestionType === "spr" ? [] : editChoices,
      };
      body.correctAnswer = editCorrectAnswer;
      const res = await fetch(`/api/admin/questions/${editingQuestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestionId
            ? {
                ...q,
                questionText: editQuestionText,
                questionType: editQuestionType,
                choices: editQuestionType !== "spr" ? editChoices : [],
                passageText: editPassageText.trim() || null,
                imageData: editImageData,
              }
            : q
        )
      );
      // Also refresh the results screen if we're editing from there —
      // re-derives isCorrect against the (possibly just-changed) correct
      // answer, and the score tally above updates to match.
      setResults((prev) => {
        if (!prev) return prev;
        let correctCount = 0;
        const updated = prev.results.map((r) => {
          const next: GradedQuestion =
            r.questionId === editingQuestionId
              ? {
                  ...r,
                  questionText: editQuestionText,
                  choices: editQuestionType !== "spr" ? editChoices : r.choices,
                  correctAnswer: editCorrectAnswer,
                  explanation: editExplanation,
                  isCorrect: r.selectedAnswer !== null && r.selectedAnswer === editCorrectAnswer,
                }
              : r;
          if (next.isCorrect) correctCount += 1;
          return next;
        });
        return { ...prev, results: updated, correctCount };
      });
      setAdminEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitReport() {
    if (!reportQuestionId) return;
    setReportSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: reportQuestionId, reason: reportReason, details: reportDetails.trim() || undefined }),
      });
      if (res.ok) {
        setReportSent(true);
        setTimeout(() => {
          setReportOpen(false);
          setReportSent(false);
          setReportDetails("");
          setReportReason("wrong_answer");
          setReportQuestionId(null);
        }, 1200);
      }
    } finally {
      setReportSending(false);
    }
  }

  useEffect(() => {
    if (reviewMode === null) return; // wait until we've read the URL
    if (reviewMode) {
      fetch(isBank ? loadUrl : `/api/module-results/one?mockId=${mockId}&section=${encodeURIComponent(section)}&module=${module}`)
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          return res.json();
        })
        .then((data) => {
          if (isBank && !Array.isArray(data.results)) throw new Error("not completed yet");
          setMockTitle(data.mockTitle ?? "");
          setResults({ total: data.total, correctCount: data.correctCount, accuracyPct: 0, results: data.results });
          setLoading(false);
        })
        .catch(() => {
          setLoadError(isBank ? "This practice set hasn't been submitted yet — solve it once to review it here." : "No saved result found for this module yet — take it once to see it here.");
          setLoading(false);
        });
      return;
    }
    fetch(loadUrl)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // A 404 here almost always just means "zero questions banked yet"
          // (see /api/public/module/route.ts) — for an admin that's the
          // empty-state screen (paste/AI or add manually), not a hard
          // error. A real error (bad mockId, server failure, etc.) still
          // falls through to the plain error message for everyone else.
          const err = new Error(data.error ?? "failed") as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return data;
      })
      .then((data) => {
        setMockTitle(data.mockTitle);
        setQuestions(data.questions);
        setTotalSeconds((data.minutes ?? 0) * 60);

        // Restore a previously "Save & exit"-ed session for this exact
        // module, if one exists and still matches the current question set.
        let restored = false;
        try {
          const raw = window.localStorage.getItem(progressKey);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved && typeof saved === "object") {
              setAnswers(saved.answers ?? {});
              setMarked(saved.marked ?? {});
              setCrossedOut(saved.crossedOut ?? {});
              setIndex(Math.min(saved.index ?? 0, data.questions.length - 1));
              setSecondsLeft(typeof saved.secondsLeft === "number" ? saved.secondsLeft : data.minutes * 60);
              restored = true;
              setRestoredProgress(true);
            }
          }
        } catch {
          // corrupted/unreadable saved state — fall through to a fresh start
        }
        if (!restored) setSecondsLeft(data.minutes * 60);

        setLoading(false);
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status === 404 && !isBank) {
          // Zero questions banked yet — not a real error. Which screen this
          // shows (admin empty-state vs a plain "not available" message)
          // is decided at render time from the current isAdminUser state,
          // not here: isAdminUser is fetched in a separate effect and may
          // not have resolved yet by the time this catch runs, so checking
          // it in this closure was a race condition — sometimes correct,
          // sometimes not, depending on which request happened to finish
          // first.
          setQuestions([]);
          setModuleEmpty(true);
          setLoading(false);
          return;
        }
        setLoadError(isBank ? "This practice set isn't available — it may belong to another account." : "This module isn't available right now.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewMode, mockId, section, module]);

  useEffect(() => {
    if (loading || results || timerPaused || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loading, results, timerPaused, secondsLeft]);

  useEffect(() => {
    if (!loading && !results && secondsLeft === 0 && questions.length > 0) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  // Auto-fire the congrats burst the moment a qualifying score comes in —
  // more than 20 correct in Math, more than 25 in Reading & Writing.
  useEffect(() => {
    if (!results || autoCelebratedRef.current) return;
    const threshold = isMath ? 20 : 25;
    if (results.correctCount > threshold) {
      autoCelebratedRef.current = true;
      setCelebrateTrigger((t) => t + 1);
    }
  }, [results, isMath]);

  const current = questions[index];

  // Per-question stopwatch — purely client-side pacing aid, counts up from 0
  // and resets every time the student moves to a different question. Kept
  // separate from the module countdown above (which never resets and is
  // what actually ends the module) and never sent anywhere for guests, to
  // preserve the "nothing saved" guest guarantee.
  const [questionSeconds, setQuestionSeconds] = useState(0);
  useEffect(() => {
    setQuestionSeconds(0);
  }, [index]);
  useEffect(() => {
    if (loading || results || timerPaused) return;
    const t = setInterval(() => setQuestionSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading, results, timerPaused, index]);
  const questionTimeStr = useMemo(() => {
    const m = Math.floor(questionSeconds / 60);
    const s = questionSeconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
  }, [questionSeconds]);

  const derived = useMemo(() => {
    if (!current || isMath || current.passageText) return { passage: "", prompt: "" };
    return splitPromptFromPassage(current.questionText);
  }, [current, isMath]);

  // The phrase a vocab-in-context / reference question is actually asking
  // about, extracted from its prompt so it can be underlined in the
  // passage on the left — matching real Bluebook.
  const underlinePhrase = useMemo(() => {
    if (!current || isMath) return undefined;
    const promptText = current.passageText ? current.questionText : derived.prompt;
    return extractQuotedPhrase(promptText || "");
  }, [current, isMath, derived]);

  const timeStr = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  function selectAnswer(qId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [qId]: choiceId }));
  }
  function toggleMark(qId: string) {
    setMarked((prev) => ({ ...prev, [qId]: !prev[qId] }));
  }
  function toggleCrossOut(qId: string, choiceId: string) {
    setCrossedOut((prev) => {
      const cur = new Set(prev[qId] ?? []);
      if (cur.has(choiceId)) cur.delete(choiceId);
      else cur.add(choiceId);
      return { ...prev, [qId]: Array.from(cur) };
    });
  }

  // Turning the "ABC" eliminator tool OFF also restores anything crossed
  // out on the current question. Without this, a crossed-out choice stayed
  // permanently struck through and unselectable even after leaving
  // eliminator mode — the only way to undo it was to remember to turn ABC
  // back on first and tap its Undo button, which isn't obvious once the
  // tool itself is hidden.
  function toggleEliminatorMode() {
    setEliminatorMode((prev) => {
      const next = !prev;
      if (!next && current) {
        setCrossedOut((c) => ({ ...c, [current.id]: [] }));
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (submitting || results) return;
    setSubmitting(true);
    try {
      const res = await fetch(gradeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isBank ? { answers } : { mockId, section, module, answers }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data);
        try {
          window.localStorage.removeItem(progressKey);
        } catch {
          // nothing to clean up if storage isn't available
        }
        if (signedIn && !isBank) {
          // Bank sets are recorded by their own grade endpoint (per-question
          // history + the set's saved breakdown) — no module result to save.
          fetch("/api/module-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mockId,
              section,
              module,
              correctCount: data.correctCount,
              total: data.total,
              results: data.results,
            }),
          }).catch(() => {
            // saving the result is best-effort — the student still sees their
            // score either way, they just won't see it again from /mocks
          });
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Fetches an answer-key preview for Module Review — fires every time
  // this screen opens so it reflects any answers changed since the last
  // preview (e.g. left review, changed an answer, came back).
  useEffect(() => {
    if (!moduleReviewOpen || questions.length === 0) return;
    setPreviewLoading(true);
    fetch(gradeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isBank ? { answers, preview: true } : { mockId, section, module, answers }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.results) return;
        const map: Record<string, GradedQuestion> = {};
        for (const r of data.results as GradedQuestion[]) map[r.questionId] = r;
        setPreviewGrading(map);
      })
      .catch(() => {
        // preview is a nice-to-have — the plain answered/unanswered grid
        // still works fine if this fails
      })
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleReviewOpen]);

  // Admin: inline correct-answer edit directly from the Module Review
  // answer-key list — click a different letter and it saves immediately,
  // no need to open the full edit modal just to fix a wrong answer key.
  const [savingAnswerKeyId, setSavingAnswerKeyId] = useState<string | null>(null);
  async function updateCorrectAnswerInline(questionId: string, newAnswer: string) {
    setSavingAnswerKeyId(questionId);
    try {
      const res = await fetch(`/api/admin/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correctAnswer: newAnswer }),
      });
      if (!res.ok) throw new Error();
      setPreviewGrading((prev) => {
        if (!prev || !prev[questionId]) return prev;
        const q = prev[questionId];
        return {
          ...prev,
          [questionId]: {
            ...q,
            correctAnswer: newAnswer,
            isCorrect: q.selectedAnswer !== null && q.selectedAnswer === newAnswer,
          },
        };
      });
      // Keep the final results screen (if reached later, or already showing
      // for a re-review) in sync with this fix too.
      setResults((prev) => {
        if (!prev) return prev;
        let correctCount = 0;
        const updated = prev.results.map((r) => {
          const next =
            r.questionId === questionId
              ? { ...r, correctAnswer: newAnswer, isCorrect: r.selectedAnswer !== null && r.selectedAnswer === newAnswer }
              : r;
          if (next.isCorrect) correctCount += 1;
          return next;
        });
        return { ...prev, results: updated, correctCount };
      });
    } catch {
      alert("Failed to update the correct answer — try again.");
    } finally {
      setSavingAnswerKeyId(null);
    }
  }

  async function askCoach(mode: CoachMode) {
    if (!current || !signedIn) return;
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachText(null);
    setCoachMode(mode);
    try {
      const res = await fetch("/api/public/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          questionText: current.questionText,
          choices: current.choices,
          skill: current.skill,
          difficulty: current.difficulty,
          studentAnswer: current.choices.find((c) => c.id === answers[current.id])?.text,
          examMode: true,
        }),
      });
      const data = await res.json();
      setCoachText(data.explanation);
    } catch {
      setCoachText("Coach is unavailable right now — nothing was lost, keep practicing.");
    } finally {
      setCoachLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-pulse text-brand-slate text-sm">Loading module…</div>
      </div>
    );
  }

  if (loadError || (moduleEmpty && questions.length === 0) || (questions.length === 0 && !results && !loading)) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center gap-4 px-4">
        {isAdminUser && !loadError ? (
          <div className="card max-w-md w-full p-8 text-center space-y-5">
            <span className="inline-flex w-12 h-12 rounded-full bg-brand-blue-light items-center justify-center text-brand-blue mx-auto">
              <BrainMark size={26} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-brand-navy">No questions in this module yet</h1>
              <p className="text-sm text-brand-slate mt-1">
                {mockTitle} — {section}{moduleDot}
              </p>
            </div>
            <div className="space-y-2.5">
              <button onClick={() => setAiPasteOpen(true)} className="btn-primary w-full text-sm">
                ✨ Paste text — AI formats it automatically
              </button>
              <button onClick={openAdminCreate} className="btn-secondary w-full text-sm">
                + Add one question manually
              </button>
            </div>
          </div>
        ) : (
          <p className="text-brand-red text-sm">{loadError ?? "This module isn't available yet."}</p>
        )}
        <Link href={isBank ? "/practice/browse" : "/"} className="btn-secondary text-sm">
          {isBank ? "Back to Question Bank" : "Back to mock library"}
        </Link>
        {adminEditOpen && adminCreateMode && (
          <AdminQuestionEditModal
            mockId={mockId}
            section={section as "Math" | "Reading and Writing"}
            module={module}
            existing={null}
            onClose={() => {
              setAdminEditOpen(false);
              setAdminCreateMode(false);
            }}
            onSaved={() => {
              setAdminEditOpen(false);
              setAdminCreateMode(false);
              refetchModule("last");
            }}
          />
        )}
        {aiPasteOpen && (
          <AdminAiPasteModal
            mockId={mockId}
            section={section as "Math" | "Reading and Writing"}
            module={module}
            onClose={() => setAiPasteOpen(false)}
            onImported={() => {
              setAiPasteOpen(false);
              refetchModule("last");
            }}
          />
        )}
      </div>
    );
  }

  if (results) {
    const congratsThreshold = isMath ? 20 : 25;
    const qualifiesForCongrats = results.correctCount > congratsThreshold;

    return (
      <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "exam-dark bg-[#0b1220]" : "bg-brand-bg"}`}>
        <TextWatermarkOverlay dark={darkMode} />
        <Celebration trigger={celebrateTrigger} />
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-brand-border">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <span className="font-bold text-brand-navy tracking-tight">BlueMind</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? "Switch to light background" : "Switch to dark background"}
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-all hover:scale-110 ${
                  darkMode
                    ? "border-amber-400 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
                    : "border-brand-blue bg-brand-blue-light text-brand-blue hover:bg-blue-100"
                }`}
              >
                <MoonIcon />
              </button>
              <button
                onClick={() => {
                  window.location.href = examPath;
                }}
                className="btn-primary text-sm"
              >
                Start Again
              </button>
              <button
                onClick={() => {
                  // Hard navigation on purpose — a client-side Link here can
                  // get served a stale cached render of /mocks (from before
                  // this result was saved) by Next's router cache, showing
                  // the old "Start Practice" state instead of the new score.
                  window.location.href = isBank ? "/practice/browse" : signedIn ? "/mocks" : "/";
                }}
                className="btn-secondary text-sm"
              >
                {isBank ? "Back to Question Bank" : "Back to Mocks"}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="card p-6 text-center relative">
            <button
              onClick={celebrate}
              title="Celebrate!"
              className="absolute right-4 top-4 w-11 h-11 rounded-full bg-brand-blue-light border border-brand-blue flex items-center justify-center hover:bg-blue-100 hover:scale-105 transition-transform"
            >
              <BrainMark size={22} />
            </button>
            <p className="text-xs text-brand-slate uppercase tracking-wide mb-1">
              {mockTitle} · {section}{moduleDot}
            </p>
            <div className="text-4xl font-extrabold text-brand-blue">
              {results.correctCount}/{results.total}
            </div>
            {qualifiesForCongrats && (
              <p className="text-sm font-semibold text-brand-blue mt-2">🎉 Great work — congrats!</p>
            )}
          </div>

          {/* Full answer summary — every question in this module (27 for
              Reading & Writing, 22 for Math, the real per-module counts,
              since results.results is already scoped to just this module)
              at a glance, color-coded correct/incorrect, jumping straight
              to that question's detailed card below when tapped. */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-brand-navy">All Answers</p>
              <div className="flex items-center gap-4 text-xs text-brand-slate">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-brand-green-light border border-brand-green inline-block" />
                  Correct
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-brand-red-light border border-brand-red inline-block" />
                  Incorrect
                </span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-11 gap-2">
              {results.results.map((r, i) => (
                <a
                  key={r.questionId}
                  href={`#result-q-${i + 1}`}
                  title={`Question ${i + 1} — ${r.isCorrect ? "Correct" : "Incorrect"}`}
                  className={`h-10 rounded-md border flex items-center justify-center text-sm font-semibold transition-transform hover:scale-105 ${
                    r.isCorrect
                      ? "border-brand-green bg-brand-green-light text-brand-green"
                      : "border-brand-red bg-brand-red-light text-brand-red"
                  }`}
                >
                  {i + 1}
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {results.results.map((r, i) => (
              <div key={r.questionId} id={`result-q-${i + 1}`} className="card p-5 scroll-mt-20">
                <div className="flex items-start justify-between mb-2 gap-3">
                  <span className="text-xs font-semibold text-brand-slate">
                    Question {i + 1} · {r.skill}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        r.isCorrect ? "bg-brand-green-light text-brand-green" : "bg-brand-red-light text-brand-red"
                      }`}
                    >
                      {r.isCorrect ? "Correct" : "Incorrect"}
                    </span>
                    <button
                      onClick={() => openReport(r.questionId)}
                      title="Report a problem with this question"
                      className="flex items-center gap-1 text-xs font-medium text-brand-slate hover:text-brand-red border border-brand-border hover:border-brand-red rounded-full px-2.5 py-1"
                    >
                      <FlagRedIcon size={11} />
                      Report
                    </button>
                  </div>
                </div>
                <p className="text-sm text-brand-navy whitespace-pre-line mb-2">
                  <MathText text={r.questionText} />
                </p>
                {/* Explicit "your answer / correct answer" summary — shown for
                    EVERY question, not just multiple-choice ones. Grid-in
                    (SPR) questions have no choices array at all, so before
                    this they showed nothing about what was answered; and
                    relying purely on border color for multiple-choice was
                    easy to miss/misread. */}
                <p className="text-xs mb-3">
                  {r.selectedAnswer ? (
                    <>
                      <span className="text-brand-slate">Your answer: </span>
                      <span className={`font-semibold ${r.isCorrect ? "text-brand-green" : "text-brand-red"}`}>
                        {r.selectedAnswer}
                      </span>
                      {!r.isCorrect && (
                        <>
                          <span className="text-brand-slate"> · Correct answer: </span>
                          <span className="font-semibold text-brand-green">{r.correctAnswer}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-brand-slate">You left this unanswered · Correct answer: </span>
                      <span className="font-semibold text-brand-green">{r.correctAnswer}</span>
                    </>
                  )}
                </p>
                {r.imageData && (
                  <img
                    src={r.imageData}
                    alt="Chart or figure for this question"
                    className="max-w-full h-auto rounded-lg border border-brand-border mb-3 bg-white p-2"
                    style={{ filter: "contrast(1.15)" }}
                  />
                )}
                {r.choices.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {r.choices.map((c) => {
                      const acceptedIds = r.correctAnswer.split(",").map((s) => s.trim()).filter(Boolean);
                      const isCorrectChoice = acceptedIds.includes(c.id);
                      const isSelected = c.id === r.selectedAnswer;
                      return (
                        <div
                          key={c.id}
                          className={`text-sm px-3 py-2 rounded-lg border ${
                            isCorrectChoice
                              ? "border-brand-green bg-brand-green-light text-brand-navy"
                              : isSelected
                                ? "border-brand-red bg-brand-red-light text-brand-navy"
                                : "border-brand-border text-brand-slate"
                          }`}
                        >
                          {c.id}){" "}
                          {c.imageData && (
                            <img
                              src={c.imageData}
                              alt={`Choice ${c.id}`}
                              className="max-w-full h-auto max-h-32 rounded-md border border-brand-border/60 mt-1.5 mb-1"
                            />
                          )}
                          {c.text.trim() && <MathText text={c.text} mathOnly />}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-brand-slate">
                  <strong className="text-brand-navy">Explanation: </strong>
                  <MathText text={r.explanation} />
                </p>
              </div>
            ))}
          </div>
        </main>

        {/* Report modal — duplicated here (not shared via a variable) since
            this results view is an early return with its own JSX tree,
            separate from the exam-taking view below. */}
        {reportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30">
            <div className="card max-w-sm w-full p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-brand-navy">Report a problem</span>
                <button onClick={() => setReportOpen(false)} className="text-brand-slate hover:text-brand-navy">
                  <CloseIcon />
                </button>
              </div>
              {reportSent ? (
                <p className="text-sm text-brand-green">Thanks — sent to the BlueMind team.</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-brand-navy mb-2">What's wrong with this question?</p>
                  <select
                    className="w-full text-sm rounded-lg border border-brand-border px-2.5 py-2 mb-2"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                  >
                    <option value="wrong_answer">Marked answer looks wrong</option>
                    <option value="typo">Typo / formatting issue</option>
                    <option value="unclear">Question is unclear</option>
                    <option value="broken">Choices/image broken</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea
                    className="w-full text-sm rounded-lg border border-brand-border px-2.5 py-2 mb-3 min-h-20"
                    placeholder="Optional details"
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setReportOpen(false)} className="text-sm px-3 py-1.5 text-brand-slate">
                      Cancel
                    </button>
                    <button
                      onClick={() => submitReport()}
                      disabled={reportSending}
                      className="btn-primary text-sm px-4 py-1.5"
                    >
                      {reportSending ? "Sending\u2026" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const isCrossedOut = (qId: string, choiceId: string) => (crossedOut[qId] ?? []).includes(choiceId);

  return (
    <div ref={examRootRef} className={`h-screen flex flex-col overflow-hidden ${darkMode ? "exam-dark bg-[#0b1220]" : "bg-brand-bg"}`}>
      <TextWatermarkOverlay dark={darkMode} />
      {/* ---------------- Top chrome bar ---------------- */}
      <header className="bg-white px-4 sm:px-6 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 shrink-0 relative z-30 leading-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-brand-blue">
            <BrainMark size={30} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold text-brand-navy truncate leading-none">
              {mockTitle}{moduleSuffix}
            </p>
            <button
              onClick={() => setDirectionsOpen(true)}
              className="flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy mt-2"
            >
              Directions <ChevronDownIcon />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 shrink-0 justify-self-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTimerPaused((v) => !v)}
              title={timerPaused ? "Resume timer" : "Pause timer — no limit on how long you can stay paused"}
              className="flex flex-col items-center justify-center gap-0.5 w-[58px] h-9 text-[11px] font-semibold rounded-lg border border-brand-border text-brand-navy hover:bg-slate-50 whitespace-nowrap"
            >
              {timerPaused ? <PlayIcon /> : <PauseIcon />}
              <span>{timerPaused ? "Resume" : "Pause"}</span>
            </button>
            {timerHidden ? (
              <span className="flex items-center text-brand-navy">
                <StopwatchIcon size={24} />
              </span>
            ) : (
              <span
                className={`text-lg font-bold tabular-nums leading-none ${
                  secondsLeft > 0 && secondsLeft <= 300 ? "text-[#B3453F]" : "text-brand-navy"
                }`}
              >
                {timeStr}
              </span>
            )}
          </div>
          <button
            onClick={() => setTimerHidden((v) => !v)}
            className="text-sm font-medium text-brand-navy border border-brand-border rounded-full px-4 py-1 hover:bg-slate-50 whitespace-nowrap"
          >
            {timerHidden ? "Show" : "Hide"}
          </button>
          {isPracticeMode && (
            <div className="flex items-center gap-2 mt-0.5">
              <span
                title="Question difficulty"
                className={`h-6 flex items-center text-[10px] font-semibold px-2 rounded-full whitespace-nowrap ${
                  current.difficulty === "Hard"
                    ? "bg-brand-red-light text-brand-red"
                    : current.difficulty === "Medium"
                      ? "bg-brand-amber-light text-brand-amber"
                      : "bg-brand-green-light text-brand-green"
                }`}
              >
                {current.difficulty}
              </span>
              <span
                title="Time on this question"
                className="h-6 flex items-center text-[10px] font-semibold text-brand-slate tabular-nums px-2 rounded-full bg-slate-100 whitespace-nowrap"
              >
                {questionTimeStr}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 justify-self-end">
          {isMath ? (
            <>
              <button
                onClick={() => setCalcOpen((v) => !v)}
                className={`hidden sm:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium ${
                  calcOpen ? "text-brand-blue" : "text-brand-navy hover:bg-slate-50"
                }`}
              >
                <CalculatorIcon size={21} />
                Calculator
              </button>
              <button
                onClick={() => setReferenceOpen(true)}
                className="hidden sm:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-brand-navy hover:bg-slate-50"
              >
                <ReferenceIcon size={21} />
                Reference
              </button>
            </>
          ) : (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setHighlightMode((v) => !v)}
                title={
                  highlightMode
                    ? "Annotate mode is on — select any text to choose a color or underline"
                    : "Turn on Annotate, then select text to highlight or underline it"
                }
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium ${
                  highlightMode ? "text-brand-blue" : "text-brand-navy hover:bg-slate-50"
                }`}
              >
                <AnnotateIcon size={21} />
                Annotate
              </button>
            </div>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to light background" : "Switch to dark background"}
            className={`hidden md:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium ${
              darkMode ? "text-brand-blue" : "text-brand-navy hover:bg-slate-50"
            }`}
          >
            <MoonIcon size={21} />
            {darkMode ? "Light" : "Dark"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="hidden md:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-brand-navy hover:bg-slate-50"
          >
            {isFullscreen ? <ExitFullscreenIcon size={21} /> : <FullscreenIcon size={21} />}
            Full screen
          </button>

          <button
            onClick={() => openReport(current.id)}
            className="hidden lg:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-brand-navy hover:bg-slate-50"
          >
            <FlagRedIcon size={18} />
            Report
          </button>

          {isAdminUser && (
            <button
              onClick={() => openAdminEdit(current.id)}
              title="Admin: edit this question — saves for every student"
              className="hidden lg:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-brand-blue hover:bg-brand-blue-light"
            >
              <EditPencilIcon size={18} />
              Edit
            </button>
          )}

          <button
            onClick={() => setCoachOpen(true)}
            title={signedIn ? "AI Coach" : "Sign in to unlock AI Coach"}
            className={`hidden xl:flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium ${
              signedIn ? "text-brand-navy hover:bg-slate-50" : "text-brand-slate/60 hover:bg-slate-50"
            }`}
          >
            {!signedIn && <LockIcon />}
            Coach
          </button>

          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-brand-border text-brand-navy hover:bg-slate-50"
              aria-label="More options"
            >
              <KebabIcon />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-12 w-56 card p-1 shadow-card-hover z-40">
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    openReport(current.id);
                  }}
                  className="flex w-full items-center gap-2 text-left text-sm px-3 py-2 rounded-md hover:bg-slate-50 text-brand-navy sm:hidden"
                >
                  <FlagRedIcon />
                  Report a problem
                </button>
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      openAdminEdit(current.id);
                    }}
                    className="flex w-full items-center gap-2 text-left text-sm px-3 py-2 rounded-md hover:bg-slate-50 text-brand-blue lg:hidden"
                  >
                    <EditPencilIcon size={15} />
                    Admin: Edit question
                  </button>
                )}
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    setLeaveModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2 text-left text-sm px-3 py-2 rounded-md hover:bg-slate-50 text-brand-red"
                >
                  <ArrowLeftIcon />
                  Leave test
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="dash-line shrink-0 relative z-10" />
      {showFiveMinWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-amber-800 shrink-0">
          <WarningIcon />
          You have 5 minutes left
          <button
            onClick={() => setShowFiveMinWarning(false)}
            className="ml-2 text-amber-700 hover:text-amber-900"
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {/* Same split-pane structure for both sections, matching Bluebook: left
          pane is the stimulus (R&W passage / Math question stem, both
          highlightable by selecting text), right pane is the response area
          (R&W repeats the actual question prompt above its choices since
          the prompt is distinct from the passage; Math shows choices only,
          since the stem is already fully shown on the left). The "Mark for
          Review" strip lives INSIDE the right pane only — not spanning both
          panes — matching real Bluebook exactly; both panes share the same
          top padding so their content still starts at the same height. */}
      <div className="flex flex-col flex-1 min-h-0 relative z-10">
        <main ref={splitContainerRef} className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: stimulus — always rendered (matches Bluebook: every question gets
              a left pane, even bare grammar items where the "passage" is just
              the sentence itself). Tapping either pane's expand icon resizes
              the split to 80/20; dragging the divider between the panes sets
              any width in between. */}
          <div
            className={`relative overflow-y-auto p-6 sm:p-8 border-b md:border-b-0 md:border-r border-brand-border bg-white md:shrink-0 ${
              isDraggingPane ? "" : "transition-[width] duration-150"
            }`}
            style={
              isDesktop
                ? { width: `${focusedPane === "left" ? 80 : focusedPane === "right" ? 20 : leftPaneWidthPct}%` }
                : undefined
            }
          >
              <TextWatermarkOverlay dark={darkMode} mode="absolute" />
              <div className="relative z-10">
                {current.imageData && (
                  <img
                    src={current.imageData}
                    alt="Chart or figure for this question"
                    className="max-w-full h-auto rounded-lg border border-brand-border mb-4 bg-white p-2"
                    style={{ filter: "contrast(1.15)" }}
                  />
                )}
                {(current.passageText || (!isMath && derived.passage) || isMath) && (
                  <Highlightable
                    key={`${current.id}-left`}
                    className={`text-brand-navy leading-relaxed ${!isMath ? "font-serif" : ""}`}
                    enabled={isMath || highlightMode}
                  >
                    <div style={{ fontSize: fontSizePx }}>
                      <PassageText
                        text={
                          current.passageText
                            ? stripTextLabel(current.passageText)
                            : isMath
                              ? current.questionText
                              : stripTextLabel(derived.passage)
                        }
                        underline={underlinePhrase}
                      />
                    </div>
                  </Highlightable>
                )}
              </div>
            </div>

          {/* Drag handle — grab and drag horizontally to resize the split.
              Hidden on mobile (panes stack vertically there) and while a
              pane is in its expanded 80/20 state, matching how the corner
              buttons already behave. */}
          {isDesktop && (
            <div
              onMouseDown={startPaneDrag}
              title="Drag to resize"
              className="hidden md:flex items-center justify-center w-1.5 shrink-0 cursor-col-resize hover:bg-brand-blue/10 active:bg-brand-blue/15 relative z-20 group"
            >
              <div className="w-0.5 h-7 rounded-full bg-brand-border group-hover:bg-brand-blue/50 transition-colors" />
            </div>
          )}

          {/* Right: "Mark for Review" strip (scoped to this pane, matching
              real Bluebook) + response area — always rendered now, resized
              to 20% instead of disappearing when the left pane is expanded. */}
            <div
              className={`relative overflow-y-auto bg-white flex flex-col ${isDraggingPane ? "" : "transition-[width] duration-150"}`}
              style={
                isDesktop
                  ? { width: `${focusedPane === "right" ? 80 : focusedPane === "left" ? 20 : 100 - leftPaneWidthPct}%` }
                  : undefined
              }
            >
              <TextWatermarkOverlay dark={darkMode} mode="absolute" />
              <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-3 shrink-0 relative z-10">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-[4px] bg-black text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <button
                  onClick={() => toggleMark(current.id)}
                  className={`shrink-0 flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${
                    marked[current.id] ? "text-red-600" : "text-brand-navy/80 hover:text-brand-navy"
                  }`}
                >
                  <FlagIcon filled={!!marked[current.id]} />
                  {marked[current.id] ? "Marked for Review" : "Mark for Review"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={toggleEliminatorMode}
                  title={eliminatorMode ? "Turn off Answer Eliminator (also restores any crossed-out choices)" : "Turn on Answer Eliminator"}
                  className={`shrink-0 rounded-[6px] w-10 h-8 flex items-center justify-center text-xs font-bold tracking-tight border transition-colors ${
                    eliminatorMode
                      ? "bg-brand-navy border-brand-navy text-white"
                      : "bg-white border-brand-border text-brand-navy hover:bg-slate-50"
                  }`}
                >
                  <span className={eliminatorMode ? "line-through" : ""}>ABC</span>
                </button>
              </div>
              <div className="dash-line mt-2.5" />
              </div>
            <div className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-8 pb-6 sm:pb-8" style={{ fontSize: fontSizePx }}>
          <Highlightable
            key={`${current.id}-right`}
            enabled={isMath || highlightMode}
            className={!isMath ? "font-serif" : ""}
          >
            {(current.passageText || derived.prompt) && (
              <p className="text-brand-navy leading-relaxed mb-6" style={{ fontSize: fontSizePx }}>
                <MathText text={current.passageText ? current.questionText : derived.prompt} />
              </p>
            )}
          </Highlightable>

          {current.questionType !== "spr" && (
            <div className="space-y-3.5">
              {current.choices.map((c) => (
                <ChoiceRow
                  key={c.id}
                  letter={c.id}
                  text={c.text}
                  imageData={c.imageData}
                  selected={answers[current.id] === c.id}
                  crossedOut={isCrossedOut(current.id, c.id)}
                  eliminatorMode={eliminatorMode}
                  onSelect={() => selectAnswer(current.id, c.id)}
                  onToggleCrossOut={() => toggleCrossOut(current.id, c.id)}
                />
              ))}
            </div>
          )}

          {current.questionType === "spr" && (
            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-brand-slate mb-1.5">Answer</label>
              <input
                type="text"
                value={answers[current.id] ?? ""}
                onChange={(e) => selectAnswer(current.id, e.target.value)}
                placeholder="Enter your answer"
                className="w-full px-3 py-2.5 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm"
              />
            </div>
          )}
            </div>
          </div>
        </main>
      </div>

      {/* ---------------- AI Coach drawer — available to everyone ---------------- */}
      {coachOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-brand-navy/20" onClick={() => setCoachOpen(false)} />
          <div className="w-full max-w-sm h-full bg-white border-l border-brand-border shadow-card-hover flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-brand-border shrink-0">
              <span className="text-sm font-semibold text-brand-navy">BlueMind Coach</span>
              <button onClick={() => setCoachOpen(false)} className="text-brand-slate hover:text-brand-navy">
                <CloseIcon />
              </button>
            </div>
            <div className="p-4 flex items-center gap-2">
              <button onClick={() => askCoach("strategy")} disabled={!signedIn} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                Strategy
              </button>
              <button onClick={() => askCoach("explain")} disabled={!signedIn} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                Explain
              </button>
            </div>
            <div className="px-4 pb-4 text-[11px] text-brand-slate">
              Coach won't reveal the final answer while you're still solving.
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {!signedIn ? (
                <div className="text-center py-10">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-brand-slate">
                    <LockIcon />
                  </div>
                  <p className="text-sm text-brand-navy font-medium mb-1">Coach is for signed-in students</p>
                  <p className="text-xs text-brand-slate mb-4">
                    Sign in to get hints and explanations while you practice — it's free.
                  </p>
                  <Link href="/login" className="btn-primary text-xs px-4 py-1.5 inline-block">
                    Sign in
                  </Link>
                </div>
              ) : coachLoading ? (
                <div className="text-sm text-brand-navy bg-brand-blue-light rounded-lg p-3">
                  BlueMind Coach is thinking…
                </div>
              ) : coachText ? (
                <div className="bg-brand-blue-light rounded-lg p-3">
                  {coachMode === "strategy" ? <CoachMarkdown text={coachText} /> : <CoachSlideshow text={coachText} />}
                </div>
              ) : (
                <p className="text-sm text-brand-slate">Pick Hint or Explain to get help with this question.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Report a problem modal ---------------- */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30">
          <div className="card max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-brand-navy">Report a problem</span>
              <button onClick={() => setReportOpen(false)} className="text-brand-slate hover:text-brand-navy">
                <CloseIcon />
              </button>
            </div>
            {reportSent ? (
              <p className="text-sm text-brand-green">Thanks — sent to the BlueMind team.</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-brand-navy mb-2">What's wrong with this question?</p>
                <select
                  className="w-full text-sm rounded-lg border border-brand-border px-2.5 py-2 mb-2"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                >
                  <option value="wrong_answer">Marked answer looks wrong</option>
                  <option value="typo">Typo / formatting issue</option>
                  <option value="unclear">Question is unclear</option>
                  <option value="broken">Choices/image broken</option>
                  <option value="other">Other</option>
                </select>
                <textarea
                  className="w-full text-sm rounded-lg border border-brand-border px-2.5 py-2 mb-3 min-h-20"
                  placeholder="Optional details"
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setReportOpen(false)} className="text-sm px-3 py-1.5 text-brand-slate">
                    Cancel
                  </button>
                  <button
                    onClick={() => submitReport()}
                    disabled={reportSending}
                    className="btn-primary text-sm px-4 py-1.5"
                  >
                    {reportSending ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------- "Leave this test?" confirmation ---------------- */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30">
          <div className="card max-w-md w-full p-7 shadow-2xl">
            <h3 className="text-xl font-bold text-brand-navy mb-3">Leave this test?</h3>
            <p className="text-sm text-brand-slate leading-relaxed mb-2">
              You can save your place and finish this test later, or leave and delete this attempt.
            </p>
            <p className="text-sm text-brand-slate leading-relaxed mb-6">
              Saving keeps your answers and the time left on the clock. Deleting cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 flex-wrap">
              <button
                onClick={handleKeepTesting}
                className="text-sm font-semibold text-brand-navy px-2 py-2.5 hover:underline"
              >
                Keep testing
              </button>
              <button
                onClick={handleSaveAndExit}
                className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl"
              >
                Save &amp; exit
              </button>
              <button
                onClick={handleLeaveAndDelete}
                className="text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 px-5 py-2.5 rounded-xl"
              >
                Leave &amp; delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Admin: edit question modal ---------------- */}
      {adminEditOpen && current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-brand-navy/30">
          <div className="card max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-brand-navy">
                {adminCreateMode
                  ? insertAfterQuestionId !== undefined
                    ? "Insert missing question (admin)"
                    : "Add a question (admin)"
                  : "Edit question (admin)"}
              </span>
              <button onClick={() => setAdminEditOpen(false)} className="text-brand-slate hover:text-brand-navy">
                <CloseIcon />
              </button>
            </div>
            <p className="text-xs text-brand-slate mb-4">
              {adminCreateMode && insertAfterQuestionId !== undefined
                ? "This will be inserted at that exact spot and every question after it will renumber by one — the fix for AI extraction skipping a question."
                : "Saving updates this question in the shared bank — every student sees the change, including anyone already mid-attempt on this mock. The timer and your place in the module aren't affected."}
            </p>
            {editError && <p className="text-sm text-brand-red mb-3">{editError}</p>}

            {editLoading && <div className="py-10 text-center text-sm text-brand-slate">Loading full question details…</div>}

            {!editLoading && (
            <div>
            <label className="block text-xs font-semibold text-brand-slate mb-1.5">Passage image (optional)</label>
            {editImageData ? (
              <div className="mb-3">
                <img
                  src={editImageData}
                  alt="Passage graphic preview"
                  className="w-full h-auto max-h-56 object-contain rounded-lg border border-brand-border mb-2 bg-slate-50"
                />
                <div className="flex gap-3">
                  <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
                    Replace Image
                    <input type="file" accept="image/*" className="hidden" onChange={handlePassageImageUpload} />
                  </label>
                  <button type="button" onClick={() => setEditImageData(null)} className="text-xs px-3 py-1.5 text-brand-red hover:underline">
                    Remove Image
                  </button>
                </div>
              </div>
            ) : (
              <div
                tabIndex={0}
                onPaste={handlePassageImagePaste}
                className="mb-3 border-2 border-dashed border-brand-border rounded-lg p-4 text-center text-xs text-brand-slate focus:border-brand-blue outline-none"
              >
                <p className="mb-1">Click here, then Ctrl+V to paste a chart/graph/table</p>
                <p className="mb-2">— or —</p>
                <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer inline-block">
                  Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={handlePassageImageUpload} />
                </label>
              </div>
            )}
            </div>
            )}

            {!editLoading && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-brand-slate mb-1.5">
                  Passage text {isMath && <span className="font-normal text-brand-slate/70">(optional — usually left blank for Math)</span>}
                </label>
                <FormatToolbar textareaRef={editPassageTextareaRef} value={editPassageText} onChange={setEditPassageText} />
                <textarea
                  ref={editPassageTextareaRef}
                  className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-32"
                  value={editPassageText}
                  onChange={(e) => setEditPassageText(e.target.value)}
                  placeholder={
                    isMath
                      ? "Only needed if this question has a separate stimulus (e.g. a data table) before the actual question — leave blank otherwise."
                      : "The passage/stimulus shown on the left side — leave blank for a bare grammar/transition question with no separate passage."
                  }
                />
              </div>
            )}

            <div className="mb-2">
              <label className="block text-xs font-semibold text-brand-slate mb-1.5">Question text</label>
              <FormatToolbar textareaRef={editQuestionTextareaRef} value={editQuestionText} onChange={setEditQuestionText} />
              <textarea
                ref={editQuestionTextareaRef}
                className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-24"
                value={editQuestionText}
                onChange={(e) => setEditQuestionText(e.target.value)}
              />
            </div>

            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-slate">Answer format:</span>
              <button
                type="button"
                onClick={() => toggleEditQuestionType("multiple_choice")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  editQuestionType === "multiple_choice"
                    ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                    : "border-brand-border text-brand-slate hover:bg-slate-50"
                }`}
              >
                Multiple choice
              </button>
              <button
                type="button"
                onClick={() => toggleEditQuestionType("spr")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  editQuestionType === "spr"
                    ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                    : "border-brand-border text-brand-slate hover:bg-slate-50"
                }`}
              >
                Grid-in (numeric)
              </button>
            </div>

            {/* Live preview — renders through the exact same PassageText/
                MathText components the real exam page uses, so paragraph
                breaks, math, and formatting show EXACTLY as they'll look to
                a student, updating as you type rather than only after
                Save. This is what was missing before: the exam page behind
                this modal is frozen on the saved version, so any edit here
                looked like it "wasn't applying" until you could compare
                against something live. */}
            {!editLoading && (editPassageText.trim() || editQuestionText.trim()) && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-brand-slate mb-1.5">Live preview — exactly how this looks in the mock</p>
                <div className="grid sm:grid-cols-2 gap-3 border border-brand-border rounded-lg overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b sm:border-b-0 sm:border-r border-brand-border">
                    {editPassageText.trim() ? (
                      <div className={`text-sm text-brand-navy leading-relaxed ${!isMath ? "font-serif" : ""}`}>
                        <PassageText text={editPassageText} />
                      </div>
                    ) : (
                      <p className="text-xs text-brand-slate italic">No passage — left panel will be blank.</p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50">
                    {editQuestionText.trim() ? (
                      <p className="text-sm text-brand-navy leading-relaxed">
                        <MathText text={editQuestionText} />
                      </p>
                    ) : (
                      <p className="text-xs text-brand-slate italic">Question text will appear here.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {editQuestionType !== "spr" && (
              <div className="mb-2">
                <label className="block text-xs font-semibold text-brand-slate mb-1.5">
                  Choices — click a letter to toggle it as correct
                </label>
                <p className="text-[11px] text-brand-slate mb-2">
                  Some questions have more than one correct answer — click every letter that should count as correct.
                </p>
                <div className="space-y-2">
                  {editChoices.map((c, i) => {
                    const acceptedIds = editCorrectAnswer.split(",").map((s) => s.trim()).filter(Boolean);
                    const isCorrect = acceptedIds.includes(c.id);
                    return (
                    <div key={i} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = isCorrect ? acceptedIds.filter((id) => id !== c.id) : [...acceptedIds, c.id];
                          setEditCorrectAnswer(next.join(","));
                        }}
                        title={isCorrect ? "Correct answer — click to unmark" : "Click to mark as correct"}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 mt-1.5 ${
                          isCorrect
                            ? "bg-brand-green border-brand-green text-white"
                            : "border-brand-border text-brand-navy hover:border-brand-green"
                        }`}
                      >
                        {c.id}
                      </button>
                      <div className="flex-1 min-w-0">
                        <input
                          className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                          value={c.text}
                          placeholder={c.imageData ? "Optional — leave blank for an image-only choice" : "Choice text"}
                          onChange={(e) =>
                            setEditChoices((prev) => prev.map((pc, pi) => (pi === i ? { ...pc, text: e.target.value } : pc)))
                          }
                        />
                        {/* Optional per-choice image — e.g. each choice is its
                            own small graph/figure rather than text. Leaving
                            the text above blank makes this choice render as
                            image-only in the exam. */}
                        {c.imageData ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <img
                              src={c.imageData}
                              alt={`Choice ${c.id} preview`}
                              className="h-14 w-auto max-w-[120px] object-contain rounded border border-brand-border bg-slate-50"
                            />
                            <label className="text-[11px] font-medium text-brand-blue hover:underline cursor-pointer">
                              Replace
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleChoiceImageUpload(i, e)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setEditChoices((prev) => prev.map((pc, pi) => (pi === i ? { ...pc, imageData: null } : pc)))
                              }
                              className="text-[11px] font-medium text-brand-red hover:underline"
                            >
                              Remove image
                            </button>
                          </div>
                        ) : (
                          <label className="mt-1.5 inline-block text-[11px] font-medium text-brand-slate hover:text-brand-blue cursor-pointer">
                            + Add image to this choice (optional)
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleChoiceImageUpload(i, e)}
                            />
                          </label>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setEditChoices((prev) => {
                            const next = prev.filter((_, pi) => pi !== i);
                            if (editCorrectAnswer === c.id) setEditCorrectAnswer(next[0]?.id ?? "");
                            return next;
                          })
                        }
                        title="Remove this choice"
                        className="shrink-0 text-xs text-brand-red px-2 py-1 hover:underline mt-1.5"
                      >
                        Remove
                      </button>
                    </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditChoices((prev) => [...prev, { id: String.fromCharCode(65 + prev.length), text: "" }])
                  }
                  className="btn-secondary text-xs mt-2"
                >
                  + Add choice
                </button>
                <p className="text-[11px] text-brand-slate mt-2">
                  To change the domain, skill, or difficulty tag, use the full editor in the Admin panel — this
                  quick editor covers everything students actually see.
                </p>
              </div>
            )}

            {editQuestionType === "spr" && (() => {
              const sprAnswers = editCorrectAnswer.length > 0 ? editCorrectAnswer.split(",") : [""];
              const updateSprAnswer = (i: number, value: string) => {
                const next = sprAnswers.slice();
                next[i] = value;
                setEditCorrectAnswer(next.join(","));
              };
              const addSprAnswer = () => setEditCorrectAnswer([...sprAnswers, ""].join(","));
              const removeSprAnswer = (i: number) => setEditCorrectAnswer(sprAnswers.filter((_, idx) => idx !== i).join(","));
              return (
                <div className="mb-2">
                  <label className="block text-xs font-semibold text-brand-slate mb-1.5">Correct answer(s)</label>
                  <p className="text-[11px] text-brand-slate mb-2">
                    Equivalent forms of the same value (1/2, 0.5, 50%) are accepted automatically — only add another
                    box below if the question genuinely has a different correct answer too, e.g. 5 <em>and</em> 6
                    both work.
                  </p>
                  <div className="space-y-2">
                    {sprAnswers.map((val, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="w-full max-w-xs rounded-lg border border-brand-border px-3 py-2 text-sm"
                          value={val}
                          onChange={(e) => updateSprAnswer(i, e.target.value)}
                          placeholder="e.g. 12 or 3/4"
                        />
                        {sprAnswers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSprAnswer(i)}
                            className="text-xs text-brand-red px-2 py-1 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addSprAnswer} className="btn-secondary text-xs mt-2">
                    + Add another accepted answer
                  </button>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAdminEditOpen(false)} className="text-sm px-3 py-1.5 text-brand-slate">
                Cancel
              </button>
              <button onClick={saveAdminEdit} disabled={savingEdit} className="btn-primary text-sm px-4 py-1.5">
                {savingEdit
                  ? "Saving\u2026"
                  : adminCreateMode && insertAfterQuestionId !== undefined
                    ? "Insert Question"
                    : "Save for all students"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Directions modal ---------------- */}
      {directionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-brand-navy">Directions</span>
              <button onClick={() => setDirectionsOpen(false)} className="text-brand-slate hover:text-brand-navy">
                <CloseIcon />
              </button>
            </div>
            <p className="text-sm text-brand-slate leading-relaxed">
              {isMath
                ? "For this module, solve each problem and choose the correct answer, or enter your answer in the box provided. The Desmos graphing calculator and a formula reference sheet are available from the header for every question in this section."
                : "Each question is based on one or more short passages. Read each passage and question, then choose the best answer from the choices provided. Select any text in the passage to highlight it."}{" "}
              You may go back and change answers within this module before time runs out, and you can mark
              questions to revisit using the flag.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- Reference sheet modal (Math) ---------------- */}
      {referenceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-brand-navy/30">
          <div className="card max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg font-bold text-brand-navy">SAT Reference Sheet</span>
              <button onClick={() => setReferenceOpen(false)} className="text-brand-slate hover:text-brand-navy">
                <CloseIcon />
              </button>
            </div>
            <p className="text-xs text-brand-slate mb-5">
              The same reference facts and formulas available in the official Digital SAT.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 mb-6 text-brand-navy">
              {REFERENCE_SHAPES.map((shape) => (
                <div key={shape.label} className="text-center">
                  {shape.svg}
                  <div className="mt-1 space-y-0.5">
                    {shape.formulas.map((f) => (
                      <p key={f} className="text-xs font-medium text-brand-navy">
                        {f}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-brand-border pt-4">
              {REFERENCE_FACTS_TEXT.map((fact) => (
                <p key={fact} className="text-xs text-brand-slate">
                  {fact}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Question navigator (centered modal, matching the
          reference structure: title with live answered count, legend,
          grid, and a "Go to module review" action) ---------------- */}
      {navigatorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-20 bg-brand-navy/30"
          onClick={() => setNavigatorOpen(false)}
        >
          <div className="card w-full max-w-xl p-6 shadow-card-hover" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 gap-3">
              <span className="text-base font-semibold text-brand-navy">
                {section}{moduleSuffix} — {questions.filter((q) => !!answers[q.id]).length}/{questions.length} answered
              </span>
              <button onClick={() => setNavigatorOpen(false)} className="text-brand-slate hover:text-brand-navy shrink-0">
                <CloseIcon />
              </button>
            </div>

            <div className="flex items-center gap-5 text-xs text-brand-slate mb-5 flex-wrap">
              <span className="flex items-center gap-1.5 text-brand-navy">
                <FilledCircleIcon /> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <FlagIcon filled /> Marked for review
              </span>
              <span className="flex items-center gap-1.5">
                <OutlineCircleIcon /> Current
              </span>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 mb-5">
              {questions.map((q, i) => {
                const isCurrent = i === index;
                const isAnswered = !!answers[q.id];
                const isMarked = !!marked[q.id];
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setIndex(i);
                      setNavigatorOpen(false);
                    }}
                    className={`relative h-9 rounded-md border flex items-center justify-center text-sm font-medium ${
                      isCurrent
                        ? "border-2 border-brand-navy text-brand-navy font-bold"
                        : isAnswered
                          ? "border-brand-border bg-brand-blue-light text-brand-blue"
                          : "border-brand-border text-brand-blue"
                    }`}
                  >
                    {i + 1}
                    {isMarked && (
                      <span className="absolute -top-1.5 -right-1.5 text-red-600">
                        <FlagIcon filled />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                setNavigatorOpen(false);
                setModuleReviewOpen(true);
              }}
              className="btn-primary w-full text-sm flex items-center justify-center gap-1.5"
            >
              Go to module review
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Module review — a genuine full-screen takeover, not
          a small popup card floating over the exam. No dimmed backdrop, no
          card border/shadow — it replaces the whole viewport like a real
          page would, matching Bluebook's actual end-of-module screen. */}
      {moduleReviewOpen && (
        <div className="fixed inset-0 z-50 bg-brand-bg flex flex-col overflow-y-auto">
          <header className="sticky top-0 bg-white border-b border-brand-border px-4 sm:px-6 h-16 flex items-center justify-between shrink-0">
            <button
              onClick={() => setModuleReviewOpen(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-slate hover:text-brand-navy"
            >
              <ArrowLeftIcon /> Back to questions
            </button>
            <span className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <BrainMark size={20} /> Module Review
            </span>
          </header>

          <div className="flex-1 flex items-start justify-center px-4 py-14">
            <div className="w-full max-w-5xl text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-brand-navy mb-3 leading-snug">
                You've reached the end of
                <br />
                {section}{moduleSuffix}
              </h2>
              <p className="text-base text-brand-slate mb-8">Review your answers below. You can jump back to any question.</p>

              <div className="flex items-center justify-center gap-4 mb-8 flex-wrap">
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-green border border-brand-green rounded-full px-4 py-2 bg-white">
                  <CheckSmallIcon /> {questions.filter((q) => !!answers[q.id]).length} answered
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-red border border-brand-red rounded-full px-4 py-2 bg-white">
                  <WarningIcon /> {questions.filter((q) => !answers[q.id]).length} unanswered
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-amber border border-brand-amber rounded-full px-4 py-2 bg-white">
                  <FlagIcon filled /> {questions.filter((q) => !!marked[q.id]).length} marked
                </span>
              </div>

              <div className="border border-brand-border rounded-2xl p-8 mb-8 bg-white">
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-11 gap-3.5">
                  {questions.map((q, i) => {
                    const isCurrent = i === index;
                    const isAnswered = !!answers[q.id];
                    const isMarked = !!marked[q.id];
                    return (
                      <button
                        key={q.id}
                        onClick={() => {
                          setIndex(i);
                          setModuleReviewOpen(false);
                        }}
                        className={`relative h-14 rounded-lg border-2 flex items-center justify-center text-lg font-semibold bg-white ${
                          isCurrent
                            ? "border-brand-navy text-brand-navy font-bold"
                            : isAnswered
                              ? "border-brand-border text-brand-navy"
                              : "border-brand-border text-brand-slate"
                        }`}
                      >
                        {i + 1}
                        {isMarked && (
                          <span className="absolute -top-2 -right-2 text-red-600">
                            <FlagIcon filled />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Admin-only answer key — the correct answer for every
                  question, in order. Each one is directly editable: click a
                  different letter and it saves immediately to the shared
                  question bank. Not shown to students; this is a fix-it
                  tool for the admin, not a grading preview. */}
              {isAdminUser && previewGrading && (
                <div className="border border-brand-blue/30 rounded-xl p-6 mb-6 bg-brand-blue-light/40 text-left max-w-2xl mx-auto">
                  <p className="text-xs font-semibold text-brand-blue mb-3 uppercase tracking-wide">
                    Admin — Answer Key (click a letter to fix it)
                  </p>
                  <p className="text-xs text-brand-slate mb-3">
                    If AI extraction skipped a question, use the “+” between two rows to insert the missing one exactly
                    where it belongs — every question after it renumbers automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => openAdminInsert(null)}
                    className="w-full mb-2 text-xs font-semibold text-brand-blue border border-dashed border-brand-blue/50 rounded-md py-1 hover:bg-brand-blue-light"
                  >
                    + Insert question at the start
                  </button>
                  <div className="columns-1 sm:columns-2 gap-x-6">
                    {questions.map((q, i) => {
                      const graded = previewGrading[q.id];
                      const choiceIds = graded?.choices?.length ? graded.choices.map((c) => c.id) : ["A", "B", "C", "D"];
                      const isSpr = !graded?.choices?.length && graded?.correctAnswer !== undefined && !/^[A-Z]$/.test(graded.correctAnswer ?? "");
                      return (
                        <div key={q.id} className="break-inside-avoid mb-2">
                          <div className="flex items-center gap-2 text-sm text-brand-navy">
                            <span className="w-6 shrink-0 text-right tabular-nums">{i + 1}.</span>
                            {isSpr ? (
                              <input
                                defaultValue={graded?.correctAnswer ?? ""}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v && v !== graded?.correctAnswer) updateCorrectAnswerInline(q.id, v);
                                }}
                                disabled={savingAnswerKeyId === q.id}
                                className="w-20 rounded-md border border-brand-border px-2 py-1 text-sm"
                              />
                            ) : (
                              <div className="flex items-center gap-1">
                                {choiceIds.map((letter) => {
                                  const acceptedIds = (graded?.correctAnswer ?? "").split(",").map((s) => s.trim()).filter(Boolean);
                                  const isCorrect = acceptedIds.includes(letter);
                                  return (
                                    <button
                                      key={letter}
                                      type="button"
                                      disabled={savingAnswerKeyId === q.id}
                                      onClick={() => {
                                        const next = isCorrect
                                          ? acceptedIds.filter((id) => id !== letter)
                                          : [...acceptedIds, letter];
                                        if (next.length > 0) updateCorrectAnswerInline(q.id, next.join(","));
                                      }}
                                      title={isCorrect ? "Correct — click to unmark" : "Click to mark as correct too (multi-answer supported)"}
                                      className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors ${
                                        isCorrect
                                          ? "bg-brand-green border-brand-green text-white"
                                          : "border-brand-border text-brand-slate hover:border-brand-blue hover:text-brand-blue bg-white"
                                      } disabled:opacity-50`}
                                    >
                                      {letter}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {savingAnswerKeyId === q.id && <span className="text-xs text-brand-slate">Saving…</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => openAdminInsert(q.id)}
                            title={`Insert a question between ${i + 1} and ${i + 2}`}
                            className="w-full mt-1 text-[11px] font-medium text-brand-slate/70 hover:text-brand-blue border border-dashed border-transparent hover:border-brand-blue/40 rounded py-0.5"
                          >
                            + Insert question here
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setModuleReviewOpen(false)}
                  className="btn-secondary text-base px-6 py-3 flex items-center gap-2"
                >
                  <ArrowLeftIcon /> Back to questions
                </button>
                <button
                  onClick={() => {
                    setModuleReviewOpen(false);
                    handleSubmit();
                  }}
                  disabled={submitting}
                  className="flex items-center gap-2 text-base font-semibold text-white bg-brand-navy px-7 py-3 rounded-lg hover:bg-brand-navy/90 disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : isBank ? "Submit Set" : "Submit Module"}
                  <ArrowRightIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Bottom bar ---------------- */}
      <div className="dash-line shrink-0 relative z-10" />
      <footer className="shrink-0 bg-white h-14 flex items-center px-4 sm:px-6 relative z-10">
        <div className="w-full flex items-center justify-between">
          <span className="text-xs font-medium text-brand-navy truncate max-w-[40%]">{userName ?? "Guest"}</span>

          <button
            onClick={() => setNavigatorOpen(true)}
            className="flex items-center gap-1 text-sm font-semibold text-white bg-[#0d1321] px-4 py-2 rounded-full hover:bg-black"
          >
            Question {index + 1} of {questions.length}
            <ChevronUpIcon />
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="text-sm font-semibold rounded-full px-4 py-2 bg-[#0d1321] text-white hover:bg-black disabled:opacity-40 disabled:hover:bg-[#0d1321] disabled:cursor-not-allowed"
            >
              Back
            </button>
            {index < questions.length - 1 ? (
              <button
                onClick={() => setIndex((i) => i + 1)}
                className="text-sm font-semibold rounded-full px-4 py-2 bg-[#0d1321] text-white hover:bg-black"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => setModuleReviewOpen(true)}
                className="text-sm font-semibold rounded-full px-4 py-2 bg-[#0d1321] text-white hover:bg-black"
              >
                Review &amp; Submit
              </button>
            )}
          </div>
        </div>
      </footer>

      {isMath && <DesmosCalculator open={calcOpen} onOpenChange={setCalcOpen} />}
    </div>
  );
}
