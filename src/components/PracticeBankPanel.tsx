"use client";

import { useEffect, useState } from "react";
import { DOMAINS, DIFFICULTIES } from "@/lib/sat-constants";
import { MathText } from "@/components/MathText";

type Section = "Math" | "Reading and Writing";
type Choice = { id: string; text: string };

interface AdminQuestionRow {
  id: string;
  mock_id: string | null;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  module: number;
  module_pool: string | null;
  passage_text: string | null;
  question_text: string;
  choices: string;
  correct_answer: string;
  question_type: string;
  rationale: string;
  explanation: string;
  estimated_time: number;
  source: string;
  review_status: string;
  created_at: string;
}

function defaultQuestionForm() {
  const firstSection: Section = "Reading and Writing";
  const firstDomain = Object.keys(DOMAINS).find((d) => DOMAINS[d].section === firstSection)!;
  return {
    section: firstSection as Section,
    domain: firstDomain,
    skill: DOMAINS[firstDomain].skills[0],
    difficulty: "Medium" as (typeof DIFFICULTIES)[number],
    questionType: "multiple_choice" as "multiple_choice" | "spr",
    passageText: "",
    questionText: "",
    choices: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ] as Choice[],
    correctAnswer: "A",
    rationale: "",
    explanation: "",
    estimatedTime: 75,
  };
}

/**
 * Standalone Practice Question Bank admin — add/edit/delete questions that
 * aren't tied to any specific mock (mock_id IS NULL). These automatically
 * surface in the student-facing Practice section, since practice drills
 * pull from the whole `questions` table regardless of mock_id. Self-
 * contained (own state, doesn't touch AdminDashboard's per-mock state) so
 * it can sit alongside the mocks table without entangling either flow.
 */
export function PracticeBankPanel() {
  const [questions, setQuestions] = useState<AdminQuestionRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [qForm, setQForm] = useState(defaultQuestionForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [aiText, setAiText] = useState("");
  const [aiImage, setAiImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [aiPdf, setAiPdf] = useState<{ base64: string; name: string } | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDrafts, setAiDrafts] = useState<{ id: string; include: boolean; raw: string; error: string | null }[] | null>(
    null
  );
  const [aiImporting, setAiImporting] = useState(false);
  const [aiImportOk, setAiImportOk] = useState<string | null>(null);

  function loadQuestions() {
    setListError(null);
    fetch("/api/admin/questions")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error ?? "Failed to load questions");
        setQuestions(data.questions);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load questions"));
  }

  useEffect(() => {
    if (expanded && questions === null) loadQuestions();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  function domainOptionsForSection(section: Section) {
    return Object.keys(DOMAINS).filter((d) => DOMAINS[d].section === section);
  }

  function updateChoice(index: number, field: keyof Choice, value: string) {
    setQForm((f) => {
      const choices = f.choices.slice();
      choices[index] = { ...choices[index], [field]: value };
      return { ...f, choices };
    });
  }
  function addChoice() {
    setQForm((f) => ({ ...f, choices: [...f.choices, { id: String.fromCharCode(65 + f.choices.length), text: "" }] }));
  }
  function removeChoice(index: number) {
    setQForm((f) => ({ ...f, choices: f.choices.filter((_, i) => i !== index) }));
  }

  function startEdit(q: AdminQuestionRow) {
    setFormError(null);
    setFormOk(null);
    setEditingId(q.id);
    const choices: Choice[] = q.choices ? JSON.parse(q.choices) : [];
    setQForm({
      section: q.section as Section,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty as (typeof DIFFICULTIES)[number],
      questionType: q.question_type as "multiple_choice" | "spr",
      passageText: q.passage_text ?? "",
      questionText: q.question_text,
      choices: choices.length > 0 ? choices : [{ id: "A", text: "" }, { id: "B", text: "" }],
      correctAnswer: q.correct_answer,
      rationale: q.rationale,
      explanation: q.explanation,
      estimatedTime: q.estimated_time,
    });
    document.getElementById("practice-bank-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cancelEdit() {
    setEditingId(null);
    setFormError(null);
    setFormOk(null);
    setQForm(defaultQuestionForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);

    if (!qForm.questionText.trim() || !qForm.rationale.trim() || !qForm.explanation.trim()) {
      setFormError("Question text, rationale, and explanation are all required.");
      return;
    }
    if (qForm.questionType === "multiple_choice" && (qForm.choices.length < 2 || qForm.choices.some((c) => !c.text.trim()))) {
      setFormError("Multiple-choice questions need at least 2 filled-in choices.");
      return;
    }
    if (!qForm.correctAnswer.trim()) {
      setFormError("Correct answer is required.");
      return;
    }

    const payload = {
      mockId: null,
      section: qForm.section,
      domain: qForm.domain,
      skill: qForm.skill,
      difficulty: qForm.difficulty,
      module: 1,
      passageText: qForm.section === "Reading and Writing" ? qForm.passageText.trim() || null : null,
      questionText: qForm.questionText.trim(),
      choices: qForm.questionType === "multiple_choice" ? qForm.choices : [],
      correctAnswer: qForm.correctAnswer.trim(),
      questionType: qForm.questionType,
      rationale: qForm.rationale.trim(),
      explanation: qForm.explanation.trim(),
      estimatedTime: Number(qForm.estimatedTime) || 75,
      source: "Admin",
    };

    setSaving(true);
    try {
      const res = editingId
        ? await fetch(`/api/admin/questions/${editingId}`, {
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
      if (!res.ok) throw new Error(data.error ?? (editingId ? "Failed to save changes" : "Failed to add question"));
      setFormOk(editingId ? "Changes saved." : "Question added to the Practice bank.");
      setEditingId(null);
      setQForm(defaultQuestionForm());
      loadQuestions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete question");
      setQuestions((qs) => (qs ? qs.filter((q) => q.id !== id) : qs));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to delete question");
    } finally {
      setDeletingId(null);
    }
  }

  function handleAiImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAiImage({ base64: result.split(",")[1] ?? "", mimeType: file.type || "image/jpeg", name: file.name });
    };
    reader.readAsDataURL(file);
  }
  function handleAiPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAiPdf({ base64: result.split(",")[1] ?? "", name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function handleExtractWithAI() {
    setAiError(null);
    setAiImportOk(null);
    if (!aiText.trim() && !aiImage && !aiPdf) {
      setAiError("Paste some text, attach a photo, or upload a PDF first.");
      return;
    }
    setAiExtracting(true);
    setAiDrafts(null);

    if (aiPdf) {
      setAiProgress("Reading PDF and extracting questions — this can take a few minutes for large files, don't close the tab…");
      try {
        const res = await fetch("/api/admin/questions/extract-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: aiPdf.base64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "PDF extraction failed");
        if (!data.questions?.length) {
          setAiError("No questions were found in that PDF.");
          return;
        }
        setAiDrafts(
          data.questions.map((q: unknown, i: number) => ({
            id: `draft_${Date.now()}_${i}`,
            include: true,
            raw: JSON.stringify(q, null, 2),
            error: null,
          }))
        );
        setAiProgress(
          `Processed ${data.pagesProcessed} page(s) in ${data.batchCount} batch(es) — found ${data.questions.length} question(s).` +
            (data.batchErrors?.length ? ` ${data.batchErrors.length} batch(es) failed — see below.` : "")
        );
        if (data.batchErrors?.length) setAiError(`Some pages couldn't be processed:\n${data.batchErrors.join("\n")}`);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "PDF extraction failed");
        setAiProgress(null);
      } finally {
        setAiExtracting(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/admin/questions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText.trim() || undefined, imageBase64: aiImage?.base64, imageMimeType: aiImage?.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      if (!data.questions?.length) {
        setAiError("No questions were found in that content.");
        return;
      }
      setAiDrafts(
        data.questions.map((q: unknown, i: number) => ({
          id: `draft_${Date.now()}_${i}`,
          include: true,
          raw: JSON.stringify(q, null, 2),
          error: null,
        }))
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setAiExtracting(false);
    }
  }

  function updateDraftRaw(id: string, raw: string) {
    setAiDrafts((drafts) => drafts?.map((d) => (d.id === id ? { ...d, raw, error: null } : d)) ?? null);
  }
  function setDraftCorrectAnswer(id: string, choiceId: string) {
    setAiDrafts(
      (drafts) =>
        drafts?.map((d) => {
          if (d.id !== id) return d;
          try {
            const parsed = JSON.parse(d.raw);
            parsed.correctAnswer = choiceId;
            return { ...d, raw: JSON.stringify(parsed, null, 2), error: null };
          } catch {
            return d;
          }
        }) ?? null
    );
  }
  function toggleDraftInclude(id: string) {
    setAiDrafts((drafts) => drafts?.map((d) => (d.id === id ? { ...d, include: !d.include } : d)) ?? null);
  }
  function removeDraft(id: string) {
    setAiDrafts((drafts) => drafts?.filter((d) => d.id !== id) ?? null);
  }

  async function handleImportApprovedDrafts() {
    if (!aiDrafts) return;
    setAiError(null);
    setAiImportOk(null);

    const toImport: Record<string, unknown>[] = [];
    let hadParseError = false;
    let hadMissingAnswer = false;
    const validated = aiDrafts.map((d) => {
      if (!d.include) return d;
      try {
        const parsed = JSON.parse(d.raw);
        const isSpr = parsed.questionType === "spr";
        const hasValidAnswer =
          isSpr
            ? typeof parsed.correctAnswer === "string" && parsed.correctAnswer.trim().length > 0
            : typeof parsed.correctAnswer === "string" &&
              Array.isArray(parsed.choices) &&
              parsed.choices.some((c: { id: string }) => c.id === parsed.correctAnswer);
        if (!hasValidAnswer) {
          hadMissingAnswer = true;
          return { ...d, error: "Select a correct answer before importing." };
        }
        toImport.push({ ...parsed, mockId: null });
        return { ...d, error: null };
      } catch {
        hadParseError = true;
        return { ...d, error: "Invalid JSON — fix or uncheck this draft." };
      }
    });
    setAiDrafts(validated);
    if (hadParseError) {
      setAiError("Some approved drafts have invalid JSON — fix the highlighted ones or uncheck them.");
      return;
    }
    if (hadMissingAnswer) {
      setAiError("Some approved drafts are missing a correct answer — pick one for each highlighted draft, or uncheck it.");
      return;
    }
    if (toImport.length === 0) {
      setAiError("Check at least one draft to import.");
      return;
    }

    setAiImporting(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: toImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setAiImportOk(`Imported ${data.count} question(s) into the Practice bank.`);
      setAiDrafts((drafts) => drafts?.filter((d) => !d.include) ?? null);
      loadQuestions();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setAiImporting(false);
    }
  }

  return (
    <div className="card p-6">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="font-bold text-brand-navy">Practice Question Bank</h2>
          <p className="text-sm text-brand-slate mt-1">
            Standalone questions not tied to any mock — these feed the student-facing Practice section directly.
            {questions && ` ${questions.length} question(s) banked.`}
          </p>
        </div>
        <span className="text-brand-slate text-sm shrink-0 ml-4">{expanded ? "Hide ▲" : "Manage ▼"}</span>
      </button>

      {expanded && (
        <div className="mt-6 space-y-6">
          {/* List */}
          <div>
            {listError && <p className="text-sm text-brand-red mb-3">{listError}</p>}
            {!questions ? (
              <div className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ) : questions.length === 0 ? (
              <p className="text-sm text-brand-slate">No standalone practice questions yet — add one below.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {questions.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-3 border border-brand-border rounded-lg p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                        <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">{q.section}</span>
                        <span>· {q.skill}</span>
                        <span>· {q.difficulty}</span>
                      </div>
                      <p className="text-sm text-brand-navy truncate">{q.question_text}</p>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <button
                        onClick={() => startEdit(q)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        disabled={deletingId === q.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-red text-brand-red hover:bg-brand-red-light"
                      >
                        {deletingId === q.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add / edit form */}
          <div className="border-t border-brand-border pt-6" id="practice-bank-form">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-navy">{editingId ? "Edit question" : "Add a question"}</h3>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="text-xs text-brand-slate underline">
                  Cancel edit
                </button>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="text-sm text-brand-navy">
                  Section
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.section}
                    onChange={(e) => {
                      const section = e.target.value as Section;
                      const domain = domainOptionsForSection(section)[0];
                      setQForm((f) => ({ ...f, section, domain, skill: DOMAINS[domain].skills[0] }));
                    }}
                  >
                    <option value="Reading and Writing">Reading and Writing</option>
                    <option value="Math">Math</option>
                  </select>
                </label>
                <label className="text-sm text-brand-navy">
                  Domain
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.domain}
                    onChange={(e) => {
                      const domain = e.target.value;
                      setQForm((f) => ({ ...f, domain, skill: DOMAINS[domain].skills[0] }));
                    }}
                  >
                    {domainOptionsForSection(qForm.section).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-brand-navy">
                  Skill
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.skill}
                    onChange={(e) => setQForm((f) => ({ ...f, skill: e.target.value }))}
                  >
                    {DOMAINS[qForm.domain].skills.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-brand-navy">
                  Difficulty
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.difficulty}
                    onChange={(e) => setQForm((f) => ({ ...f, difficulty: e.target.value as (typeof DIFFICULTIES)[number] }))}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-brand-navy">
                  Question type
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.questionType}
                    onChange={(e) => setQForm((f) => ({ ...f, questionType: e.target.value as "multiple_choice" | "spr" }))}
                  >
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="spr">Student-produced response</option>
                  </select>
                </label>
                <label className="text-sm text-brand-navy">
                  Estimated time (seconds)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.estimatedTime}
                    onChange={(e) => setQForm((f) => ({ ...f, estimatedTime: Number(e.target.value) }))}
                  />
                </label>
              </div>

              {qForm.section === "Reading and Writing" && (
                <label className="block text-sm text-brand-navy">
                  Passage text
                  <textarea
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-32"
                    value={qForm.passageText}
                    onChange={(e) => setQForm((f) => ({ ...f, passageText: e.target.value }))}
                    placeholder="The passage shown on the left side. Use $...$ for inline math and $$...$$ for block math."
                  />
                </label>
              )}

              <label className="block text-sm text-brand-navy">
                Question text
                <textarea
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-24"
                  value={qForm.questionText}
                  onChange={(e) => setQForm((f) => ({ ...f, questionText: e.target.value }))}
                  placeholder="Use $...$ for inline math and $$...$$ for block math, e.g. $x^2 + 3x = 0$"
                />
                {qForm.questionText.trim() && (
                  <div className="mt-2 rounded-lg border border-brand-border bg-slate-50 px-3 py-2 text-sm text-brand-navy">
                    <p className="text-xs text-brand-slate mb-1">Preview</p>
                    <MathText text={qForm.questionText} />
                  </div>
                )}
              </label>

              {qForm.questionType === "multiple_choice" ? (
                <div>
                  <p className="text-sm font-medium text-brand-navy mb-2">Choices</p>
                  <div className="space-y-2">
                    {qForm.choices.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="w-16 rounded-lg border border-brand-border px-2 py-2 text-sm text-center"
                          value={c.id}
                          onChange={(e) => updateChoice(i, "id", e.target.value)}
                        />
                        <input
                          className="flex-1 rounded-lg border border-brand-border px-3 py-2 text-sm"
                          placeholder={`Choice ${c.id} text`}
                          value={c.text}
                          onChange={(e) => updateChoice(i, "text", e.target.value)}
                        />
                        <button type="button" onClick={() => removeChoice(i)} className="text-xs text-brand-red px-2">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addChoice} className="btn-secondary text-xs mt-2">
                    + Add choice
                  </button>
                  <label className="block text-sm text-brand-navy mt-3">
                    Correct answer (choice id)
                    <select
                      className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                      value={qForm.correctAnswer}
                      onChange={(e) => setQForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                    >
                      {qForm.choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <label className="block text-sm text-brand-navy">
                  Correct answer
                  <input
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.correctAnswer}
                    onChange={(e) => setQForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                  />
                </label>
              )}

              <label className="block text-sm text-brand-navy">
                Rationale
                <textarea
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-20"
                  value={qForm.rationale}
                  onChange={(e) => setQForm((f) => ({ ...f, rationale: e.target.value }))}
                />
              </label>

              <label className="block text-sm text-brand-navy">
                Explanation
                <textarea
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-20"
                  value={qForm.explanation}
                  onChange={(e) => setQForm((f) => ({ ...f, explanation: e.target.value }))}
                />
              </label>

              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add question"}
                </button>
                {formError && <p className="text-sm text-brand-red">{formError}</p>}
                {formOk && <p className="text-sm text-brand-green">{formOk}</p>}
              </div>
            </form>
          </div>

          {/* AI-assisted import */}
          <div className="border-t border-brand-border pt-6">
            <h3 className="font-semibold text-brand-navy mb-1">AI-assisted import</h3>
            <p className="text-sm text-brand-slate mb-3">
              Paste question text, attach a photo, or upload a PDF — AI extracts draft questions below. Nothing is
              saved until you review and approve them. Approved drafts go straight into the Practice bank (no mock
              needed).
            </p>
            <textarea
              className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-28"
              placeholder="Paste question text here (optional if you're attaching a photo or PDF)…"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={!!aiPdf}
            />
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-navy hover:bg-slate-50 cursor-pointer">
                {aiImage ? `🖼️ ${aiImage.name}` : "Attach photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleAiImageChange} disabled={!!aiPdf} />
              </label>
              {aiImage && (
                <button onClick={() => setAiImage(null)} className="text-xs text-brand-red">
                  Remove photo
                </button>
              )}
              <label className="text-xs px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue hover:bg-brand-blue-light cursor-pointer font-medium">
                {aiPdf ? `📄 ${aiPdf.name}` : "Upload PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleAiPdfChange}
                  disabled={!!aiImage || !!aiText.trim()}
                />
              </label>
              {aiPdf && (
                <button
                  onClick={() => {
                    setAiPdf(null);
                    setAiProgress(null);
                  }}
                  className="text-xs text-brand-red"
                >
                  Remove PDF
                </button>
              )}
              <button
                onClick={handleExtractWithAI}
                disabled={aiExtracting || (!aiText.trim() && !aiImage && !aiPdf)}
                className="btn-primary text-sm ml-auto"
              >
                {aiExtracting ? "Extracting…" : "Extract with AI"}
              </button>
            </div>
            {aiPdf && (
              <p className="text-xs text-brand-slate mt-2">
                Large PDFs are processed a couple of pages at a time — a 50-page file can take a few minutes. Leave
                this tab open until it finishes.
              </p>
            )}
            {aiProgress && <p className="text-sm text-brand-blue mt-3">{aiProgress}</p>}
            {aiError && <p className="text-sm text-brand-red mt-3 whitespace-pre-line">{aiError}</p>}
            {aiImportOk && <p className="text-sm text-brand-green mt-3">{aiImportOk}</p>}

            {aiDrafts && aiDrafts.length > 0 && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-brand-navy">
                    {aiDrafts.length} draft{aiDrafts.length === 1 ? "" : "s"} — review before importing
                  </p>
                  <button
                    onClick={handleImportApprovedDrafts}
                    disabled={aiImporting || !aiDrafts.some((d) => d.include)}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {aiImporting ? "Importing…" : `Import ${aiDrafts.filter((d) => d.include).length} approved`}
                  </button>
                </div>
                {aiDrafts.map((d) => {
                  let preview: {
                    questionText?: string;
                    section?: string;
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
                  const needsAnswer =
                    !isSpr &&
                    (!preview.correctAnswer || !preview.choices?.some((c) => c.id === preview.correctAnswer));
                  return (
                    <div key={d.id} className={`border rounded-lg p-3 ${d.include ? "border-brand-border" : "border-brand-border opacity-50"} ${needsAnswer && d.include ? "border-brand-red" : ""}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={d.include} onChange={() => toggleDraftInclude(d.id)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                            {preview.section && (
                              <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">{preview.section}</span>
                            )}
                            {preview.skill && <span>{preview.skill}</span>}
                            {preview.difficulty && <span>· {preview.difficulty}</span>}
                          </div>
                          {preview.questionText && (
                            <div className="text-sm text-brand-navy mb-2">
                              <MathText text={preview.questionText} />
                            </div>
                          )}

                          {!isSpr && preview.choices && preview.choices.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-brand-navy mb-1.5">
                                Correct answer{" "}
                                {needsAnswer ? (
                                  <span className="text-brand-red font-normal">— not selected, required before import</span>
                                ) : null}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {preview.choices.map((c) => {
                                  const isCorrect = preview.correctAnswer === c.id;
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => setDraftCorrectAnswer(d.id, c.id)}
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
                              className="mt-2 w-full rounded-lg border border-brand-border px-3 py-2 text-xs font-mono min-h-40"
                              value={d.raw}
                              onChange={(e) => updateDraftRaw(d.id, e.target.value)}
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
      )}
    </div>
  );
}
