"use client";

import { useEffect, useRef, useState } from "react";
import { MathText } from "@/components/MathText";

/**
 * Inline "manage this module's questions" panel — mounted directly inside
 * the Mocks page under a module row, admin-only. Lets an admin see what's
 * banked, paste raw SAT text and have AI structure it into draft questions,
 * review/edit each draft (including an optional Ctrl+V/upload passage
 * image), and save — all without ever navigating to a separate /admin page.
 *
 * All writes go through the existing admin-gated API routes
 * (/api/admin/questions, /api/admin/questions/[id], /api/admin/questions/
 * extract) — the same server-side requireAdmin() check used everywhere
 * else in the app, so this is real authorization, not just a hidden button.
 */

interface Choice {
  id: string;
  text: string;
}
interface ExistingQuestion {
  id: string;
  question_text: string;
  passage_text: string | null;
  image_data: string | null;
  choices: string;
  correct_answer: string;
  question_type: string;
  skill: string;
  difficulty: string;
  domain: string;
  rationale: string;
  explanation: string;
}
interface Draft {
  localId: string;
  savedId?: string; // set once this draft has been saved — lets "Save" become "Update"
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  passageText: string;
  imageData: string | null;
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
}

function blankDraft(): Draft {
  return {
    localId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    domain: "",
    skill: "",
    difficulty: "Medium",
    passageText: "",
    imageData: null,
    questionText: "",
    choices: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ],
    correctAnswer: "",
    questionType: "multiple_choice",
    rationale: "",
    explanation: "",
  };
}

export function MockQuestionsInline({
  mockId,
  section,
  module,
  onCountChange,
}: {
  mockId: string;
  section: "Math" | "Reading and Writing";
  module: 1 | 2;
  onCountChange?: (delta: number) => void;
}) {
  const [existing, setExisting] = useState<ExistingQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [structuring, setStructuring] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Synchronous guards against double-submit — React state updates
  // (setSavingId/setSavingAll) aren't applied until the next render, so a
  // fast double-click can fire this function a second time before the
  // button visually disables, POSTing the same question(s) twice. A plain
  // ref is checked and set immediately, before any async work, so the
  // second call bails out for real. This is what actually caused the
  // August 2024 R&W Module 2 duplicate-import incident.
  const savingRef = useRef<Set<string>>(new Set());
  const savingAllRef = useRef(false);

  function load() {
    fetch(`/api/admin/questions?mockId=${mockId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const rows: ExistingQuestion[] = (data.questions ?? []).filter(
          (q: any) => q.section === section && q.module === module
        );
        setExisting(rows);
      })
      .catch(() => setLoadError("Couldn't load questions for this module."));
  }
  useEffect(load, [mockId, section, module]);

  async function structureWithAI() {
    if (!pasteText.trim()) return;
    setStructuring(true);
    setStructureError(null);
    try {
      const res = await fetch("/api/admin/questions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI couldn't structure that text");
      if (!data.questions?.length) throw new Error("AI didn't find any questions in that text");
      const newDrafts: Draft[] = data.questions.map((q: any) => ({
        localId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        domain: q.domain ?? "",
        skill: q.skill ?? "",
        difficulty: q.difficulty ?? "Medium",
        passageText: q.passageText ?? "",
        imageData: null,
        questionText: q.questionText ?? "",
        choices: q.choices?.length ? q.choices : blankDraft().choices,
        correctAnswer: q.correctAnswer ?? "", // "" = Not selected, matches spec: never invent it
        questionType: q.questionType ?? "multiple_choice",
        rationale: q.rationale ?? "",
        explanation: q.explanation ?? "",
      }));
      setDrafts((prev) => [...prev, ...newDrafts]);
      setPasteText("");
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : "AI couldn't structure that text");
    } finally {
      setStructuring(false);
    }
  }

  function addManualDraft() {
    setDrafts((prev) => [...prev, blankDraft()]);
  }
  function updateDraft(localId: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  }
  function discardDraft(localId: string) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }

  async function saveDraft(draft: Draft) {
    if (!draft.questionText.trim()) return;
    if (savingRef.current.has(draft.localId)) return; // already in flight — ignore the duplicate call
    savingRef.current.add(draft.localId);
    setSavingId(draft.localId);
    try {
      const payload = {
        mockId,
        section,
        module,
        domain: draft.domain || "Uncategorized",
        skill: draft.skill || "Uncategorized",
        difficulty: draft.difficulty,
        passageText: draft.passageText.trim() || null,
        imageData: draft.imageData,
        questionText: draft.questionText.trim(),
        choices: draft.questionType === "multiple_choice" ? draft.choices : [],
        correctAnswer: draft.correctAnswer || (draft.questionType === "spr" ? draft.correctAnswer : "A"),
        questionType: draft.questionType,
        rationale: draft.rationale.trim() || "—",
        explanation: draft.explanation.trim() || "—",
      };

      // Auto-classify domain/skill if AI didn't confidently set one (e.g. a
      // manually-added draft) — same convenience the standalone admin form
      // already has, so nobody has to know the taxonomy by hand here either.
      if (!draft.domain || !draft.skill) {
        try {
          const cRes = await fetch("/api/admin/questions/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ section, questionText: payload.questionText, passageText: payload.passageText ?? undefined }),
          });
          if (cRes.ok) {
            const c = await cRes.json();
            payload.domain = c.domain;
            payload.skill = c.skill;
            payload.difficulty = c.difficulty;
          }
        } catch {
          // keep the "Uncategorized" fallback above — never block saving on this
        }
      }

      const res = draft.savedId
        ? await fetch(`/api/admin/questions/${draft.savedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      if (!draft.savedId) {
        updateDraft(draft.localId, { savedId: data.id });
        onCountChange?.(1);
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      savingRef.current.delete(draft.localId);
      setSavingId(null);
    }
  }

  async function saveAllDrafts() {
    if (savingAllRef.current) return;
    savingAllRef.current = true;
    setSavingAll(true);
    try {
      for (const d of drafts) {
        if (!d.savedId) await saveDraft(d);
      }
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  }

  async function deleteExisting(id: string) {
    if (!confirm("Delete this question? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      onCountChange?.(-1);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  function editExisting(q: ExistingQuestion) {
    const choices: Choice[] = q.choices ? JSON.parse(q.choices) : blankDraft().choices;
    setDrafts((prev) => [
      ...prev,
      {
        localId: `edit_${q.id}`,
        savedId: q.id,
        domain: q.domain,
        skill: q.skill,
        difficulty: q.difficulty as Draft["difficulty"],
        passageText: q.passage_text ?? "",
        imageData: q.image_data ?? null,
        questionText: q.question_text,
        choices: choices.length ? choices : blankDraft().choices,
        correctAnswer: q.correct_answer,
        questionType: q.question_type as Draft["questionType"],
        rationale: q.rationale,
        explanation: q.explanation,
      },
    ]);
  }

  return (
    <div className="mt-2 border border-brand-border rounded-xl bg-slate-50/60 p-4 space-y-4">
      {/* Existing questions in this exact module */}
      <div>
        <p className="text-xs font-semibold text-brand-navy uppercase tracking-wide mb-2">
          Banked questions {existing ? `(${existing.length})` : ""}
        </p>
        {loadError && <p className="text-xs text-brand-red">{loadError}</p>}
        {existing && existing.length === 0 && <p className="text-xs text-brand-slate">Nothing added yet.</p>}
        <div className="space-y-1.5">
          {existing?.map((q, i) => (
            <div key={q.id} className="flex items-center justify-between gap-2 bg-white border border-brand-border rounded-lg px-3 py-2">
              <span className="text-xs text-brand-navy truncate flex-1">
                {i + 1}. {q.question_text}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => editExisting(q)} className="text-xs text-brand-blue font-medium px-2 py-1 hover:bg-brand-blue-light rounded">
                  Edit
                </button>
                <button
                  onClick={() => deleteExisting(q.id)}
                  disabled={deletingId === q.id}
                  className="text-xs text-brand-red font-medium px-2 py-1 hover:bg-brand-red-light rounded"
                >
                  {deletingId === q.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Paste + Structure with AI */}
      <div>
        <p className="text-xs font-semibold text-brand-navy uppercase tracking-wide mb-2">Add questions</p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste one or multiple SAT questions here — text copied from a PDF, OCR, anything…"
          className="w-full min-h-24 rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={structureWithAI}
            disabled={structuring || !pasteText.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {structuring ? "Structuring…" : "✨ Structure with AI"}
          </button>
          <button onClick={addManualDraft} className="text-xs text-brand-blue font-medium underline">
            or add one manually
          </button>
        </div>
        {structureError && <p className="text-xs text-brand-red mt-2">{structureError}</p>}
      </div>

      {/* Review drafts */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-brand-navy uppercase tracking-wide">
              {drafts.filter((d) => !d.savedId).length > 0 ? `AI found / added ${drafts.length} question(s)` : "Editing"}
            </p>
            {drafts.some((d) => !d.savedId) && (
              <button onClick={saveAllDrafts} disabled={savingAll} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50">
                {savingAll ? "Saving…" : "Save All Questions"}
              </button>
            )}
          </div>
          {drafts.map((draft, i) => (
            <DraftEditor
              key={draft.localId}
              index={i}
              draft={draft}
              saving={savingId === draft.localId}
              onChange={(patch) => updateDraft(draft.localId, patch)}
              onSave={() => saveDraft(draft)}
              onDiscard={() => discardDraft(draft.localId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Per-question two-column review editor \u2014 matches the real solving layout */
/* ---------------------------------------------------------------------- */

function DraftEditor({
  index,
  draft,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  index: number;
  draft: Draft;
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="border border-brand-border rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-brand-border">
        <span className="text-xs font-semibold text-brand-navy">
          Question {index + 1} {draft.savedId && <span className="text-brand-green">· saved</span>}
        </span>
        <button onClick={onDiscard} className="text-xs text-brand-red">
          Discard
        </button>
      </div>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-brand-border">
        {/* LEFT: optional passage image + passage text */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-brand-slate uppercase tracking-wide">Passage</p>
          <PassageImageField imageData={draft.imageData} onChange={(imageData) => onChange({ imageData })} />
          <textarea
            value={draft.passageText}
            onChange={(e) => onChange({ passageText: e.target.value })}
            placeholder="Paste / edit passage text… (optional — leave blank for a bare math question)"
            className="w-full min-h-32 rounded-lg border border-brand-border px-3 py-2 text-sm"
          />
          {draft.passageText && (
            <div className="text-xs text-brand-slate bg-slate-50 rounded-lg p-2">
              <MathText text={draft.passageText} />
            </div>
          )}
        </div>

        {/* RIGHT: question, choices, correct answer, explanation */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-brand-slate uppercase tracking-wide">Question</p>
          <textarea
            value={draft.questionText}
            onChange={(e) => onChange({ questionText: e.target.value })}
            placeholder="Question text — use $...$ for inline math, $$...$$ for block math"
            className="w-full min-h-20 rounded-lg border border-brand-border px-3 py-2 text-sm"
          />

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={draft.questionType === "multiple_choice"}
                onChange={() => onChange({ questionType: "multiple_choice" })}
              />
              Multiple choice
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={draft.questionType === "spr"} onChange={() => onChange({ questionType: "spr" })} />
              Student-produced response
            </label>
          </div>

          {draft.questionType === "multiple_choice" ? (
            <div className="space-y-2">
              {draft.choices.map((c, ci) => (
                <div key={c.id} className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 shrink-0" title="Mark as correct answer">
                    <input
                      type="radio"
                      name={`correct-${draft.localId}`}
                      checked={draft.correctAnswer === c.id}
                      onChange={() => onChange({ correctAnswer: c.id })}
                    />
                    <span className="w-5 h-5 rounded-full border border-brand-border flex items-center justify-center text-[10px] font-bold">
                      {c.id}
                    </span>
                  </label>
                  <input
                    value={c.text}
                    onChange={(e) => {
                      const choices = [...draft.choices];
                      choices[ci] = { ...c, text: e.target.value };
                      onChange({ choices });
                    }}
                    placeholder={`Answer ${c.id}`}
                    className="flex-1 rounded-lg border border-brand-border px-3 py-1.5 text-sm"
                  />
                </div>
              ))}
              <p className={`text-xs ${draft.correctAnswer ? "text-brand-green" : "text-brand-amber"}`}>
                Correct Answer: {draft.correctAnswer || "Not selected"}
              </p>
            </div>
          ) : (
            <input
              value={draft.correctAnswer}
              onChange={(e) => onChange({ correctAnswer: e.target.value })}
              placeholder="Correct numeric answer"
              className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
            />
          )}

          <textarea
            value={draft.explanation}
            onChange={(e) => onChange({ explanation: e.target.value })}
            placeholder="Explanation (optional — shown to students after they answer)"
            className="w-full min-h-16 rounded-lg border border-brand-border px-3 py-2 text-sm"
          />

          <button
            onClick={onSave}
            disabled={saving || !draft.questionText.trim()}
            className="btn-primary text-sm w-full disabled:opacity-50"
          >
            {saving ? "Saving…" : draft.savedId ? "Update Question" : "Save Question"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Passage image \u2014 the ONLY image field anywhere in the question editor.  */
/* Supports Ctrl+V paste (focus the box, paste a screenshot/clipboard      */
/* image) and a plain file upload, with preview + Replace + Remove.       */
/* ---------------------------------------------------------------------- */

function PassageImageField({ imageData, onChange }: { imageData: string | null; onChange: (data: string | null) => void }) {
  const dropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteFocused, setPasteFocused] = useState(false);

  function readFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) readFile(file);
  }

  if (imageData) {
    return (
      <div className="space-y-2">
        <img src={imageData} alt="" className="max-w-full rounded-lg border border-brand-border" />
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="text-xs text-brand-blue font-medium">
            Replace Image
          </button>
          <button onClick={() => onChange(null)} className="text-xs text-brand-red font-medium">
            Remove Image
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <div
      ref={dropRef}
      tabIndex={0}
      onPaste={handlePaste}
      onFocus={() => setPasteFocused(true)}
      onBlur={() => setPasteFocused(false)}
      className={`rounded-lg border-2 border-dashed p-4 text-center outline-none transition-colors ${
        pasteFocused ? "border-brand-blue bg-brand-blue-light" : "border-brand-border bg-slate-50"
      }`}
    >
      <p className="text-xs text-brand-slate mb-1">Passage image (optional) — for a graph, chart, table, or diagram</p>
      <p className="text-xs font-semibold text-brand-navy">Click here, then press Ctrl+V to paste</p>
      <p className="text-xs text-brand-slate my-1">or</p>
      <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs px-3 py-1.5">
        Upload Image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
    </div>
  );
}
