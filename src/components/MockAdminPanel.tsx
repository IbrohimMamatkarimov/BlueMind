"use client";

import { useEffect, useRef, useState } from "react";
import { DOMAINS, DIFFICULTIES, SAT_TEST_MONTHS } from "@/lib/sat-constants";
import { MathText } from "@/components/MathText";
import { FormatToolbar } from "@/components/FormatToolbar";
import { QuestionPreviewModal } from "@/components/QuestionPreviewModal";

interface AdminQuestionRow {
  id: string;
  mock_id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  module: number;
  module_pool: string | null;
  passage_text: string | null;
  image_data: string | null;
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
  position: number;
}

type Section = "Math" | "Reading and Writing";
type Choice = { id: string; text: string };

function defaultQuestionForm(mockId: string, section: Section = "Reading and Writing", module: 1 | 2 = 1) {
  const firstDomain = Object.keys(DOMAINS).find((d) => DOMAINS[d].section === section)!;
  return {
    mockId,
    section,
    domain: firstDomain,
    skill: DOMAINS[firstDomain].skills[0],
    difficulty: "Medium" as (typeof DIFFICULTIES)[number],
    module,
    modulePool: "" as "" | "higher" | "lower",
    questionType: "multiple_choice" as "multiple_choice" | "spr",
    passageText: "",
    imageData: null as string | null,
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
    source: "Admin",
  };
}

const domainOptionsForSection = (section: Section) => Object.keys(DOMAINS).filter((d) => DOMAINS[d].section === section);

/**
 * Everything needed to manage ONE mock's question bank — list, add/edit
 * form (with the passage-only optional image via Ctrl+V paste or upload),
 * AI-assisted import (text/photo/PDF → review → approve), bulk JSON
 * import, and release-to-students control. Extracted out of
 * AdminDashboard so the exact same panel can also render directly on the
 * student-facing Mocks page for admins — no separate Admin-page detour
 * needed to add or edit content.
 *
 * `initialSection`/`initialModule` pre-selects the add-question form and
 * scrolls it into view — used when an admin clicks "+ Add Questions" on a
 * specific module card rather than opening the panel generically.
 */
export function MockAdminPanel({
  mockId,
  mockTitle,
  initialSection,
  initialModule,
  onChanged,
}: {
  mockId: string;
  mockTitle: string;
  initialSection?: Section;
  initialModule?: 1 | 2;
  onChanged?: () => void;
}) {
  const [questions, setQuestions] = useState<AdminQuestionRow[] | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [deletingQId, setDeletingQId] = useState<string | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<AdminQuestionRow | null>(null);

  const [releases, setReleases] = useState<
    { section: Section; module: 1 | 2; released: boolean; questionCount: number }[] | null
  >(null);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [releaseBusyKey, setReleaseBusyKey] = useState<string | null>(null);

  const [qForm, setQForm] = useState(defaultQuestionForm(mockId, initialSection, initialModule));
  const passageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const questionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [qFormError, setQFormError] = useState<string | null>(null);
  const [qFormOk, setQFormOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvancedQFields, setShowAdvancedQFields] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classifiedAuto, setClassifiedAuto] = useState(false);
  const [generatingRationale, setGeneratingRationale] = useState(false);
  const [rationaleError, setRationaleError] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkOk, setBulkOk] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(true);

  const [aiText, setAiText] = useState("");
  const [aiModule, setAiModule] = useState<1 | 2>(initialModule ?? 1);
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

  const panelRootRef = useRef<HTMLDivElement>(null);

  function loadQuestions() {
    setQuestionsError(null);
    setQuestions(null);
    fetch(`/api/admin/questions?mockId=${mockId}`)
      .then(async (res) => {
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          throw new Error(
            res.ok
              ? "Server sent back an empty response — try restarting the dev server."
              : `Server error (${res.status}) — try restarting the dev server.`
          );
        }
        if (!res.ok) throw new Error(data?.error ?? "Failed to load questions");
        return data;
      })
      .then((data) => setQuestions(data.questions))
      .catch((err) => setQuestionsError(err instanceof Error ? err.message : "Failed to load questions"));
  }

  function loadReleases() {
    setReleasesError(null);
    fetch(`/api/admin/mocks/${mockId}/releases`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error ?? "Failed to load release status");
        setReleases(data.releases);
      })
      .catch((err) => setReleasesError(err instanceof Error ? err.message : "Failed to load release status"));
  }

  useEffect(() => {
    loadQuestions();
    loadReleases();
    setQForm(defaultQuestionForm(mockId, initialSection, initialModule));
    if (initialSection || initialModule) {
      requestAnimationFrame(() => {
        panelRootRef.current?.querySelector("#question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockId]);

  async function toggleRelease(section: Section, module: 1 | 2, nextReleased: boolean) {
    const key = `${section}|${module}`;
    setReleaseBusyKey(key);
    setReleasesError(null);
    try {
      const res = await fetch(`/api/admin/mocks/${mockId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, module, released: nextReleased }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update release status");
      setReleases(data.releases);
      onChanged?.();
    } catch (err) {
      setReleasesError(err instanceof Error ? err.message : "Failed to update release status");
    } finally {
      setReleaseBusyKey(null);
    }
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    setDeletingQId(id);
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete question");
      setQuestions((qs) => (qs ? qs.filter((q) => q.id !== id) : qs));
      onChanged?.();
    } catch (err) {
      setQuestionsError(err instanceof Error ? err.message : "Failed to delete question");
    } finally {
      setDeletingQId(null);
    }
  }

  function updateChoice(index: number, field: keyof Choice, value: string) {
    setQForm((f) => {
      const choices = f.choices.slice();
      choices[index] = { ...choices[index], [field]: value };
      return { ...f, choices };
    });
  }

  function handleQuestionImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => setQForm((f) => ({ ...f, imageData: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function handleQuestionImagePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setQForm((f) => ({ ...f, imageData: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function addChoice() {
    setQForm((f) => ({ ...f, choices: [...f.choices, { id: String.fromCharCode(65 + f.choices.length), text: "" }] }));
  }
  function removeChoice(index: number) {
    setQForm((f) => ({ ...f, choices: f.choices.filter((_, i) => i !== index) }));
  }

  async function runAutoClassify(): Promise<{ domain: string; skill: string; difficulty: string } | null> {
    if (!qForm.questionText.trim() || qForm.questionText.trim().length < 15) return null;
    setClassifying(true);
    setClassifyError(null);
    try {
      const res = await fetch("/api/admin/questions/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: qForm.section,
          questionText: qForm.questionText.trim(),
          passageText: qForm.passageText.trim() || undefined,
          choices: qForm.questionType === "multiple_choice" ? qForm.choices.filter((c) => c.text.trim()) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't auto-detect category");
      if (!DOMAINS[data.domain]) throw new Error("Detected an unrecognized category");
      setQForm((f) => ({ ...f, domain: data.domain, skill: data.skill, difficulty: data.difficulty }));
      setClassifiedAuto(true);
      return data;
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : "Couldn't auto-detect category");
      return null;
    } finally {
      setClassifying(false);
    }
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setQFormError(null);
    setQFormOk(null);

    if (!qForm.questionText.trim()) {
      setQFormError("Question text is required.");
      return;
    }
    if (qForm.questionType === "multiple_choice") {
      if (qForm.choices.length < 2 || qForm.choices.some((c) => !c.text.trim())) {
        setQFormError("Multiple-choice questions need at least 2 filled-in choices.");
        return;
      }
    }
    if (!qForm.correctAnswer.trim()) {
      setQFormError("Correct answer is required.");
      return;
    }

    let domain = qForm.domain;
    let skill = qForm.skill;
    let difficulty = qForm.difficulty;
    if (!editingId && !classifiedAuto) {
      const classified = await runAutoClassify();
      if (classified) {
        domain = classified.domain;
        skill = classified.skill;
        difficulty = classified.difficulty as typeof difficulty;
      }
    }

    let rationale = qForm.rationale;
    let explanation = qForm.explanation;
    if (!editingId) {
      setGeneratingRationale(true);
      setRationaleError(null);
      const res = await fetch("/api/admin/questions/rationale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: qForm.section,
          questionText: qForm.questionText.trim(),
          passageText: qForm.passageText.trim() || undefined,
          choices: qForm.questionType === "multiple_choice" ? qForm.choices.filter((c) => c.text.trim()) : [],
          correctAnswer: qForm.correctAnswer.trim(),
          questionType: qForm.questionType,
        }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      setGeneratingRationale(false);
      if (res?.ok && data?.rationale && data?.explanation) {
        rationale = data.rationale;
        explanation = data.explanation;
      } else {
        setRationaleError(data?.error ?? "Couldn't generate the answer explanation — add one and try again, or retry.");
        setQFormError("AI couldn't write the answer explanation for this question — see note above, then try saving again.");
        return;
      }
    }

    const payload = {
      mockId,
      section: qForm.section,
      domain,
      skill,
      difficulty,
      module: qForm.module,
      modulePool: qForm.modulePool || null,
      passageText: qForm.section === "Reading and Writing" ? qForm.passageText.trim() || null : null,
      imageData: qForm.imageData ?? null,
      questionText: qForm.questionText.trim(),
      choices: qForm.questionType === "multiple_choice" ? qForm.choices : [],
      correctAnswer: qForm.correctAnswer.trim(),
      questionType: qForm.questionType,
      rationale,
      explanation,
      estimatedTime: Number(qForm.estimatedTime) || 75,
      source: qForm.source.trim() || "Admin",
    };

    setSavingQuestion(true);
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
      setQFormOk(editingId ? "Changes saved." : "Question added.");
      setEditingId(null);
      setQForm(defaultQuestionForm(mockId, qForm.section, qForm.module));
      setClassifiedAuto(false);
      setClassifyError(null);
      setRationaleError(null);
      loadQuestions();
      loadReleases();
      onChanged?.();
    } catch (err) {
      setQFormError(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      setSavingQuestion(false);
    }
  }

  function startEditQuestion(q: AdminQuestionRow) {
    setQFormError(null);
    setQFormOk(null);
    setEditingId(q.id);
    setClassifiedAuto(true);
    setClassifyError(null);
    const choices: Choice[] = q.choices ? JSON.parse(q.choices) : [];
    setQForm({
      mockId: q.mock_id,
      section: q.section as Section,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty as (typeof DIFFICULTIES)[number],
      module: q.module as 1 | 2,
      modulePool: (q.module_pool ?? "") as "" | "higher" | "lower",
      questionType: q.question_type as "multiple_choice" | "spr",
      passageText: q.passage_text ?? "",
      imageData: q.image_data ?? null,
      questionText: q.question_text,
      choices: choices.length > 0 ? choices : [{ id: "A", text: "" }, { id: "B", text: "" }],
      correctAnswer: q.correct_answer,
      rationale: q.rationale,
      explanation: q.explanation,
      estimatedTime: q.estimated_time,
      source: q.source,
    });
    panelRootRef.current?.querySelector("#question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditQuestion() {
    setEditingId(null);
    setQFormError(null);
    setQFormOk(null);
    setQForm(defaultQuestionForm(mockId));
    setClassifiedAuto(false);
    setClassifyError(null);
    setRationaleError(null);
  }

  async function handleBulkImport() {
    setBulkError(null);
    setBulkOk(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bulkText);
    } catch {
      setBulkError("That's not valid JSON.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setBulkError("Paste a JSON array of question objects.");
      return;
    }
    const items = (parsed as Record<string, unknown>[]).map((item) => ({ ...item, mockId: item.mockId ?? mockId }));
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk import failed");
      setBulkOk(`Imported ${data.count} question(s).`);
      setBulkText("");
      loadQuestions();
      loadReleases();
      onChanged?.();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk import failed");
    } finally {
      setBulkBusy(false);
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
    setAiProgress(null);
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
        setAiProgress(
          `Processed ${data.pagesProcessed} page(s) in ${data.batchCount} batch(es) — found ${data.questions?.length ?? 0} question(s).`
        );
        if (!data.questions?.length) {
          setAiError(
            data.batchErrors?.length
              ? `No questions were extracted — every batch failed:\n${data.batchErrors.join("\n")}`
              : "No questions were found in that PDF. If it's a scanned/image-based PDF, try the photo upload instead."
          );
          return;
        }
        setAiDrafts(
          data.questions.map((q: unknown, i: number) => ({
            id: `draft_${Date.now()}_${i}`,
            include: true,
            raw: JSON.stringify({ ...(q as object), module: aiModule }, null, 2),
            error: null,
          }))
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
      if (data.batchCount) {
        setAiProgress(`Processed ${data.batchCount} batch(es) — found ${data.questions?.length ?? 0} question(s).`);
        if (data.batchErrors?.length) setAiError(`Some sections couldn't be processed:\n${data.batchErrors.join("\n")}`);
      }
      if (!data.questions?.length) {
        setAiError((prev) => prev ?? "No questions were found in that content.");
        return;
      }
      setAiDrafts(
        data.questions.map((q: unknown, i: number) => ({
          id: `draft_${Date.now()}_${i}`,
          include: true,
          raw: JSON.stringify({ ...(q as object), module: aiModule }, null, 2),
          error: null,
        }))
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Extraction failed");
      setAiProgress(null);
    } finally {
      setAiExtracting(false);
    }
  }

  function updateDraftRaw(id: string, raw: string) {
    setAiDrafts((drafts) => drafts?.map((d) => (d.id === id ? { ...d, raw, error: null } : d)) ?? null);
  }
  function toggleDraftCorrectAnswer(id: string, choiceId: string) {
    setAiDrafts(
      (drafts) =>
        drafts?.map((d) => {
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
        const acceptedIds = typeof parsed.correctAnswer === "string"
          ? parsed.correctAnswer.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
        const hasValidAnswer = isSpr
          ? acceptedIds.length > 0
          : acceptedIds.length > 0 && Array.isArray(parsed.choices) && acceptedIds.every((id: string) => parsed.choices.some((c: { id: string }) => c.id === id));
        if (!hasValidAnswer) {
          hadMissingAnswer = true;
          return { ...d, error: "Select a correct answer before importing." };
        }
        toImport.push({ ...parsed, mockId });
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
      setAiImportOk(`Imported ${data.count} question(s).`);
      setAiDrafts((drafts) => drafts?.filter((d) => !d.include) ?? null);
      loadQuestions();
      loadReleases();
      onChanged?.();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setAiImporting(false);
    }
  }

  return (
    <div ref={panelRootRef} className="space-y-6">
      <div className="card p-6">
        <h2 className="font-bold text-brand-navy mb-1">Question bank — {mockTitle}</h2>
        <p className="text-sm text-brand-slate mb-4">{questions?.length ?? "…"} question(s) banked.</p>

        <div className="mb-5 p-4 rounded-lg border border-brand-border bg-slate-50">
          <p className="text-sm font-semibold text-brand-navy mb-0.5">Release to students</p>
          <p className="text-xs text-brand-slate mb-3">
            A module only shows "Start Practice" once it's released here — otherwise "Coming soon", even if
            questions are already banked.
          </p>
          {releasesError && <p className="text-xs text-brand-red mb-2">{releasesError}</p>}
          {!releases ? (
            <div className="h-14 bg-slate-200 rounded-lg animate-pulse" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {releases.map((r) => {
                const key = `${r.section}|${r.module}`;
                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-3 ${r.released ? "border-brand-green bg-brand-green-light" : "border-brand-border bg-white"}`}
                  >
                    <p className="text-xs font-semibold text-brand-navy">
                      {r.section === "Reading and Writing" ? "R&W" : "Math"} · Module {r.module}
                    </p>
                    <p className="text-xs text-brand-slate mt-0.5 mb-2">{r.questionCount} question(s)</p>
                    <button
                      onClick={() => toggleRelease(r.section, r.module, !r.released)}
                      disabled={releaseBusyKey === key || (!r.released && r.questionCount === 0)}
                      title={!r.released && r.questionCount === 0 ? "Add questions to this module first" : undefined}
                      className={`w-full text-xs font-semibold px-2 py-1.5 rounded-md ${
                        r.released ? "border border-brand-red text-brand-red hover:bg-brand-red-light bg-white" : "btn-primary"
                      } disabled:opacity-40`}
                    >
                      {releaseBusyKey === key ? "…" : r.released ? "Unrelease" : "Release"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {questionsError && <p className="text-sm text-brand-red mb-3">{questionsError}</p>}
        {!questions ? (
          <div className="h-24 bg-slate-200 rounded-xl animate-pulse" />
        ) : questions.length === 0 ? (
          <p className="text-sm text-brand-slate">No questions yet for this mock.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(() => {
              const seen: Record<string, number> = {};
              return questions.map((q) => {
                const groupKey = `${q.section}|${q.module}`;
                seen[groupKey] = (seen[groupKey] ?? 0) + 1;
                const qNumber = seen[groupKey];
                return (
                  <div key={q.id} className="flex items-start justify-between gap-3 border border-brand-border rounded-lg p-3">
                    <div className="min-w-0 flex items-start gap-3">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 text-brand-navy text-xs font-bold flex items-center justify-center mt-0.5">
                        {qNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                          <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">{q.section}</span>
                          <span>Module {q.module}</span>
                          {q.module_pool && <span>· {q.module_pool} pool</span>}
                          <span>· {q.skill}</span>
                          <span>· {q.difficulty}</span>
                        </div>
                        <p className="text-sm text-brand-navy truncate">{q.question_text}</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <button
                        onClick={() => setPreviewQuestion(q)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-navy hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => startEditQuestion(q)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        disabled={deletingQId === q.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-red text-brand-red hover:bg-brand-red-light"
                      >
                        {deletingQId === q.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Add / edit question form */}
      <div className="card p-6" id="question-form">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-brand-navy">{editingId ? "Edit question" : "Add a question"}</h2>
          {editingId && (
            <button type="button" onClick={cancelEditQuestion} className="text-xs text-brand-slate underline">
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleAddQuestion} className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-brand-navy mb-2">Section</p>
            <div className="grid grid-cols-2 gap-2">
              {(["Reading and Writing", "Math"] as Section[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const domain = domainOptionsForSection(s)[0];
                    setQForm((f) => ({
                      ...f,
                      section: s,
                      domain,
                      skill: DOMAINS[domain].skills[0],
                      // Grid-in questions don't exist outside Math on the real
                      // SAT — force back to multiple choice if it was set while
                      // Math was selected, so switching to R&W can never leave
                      // an invalid section/type combination sitting in the form.
                      questionType: s === "Math" ? f.questionType : "multiple_choice",
                    }));
                  }}
                  className={`rounded-xl border-2 py-3 text-sm font-semibold transition-colors ${
                    qForm.section === s ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:bg-slate-50"
                  }`}
                >
                  {s === "Reading and Writing" ? "Reading & Writing" : "Math"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-brand-navy mb-2">Module</p>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setQForm((f) => ({ ...f, module: m }))}
                  className={`rounded-xl border-2 py-3 text-sm font-semibold transition-colors ${
                    qForm.module === m ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:bg-slate-50"
                  }`}
                >
                  Module {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-brand-navy mb-2">Category</p>
            <p className="text-xs text-brand-slate">Detected automatically from the question text below.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedQFields((v) => !v)}
            className="text-xs text-brand-blue font-medium underline"
          >
            {showAdvancedQFields ? "Hide advanced options" : "Advanced options (category, difficulty, module pool, timing)"}
          </button>

          {showAdvancedQFields && (
            <div className="space-y-4 pt-2 border-t border-brand-border">
              <div>
                <p className="text-sm font-semibold text-brand-navy mb-2">Difficulty</p>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setQForm((f) => ({ ...f, difficulty: d }))}
                      className={`rounded-xl border-2 py-3 text-sm font-semibold transition-colors ${
                        qForm.difficulty === d ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:bg-slate-50"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
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
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <label className="text-sm text-brand-navy">
                  Module pool (adaptive, optional)
                  <select
                    className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                    value={qForm.modulePool}
                    onChange={(e) => setQForm((f) => ({ ...f, modulePool: e.target.value as "" | "higher" | "lower" }))}
                  >
                    <option value="">None (module 1)</option>
                    <option value="higher">Higher</option>
                    <option value="lower">Lower</option>
                  </select>
                </label>
                {qForm.section === "Math" ? (
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
                ) : (
                  <div className="text-sm text-brand-navy">
                    Question type
                    <p className="mt-1 text-xs text-brand-slate py-2">
                      Always multiple choice — grid-in (student-produced response) doesn't exist on the real SAT
                      outside Math.
                    </p>
                  </div>
                )}
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
            </div>
          )}

          {qForm.section === "Reading and Writing" && (
            <div>
              <p className="text-sm text-brand-navy mb-1">Passage text</p>
              <FormatToolbar textareaRef={passageTextareaRef} value={qForm.passageText} onChange={(v) => setQForm((f) => ({ ...f, passageText: v }))} />
              <textarea
                id="passage-text-field"
                ref={passageTextareaRef}
                className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-32"
                value={qForm.passageText}
                onChange={(e) => setQForm((f) => ({ ...f, passageText: e.target.value }))}
                placeholder="The passage shown on the left side of the R&W screen."
              />
              {qForm.passageText.trim() && (
                <div className="mt-2 rounded-lg border border-brand-border bg-slate-50 px-3 py-2 text-sm text-brand-navy">
                  <p className="text-xs text-brand-slate mb-1">Preview</p>
                  <MathText text={qForm.passageText} />
                </div>
              )}
            </div>
          )}

          {/* The ONLY image field in the whole editor — belongs to the
              left-side passage area only, never to answer choices or the
              explanation. Supports Ctrl+V paste and file upload. */}
          <div>
            <p className="text-sm text-brand-navy mb-1">Chart / graph / photo (optional — passage side only)</p>
            {qForm.imageData ? (
              <div className="space-y-2">
                <img src={qForm.imageData} alt="Question figure preview" className="max-w-full h-auto max-h-56 rounded-lg border border-brand-border" />
                <div className="flex gap-3">
                  <label className="text-xs text-brand-blue underline cursor-pointer">
                    Replace image
                    <input type="file" accept="image/*" className="hidden" onChange={handleQuestionImageChange} />
                  </label>
                  <button type="button" onClick={() => setQForm((f) => ({ ...f, imageData: null }))} className="text-xs text-brand-red underline">
                    Remove image
                  </button>
                </div>
              </div>
            ) : (
              <div
                onPaste={handleQuestionImagePaste}
                tabIndex={0}
                className="flex flex-col items-start gap-1.5 rounded-lg border border-dashed border-brand-border p-3 outline-none focus:border-brand-blue focus:bg-brand-blue-light/30"
              >
                <label className="inline-block text-xs px-3 py-2 rounded-lg border border-brand-border text-brand-navy hover:bg-slate-50 cursor-pointer">
                  🖼️ Attach chart / graph / photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleQuestionImageChange} />
                </label>
                <p className="text-[11px] text-brand-slate">
                  Or click here and press <kbd className="px-1 py-0.5 rounded border border-brand-border bg-slate-50 font-mono">Ctrl+V</kbd> to paste a copied image.
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm text-brand-navy">Question text</p>
              <button type="button" onClick={() => setShowLivePreview((v) => !v)} className="text-[11px] font-medium text-brand-blue underline underline-offset-2">
                {showLivePreview ? "Hide preview" : "Show preview"}
              </button>
            </div>
            <FormatToolbar
              textareaRef={questionTextareaRef}
              value={qForm.questionText}
              onChange={(v) => {
                setQForm((f) => ({ ...f, questionText: v }));
                if (classifiedAuto) setClassifiedAuto(false);
                if (classifyError) setClassifyError(null);
              }}
            />
            <textarea
              id="question-text-field"
              ref={questionTextareaRef}
              className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-24"
              value={qForm.questionText}
              onChange={(e) => {
                const val = e.target.value;
                setQForm((f) => ({ ...f, questionText: val }));
                if (classifiedAuto) setClassifiedAuto(false);
                if (classifyError) setClassifyError(null);
              }}
              onBlur={() => {
                if (!editingId) runAutoClassify();
              }}
              placeholder="Use the toolbar above for italics, underlines, and math, e.g. $x^2 + 3x = 0$"
            />
            {showLivePreview && (
              <div className="mt-3 rounded-xl border border-brand-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate mb-2">Live mock preview</p>
                <div className="rounded-xl border border-brand-border bg-white overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-brand-border bg-slate-100 px-3 py-2">
                    <span className="w-7 h-7 rounded bg-black text-white text-[12px] font-bold flex items-center justify-center">?</span>
                    <span className="text-xs font-medium text-brand-navy">Mark for Review</span>
                  </div>
                  <div className="grid md:grid-cols-[45%_55%] min-h-[180px]">
                    <div className="border-r border-brand-border bg-white p-3">
                      {qForm.imageData && (
                        <img src={qForm.imageData} alt="Question figure preview" className="max-w-full h-auto rounded-lg border border-brand-border mb-3" />
                      )}
                      {(qForm.section === "Reading and Writing" ? qForm.passageText : qForm.questionText).trim() ? (
                        <div className="text-[14px] leading-relaxed text-brand-navy">
                          <MathText text={qForm.section === "Reading and Writing" ? qForm.passageText : qForm.questionText} />
                        </div>
                      ) : (
                        <div className="text-xs text-brand-slate">Passage / prompt preview will appear here…</div>
                      )}
                    </div>
                    <div className="bg-white p-3">
                      {(qForm.questionText || qForm.passageText) && (
                        <div className="mb-3 text-[14px] leading-relaxed text-brand-navy">
                          <MathText text={qForm.questionText} />
                        </div>
                      )}
                      {qForm.questionType === "multiple_choice" ? (
                        <div className="space-y-2">
                          {qForm.choices.map((c) => (
                            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-brand-border bg-slate-50 p-2">
                              <span className="w-6 h-6 rounded-full border border-slate-400 flex items-center justify-center text-[11px] font-bold text-brand-navy shrink-0">
                                {c.id}
                              </span>
                              <div className="text-[13px] text-brand-navy flex-1">
                                <MathText text={c.text || "Choice text…"} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-brand-border bg-slate-50 p-3 text-xs text-brand-slate">
                          Student-produced response preview — numeric answer field shown in the actual mock.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                    {c.text.trim() && (
                      <span className="text-sm text-brand-navy shrink-0 max-w-[40%] truncate">
                        <MathText text={c.text} />
                      </span>
                    )}
                    <button type="button" onClick={() => removeChoice(i)} className="text-xs text-brand-red px-2">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addChoice} className="btn-secondary text-xs mt-2">
                + Add choice
              </button>
              <div className="mt-3">
                <p className="text-sm text-brand-navy">Correct answer(s)</p>
                <p className="text-xs text-brand-slate mb-1.5">
                  Click every letter that should count as correct — most questions have just one, but multi-select is
                  supported.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {qForm.choices.map((c) => {
                    const acceptedIds = qForm.correctAnswer.split(",").map((s) => s.trim()).filter(Boolean);
                    const isCorrect = acceptedIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const next = isCorrect ? acceptedIds.filter((id) => id !== c.id) : [...acceptedIds, c.id];
                          setQForm((f) => ({ ...f, correctAnswer: next.join(",") }));
                        }}
                        className={`w-9 h-9 rounded-full border text-sm font-bold flex items-center justify-center ${
                          isCorrect
                            ? "bg-brand-green border-brand-green text-white"
                            : "border-brand-border text-brand-navy hover:border-brand-green"
                        }`}
                      >
                        {c.id}
                      </button>
                    );
                  })}
                </div>
              </div>
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

          {!editingId && (
            <div className="rounded-lg border border-brand-border bg-slate-50 px-3 py-2.5 text-xs text-brand-slate">
              {generatingRationale ? (
                <span className="text-brand-blue font-medium">Writing the answer explanation…</span>
              ) : rationaleError ? (
                <span className="text-brand-red">{rationaleError}</span>
              ) : (
                <span>Rationale and explanation are written automatically from the question, choices, and correct answer when you save.</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingQuestion || generatingRationale} className="btn-primary text-sm">
              {generatingRationale ? "Writing explanation…" : savingQuestion ? "Saving…" : editingId ? "Save changes" : "Add question"}
            </button>
            {qFormError && <p className="text-sm text-brand-red">{qFormError}</p>}
            {qFormOk && <p className="text-sm text-brand-green">{qFormOk}</p>}
          </div>
        </form>
      </div>

      {/* AI-assisted import */}
      <div className="card p-6">
        <h2 className="font-bold text-brand-navy mb-1">AI-assisted import</h2>
        <p className="text-sm text-brand-slate mb-3">
          Paste question text, attach a photo, or upload a full PDF. AI extracts draft questions below — nothing
          is saved until you review and approve them.
        </p>
        <div className="mb-3">
          <p className="text-xs font-semibold text-brand-navy mb-1.5">This batch is for Module</p>
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            {([1, 2] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAiModule(m)}
                className={`rounded-lg border-2 py-2 text-sm font-semibold transition-colors ${
                  aiModule === m ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate hover:bg-slate-50"
                }`}
              >
                Module {m}
              </button>
            ))}
          </div>
        </div>
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
            <input type="file" accept="application/pdf" className="hidden" onChange={handleAiPdfChange} disabled={!!aiImage || !!aiText.trim()} />
          </label>
          {aiPdf && (
            <button onClick={() => { setAiPdf(null); setAiProgress(null); }} className="text-xs text-brand-red">
              Remove PDF
            </button>
          )}
          <button onClick={handleExtractWithAI} disabled={aiExtracting || (!aiText.trim() && !aiImage && !aiPdf)} className="btn-primary text-sm ml-auto">
            {aiExtracting ? "Extracting…" : "Extract with AI"}
          </button>
        </div>
        {aiPdf && (
          <p className="text-xs text-brand-slate mt-2">
            Large PDFs are processed a couple of pages at a time — a 50-page file can take a few minutes.
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
                module?: number;
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
              const acceptedIds = typeof preview.correctAnswer === "string"
                ? preview.correctAnswer.split(",").map((s) => s.trim()).filter(Boolean)
                : [];
              const needsAnswer = !isSpr && acceptedIds.length === 0;
              return (
                <div key={d.id} className={`border rounded-lg p-3 ${d.include ? "border-brand-border" : "border-brand-border opacity-50"} ${needsAnswer && d.include ? "border-brand-red" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={d.include} onChange={() => toggleDraftInclude(d.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                        {preview.section && <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">{preview.section}</span>}
                        {preview.module && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-brand-navy font-medium">Module {preview.module}</span>}
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
                            Correct answer(s){" "}
                            {needsAnswer ? <span className="text-brand-red font-normal">— not selected, required before import</span> : null}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {preview.choices.map((c) => {
                              const isCorrect = acceptedIds.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleDraftCorrectAnswer(d.id, c.id)}
                                  className={`text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs max-w-full ${
                                    isCorrect ? "border-brand-green bg-brand-green-light text-brand-navy font-semibold" : "border-brand-border text-brand-slate hover:bg-slate-50"
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

      {/* Bulk import */}
      <div className="card p-6">
        <h2 className="font-bold text-brand-navy mb-1">Bulk import</h2>
        <p className="text-sm text-brand-slate mb-3">
          Paste a JSON array of question objects. If a question omits <code>mockId</code>, it's added to{" "}
          <strong>{mockTitle}</strong> automatically.
        </p>
        <textarea
          className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm min-h-40 font-mono"
          placeholder='[{"section": "Math", "domain": "Algebra", "skill": "Linear Equations", "difficulty": "Medium", "module": 1, "questionType": "multiple_choice", "questionText": "...", "choices": [{"id":"A","text":"..."}], "correctAnswer": "A", "rationale": "...", "explanation": "..."}]'
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={handleBulkImport} disabled={bulkBusy || !bulkText.trim()} className="btn-primary text-sm">
            {bulkBusy ? "Importing…" : "Import"}
          </button>
          {bulkError && <p className="text-sm text-brand-red">{bulkError}</p>}
          {bulkOk && <p className="text-sm text-brand-green">{bulkOk}</p>}
        </div>
      </div>

      {previewQuestion && (
        <QuestionPreviewModal
          section={previewQuestion.section as "Math" | "Reading and Writing"}
          module={previewQuestion.module}
          passageText={previewQuestion.passage_text}
          imageData={previewQuestion.image_data}
          questionText={previewQuestion.question_text}
          choices={previewQuestion.choices ? JSON.parse(previewQuestion.choices) : []}
          correctAnswer={previewQuestion.correct_answer}
          questionType={previewQuestion.question_type as "multiple_choice" | "spr"}
          onClose={() => setPreviewQuestion(null)}
        />
      )}
    </div>
  );
}
