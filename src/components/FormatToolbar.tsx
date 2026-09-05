"use client";

import { RefObject } from "react";
import { flushSync } from "react-dom";

/** Wraps the current text-selection in `before`/`after` markers. If nothing
 * is selected, inserts real placeholder text (not empty markers) and
 * selects it — matching how Google Docs/GitHub's markdown toolbar behave.
 * This matters: empty markers left the cursor sitting in an invisible gap,
 * so clicking another button right after nested a second empty pair inside
 * the first, and a few clicks in a row produced degenerate runs like
 * "$$$$$$" that the renderer misparsed as block math swallowing everything
 * inside it. Always-real content means every click produces a complete,
 * self-contained pair, so stacking clicks can't cascade into that. */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (next: string) => void,
  before: string,
  after: string,
  placeholder: string
) {
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const hasSelection = end > start;
  const selected = hasSelection ? value.slice(start, end) : placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);

  // flushSync forces the state update (and the textarea's DOM re-render
  // with the new, longer value) to complete SYNCHRONOUSLY before the next
  // line runs. Without this, setSelectionRange below could fire before
  // React has actually painted the new value — the browser would then
  // clamp the selection to the OLD (shorter) text length, silently
  // landing the cursor in the wrong place.
  flushSync(() => onChange(next));

  textarea.focus();
  textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
}

/** Small formatting toolbar for passage/question textareas — inserts the
 * exact *italic* / __underline__ / [bracket] / $math$ markup MathText
 * renders, so admins don't need to remember or hand-type the syntax. Wrap
 * a selection to format it, or click with nothing selected to drop in
 * placeholder text you can immediately type over. */
export function FormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function apply(before: string, after: string, placeholder: string) {
    const el = textareaRef.current;
    if (!el) return;
    wrapSelection(el, value, onChange, before, after, placeholder);
  }

  const buttonClass =
    "px-2.5 py-1 rounded-md text-xs font-semibold text-brand-navy border border-brand-border bg-white hover:bg-slate-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-t-lg border border-b-0 border-brand-border bg-slate-50">
      <button
        type="button"
        onClick={() => apply("*", "*", "italic text")}
        title="Italic (book/publication titles)"
        className={`${buttonClass} italic`}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => apply("__", "__", "underlined text")}
        title="Underline (the exact SAT underlined-portion convention)"
        className={`${buttonClass} underline`}
      >
        U
      </button>
      <button
        type="button"
        onClick={() => apply("[", "]", "bracketed text")}
        title="Bracketed editorial insertion, e.g. [a British newspaper]"
        className={buttonClass}
      >
        [ ]
      </button>
      <span className="w-px h-4 bg-brand-border mx-0.5" />
      <button type="button" onClick={() => apply("$", "$", "x")} title="Inline math, e.g. $x^2$" className={buttonClass}>
        $x$
      </button>
      <button
        type="button"
        onClick={() => apply("$$", "$$", "x^2 + 3x = 0")}
        title="Block math (own line), e.g. $$x^2 + 3x = 0$$"
        className={buttonClass}
      >
        $$x$$
      </button>
    </div>
  );
}
