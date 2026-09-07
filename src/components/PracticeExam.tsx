"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PauseScreen, TestSetup, useExamGuard } from "@/components/TestSessionControls";
import { isTestMode, remainingSeconds, TestMode } from "@/lib/test-session";

export interface ExamResult { total: number; correctCount: number; accuracyPct: number; results: GradedQuestion[] }
export interface FullExamModule {
  mode: TestMode;
  storageKey: string;
  sessionId?: string;
  onComplete: (result: ExamResult) => void;
  onDelete: () => void;
}
import { DesmosCalculator } from "@/components/DesmosCalculator";
import { MathText } from "@/components/MathText";
import { Celebration } from "@/components/Celebration";
import { BrainMark } from "@/components/BrainLogo";
import { AdminQuestionEditModal } from "@/components/AdminQuestionEditModal";
import { AdminAiPasteModal } from "@/components/AdminAiPasteModal";
import { FormatToolbar } from "@/components/FormatToolbar";
import { TextWatermarkOverlay } from "@/components/TextWatermarkOverlay";
import { useAppTheme } from "@/lib/theme";
// Bluebook's typefaces: Roboto for the chrome, a Times-compatible serif
// (Tinos) for Reading & Writing passages, prompts and choices.
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/tinos/400.css";
import "@fontsource/tinos/700.css";

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
interface CheckedAnswer {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string;
  rationale: string;
  explanation: string;
}


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

function BookmarkIcon({ filled = false, size = 16, className = "" }: { filled?: boolean; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill={filled ? "currentColor" : "none"}>
      <path d="M6 3h12v18l-6-4.5L6 21V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function LocationPinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

function NewWordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4.5h8.5A2.5 2.5 0 0 1 16 7v12H7.5A2.5 2.5 0 0 1 5 16.5v-12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 9h5M8 12h4M19 5v6M16 8h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ToolButton({
  label,
  icon,
  onClick,
  active = false,
  className = "",
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center gap-1 min-w-[60px] px-2 pt-1 pb-1.5 rounded-md text-[12px] leading-none whitespace-nowrap hover:bg-[#f0f0f0] ${
        active ? "text-[#324dc7]" : "text-[#1e1e1e]"
      } ${className}`}
    >
      <span className="h-6 flex items-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** The small corner button at the top of each pane that expands it. */
function PaneExpandButton({ expanded, onClick, title }: { expanded: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-[4px] border border-[#8f8f8f] bg-white text-[#3b3b3b] flex items-center justify-center hover:bg-[#f0f0f0]"
    >
      {expanded ? <CompressCornerIcon /> : <ExpandCornerIcon />}
    </button>
  );
}

/** One numbered square in the question navigator / review page grid —
 * filled blue when answered, dashed outline when not, a red bookmark when
 * marked for review, and a location pin above the current question. */
function QuestionTile({
  number,
  answered,
  marked,
  current,
  onClick,
  size = 40,
}: {
  number: number;
  answered: boolean;
  marked: boolean;
  current: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button onClick={onClick} className="relative flex items-center justify-center mx-auto" style={{ width: size, height: size }}>
      {current && (
        <span className="absolute -top-[19px] left-1/2 -translate-x-1/2 text-[#1e1e1e]">
          <LocationPinIcon size={17} />
        </span>
      )}
      <span
        className={`w-full h-full flex items-center justify-center text-[16px] font-bold ${
          answered ? "bg-[#324dc7] text-white" : "bg-white text-[#324dc7] border border-dashed border-[#1e1e1e]"
        }`}
      >
        {number}
      </span>
      {marked && (
        <span className="absolute -top-[8px] -right-[7px] text-[#c13515]">
          <BookmarkIcon filled size={15} />
        </span>
      )}
    </button>
  );
}

function NavigatorLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-[14px] text-[#1e1e1e] flex-wrap">
      <span className="flex items-center gap-1.5">
        <LocationPinIcon size={16} /> Current
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-[18px] h-[18px] border border-dashed border-[#1e1e1e] bg-white" /> Unanswered
      </span>
      <span className="flex items-center gap-1.5">
        <BookmarkIcon filled size={16} className="text-[#c13515]" /> For Review
      </span>
    </div>
  );
}

const RW_DIRECTIONS = [
  "The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).",
  "All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.",
  "Select any text in the passage to highlight it, and use the ABC button to cross out answer choices. You can go back and change answers within this module before time runs out, and you can mark questions to revisit using the bookmark.",
];
const MATH_DIRECTIONS = [
  "The questions in this section address a number of important math skills.",
  "Use of a calculator is permitted for all questions. A reference sheet, calculator, and these directions can be accessed throughout the test.",
  "Unless otherwise indicated: all variables and expressions represent real numbers; figures provided are drawn to scale; all figures lie in a plane; the domain of a given function f is the set of all real numbers x for which f(x) is a real number.",
  "For multiple-choice questions, solve each problem and choose the correct answer from the choices provided. Each multiple-choice question has a single correct answer.",
  "For student-produced response questions, solve each problem and enter your answer in the box. If you find more than one correct answer, enter only one answer. You can enter up to 5 characters for a positive answer and up to 6 characters (including the negative sign) for a negative answer. If your answer is a fraction that doesn't fit in the provided space, enter the decimal equivalent. If your answer is a decimal that doesn't fit in the provided space, enter it by truncating or rounding at the fourth digit. If your answer is a mixed number (such as 3½), enter it as an improper fraction (7/2) or its decimal equivalent (3.5). Don't enter symbols such as a percent sign, comma, or dollar sign.",
];

function ChoiceRow({
  letter,
  text,
  imageData,
  selected,
  crossedOut,
  eliminatorMode,
  onSelect,
  onToggleCrossOut,
  feedback,
  disabled = false,
}: {
  letter: string;
  text: string;
  imageData?: string | null;
  selected: boolean;
  crossedOut: boolean;
  eliminatorMode: boolean;
  onSelect: () => void;
  onToggleCrossOut: () => void;
  feedback?: "correct" | "incorrect";
  disabled?: boolean;
}) {
  const hasText = text.trim().length > 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="button"
        tabIndex={crossedOut || disabled ? -1 : 0}
        onClick={() => !crossedOut && !disabled && onSelect()}
        onKeyDown={(e) => {
          if (!crossedOut && !disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-disabled={crossedOut || disabled}
        className={`relative flex-1 flex items-center gap-3 text-left px-3.5 py-2.5 rounded-lg border bg-white overflow-hidden ${
          feedback === "correct"
            ? "border-brand-green bg-brand-green-light shadow-[inset_0_0_0_1px_var(--success)] cursor-default"
            : feedback === "incorrect"
              ? "border-brand-red bg-brand-red-light shadow-[inset_0_0_0_1px_var(--danger)] cursor-default"
              : selected
            ? "border-[#324dc7] shadow-[inset_0_0_0_1px_#324dc7] cursor-pointer"
            : crossedOut
              ? "border-[#8f8f8f] cursor-not-allowed"
            : disabled ? "border-[#8f8f8f] cursor-default" : "border-[#1e1e1e] hover:bg-[#f5f5f5] cursor-pointer"
        }`}
      >
        <span
          className={`shrink-0 w-[26px] h-[26px] rounded-full border-[1.5px] flex items-center justify-center text-[13px] font-bold ${
            feedback === "correct"
              ? "bg-brand-green border-brand-green text-white"
              : feedback === "incorrect"
                ? "bg-brand-red border-brand-red text-white"
                : selected
              ? "bg-[#324dc7] border-[#324dc7] text-white"
              : crossedOut
                ? "border-[#8f8f8f] text-[#8f8f8f] bg-white"
                : "border-[#1e1e1e] text-[#1e1e1e] bg-white"
          }`}
        >
          {letter}
        </span>
        {/* An image-only choice (no text entered alongside it) renders just
            the image — no empty text line taking up space beside it. A
            choice with both shows the image above the text. */}
        <span className={`flex-1 min-w-0 ${crossedOut ? "text-[#8f8f8f]" : "text-[#1e1e1e]"}`}>
          {imageData && (
            <img
              src={imageData}
              alt={`Choice ${letter}`}
              className={`max-w-full h-auto ${hasText ? "mb-2 max-h-40" : "max-h-48"}`}
            />
          )}
          {hasText && (
            <span className="text-[16px] font-normal leading-snug">
              <MathText text={text} mathOnly />
            </span>
          )}
        </span>
        {/* Full-width strike line across the whole choice box, exactly as
            Bluebook's answer eliminator draws it. */}
        {crossedOut && (
          <span className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-[#1e1e1e] pointer-events-none" />
        )}
      </div>
      {/* Eliminator target — only present while the ABC tool is on: a small
          struck-through letter next to every choice, or "Undo" once that
          choice has been crossed out. */}
      {eliminatorMode && !disabled &&
        (crossedOut ? (
          <button
            type="button"
            onClick={onToggleCrossOut}
            title="Restore choice"
            className="shrink-0 w-[42px] text-[13px] font-medium text-[#1e1e1e] underline underline-offset-2 hover:no-underline whitespace-nowrap"
          >
            Undo
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCrossOut}
            title="Cross out choice"
            className="shrink-0 relative w-[26px] h-[26px] mx-2 rounded-full border-[1.5px] border-[#1e1e1e] text-[#1e1e1e] bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[12px] font-bold"
          >
            {letter}
            <span className="absolute -left-[4px] -right-[4px] top-1/2 h-[1.5px] bg-[#1e1e1e]" />
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

export default function PracticeExam({
  params, fullExam,
}: {
  params: { mockId: string; section: string; module: string };
  fullExam?: FullExamModule;
}) {
  const { mockId, section: sectionParam, module: moduleParam } = params;
  const section = decodeURIComponent(sectionParam);
  // Question Bank practice sets reuse this exact exam screen at
  // /practice/qbank/<section>/<setId>: the third segment is the set id
  // instead of a module number, questions load from the set endpoint, and
  // grading records per-question bank history instead of a module result.
  const isBank = mockId === "qbank";
  const setId = isBank ? moduleParam : null;
  // The API and existing route use this name for the SAT module number.
  // eslint-disable-next-line @next/next/no-assign-module-variable
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
    if (params.get("question")) {
      setTestMode("untimed");
      setStarted(true);
    }
  }, []);

  const [testMode, setTestMode] = useState<TestMode>(fullExam?.mode ?? (isBank ? "untimed" : "timed"));
  const [started, setStarted] = useState(!!fullExam);
  const [pauseReason, setPauseReason] = useState("Take as much time as you need.");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);
  const pausedRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moduleEmpty, setModuleEmpty] = useState(false);
  const [mockTitle, setMockTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, CheckedAnswer>>({});
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
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

  // Signed-in state supplies the name in the bottom bar
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

  // Chrome
  const [timerHidden, setTimerHidden] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(true);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("bluemind_question_difficulty_indicator");
      if (saved !== null) setShowDifficulty(saved !== "off");
    } catch { /* use the default when browser storage is unavailable */ }
  }, []);
  function toggleDifficultyIndicator() {
    setShowDifficulty((previous) => {
      const next = !previous;
      try { window.localStorage.setItem("bluemind_question_difficulty_indicator", next ? "on" : "off"); } catch { /* preference remains for this visit */ }
      return next;
    });
  }
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
  const { dark: darkMode, setDark: setDarkMode } = useAppTheme();
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

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
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

  // Personal vocabulary capture is intentionally unavailable in real exam
  // environment mode. In study/timed practice, the learner can save just a
  // word now and add its definition later from the Vocabulary section.
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newWordDefinition, setNewWordDefinition] = useState("");
  const [wordSaving, setWordSaving] = useState(false);
  const [wordSaveError, setWordSaveError] = useState("");
  const [wordSaved, setWordSaved] = useState(false);

  // "Leave this test?" confirmation — shown from the kebab menu instead of
  // navigating straight away. Progress is saved to localStorage (works for
  // guests and signed-in users alike, no backend attempt-record needed for
  // this quick-practice flow) keyed to this exact mock/section/module, and
  // restored automatically if the student comes back to the same module
  // before finishing or explicitly deleting it.
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const submissionId = useRef<string>("");
  const [restoredProgress, setRestoredProgress] = useState(false);
  const progressKey = fullExam?.storageKey ?? `bluemind_progress_${mockId}_${section}_${isBank ? setId : module}`;

  // One-time "5 minutes left" warning — fires once when the countdown
  // crosses the 5-minute mark, not on every render/re-check, and never
  // fires again once dismissed or once it's already fired this session.
  const [showFiveMinWarning, setShowFiveMinWarning] = useState(false);
  const firedFiveMinWarningRef = useRef(false);
  useEffect(() => {
    if (firedFiveMinWarningRef.current) return;
    if (!started || testMode === "untimed" || loading || results || secondsLeft <= 0 || secondsLeft > 300 || totalSeconds <= 300) return;
    firedFiveMinWarningRef.current = true;
    setShowFiveMinWarning(true);
  }, [secondsLeft, loading, results, totalSeconds, started, testMode]);

  function saveProgressToStorage() {
    if (finishedRef.current) return true;
    try {
      if (!submissionId.current) submissionId.current = crypto.randomUUID();
      window.localStorage.setItem(progressKey, JSON.stringify({
        submissionId: submissionId.current,
        answers, checkedAnswers, marked, crossedOut,
        secondsLeft: deadlineRef.current === null ? secondsLeft : remainingSeconds(deadlineRef.current),
        index, mode: testMode, savedAt: Date.now(),
      }));
      setStorageError(null);
      return true;
    } catch {
      setStorageError("Your browser could not save progress. Free up browser storage and try Save & exit again. Keep this page open to avoid losing your work.");
      return false;
    }
  }

  const saveRef = useRef(saveProgressToStorage);
  saveRef.current = saveProgressToStorage;
  useEffect(() => {
    if (!started || loading || results || !questions.length || finishedRef.current) return;
    saveRef.current();
  }, [started, loading, results, questions.length, answers, checkedAnswers, marked, crossedOut, index, secondsLeft, testMode]);

  useEffect(() => {
    if (!started || loading || results || !questions.length) return;
    const save = () => { saveRef.current(); };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
  }, [started, loading, results, questions.length]);

  function pauseTest(reason = "Take as much time as you need.") {
    if (finishedRef.current || pausedRef.current) return;
    pausedRef.current = true;
    saveRef.current();
    if (deadlineRef.current !== null) setSecondsLeft(remainingSeconds(deadlineRef.current));
    deadlineRef.current = null;
    setPauseReason(reason);
    setTimerPaused(true);
  }

  useExamGuard(testMode === "exam" && started && !loading && !results && !timerPaused && questions.length > 0, pauseTest);

  function handleKeepTesting() { setLeaveModalOpen(false); }

  function handleSaveAndExit() {
    pauseTest();
    if (!saveProgressToStorage()) return;
    window.location.href = isBank ? "/practice/browse" : signedIn ? "/mocks" : "/";
  }

  function handleLeaveAndDelete() {
    try {
      window.localStorage.removeItem(progressKey);
      fullExam?.onDelete();
      finishedRef.current = true;
    } catch {
      setStorageError("Could not remove saved progress. Please try again.");
      return;
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
  // For image extraction: a chart/graph screenshot only
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
      const historyId = new URLSearchParams(window.location.search).get("history");
      fetch(historyId ? "/api/progress/" + encodeURIComponent(historyId) : isBank ? loadUrl : `/api/module-results/one?mockId=${mockId}&section=${encodeURIComponent(section)}&module=${module}`)
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          return res.json();
        })
        .then((data) => {
          if (isBank && !Array.isArray(data.results)) throw new Error("not completed yet");
          setMockTitle(data.mockTitle ?? "");
          setResults({ total: data.total, correctCount: data.correctCount, accuracyPct: data.total ? Math.round(data.correctCount / data.total * 100) : 0, results: data.results });
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
        if (fullExam && data.questions.length !== (isMath ? 22 : 27)) {
          throw new Error("This full-exam module no longer has its complete question set.");
        }
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
              if (typeof saved.submissionId === "string") submissionId.current = saved.submissionId;
               setAnswers(saved.answers ?? {});
               setCheckedAnswers(saved.checkedAnswers ?? {});
              setMarked(saved.marked ?? {});
              setCrossedOut(saved.crossedOut ?? {});
              setIndex(Math.max(0, Math.min(saved.index ?? 0, data.questions.length - 1)));
               if (!fullExam && isTestMode(saved.mode)) setTestMode(isBank && saved.mode === "exam" ? "untimed" : saved.mode);
              setSecondsLeft(typeof saved.secondsLeft === "number" && Number.isFinite(saved.secondsLeft) ? Math.max(0, Math.min(saved.secondsLeft, data.minutes * 60)) : data.minutes * 60);
              restored = true;
              setRestoredProgress(true);
            }
          }
        } catch {
          // corrupted/unreadable saved state — fall through to a fresh start
        }
        if (!restored) setSecondsLeft(data.minutes * 60);

        // Vocabulary entries link back with a stable question id. Selecting
        // it after local progress restoration makes the source link win over
        // the last saved index and opens the exact question the word came from.
        const targetQuestionId = new URLSearchParams(window.location.search).get("question");
        if (targetQuestionId) {
          const targetIndex = data.questions.findIndex((question: Question) => question.id === targetQuestionId);
          if (targetIndex >= 0) setIndex(targetIndex);
        }

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
    if (!started || testMode === "untimed" || loading || results || timerPaused || submitting || submitError) {
      deadlineRef.current = null;
      return;
    }
    deadlineRef.current = Date.now() + secondsLeft * 1000;
    const tick = () => {
      if (!pausedRef.current && deadlineRef.current !== null) setSecondsLeft(remainingSeconds(deadlineRef.current));
    };
    const timer = setInterval(tick, 250);
    return () => { clearInterval(timer); deadlineRef.current = null; };
    // secondsLeft is a snapshot at the start of each running period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, testMode, loading, results, timerPaused, submitting, submitError]);

  useEffect(() => {
    if (!isBank && started && testMode !== "untimed" && !loading && !results && !timerPaused && !submitting && !submitError && secondsLeft === 0 && questions.length > 0) handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, started, testMode, loading, results, timerPaused, submitting, submitError]);

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

  function openWordCapture() {
    const selection = window.getSelection()?.toString().trim().replace(/\s+/g, " ") ?? "";
    setNewWord(selection.length <= 120 ? selection : "");
    setNewWordDefinition("");
    setWordSaveError("");
    setWordSaved(false);
    setWordModalOpen(true);
  }

  async function saveNewWord() {
    if (!current || !newWord.trim()) return;
    if (!signedIn) {
      setWordSaveError("Sign in to save words to your personal vocabulary.");
      return;
    }
    setWordSaving(true);
    setWordSaveError("");
    try {
      const response = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: newWord,
          definition: newWordDefinition,
          questionId: current.id,
          sourcePath: examPath,
          questionNumber: index + 1,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this word.");
      setNewWord(data.word.word);
      setNewWordDefinition(data.word.definition);
      setWordSaved(true);
    } catch (cause) {
      setWordSaveError(cause instanceof Error ? cause.message : "Could not save this word.");
    } finally {
      setWordSaving(false);
    }
  }

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
    if (!started || loading || results || timerPaused) return;
    const t = setInterval(() => setQuestionSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading, results, timerPaused, index, started]);
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
    if (isBank && checkedAnswers[qId]) return;
    setAnswers((prev) => ({ ...prev, [qId]: choiceId }));
    setCheckError(null);
  }

  async function handleCheckAnswer() {
    if (!isBank || !current || checkedAnswers[current.id] || checkingAnswer) return;
    const selectedAnswer = answers[current.id]?.trim();
    if (!selectedAnswer) {
      setCheckError("Choose or enter an answer before checking.");
      return;
    }
    setCheckingAnswer(true);
    setCheckError(null);
    try {
      const response = await fetch(`/api/qbank/sets/${setId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, selectedAnswer }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Your answer could not be checked.");
      setCheckedAnswers((previous) => ({ ...previous, [current.id]: data as CheckedAnswer }));
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : "Your answer could not be checked.");
    } finally {
      setCheckingAnswer(false);
    }
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
    if (submittingRef.current || finishedRef.current || results || pausedRef.current) return;
    if (isBank && Object.keys(checkedAnswers).length < questions.length) {
      const firstUnchecked = questions.findIndex((question) => !checkedAnswers[question.id]);
      if (firstUnchecked >= 0) setIndex(firstUnchecked);
      setCheckError("Check every answer before finishing this practice session.");
      return;
    }
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    submittingRef.current = true;
    if (deadlineRef.current !== null) setSecondsLeft(remainingSeconds(deadlineRef.current));
    deadlineRef.current = null;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(gradeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(isBank ? {} : { mockId, section, module }), answers, submissionId: submissionId.current, mode: testMode, fullExamId: fullExam?.sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit this module. Please try again.");
      if (res.ok) {
        if (fullExam) fullExam.onComplete(data);
        finishedRef.current = true;
        if (!fullExam) {
          setResults(data);
          if (testMode === "exam" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        }
        try {
          window.localStorage.removeItem(progressKey);
        } catch {
          // nothing to clean up if storage isn't available
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit this module. Check your connection and try again.");
      saveRef.current();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // Fetches an answer-key preview for Module Review — fires every time
  // this screen opens so it reflects any answers changed since the last
  // preview (e.g. left review, changed an answer, came back).
  useEffect(() => {
    if (!moduleReviewOpen || questions.length === 0 || fullExam || isBank || testMode === "exam") return;
    setPreviewLoading(true);
    fetch(gradeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isBank ? { answers, preview: true } : { mockId, section, module, answers, preview: true }),
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
              <div key={r.questionId} id={`result-q-${i + 1}`} className="card p-5 scroll-mt-20 relative overflow-hidden">
                <TextWatermarkOverlay dark={darkMode} mode="absolute" />
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

  if (!results && !started) {
    return <TestSetup
      title={mockTitle}
      detail={isBank ? `${section} · ${questions.length} questions · check each answer for immediate feedback` : section + moduleDot + " · " + questions.length + " questions · " + totalSeconds / 60 + " minutes in timed modes"}
      savedMode={restoredProgress ? testMode : undefined}
      allowedModes={isBank ? ["untimed", "timed"] : undefined}
      practiceOnly={isBank}
      backHref={isBank ? "/practice/browse" : undefined}
      onStart={(mode) => { setTestMode(mode); setStarted(true); }}
    >
      {isBank && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Question difficulty indicator</p>
            <p className="text-xs text-slate-600 mt-1">Show Easy, Medium, or Hard above each question.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showDifficulty}
            aria-label="Question difficulty indicator"
            onClick={toggleDifficultyIndicator}
            className={`w-12 h-7 rounded-full p-1 transition-colors ${showDifficulty ? "bg-blue-600" : "bg-slate-300"}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${showDifficulty ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      )}
    </TestSetup>;
  }

  const isCrossedOut = (qId: string, choiceId: string) => (crossedOut[qId] ?? []).includes(choiceId);

  // Bluebook's header title: "Section 1, Module 1: Reading and Writing".
  // Question Bank sets carry their own label ("Question Bank: Algebra").
  const examTitle = isBank ? mockTitle.replace(" · ", ": ") : `Section ${sectionNumber}, Module ${module}: ${section}`;

  return (
    <div ref={examRootRef} className={`bluebook h-screen flex flex-col overflow-hidden ${darkMode ? "exam-dark bg-[#0b1220]" : "bg-white"}`}>
      {(timerPaused || submitError) && <PauseScreen reason={submitError ?? pauseReason} error={storageError} mode={testMode}
        onResume={() => {
          pausedRef.current = false;
          setTimerPaused(false);
          if (submitError) { setSubmitError(null); handleSubmit(); }
        }} onExit={handleSaveAndExit} />}
      {storageError && !timerPaused && !submitError && <div role="alert" className="bg-red-50 text-red-800 px-4 py-2 text-sm">{storageError}</div>}
      {/* ---------------- Top chrome bar — Bluebook layout: title + Directions on
          the left, timer with Hide underneath in the middle, labelled tool
          icons on the right ---------------- */}
      <header className="bg-white px-4 sm:px-6 pt-3 pb-2 grid grid-cols-[1fr_auto_1fr] items-start gap-4 shrink-0 relative z-30">
        <div className="min-w-0 relative">
          <p className="text-[19px] sm:text-[20px] text-[#1e1e1e] truncate leading-tight">{examTitle}</p>
          <div className="flex items-center gap-3 mt-1 min-w-0">
            <button
              onClick={() => setDirectionsOpen((v) => !v)}
              className="flex items-center gap-1 text-[14px] text-[#1e1e1e] hover:underline underline-offset-2 shrink-0"
            >
              Directions <ChevronDownIcon className={directionsOpen ? "rotate-180" : ""} />
            </button>
            {!isBank && mockTitle && <span className="text-[12px] text-[#6b6b6b] truncate">{mockTitle}</span>}
          </div>
          {directionsOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setDirectionsOpen(false)} />
              <div className="absolute left-0 top-[60px] z-40 w-[640px] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.28)] border border-[#d9d9d9] p-6 text-[15px] leading-relaxed text-[#1e1e1e] space-y-3 max-h-[70vh] overflow-y-auto">
                {(isMath ? MATH_DIRECTIONS : RW_DIRECTIONS).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                <div className="flex justify-end pt-2">
                  <button onClick={() => setDirectionsOpen(false)} className="bb-btn-primary">
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col items-center shrink-0 justify-self-center pt-0.5">
          {timerHidden ? (
            <span className="h-[30px] flex items-center text-[#1e1e1e]">
              <StopwatchIcon size={22} />
            </span>
          ) : (
            <span
              className={`h-[30px] flex items-center text-[22px] font-medium tabular-nums leading-none ${
                secondsLeft > 0 && secondsLeft <= 300 ? "text-[#c13515]" : "text-[#1e1e1e]"
              }`}
            >
              {testMode === "untimed" ? "Untimed" : timeStr}
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={() => setTimerHidden((v) => !v)}
              className="text-[13px] font-medium text-[#1e1e1e] border border-[#1e1e1e] rounded-full px-3 h-[24px] leading-none hover:bg-[#f0f0f0] whitespace-nowrap"
            >
              {timerHidden ? "Show" : "Hide"}
            </button>
            <button
              onClick={() => pauseTest()}
              aria-label="Pause test"
              title="Pause test and save progress"
              className={`w-[24px] h-[24px] rounded-full border flex items-center justify-center ${
                timerPaused ? "border-[#324dc7] text-[#324dc7] bg-[#eef1fb]" : "border-[#1e1e1e] text-[#1e1e1e] hover:bg-[#f0f0f0]"
              }`}
            >
              {timerPaused ? <PlayIcon /> : <PauseIcon />}
            </button>
          </div>
          {(isPracticeMode || isBank) && (
            <div className="flex items-center gap-2 mt-1.5">
              {showDifficulty && <span
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
              </span>}
              <span
                title="Time on this question"
                className="h-6 flex items-center text-[10px] font-semibold text-brand-slate tabular-nums px-2 rounded-full bg-slate-100 whitespace-nowrap"
              >
                {questionTimeStr}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-start justify-end gap-0.5 shrink-0 justify-self-end">
          {testMode !== "exam" && (
            <ToolButton
              label="New word"
              onClick={openWordCapture}
              icon={<NewWordIcon size={22} />}
              title="Save a word from this question to your vocabulary"
              className="hidden lg:flex"
            />
          )}
          {isMath ? (
            <>
              <ToolButton
                label="Calculator"
                active={calcOpen}
                onClick={() => setCalcOpen((v) => !v)}
                icon={<CalculatorIcon size={22} />}
                className="hidden sm:flex"
              />
              <ToolButton
                label="Reference"
                onClick={() => setReferenceOpen(true)}
                icon={<ReferenceIcon size={22} />}
                className="hidden sm:flex"
              />
            </>
          ) : (
            <ToolButton
              label="Annotate"
              active={highlightMode}
              onClick={() => setHighlightMode((v) => !v)}
              title={
                highlightMode
                  ? "Annotate mode is on — select any text to choose a color or underline"
                  : "Turn on Annotate, then select text to highlight or underline it"
              }
              icon={<AnnotateIcon size={22} />}
              className="hidden sm:flex"
            />
          )}
          <button onClick={handleSaveAndExit} disabled={submitting} className="text-xs font-semibold px-2 py-3 text-blue-700 disabled:opacity-50">Save &amp; exit</button>

          <div className="relative">
            <ToolButton label="More" active={moreOpen} onClick={() => setMoreOpen((v) => !v)} icon={<KebabIcon />} />
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-[52px] w-60 bg-white rounded-lg border border-[#d9d9d9] shadow-[0_8px_30px_rgba(0,0,0,0.22)] p-1.5 z-40 text-[14px] text-[#1e1e1e]">
                  {isMath ? (
                    <>
                      <button
                        onClick={() => {
                          setMoreOpen(false);
                          setCalcOpen((v) => !v);
                        }}
                        className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0] sm:hidden"
                      >
                        <CalculatorIcon size={17} /> Calculator
                      </button>
                      <button
                        onClick={() => {
                          setMoreOpen(false);
                          setReferenceOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0] sm:hidden"
                      >
                        <ReferenceIcon size={17} /> Reference
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        setHighlightMode((v) => !v);
                      }}
                      className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0] sm:hidden"
                    >
                      <AnnotateIcon size={17} /> {highlightMode ? "Turn off Annotate" : "Annotate"}
                    </button>
                  )}
                  {testMode !== "exam" && (
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        openWordCapture();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[#f0f0f0] lg:hidden"
                    >
                      <NewWordIcon size={17} /> New word
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      setDarkMode(!darkMode);
                    }}
                    className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0]"
                  >
                    <MoonIcon size={17} /> {darkMode ? "Light background" : "Dark background"}
                  </button>
                  {isBank && (
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        toggleDifficultyIndicator();
                      }}
                      className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0]"
                    >
                      <span className={`w-3 h-3 rounded-full ${showDifficulty ? "bg-brand-green" : "bg-slate-300"}`} />
                      Question difficulty indicator: {showDifficulty ? "On" : "Off"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      toggleFullscreen();
                    }}
                    className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0]"
                  >
                    {isFullscreen ? <ExitFullscreenIcon size={17} /> : <FullscreenIcon size={17} />}
                    {isFullscreen ? "Exit full screen" : "Full screen"}
                  </button>
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      openReport(current.id);
                    }}
                    className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0]"
                  >
                    <FlagRedIcon size={15} /> Report a problem
                  </button>
                  {isAdminUser && (
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        openAdminEdit(current.id);
                      }}
                      className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0] text-[#324dc7]"
                    >
                      <EditPencilIcon size={15} /> Admin: Edit question
                    </button>
                  )}
                  <div className="my-1 border-t border-[#e5e5e5]" />
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      setLeaveModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 text-left px-3 py-2 rounded-md hover:bg-[#f0f0f0] text-[#c13515]"
                  >
                    <ArrowLeftIcon /> {isBank ? "Leave this set" : "Leave test"}
                  </button>
                </div>
              </>
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
            className={`relative overflow-y-auto px-6 sm:px-8 pt-12 pb-8 border-b md:border-b-0 border-[#c7c7c7] bg-white md:shrink-0 ${
              isDraggingPane ? "" : "transition-[width] duration-150"
            }`}
            style={
              isDesktop
                ? { width: `${focusedPane === "left" ? 80 : focusedPane === "right" ? 20 : leftPaneWidthPct}%` }
                : undefined
            }
          >
              {isDesktop && (
                <div className="absolute top-2 right-2 z-20">
                  <PaneExpandButton
                    expanded={focusedPane === "left"}
                    onClick={() => setFocusedPane((p) => (p === "left" ? null : "left"))}
                    title={focusedPane === "left" ? "Restore the split view" : "Expand this pane"}
                  />
                </div>
              )}
              <div className="relative z-10 min-h-full">
                <TextWatermarkOverlay dark={darkMode} mode="absolute" />
                {current.imageData && (
                  <img
                    src={current.imageData}
                    alt="Chart or figure for this question"
                    className="max-w-full h-auto mb-4"
                  />
                )}
                {(current.passageText || (!isMath && derived.passage) || isMath) && (
                  <Highlightable
                    key={`${current.id}-left`}
                    className={`text-[#1e1e1e] leading-[1.6] ${!isMath ? "bluebook-serif" : ""}`}
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
              className="hidden md:flex items-center justify-center w-[6px] shrink-0 cursor-col-resize bg-[#d9d9d9] hover:bg-[#bdbdbd] relative z-20 group"
            >
              <div className="w-[3px] h-9 rounded-full bg-[#1e1e1e]/70 group-hover:bg-[#1e1e1e]" />
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
              {/* Bluebook's response-pane top: the pane expand button, then the
                  gray strip with the question number, "Mark for Review" and
                  the ABC answer eliminator, closed off by the dashed rule. */}
              <div className="shrink-0 relative z-10">
                <div className="h-11 flex items-center px-2">
                  {isDesktop && (
                    <PaneExpandButton
                      expanded={focusedPane === "right"}
                      onClick={() => setFocusedPane((p) => (p === "right" ? null : "right"))}
                      title={focusedPane === "right" ? "Restore the split view" : "Expand this pane"}
                    />
                  )}
                </div>
                <div className="mx-6 sm:mx-8 flex items-center bg-[#f0f0f0] h-[34px] pr-2">
                  <span className="w-[34px] h-[34px] bg-[#1e1e1e] text-white text-[15px] font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <button
                    onClick={() => toggleMark(current.id)}
                    className="flex items-center gap-1.5 pl-3 text-[14px] text-[#1e1e1e] whitespace-nowrap"
                  >
                    <BookmarkIcon filled={!!marked[current.id]} size={17} className={marked[current.id] ? "text-[#c13515]" : ""} />
                    {marked[current.id] ? "Marked for Review" : "Mark for Review"}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={toggleEliminatorMode}
                    title={eliminatorMode ? "Turn off the answer eliminator (also restores any crossed-out choices)" : "Turn on the answer eliminator"}
                    className={`shrink-0 w-[34px] h-[26px] rounded-[4px] border flex items-center justify-center text-[11px] font-bold tracking-tight ${
                      eliminatorMode ? "bg-[#1e1e1e] border-[#1e1e1e] text-white" : "bg-white border-[#1e1e1e] text-[#1e1e1e] hover:bg-[#e6e6e6]"
                    }`}
                  >
                    <span className="line-through decoration-[1.5px]">ABC</span>
                  </button>
                </div>
                <div className="mx-6 sm:mx-8 dash-line" />
              </div>
            <div className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-8 pt-5 pb-8" style={{ fontSize: fontSizePx }}>
          <div className="relative min-h-full">
          <TextWatermarkOverlay dark={darkMode} mode="absolute" />
          <Highlightable
            key={`${current.id}-right`}
            enabled={isMath || highlightMode}
            className={!isMath ? "bluebook-serif" : ""}
          >
            {(current.passageText || derived.prompt) && (
              <p className="text-[#1e1e1e] leading-[1.6] mb-5" style={{ fontSize: fontSizePx }}>
                <MathText text={current.passageText ? current.questionText : derived.prompt} />
              </p>
            )}
          </Highlightable>

          {current.questionType !== "spr" && (
            <div className={`space-y-3 ${!isMath ? "bluebook-serif" : ""}`}>
              {current.choices.map((c) => {
                const checked = checkedAnswers[current.id];
                const accepted = checked?.correctAnswer.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
                const feedback = checked
                  ? accepted.includes(c.id)
                    ? "correct"
                    : answers[current.id] === c.id
                      ? "incorrect"
                      : undefined
                  : undefined;
                return <ChoiceRow
                  key={c.id}
                  letter={c.id}
                  text={c.text}
                  imageData={c.imageData}
                  selected={answers[current.id] === c.id}
                  crossedOut={isCrossedOut(current.id, c.id)}
                  eliminatorMode={eliminatorMode}
                  onSelect={() => selectAnswer(current.id, c.id)}
                  onToggleCrossOut={() => toggleCrossOut(current.id, c.id)}
                  feedback={feedback}
                  disabled={!!checked}
                />;
              })}
            </div>
          )}

          {current.questionType === "spr" && (
            <div className="max-w-[300px]">
              <input
                type="text"
                value={answers[current.id] ?? ""}
                onChange={(e) => selectAnswer(current.id, e.target.value)}
                disabled={!!checkedAnswers[current.id]}
                aria-label="Your answer"
                className="w-[176px] h-[44px] px-3 rounded-[4px] border border-[#1e1e1e] focus:border-[#324dc7] focus:shadow-[inset_0_0_0_1px_#324dc7] outline-none text-[18px] bg-white text-[#1e1e1e]"
              />
              <p className="mt-3 text-[13px] text-[#1e1e1e] flex items-baseline gap-2">
                Answer Preview:
                <span className="text-[17px] min-h-[24px]">
                  <MathText text={answers[current.id] ?? ""} mathOnly />
                </span>
              </p>
            </div>
          )}

          {isBank && checkedAnswers[current.id] && (
            <div
              role="status"
              className={`mt-6 rounded-xl border p-4 ${
                checkedAnswers[current.id].isCorrect
                  ? "border-brand-green bg-brand-green-light"
                  : "border-brand-red bg-brand-red-light"
              }`}
            >
              <p className={`font-bold ${checkedAnswers[current.id].isCorrect ? "text-brand-green" : "text-brand-red"}`}>
                {checkedAnswers[current.id].isCorrect ? "Correct" : "Not quite"}
              </p>
              {!checkedAnswers[current.id].isCorrect && (
                <p className="text-sm text-brand-navy mt-1">
                  Correct answer: <strong>{checkedAnswers[current.id].correctAnswer}</strong>
                </p>
              )}
              <div className="mt-3 text-sm leading-relaxed text-brand-navy">
                <p className="font-semibold mb-1">Explanation</p>
                <MathText text={checkedAnswers[current.id].explanation || checkedAnswers[current.id].rationale || "An explanation is not available yet."} />
              </div>
            </div>
          )}
          {isBank && checkError && <p role="alert" className="mt-4 text-sm font-medium text-brand-red">{checkError}</p>}
          </div>
            </div>
          </div>
        </main>
      </div>

      {/* ---------------- Personal vocabulary capture ---------------- */}
      {wordModalOpen && testMode !== "exam" && (
        <div role="dialog" aria-modal="true" aria-labelledby="new-word-title" className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/30 px-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="new-word-title" className="text-lg font-bold text-brand-navy">Save a new word</h2>
                <p className="mt-1 text-xs leading-5 text-brand-slate">From question {index + 1}. Its source and context will be saved automatically.</p>
              </div>
              <button onClick={() => setWordModalOpen(false)} aria-label="Close new word window" className="rounded p-1 text-brand-slate hover:bg-slate-100"><CloseIcon /></button>
            </div>

            {wordSaved ? <div>
              <div role="status" className="rounded-lg border border-brand-green bg-brand-green-light p-4 text-sm text-brand-green"><strong>{newWord}</strong> was saved to My Vocabulary.</div>
              <p className="mt-3 text-xs leading-5 text-brand-slate">You can continue the question now and add or improve the definition later.</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button onClick={() => setWordModalOpen(false)} className="btn-secondary text-xs">Continue test</button>
                <button onClick={() => { saveProgressToStorage(); window.location.href = "/vocabulary"; }} className="btn-primary text-xs">Open My Vocabulary</button>
              </div>
            </div> : <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-brand-navy">Word or phrase</span>
                <input autoFocus value={newWord} onChange={(event) => setNewWord(event.target.value)} maxLength={120} placeholder="Paste or type the unfamiliar word" className="w-full rounded-lg border border-brand-border bg-white px-3 py-2.5 text-sm text-brand-navy" />
                <span className="mt-1 block text-right text-[10px] text-brand-slate">{newWord.length}/120</span>
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-semibold text-brand-navy">Definition <span className="font-normal text-brand-slate">(optional)</span></span>
                <textarea value={newWordDefinition} onChange={(event) => setNewWordDefinition(event.target.value)} maxLength={2000} rows={4} placeholder="Add the meaning now, or leave this blank and return later." className="w-full resize-y rounded-lg border border-brand-border bg-white px-3 py-2.5 text-sm leading-6 text-brand-navy" />
                <span className="mt-1 block text-right text-[10px] text-brand-slate">{newWordDefinition.length}/2000</span>
              </label>
              {wordSaveError && <p role="alert" className="mt-3 text-xs text-brand-red">{wordSaveError}</p>}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button onClick={() => setWordModalOpen(false)} disabled={wordSaving} className="btn-secondary text-xs">Cancel</button>
                <button onClick={saveNewWord} disabled={wordSaving || !newWord.trim()} className="btn-primary text-xs">{wordSaving ? "Saving…" : newWordDefinition.trim() ? "Save word" : "Save for later"}</button>
              </div>
            </>}
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
                      <div className={`text-sm text-brand-navy leading-relaxed ${!isMath ? "bluebook-serif" : ""}`}>
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

      {/* ---------------- Question navigator — Bluebook's popover above the
          "Question N of N" button: title, legend, numbered grid, and a link
          to the review page ---------------- */}
      {navigatorOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setNavigatorOpen(false)}>
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-[82px] w-[600px] max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-[0_6px_28px_rgba(0,0,0,0.3)] border border-[#d9d9d9] px-6 pt-5 pb-6 max-h-[calc(100vh-130px)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative text-center">
              <h3 className="text-[19px] font-bold text-[#1e1e1e] leading-snug px-8">{examTitle} Questions</h3>
              <button
                onClick={() => setNavigatorOpen(false)}
                className="absolute right-0 top-0 text-[#1e1e1e] hover:bg-[#f0f0f0] rounded p-1"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="my-4 border-t border-[#1e1e1e]" />
            <NavigatorLegend />
            <div className="my-4 border-t border-[#1e1e1e]" />
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-x-3 gap-y-7 px-1 pt-3">
              {questions.map((q, i) => (
                <QuestionTile
                  key={q.id}
                  number={i + 1}
                  answered={!!answers[q.id]}
                  marked={!!marked[q.id]}
                  current={i === index}
                  onClick={() => {
                    if (isBank && !checkedAnswers[current.id]) {
                      setNavigatorOpen(false);
                      setCheckError("Check this answer before moving to another question.");
                      return;
                    }
                    setIndex(i);
                    setCheckError(null);
                    setNavigatorOpen(false);
                  }}
                />
              ))}
            </div>
            {!isBank && <div className="mt-8 flex justify-center">
              <button
                onClick={() => {
                  setNavigatorOpen(false);
                  setModuleReviewOpen(true);
                }}
                className="bb-btn-outline"
              >
                Go to Review Page
              </button>
            </div>}
            <span className="absolute left-1/2 -translate-x-1/2 -bottom-[9px] w-4 h-4 bg-white border-r border-b border-[#d9d9d9] rotate-45" />
          </div>
        </div>
      )}

      {/* ---------------- Module review — a genuine full-screen takeover, not
          a small popup card floating over the exam. No dimmed backdrop, no
          card border/shadow — it replaces the whole viewport like a real
          page would, matching Bluebook's actual end-of-module screen. */}
      {/* ---------------- Review page — Bluebook's "Check Your Work" screen:
          same header, a card with the numbered grid, Back / Submit below. */}
      {moduleReviewOpen && (
        <div className="bluebook fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <header className="px-4 sm:px-6 pt-3 pb-2 grid grid-cols-[1fr_auto_1fr] items-start shrink-0">
            <div className="min-w-0">
              <p className="text-[19px] sm:text-[20px] text-[#1e1e1e] truncate leading-tight">{examTitle}</p>
              <span className="block text-[14px] text-[#1e1e1e] mt-1">Review</span>
            </div>
            <div className="flex flex-col items-center justify-self-center pt-0.5">
              <span
                className={`h-[30px] flex items-center text-[22px] font-medium tabular-nums leading-none ${
                  secondsLeft > 0 && secondsLeft <= 300 ? "text-[#c13515]" : "text-[#1e1e1e]"
                }`}
              >
                {testMode === "untimed" ? "Untimed" : timerHidden ? <StopwatchIcon size={22} /> : timeStr}
              </span>
            </div>
            <button onClick={() => { setModuleReviewOpen(false); pauseTest(); }} className="text-sm font-semibold text-blue-700">Pause / save</button>
          </header>
          <div className="dash-line shrink-0" />

          <div className="flex-1 overflow-y-auto px-4 py-10">
            <div className="w-full max-w-3xl mx-auto text-center">
              <h2 className="text-[28px] sm:text-[32px] text-[#1e1e1e] mb-3 leading-tight">Check Your Work</h2>
              <p className="text-[15px] text-[#1e1e1e] mb-8 max-w-xl mx-auto">
                On this page, you can review your work before you submit. Click a question number to go back to it.
                Unanswered questions count as incorrect.
              </p>

              <div className="border border-[#1e1e1e] rounded-lg bg-white px-5 sm:px-10 pt-6 pb-8 mb-8">
                <h3 className="text-[18px] font-bold text-[#1e1e1e] mb-4">{examTitle} Questions</h3>
                <div className="border-y border-[#1e1e1e] py-3 mb-8">
                  <NavigatorLegend />
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-x-4 gap-y-9 pt-3">
                  {questions.map((q, i) => (
                    <QuestionTile
                      key={q.id}
                      number={i + 1}
                      answered={!!answers[q.id]}
                      marked={!!marked[q.id]}
                      current={i === index}
                      size={44}
                      onClick={() => {
                        setIndex(i);
                        setModuleReviewOpen(false);
                      }}
                    />
                  ))}
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

            </div>
          </div>

          <div className="dash-line shrink-0" />
          <footer className="shrink-0 bg-white h-[64px] flex items-center px-4 sm:px-6">
            <span className="text-[14px] font-medium text-[#1e1e1e] flex-1 truncate">{userName ?? "Guest"}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setModuleReviewOpen(false)} className="bb-btn-primary">
                Back
              </button>
              <button
                onClick={() => {
                  setModuleReviewOpen(false);
                  handleSubmit();
                }}
                disabled={submitting}
                className="bb-btn-primary"
              >
                {submitting ? "Submitting…" : isBank ? "Submit Set" : fullExam ? "Finish module & continue" : "Submit Module"}
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* ---------------- Bottom bar — student name, the black "Question N of N"
          navigator button, and Bluebook's blue Back / Next pills ---------------- */}
      <div className="dash-line shrink-0 relative z-10" />
      <footer className="shrink-0 bg-white h-[64px] flex items-center px-4 sm:px-6 relative z-10">
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="text-[14px] font-medium text-[#1e1e1e] truncate">{userName ?? "Guest"}</span>

          <button
            onClick={() => setNavigatorOpen((v) => !v)}
            className="justify-self-center flex items-center gap-2 text-[15px] font-bold text-white bg-[#1e1e1e] pl-4 pr-3 h-[40px] rounded-md hover:bg-black whitespace-nowrap"
          >
            Question {index + 1} of {questions.length}
            {navigatorOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </button>

          <div className="justify-self-end flex items-center gap-3">
            {index > 0 && (
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} className="bb-btn-primary">
                Back
              </button>
            )}
            {isBank ? (
              checkedAnswers[current.id] ? (
                index < questions.length - 1 ? (
                  <button onClick={() => { setIndex((i) => i + 1); setCheckError(null); }} className="bb-btn-primary">
                    Next Question
                  </button>
                ) : Object.keys(checkedAnswers).length < questions.length ? (
                  <button
                    onClick={() => {
                      const next = questions.findIndex((question) => !checkedAnswers[question.id]);
                      if (next >= 0) setIndex(next);
                    }}
                    className="bb-btn-primary"
                  >
                    Next Unchecked
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={submitting} className="bb-btn-primary">
                    {submitting ? "Finishing…" : "Finish Session"}
                  </button>
                )
              ) : (
                <button onClick={handleCheckAnswer} disabled={checkingAnswer || !answers[current.id]?.trim()} className="bb-btn-primary disabled:opacity-50">
                  {checkingAnswer ? "Checking…" : "Check Answer"}
                </button>
              )
            ) : index < questions.length - 1 ? (
              <button onClick={() => setIndex((i) => i + 1)} className="bb-btn-primary">
                Next
              </button>
            ) : (
              <button onClick={() => setModuleReviewOpen(true)} className="bb-btn-primary">
                Next
              </button>
            )}
          </div>
        </div>
      </footer>

      {isMath && <DesmosCalculator open={calcOpen} onOpenChange={setCalcOpen} />}
    </div>
  );
}
