"use client";

import { useRef, useState } from "react";
import { MathText } from "@/components/MathText";

type Section = "Math" | "Reading and Writing";

interface Draft {
  id: string;
  include: boolean;
  raw: string;
  error: string | null;
}

/**
 * "Paste raw text (questions + answer key, copied from anywhere), AI
 * structures it into draft questions automatically" — the AI-assisted
 * import flow, wrapped as a standalone modal so it can open directly from
 * the empty-module admin screen. Styled to match the rest of the modern
 * admin UI (white cards, brand-* tokens) rather than the old gray inline
 * panel this replaces. Nothing saves until drafts are reviewed and
 * "Import approved" is pressed — same review-before-commit guarantee as
 * every other AI import path in the app.
 */
export function AdminAiPasteModal({
  mockId,
  section,
  module,
  onClose,
  onImported,
}: {
  mockId: string;
  section: Section;
  module: 1 | 2;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importOk, setImportOk] = useState<string | null>(null);
  // Synchronous guard — setImporting(true) is a React state update and
  // isn't visible until the next render, so a fast double-click on
  // "Import" can fire importApproved() twice before the button disables,
  // POSTing the whole batch twice. A plain ref is checked/set immediately.
  const importingRef = useRef(false);

  async function extract() {
    if (!text.trim()) return;
    setExtracting(true);
    setExtractError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/admin/questions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      if (data.batchCount) {
        setProgress(`Processed ${data.batchCount} batch(es) — found ${data.questions?.length ?? 0} question(s).`);
      }
      if (!data.questions?.length) {
        setExtractError("No questions were found in that text.");
        return;
      }
      setDrafts(
        data.questions.map((q: unknown, i: number) => ({
          id: `draft_${Date.now()}_${i}`,
          include: true,
          raw: JSON.stringify({ ...(q as object), mockId, section, module }, null, 2),
          error: null,
        }))
      );
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function toggleInclude(id: string) {
    setDrafts((prev) => prev?.map((d) => (d.id === id ? { ...d, include: !d.include } : d)) ?? null);
  }
  function updateRaw(id: string, raw: string) {
    setDrafts((prev) => prev?.map((d) => (d.id === id ? { ...d, raw, error: null } : d)) ?? null);
  }
  function toggleCorrectAnswer(id: string, choiceId: string) {
    setDrafts(
      (prev) =>
        prev?.map((d) => {
          if (d.id !== id) return d;
          try {
            const parsed = JSON.parse(d.raw);
            const accepted: string[] = typeof parsed.correctAnswer === "string"
              ? parsed.correctAnswer.split(",").map((s: string) => s.trim()).filter(Boolean)
              : [];
            const next = accepted.includes(choiceId) ? accepted.filter((id2) => id2 !== choiceId) : [...accepted, choiceId];
            parsed.correctAnswer = next.join(",");
            return { ...d, raw: JSON.stringify(parsed, null, 2), error: null };
          } catch {
            return d;
          }
        }) ?? null
    );
  }
  // Generic "fix one field inline" helper — used for question text right
  // now, but written to take any field name so other missing pieces (a
  // passage, an explanation) can reuse the same pattern later without
  // needing a new function per field.
  function setDraftField(id: string, field: string, value: string) {
    setDrafts(
      (prev) =>
        prev?.map((d) => {
          if (d.id !== id) return d;
          try {
            const parsed = JSON.parse(d.raw);
            parsed[field] = value;
            return { ...d, raw: JSON.stringify(parsed, null, 2), error: null };
          } catch {
            return d;
          }
        }) ?? null
    );
  }
  function removeDraft(id: string) {
    setDrafts((prev) => prev?.filter((d) => d.id !== id) ?? null);
  }

  async function importApproved() {
    if (!drafts) return;
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setExtractError(null);
    setImportOk(null);
    // Tracks which draft each submitted item came from, by array position
    // — the server reports failures back by index into exactly this same
    // array, so this is how a partial failure maps back to "which specific
    // draft still needs fixing" instead of an opaque "question 5 of 12"
    // that means nothing once some drafts were already unchecked/removed.
    const toImport: { draftId: string; data: Record<string, unknown> }[] = [];
    let hadParseError = false;
    let missingAnswerCount = 0;
    const validated = drafts.map((d) => {
    if (!d.include) return d;
    try {
    const parsed = JSON.parse(d.raw);
    if (typeof parsed.questionText !== "string" || !parsed.questionText.trim()) {
          return { ...d, error: "Missing question text — fix the raw JSON or uncheck this draft." };
        }
        const isSpr = parsed.questionType === "spr";
        const acceptedIds = typeof parsed.correctAnswer === "string"
          ? parsed.correctAnswer.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
        const hasAnswer = isSpr
          ? acceptedIds.length > 0
          : acceptedIds.length > 0 && Array.isArray(parsed.choices) && acceptedIds.every((id: string) => parsed.choices.some((c: { id: string }) => c.id === id));
        // A missing correct answer no longer blocks import — it imports
        // with correctAnswer left blank so the question exists in the bank
        // and can be fixed later via Edit, instead of holding up every
        // other draft in the same batch that DID come through clean.
        if (!hasAnswer) {
          missingAnswerCount++;
          parsed.correctAnswer = "";
        }
        toImport.push({ draftId: d.id, data: parsed });
        return { ...d, error: hasAnswer ? null : "Imported without a correct answer — set it via Edit." };
      } catch {
        hadParseError = true;
        return { ...d, error: "Invalid JSON — fix or uncheck this draft." };
      }
    });
    setDrafts(validated);
    if (hadParseError) {
      setExtractError("Some approved drafts have invalid JSON — fix the highlighted ones or uncheck them.");
      importingRef.current = false;
      setImporting(false);
      return;
    }
    if (toImport.length === 0) {
      setExtractError("Check at least one draft to import.");
      importingRef.current = false;
      setImporting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: toImport.map((t) => t.data) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      const itemErrors: { index: number; message: string }[] = data.itemErrors ?? [];
      const failedDraftIds = new Set(itemErrors.map((e) => toImport[e.index]?.draftId).filter(Boolean));
      const errorByDraftId = new Map(
        itemErrors
          .map((e): [string, string] | null => {
            const draftId = toImport[e.index]?.draftId;
            return draftId ? [draftId, e.message] : null;
          })
          .filter((entry): entry is [string, string] => entry !== null)
      );

      const answerNote =
        missingAnswerCount > 0
          ? ` ${missingAnswerCount} of the imported ones still need a correct answer set — find them via Edit.`
          : "";

      if (failedDraftIds.size === 0) {
        // Everything approved actually imported — close out normally.
        setImportOk(`Imported ${data.count} question(s).${answerNote}`);
        setTimeout(() => onImported(), 700);
      } else {
        // Partial success: remove the ones that imported fine, keep the
        // failed ones visible with their specific error so they can be
        // fixed and re-submitted without re-doing the whole batch. Do NOT
        // close the modal — there's still work to review here.
        setDrafts((prev) =>
          (prev ?? [])
            .filter((d) => !d.include || failedDraftIds.has(d.id))
            .map((d) => (failedDraftIds.has(d.id) ? { ...d, error: errorByDraftId.get(d.id) ?? "Import failed" } : d))
        );
        setImportOk(
          `Imported ${data.count} question(s).${answerNote} ${failedDraftIds.size} failed — fix the highlighted draft(s) below and import again.`
        );
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-brand-navy/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy">Paste & structure with AI</h2>
          <button onClick={onClose} className="text-brand-slate hover:text-brand-navy text-sm">
            Close
          </button>
        </div>
        <p className="text-sm text-brand-slate">
          Paste one or more questions — text, choices, and an answer key if you have one, copied from anywhere.
          AI splits it into structured questions and matches your answers automatically. Nothing saves until you
          review and approve below.
        </p>

        {!drafts && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste questions, choices, and an answer key here…"
              className="w-full min-h-40 rounded-lg border border-brand-border px-3 py-2 text-sm"
            />
            <button
              onClick={extract}
              disabled={extracting || !text.trim()}
              className="btn-primary text-sm px-4 disabled:opacity-50"
            >
              {extracting ? "Extracting…" : "✨ Extract with AI"}
            </button>
            {progress && <p className="text-sm text-brand-blue">{progress}</p>}
            {extractError && <p className="text-sm text-brand-red whitespace-pre-line">{extractError}</p>}
          </>
        )}

        {drafts && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-navy">
                {drafts.length} draft{drafts.length === 1 ? "" : "s"} — review before importing
              </p>
              <button
                onClick={importApproved}
                disabled={importing || !drafts.some((d) => d.include)}
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${drafts.filter((d) => d.include).length} approved`}
              </button>
            </div>
            {progress && <p className="text-sm text-brand-blue">{progress}</p>}
            {extractError && <p className="text-sm text-brand-red whitespace-pre-line">{extractError}</p>}
            {importOk && <p className="text-sm text-brand-green">{importOk}</p>}

            {drafts.map((d) => {
              let preview: {
                questionText?: string;
                skill?: string;
                difficulty?: string;
                questionType?: string;
                choices?: { id: string; text: string }[];
                correctAnswer?: string;
              } = {};
              try {
                preview = JSON.parse(d.raw);
              } catch {
                // shown as an error below instead
              }
              const isSpr = preview.questionType === "spr";
              const needsAnswer = !isSpr && (!preview.correctAnswer || !preview.choices?.some((c) => c.id === preview.correctAnswer));
              const missingQuestionText = typeof preview.questionText !== "string" || !preview.questionText.trim();
              return (
                <div
                  key={d.id}
                  className={`border rounded-lg p-3 ${d.include ? "border-brand-border" : "border-brand-border opacity-50"} ${
                    (needsAnswer || missingQuestionText) && d.include ? "border-brand-red" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={d.include} onChange={() => toggleInclude(d.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                        {preview.skill && <span>{preview.skill}</span>}
                        {preview.difficulty && <span>· {preview.difficulty}</span>}
                      </div>
                      {missingQuestionText ? (
                        <div className="mb-2">
                          <p className="text-sm text-brand-red font-medium mb-1.5">
                            ⚠ No question text — the AI didn't extract this one cleanly (often a batch boundary
                            cutting mid-question). Type it in below.
                          </p>
                          <textarea
                            autoFocus
                            placeholder="Type or paste the question text here…"
                            className="w-full rounded-lg border border-brand-red px-3 py-2 text-sm min-h-20"
                            defaultValue=""
                            onBlur={(e) => setDraftField(d.id, "questionText", e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-brand-navy mb-2">
                          <MathText text={preview.questionText!} />
                        </div>
                      )}
                      {!isSpr && preview.choices && preview.choices.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-brand-navy mb-1.5">
                            Correct answer{" "}
                            {needsAnswer ? <span className="text-brand-red font-normal">— not selected</span> : null}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {preview.choices.map((c) => {
                              const isCorrect = preview.correctAnswer === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleCorrectAnswer(d.id, c.id)}
                                  className={`text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs max-w-full ${
                                    isCorrect
                                      ? "border-brand-green bg-brand-green-light text-brand-navy font-semibold"
                                      : "border-brand-border text-brand-slate hover:bg-slate-50"
                                  }`}
                                >
                                  <span
                                    className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                      isCorrect ? "bg-brand-green border-brand-green text-white" : "border-brand-slate text-brand-slate"
                                    }`}
                                  >
                                    {c.id}
                                  </span>
                                  <span className="truncate max-w-[220px]">{c.text || "(empty)"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-brand-blue">Edit raw JSON</summary>
                        <textarea
                          className="mt-2 w-full rounded-lg border border-brand-border px-3 py-2 text-xs font-mono min-h-32"
                          value={d.raw}
                          onChange={(e) => updateRaw(d.id, e.target.value)}
                        />
                      </details>
                      {d.error && <p className="text-xs text-brand-red mt-1">{d.error}</p>}
                    </div>
                    <button onClick={() => removeDraft(d.id)} className="text-xs text-brand-red shrink-0">
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
