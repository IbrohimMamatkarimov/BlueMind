"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DOMAINS, DIFFICULTIES, SAT_TEST_MONTHS } from "@/lib/sat-constants";
import { MathText } from "@/components/MathText";
import { FormatToolbar } from "@/components/FormatToolbar";
import { PracticeBankPanel } from "@/components/PracticeBankPanel";
import { QuestionPreviewModal } from "@/components/QuestionPreviewModal";

interface AdminMockSummary {
  id: string;
  title: string;
  subtitle: string | null;
  group_label: string;
  month: string;
  year: number;
  order_in_month: number;
  total_questions: number;
  duration_minutes: number;
  is_official: number;
  created_at: string;
  questionCount: number;
  attemptCount: number;
}

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

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  is_guest: number;
  created_at: string;
  attemptCount: number;
  completedAttemptCount: number;
  latestScore: number | null;
  lastActiveAt: string | null;
}

interface AdminReportRow {
  id: string;
  question_id: string;
  user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  question_text: string;
  section: string;
  skill: string;
  mock_title: string | null;
  reporter_email: string | null;
}

type Section = "Math" | "Reading and Writing";
type Choice = { id: string; text: string };

const MONTH_NAMES = SAT_TEST_MONTHS;

// Picks the next SAT month on/after the current one (wrapping to March if
// we're past December's window) so a freshly-opened form defaults to
// something sensible instead of always "March".
const SAT_MONTH_CALENDAR_INDEX: Record<(typeof SAT_TEST_MONTHS)[number], number> = {
  March: 2,
  May: 4,
  June: 5,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};
function defaultSatMonth() {
  const now = new Date().getMonth();
  return SAT_TEST_MONTHS.find((m) => SAT_MONTH_CALENDAR_INDEX[m] >= now) ?? SAT_TEST_MONTHS[0];
}

type MockFormState = {
  title: string;
  subtitle: string;
  groupLabel: string;
  month: (typeof SAT_TEST_MONTHS)[number];
  year: number;
  orderInMonth: number;
};

const EMPTY_MOCK_FORM: MockFormState = {
  title: "",
  subtitle: "",
  groupLabel: String(new Date().getFullYear()),
  month: defaultSatMonth(),
  year: new Date().getFullYear(),
  orderInMonth: 1,
};

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

export function AdminDashboard() {
  const [tab, setTab] = useState<"mocks" | "users" | "reports">("mocks");

  const [mocks, setMocks] = useState<AdminMockSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedMockId, setSelectedMockId] = useState<string | null>(null);

  const [mockForm, setMockForm] = useState(EMPTY_MOCK_FORM);
  const [creatingMock, setCreatingMock] = useState(false);
  const [mockFormError, setMockFormError] = useState<string | null>(null);
  const [showAdvancedMockFields, setShowAdvancedMockFields] = useState(false);

  const [deletingMockId, setDeletingMockId] = useState<string | null>(null);
  const [mockActionError, setMockActionError] = useState<string | null>(null);
  const [wipingAll, setWipingAll] = useState(false);
  const [releasingAll, setReleasingAll] = useState(false);
  const [releaseAllMsg, setReleaseAllMsg] = useState<string | null>(null);

  const [editingMockId, setEditingMockId] = useState<string | null>(null);
  const [mockEditForm, setMockEditForm] = useState(EMPTY_MOCK_FORM);
  const [savingMockEdit, setSavingMockEdit] = useState(false);

  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [reports, setReports] = useState<AdminReportRow[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<"open" | "all">("open");
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<AdminQuestionRow[] | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [deletingQId, setDeletingQId] = useState<string | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<AdminQuestionRow | null>(null);

  const [releases, setReleases] = useState<
    { section: Section; module: 1 | 2; released: boolean; questionCount: number }[] | null
  >(null);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [releaseBusyKey, setReleaseBusyKey] = useState<string | null>(null);
  const [clearingModuleKey, setClearingModuleKey] = useState<string | null>(null);
  // Which module's card was last clicked — filters the question list below
  // and syncs the "Add a question" form + AI import's module picker, so
  // tapping a module actually focuses the whole page on it instead of only
  // toggling its release status.
  const [moduleFocus, setModuleFocus] = useState<{ section: Section; module: 1 | 2 } | null>(null);

  const [qForm, setQForm] = useState(defaultQuestionForm(""));
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

  // AI-assisted import: paste text or attach a photo, AI extracts draft
  // questions, admin reviews/edits each one before anything is saved.
  const [aiText, setAiText] = useState("");
  const [aiModule, setAiModule] = useState<1 | 2>(1);
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

  const selectedMock = useMemo(
    () => mocks?.find((m) => m.id === selectedMockId) ?? null,
    [mocks, selectedMockId]
  );

  async function loadMocks() {
    setListError(null);
    try {
      const res = await fetch("/api/admin/mocks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load mocks");
      setMocks(data.mocks);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load mocks");
    }
  }

  useEffect(() => {
    loadMocks();
  }, []);

  useEffect(() => {
    if (!selectedMockId) {
      setQuestions(null);
      setReleases(null);
      return;
    }
    setQForm((f) => ({ ...f, mockId: selectedMockId }));
    setQuestionsError(null);
    setQuestions(null);
    fetch(`/api/admin/questions?mockId=${selectedMockId}`)
      .then(async (res) => {
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          throw new Error(
            res.ok
              ? "Server sent back an empty response — try restarting the dev server (a schema change may not have applied to the running process yet)."
              : `Server error (${res.status}) — try restarting the dev server.`
          );
        }
        if (!res.ok) throw new Error(data?.error ?? "Failed to load questions");
        return data;
      })
      .then((data) => setQuestions(data.questions))
      .catch((err) => setQuestionsError(err instanceof Error ? err.message : "Failed to load questions"));
    loadReleases(selectedMockId);
  }, [selectedMockId]);

  async function loadReleases(mockId: string) {
    setReleasesError(null);
    try {
      const res = await fetch(`/api/admin/mocks/${mockId}/releases`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load release status");
      setReleases(data.releases);
    } catch (err) {
      setReleasesError(err instanceof Error ? err.message : "Failed to load release status");
    }
  }

  async function toggleRelease(section: Section, module: 1 | 2, nextReleased: boolean) {
    if (!selectedMockId) return;
    const key = `${section}|${module}`;
    setReleaseBusyKey(key);
    setReleasesError(null);
    try {
      const res = await fetch(`/api/admin/mocks/${selectedMockId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, module, released: nextReleased }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update release status");
      setReleases(data.releases);
    } catch (err) {
      setReleasesError(err instanceof Error ? err.message : "Failed to update release status");
    } finally {
      setReleaseBusyKey(null);
    }
  }

  function focusModule(section: Section, module: 1 | 2) {
    setModuleFocus({ section, module });
    const domain = domainOptionsForSection(section)[0];
    setQForm((f) => ({ ...f, section, module, domain, skill: DOMAINS[domain].skills[0] }));
    setAiModule(module);
  }

  async function handleClearModule(section: Section, module: 1 | 2) {
    if (!selectedMockId) return;
    const key = `${section}|${module}`;
    const label = `${section === "Reading and Writing" ? "R&W" : "Math"} · Module ${module}`;
    if (
      !confirm(
        `Delete ALL questions in ${label}? This is for starting a bad import over — it can't be undone. Questions already answered by a student are kept and skipped automatically.`
      )
    )
      return;
    setClearingModuleKey(key);
    setReleasesError(null);
    try {
      const res = await fetch(
        `/api/admin/mocks/${selectedMockId}/module?section=${encodeURIComponent(section)}&module=${module}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear module");
      const refreshed = await fetch(`/api/admin/questions?mockId=${selectedMockId}`).then((r) => r.json());
      setQuestions(refreshed.questions);
      await loadMocks();
      await loadReleases(selectedMockId);
      if (data.skipped > 0) {
        setReleasesError(
          `Removed ${data.deleted} question(s). ${data.skipped} already-answered question(s) were kept.`
        );
      }
    } catch (err) {
      setReleasesError(err instanceof Error ? err.message : "Failed to clear module");
    } finally {
      setClearingModuleKey(null);
    }
  }

  async function handleCreateMock(e: React.FormEvent) {
    e.preventDefault();
    setMockFormError(null);
    if (!mockForm.title.trim()) {
      setMockFormError("Give the mock a title.");
      return;
    }
    setCreatingMock(true);
    try {
      const res = await fetch("/api/admin/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: mockForm.title.trim(),
          subtitle: mockForm.subtitle.trim() || null,
          groupLabel: mockForm.groupLabel.trim() || String(new Date().getFullYear()),
          month: mockForm.month.trim() || defaultSatMonth(),
          year: Number(mockForm.year) || new Date().getFullYear(),
          orderInMonth: Number(mockForm.orderInMonth) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create mock");
      setMockForm(EMPTY_MOCK_FORM);
      setShowAdvancedMockFields(false);
      await loadMocks();
      // Jump straight into the new mock's question bank — previously nothing
      // visibly happened after creating one; you had to scroll down and find
      // "Manage" yourself.
      if (data.id) {
        setSelectedMockId(data.id);
        requestAnimationFrame(() => {
          document.getElementById("question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (err) {
      setMockFormError(err instanceof Error ? err.message : "Failed to create mock");
    } finally {
      setCreatingMock(false);
    }
  }

  async function handleDeleteMock(id: string) {
    setMockActionError(null);
    if (!confirm("Delete this mock and its question bank? This can't be undone.")) return;
    setDeletingMockId(id);
    try {
      const res = await fetch(`/api/admin/mocks/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete mock");
      if (selectedMockId === id) setSelectedMockId(null);
      await loadMocks();
    } catch (err) {
      setMockActionError(err instanceof Error ? err.message : "Failed to delete mock");
    } finally {
      setDeletingMockId(null);
    }
  }

  async function handleWipeAll() {
    setMockActionError(null);
    if (!mocks || mocks.length === 0) return;
    const first = confirm(
      `Delete ALL ${mocks.length} mock(s) and every question in them? This also clears attempts, answers, scores, and reports tied to them. This cannot be undone.`
    );
    if (!first) return;
    const typed = prompt('Type "DELETE ALL" to confirm.');
    if (typed !== "DELETE ALL") return;
    setWipingAll(true);
    try {
      const res = await fetch("/api/admin/wipe", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to wipe mocks");
      setSelectedMockId(null);
      await loadMocks();
    } catch (err) {
      setMockActionError(err instanceof Error ? err.message : "Failed to wipe mocks");
    } finally {
      setWipingAll(false);
    }
  }

  async function handleReleaseAll() {
    setMockActionError(null);
    setReleaseAllMsg(null);
    setReleasingAll(true);
    try {
      const res = await fetch("/api/admin/release-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to release modules");
      setReleaseAllMsg(
        data.released > 0
          ? `Released ${data.released} module(s) that had questions but weren't visible yet.`
          : "Everything with questions is already released."
      );
      if (selectedMockId) await loadReleases(selectedMockId);
    } catch (err) {
      setMockActionError(err instanceof Error ? err.message : "Failed to release modules");
    } finally {
      setReleasingAll(false);
    }
  }

  function startEditMock(m: AdminMockSummary) {
    setMockActionError(null);
    setEditingMockId(m.id);
    setMockEditForm({
      title: m.title,
      subtitle: m.subtitle ?? "",
      groupLabel: m.group_label,
      month: m.month as (typeof SAT_TEST_MONTHS)[number],
      year: m.year,
      orderInMonth: m.order_in_month,
    });
  }

  async function handleSaveMockEdit(id: string) {
    setMockActionError(null);
    setSavingMockEdit(true);
    try {
      const res = await fetch(`/api/admin/mocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: mockEditForm.title.trim(),
          subtitle: mockEditForm.subtitle.trim() || null,
          groupLabel: mockEditForm.groupLabel.trim(),
          month: mockEditForm.month.trim(),
          year: Number(mockEditForm.year),
          orderInMonth: Number(mockEditForm.orderInMonth) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save changes");
      setEditingMockId(null);
      await loadMocks();
    } catch (err) {
      setMockActionError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingMockEdit(false);
    }
  }

  async function loadUsers() {
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      setUsers(data.users);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  async function loadReports(filter: "open" | "all") {
    setReportsError(null);
    try {
      const res = await fetch(`/api/admin/reports${filter === "open" ? "?status=open" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reports");
      setReports(data.reports);
    } catch (err) {
      setReportsError(err instanceof Error ? err.message : "Failed to load reports");
    }
  }

  useEffect(() => {
    if (tab === "users" && !users) loadUsers();
    if (tab === "reports") loadReports(reportFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reportFilter]);

  async function handleReportAction(id: string, status: "resolved" | "dismissed") {
    setReportBusyId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update report");
      await loadReports(reportFilter);
    } catch (err) {
      setReportsError(err instanceof Error ? err.message : "Failed to update report");
    } finally {
      setReportBusyId(null);
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
      await loadMocks();
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
    reader.onload = () => {
      setQForm((f) => ({ ...f, imageData: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  function handleQuestionImagePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQForm((f) => ({ ...f, imageData: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  function addChoice() {
    setQForm((f) => ({
      ...f,
      choices: [...f.choices, { id: String.fromCharCode(65 + f.choices.length), text: "" }],
    }));
  }

  function removeChoice(index: number) {
    setQForm((f) => ({ ...f, choices: f.choices.filter((_, i) => i !== index) }));
  }

  // Fires when the admin finishes typing the question (blur) — fills in
  // domain/skill/difficulty automatically so they never have to touch
  // College Board's taxonomy by hand. Only runs for brand-new questions
  // (never for an edit, since an existing question already has real
  // values an admin might be deliberately fine-tuning). Returns the
  // result so handleAddQuestion can use it immediately on submit, since
  // setQForm's update wouldn't be visible in the same tick otherwise.
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
    if (!selectedMockId) return;
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

    // Brand-new question and auto-classify hasn't run yet (e.g. they
    // pasted text and hit submit before ever blurring the field, so the
    // onBlur trigger never fired) — run it now rather than silently
    // saving the placeholder domain/skill from defaultQuestionForm(). If
    // it still fails, fall through and save with whatever's showing;
    // Advanced options lets them fix it, and an AI hiccup shouldn't block
    // saving the question entirely.
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

    // Same idea for rationale/explanation — the admin never writes these
    // by hand, AI drafts them from the finished question + correct answer.
    // Only for brand-new questions; editing keeps whatever's already
    // there rather than silently rewriting a previously reviewed answer.
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
      mockId: selectedMockId,
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
      setQForm(defaultQuestionForm(selectedMockId, qForm.section, qForm.module));
      setClassifiedAuto(false);
      setClassifyError(null);
      setRationaleError(null);
      const refreshed = await fetch(`/api/admin/questions?mockId=${selectedMockId}`).then((r) => r.json());
      setQuestions(refreshed.questions);
      await loadMocks();
      await loadReleases(selectedMockId);
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
    setClassifiedAuto(true); // existing question already has real values — don't force a reclassify on blur
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
    // Scroll the form into view so it's obvious editing started.
    document.getElementById("question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditQuestion() {
    setEditingId(null);
    setQFormError(null);
    setQFormOk(null);
    setQForm(defaultQuestionForm(selectedMockId ?? ""));
    setClassifiedAuto(false);
    setClassifyError(null);
    setRationaleError(null);
  }

  async function handleBulkImport() {
    if (!selectedMockId) return;
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

    const items = (parsed as Record<string, unknown>[]).map((item) => ({
      ...item,
      mockId: item.mockId ?? selectedMockId,
    }));

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
      const refreshed = await fetch(`/api/admin/questions?mockId=${selectedMockId}`).then((r) => r.json());
      setQuestions(refreshed.questions);
      await loadMocks();
      await loadReleases(selectedMockId);
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
      const base64 = result.split(",")[1] ?? "";
      setAiImage({ base64, mimeType: file.type || "image/jpeg", name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function handleAiPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      setAiPdf({ base64, name: file.name });
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
          // Surface the REAL per-batch errors (e.g. Groq rejecting an
          // oversized request) instead of a generic "nothing found" —
          // that used to be swallowed here, hiding the actual cause.
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
        if (data.batchErrors?.length) {
          setAiError(`Some pages couldn't be processed:\n${data.batchErrors.join("\n")}`);
        }
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
        body: JSON.stringify({
          text: aiText.trim() || undefined,
          imageBase64: aiImage?.base64,
          imageMimeType: aiImage?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      if (data.batchCount) {
        // Large paste that got split into batches (see extract/route.ts) —
        // mirror the PDF path's progress feedback.
        setAiProgress(`Processed ${data.batchCount} batch(es) — found ${data.questions?.length ?? 0} question(s).`);
        if (data.batchErrors?.length) {
          setAiError(`Some sections couldn't be processed:\n${data.batchErrors.join("\n")}`);
        }
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

  // Sets the correct answer on a draft via its choice id — used by the
  // structured picker (radio-style buttons) rather than making the admin
  // hand-edit raw JSON just to mark which choice is right.
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

  // Generic "edit a field on a draft without touching raw JSON by hand"
  // helper — backs the editable question-text textarea and per-choice text
  // inputs in the review list below. Silently no-ops on a draft whose JSON
  // is currently invalid (the raw-JSON editor already surfaces that error).
  function updateDraftField(id: string, mutate: (parsed: any) => void) {
    setAiDrafts(
      (drafts) =>
        drafts?.map((d) => {
          if (d.id !== id) return d;
          try {
            const parsed = JSON.parse(d.raw);
            mutate(parsed);
            return { ...d, raw: JSON.stringify(parsed, null, 2), error: null };
          } catch {
            return d;
          }
        }) ?? null
    );
  }

  function removeDraft(id: string) {
    setAiDrafts((drafts) => drafts?.filter((d) => d.id !== id) ?? null);
  }

  async function handleImportApprovedDrafts() {
    if (!selectedMockId || !aiDrafts) return;
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
        toImport.push({ ...parsed, mockId: selectedMockId });
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
      // Drop the imported drafts, keep any the admin left unchecked.
      setAiDrafts((drafts) => drafts?.filter((d) => !d.include) ?? null);
      const refreshed = await fetch(`/api/admin/questions?mockId=${selectedMockId}`).then((r) => r.json());
      setQuestions(refreshed.questions);
      await loadMocks();
      await loadReleases(selectedMockId);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setAiImporting(false);
    }
  }

  const domainOptionsForSection = (section: Section) =>
    Object.keys(DOMAINS).filter((d) => DOMAINS[d].section === section);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Admin</h1>
        <p className="text-brand-slate mt-1">Manage mocks, users, and question reports. Owner-only.</p>
      </div>

      <div className="flex gap-2 border-b border-brand-border">
        {(["mocks", "users", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px capitalize ${
              tab === t ? "border-brand-blue text-brand-blue" : "border-transparent text-brand-slate hover:text-brand-navy"
            }`}
          >
            {t === "mocks" ? "Mocks & Questions" : t}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="card p-6">
          <h2 className="font-bold text-brand-navy mb-4">Real users</h2>
          {usersError && <p className="text-sm text-brand-red mb-3">{usersError}</p>}
          {!users ? (
            <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
          ) : users.length === 0 ? (
            <p className="text-sm text-brand-slate">No signed-up users yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brand-slate border-b border-brand-border">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Joined</th>
                    <th className="py-2 pr-3">Attempts</th>
                    <th className="py-2 pr-3">Completed</th>
                    <th className="py-2 pr-3">Latest score</th>
                    <th className="py-2 pr-3">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-brand-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-brand-navy">{u.name}</td>
                      <td className="py-2 pr-3 text-brand-slate">{u.email}</td>
                      <td className="py-2 pr-3 text-brand-slate">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3 text-brand-slate">{u.attemptCount}</td>
                      <td className="py-2 pr-3 text-brand-slate">{u.completedAttemptCount}</td>
                      <td className="py-2 pr-3 text-brand-slate">{u.latestScore ?? "—"}</td>
                      <td className="py-2 pr-3 text-brand-slate">
                        {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-brand-navy">Question reports</h2>
            <div className="flex gap-2">
              {(["open", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border capitalize ${
                    reportFilter === f ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-slate"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {reportsError && <p className="text-sm text-brand-red mb-3">{reportsError}</p>}
          {!reports ? (
            <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
          ) : reports.length === 0 ? (
            <p className="text-sm text-brand-slate">No {reportFilter === "open" ? "open " : ""}reports.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="border border-brand-border rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-brand-slate mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-brand-red-light text-brand-red font-medium capitalize">
                      {r.reason.replace("_", " ")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium capitalize ${
                        r.status === "open"
                          ? "bg-brand-amber-light text-brand-amber"
                          : r.status === "resolved"
                            ? "bg-brand-green-light text-brand-green"
                            : "bg-slate-100 text-brand-slate"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span>{r.mock_title ?? "Practice question"}</span>
                    <span>· {r.section}</span>
                    <span>· {r.skill}</span>
                    <span>· {new Date(r.created_at).toLocaleString()}</span>
                    {r.reporter_email && <span>· by {r.reporter_email}</span>}
                    {!r.reporter_email && <span>· by guest</span>}
                  </div>
                  <p className="text-sm text-brand-navy mb-1 line-clamp-2">{r.question_text}</p>
                  {r.details && <p className="text-xs text-brand-slate italic mb-2">“{r.details}”</p>}
                  {r.status === "open" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleReportAction(r.id, "resolved")}
                        disabled={reportBusyId === r.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-green text-brand-green hover:bg-brand-green-light"
                      >
                        Mark resolved
                      </button>
                      <button
                        onClick={() => handleReportAction(r.id, "dismissed")}
                        disabled={reportBusyId === r.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-slate hover:bg-slate-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "mocks" && (
      <>
      <PracticeBankPanel />

      {/* New mock form */}
      <div className="card p-6">
        <h2 className="font-bold text-brand-navy mb-1">Add a new mock</h2>
        <p className="text-sm text-brand-slate mb-4">
          Just give it a name — everything else (month, year, group) is filled in automatically and you
          can change it later from the table below.
        </p>
        <form onSubmit={handleCreateMock} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              autoFocus
              className="flex-1 rounded-lg border border-brand-border px-4 py-3 text-base"
              value={mockForm.title}
              onChange={(e) => setMockForm((f) => ({ ...f, title: e.target.value }))}
              placeholder='e.g. "August 2026 SAT" or "BlueMind Practice Test 5"'
            />
            <button type="submit" disabled={creatingMock} className="btn-primary text-sm px-6 whitespace-nowrap">
              {creatingMock ? "Creating…" : "+ Create mock"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedMockFields((v) => !v)}
            className="text-xs text-brand-blue font-medium underline"
          >
            {showAdvancedMockFields ? "Hide advanced options" : "Advanced options (subtitle, group, date)"}
          </button>

          {showAdvancedMockFields && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-brand-border">
              <label className="text-sm text-brand-navy">
                Subtitle (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                  value={mockForm.subtitle}
                  onChange={(e) => setMockForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="Form V1"
                />
              </label>
              <label className="text-sm text-brand-navy">
                Group label (sidebar section on the homepage)
                <input
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                  value={mockForm.groupLabel}
                  onChange={(e) => setMockForm((f) => ({ ...f, groupLabel: e.target.value }))}
                  placeholder="2026 / 2025 / 2024 / BlueMind Tests"
                />
              </label>
              <label className="text-sm text-brand-navy">
                Month
                <select
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                  value={mockForm.month}
                  onChange={(e) => setMockForm((f) => ({ ...f, month: e.target.value as (typeof SAT_TEST_MONTHS)[number] }))}
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-brand-navy">
                Year
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                  value={mockForm.year}
                  onChange={(e) => setMockForm((f) => ({ ...f, year: Number(e.target.value) }))}
                />
              </label>
              <label className="text-sm text-brand-navy">
                Order within the month
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                  value={mockForm.orderInMonth}
                  onChange={(e) => setMockForm((f) => ({ ...f, orderInMonth: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}

          {mockFormError && <p className="text-sm text-brand-red">{mockFormError}</p>}
        </form>
      </div>

      {/* Mocks table */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-brand-navy">Mocks</h2>
          <div className="flex items-center gap-2">
            {mocks && mocks.length > 0 && (
              <button
                onClick={handleReleaseAll}
                disabled={releasingAll}
                title="Un-hides any module that has questions banked but isn't released yet"
                className="text-xs px-3 py-1.5 rounded-lg border border-brand-green text-brand-green hover:bg-brand-green-light"
              >
                {releasingAll ? "Releasing…" : "Release all banked modules"}
              </button>
            )}
            {mocks && mocks.length > 0 && (
              <button
                onClick={handleWipeAll}
                disabled={wipingAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-brand-red text-brand-red hover:bg-brand-red-light"
              >
                {wipingAll ? "Deleting everything…" : "Delete ALL mocks & questions"}
              </button>
            )}
          </div>
        </div>
        {releaseAllMsg && <p className="text-sm text-brand-green mb-3">{releaseAllMsg}</p>}
        {listError && <p className="text-sm text-brand-red mb-3">{listError}</p>}
        {mockActionError && <p className="text-sm text-brand-red mb-3">{mockActionError}</p>}
        {!mocks ? (
          <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        ) : mocks.length === 0 ? (
          <p className="text-sm text-brand-slate">No mocks yet — create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-slate border-b border-brand-border">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Group</th>
                  <th className="py-2 pr-3">Month / Year</th>
                  <th className="py-2 pr-3">Questions</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {mocks.map((m) => (
                  editingMockId === m.id ? (
                    <tr key={m.id} className="border-b border-brand-border last:border-0 bg-slate-50">
                      <td colSpan={6} className="py-3 pr-3">
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <label className="text-xs text-brand-navy">
                            Title
                            <input
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.title}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, title: e.target.value }))}
                            />
                          </label>
                          <label className="text-xs text-brand-navy">
                            Subtitle
                            <input
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.subtitle}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, subtitle: e.target.value }))}
                            />
                          </label>
                          <label className="text-xs text-brand-navy">
                            Group label
                            <input
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.groupLabel}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, groupLabel: e.target.value }))}
                            />
                          </label>
                          <label className="text-xs text-brand-navy">
                            Month
                            <select
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.month}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, month: e.target.value as (typeof SAT_TEST_MONTHS)[number] }))}
                            >
                              {MONTH_NAMES.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-brand-navy">
                            Year
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.year}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, year: Number(e.target.value) }))}
                            />
                          </label>
                          <label className="text-xs text-brand-navy">
                            Order in month
                            <input
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-sm"
                              value={mockEditForm.orderInMonth}
                              onChange={(e) => setMockEditForm((f) => ({ ...f, orderInMonth: Number(e.target.value) }))}
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleSaveMockEdit(m.id)}
                            disabled={savingMockEdit}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            {savingMockEdit ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingMockId(null)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-brand-border text-brand-slate hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={m.id}
                      className={`border-b border-brand-border last:border-0 ${
                        selectedMockId === m.id ? "bg-brand-blue-light" : ""
                      }`}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-brand-navy">{m.title}</div>
                        {m.subtitle && <div className="text-xs text-brand-slate">{m.subtitle}</div>}
                      </td>
                      <td className="py-2 pr-3 text-brand-slate">{m.group_label}</td>
                      <td className="py-2 pr-3 text-brand-slate">
                        {m.month} {m.year}
                      </td>
                      <td className="py-2 pr-3 text-brand-slate">{m.questionCount}</td>
                      <td className="py-2 pr-3 text-brand-slate">{m.attemptCount}</td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setSelectedMockId(m.id === selectedMockId ? null : m.id)}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            {selectedMockId === m.id ? "Close" : "Manage"}
                          </button>
                          <button
                            onClick={() => startEditMock(m)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue hover:bg-brand-blue-light"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMock(m.id)}
                            disabled={deletingMockId === m.id}
                            className="text-xs px-3 py-1.5 rounded-lg border border-brand-red text-brand-red hover:bg-brand-red-light"
                          >
                            {deletingMockId === m.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Question bank for selected mock */}
      {selectedMock && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-bold text-brand-navy mb-1">
              Question bank — {selectedMock.title}
            </h2>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-brand-slate">
                {moduleFocus
                  ? `Showing ${moduleFocus.section === "Reading and Writing" ? "R&W" : "Math"} · Module ${moduleFocus.module} only`
                  : `${selectedMock.questionCount} question(s) banked.`}
              </p>
              {moduleFocus && (
                <button
                  onClick={() => setModuleFocus(null)}
                  className="text-xs text-brand-blue underline font-medium"
                >
                  Show all modules
                </button>
              )}
            </div>

            {/* A mock whose month/group aren't in the public library's allowed
                set (real SAT months only; fixed 2023-2026 groups) will NEVER
                show up for students no matter what gets released below —
                without this, "Release" looks broken instead of working
                exactly as designed. */}
            {(!(SAT_TEST_MONTHS as readonly string[]).includes(selectedMock.month) ||
              !["2026", "2025", "2024", "2023"].includes(selectedMock.group_label)) && (
              <div className="mb-5 p-4 rounded-lg border border-brand-amber bg-brand-amber-light">
                <p className="text-sm font-semibold text-brand-navy mb-1">⚠️ This mock won't appear to students yet</p>
                <p className="text-xs text-brand-navy">
                  {!(SAT_TEST_MONTHS as readonly string[]).includes(selectedMock.month) && (
                    <>
                      Its month ("{selectedMock.month}") isn't a real SAT test month — the public library only shows{" "}
                      {SAT_TEST_MONTHS.join(", ")}.{" "}
                    </>
                  )}
                  {!["2026", "2025", "2024", "2023"].includes(selectedMock.group_label) && (
                    <>Its group ("{selectedMock.group_label}") isn't one of 2023-2026, so it's excluded too. </>
                  )}
                  Releasing modules below still saves that state, but fix this via “Edit” in the table above for it to
                  actually show up.
                </p>
              </div>
            )}

            {/* Release status — a module can be fully banked with questions and
                still not visible to students until explicitly released here.
                That's separate from question count on purpose, so a
                half-finished module never accidentally goes live. */}
            <div className="mb-5 p-4 rounded-lg border border-brand-border bg-slate-50">
              <p className="text-sm font-semibold text-brand-navy mb-0.5">Release to students</p>
              <p className="text-xs text-brand-slate mb-3">
                A module only shows "Start Practice" on the student Mocks page once it's released here —
                otherwise it shows "Coming soon", even if questions are already banked.
              </p>
              {releasesError && <p className="text-xs text-brand-red mb-2">{releasesError}</p>}
              {!releases ? (
                <div className="h-14 bg-slate-200 rounded-lg animate-pulse" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {releases.map((r) => {
                    const key = `${r.section}|${r.module}`;
                    const isFocused = moduleFocus?.section === r.section && moduleFocus?.module === r.module;
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => focusModule(r.section, r.module)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") focusModule(r.section, r.module);
                        }}
                        title="Click to focus the question list and import tools on this module"
                        className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                          isFocused
                            ? "border-brand-blue ring-2 ring-brand-blue bg-brand-blue-light"
                            : r.released
                              ? "border-brand-green bg-brand-green-light"
                              : "border-brand-border bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-xs font-semibold text-brand-navy">
                          {r.section === "Reading and Writing" ? "R&W" : "Math"} · Module {r.module}
                        </p>
                        <p className="text-xs text-brand-slate mt-0.5 mb-2">{r.questionCount} question(s)</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRelease(r.section, r.module, !r.released);
                          }}
                          disabled={releaseBusyKey === key || (!r.released && r.questionCount === 0)}
                          title={!r.released && r.questionCount === 0 ? "Add questions to this module first" : undefined}
                          className={`w-full text-xs font-semibold px-2 py-1.5 rounded-md ${
                            r.released
                              ? "border border-brand-red text-brand-red hover:bg-brand-red-light bg-white"
                              : "btn-primary"
                          } disabled:opacity-40`}
                        >
                          {releaseBusyKey === key ? "…" : r.released ? "Unrelease" : "Release"}
                        </button>
                        {r.questionCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearModule(r.section, r.module);
                            }}
                            disabled={clearingModuleKey === key}
                            title="Delete every question in this module — for starting a bad import over"
                            className="w-full text-[11px] font-medium px-2 py-1 mt-1.5 rounded-md text-brand-red hover:bg-brand-red-light"
                          >
                            {clearingModuleKey === key ? "Clearing…" : "Clear module"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {questionsError && <p className="text-sm text-brand-red mb-3">{questionsError}</p>}
            {!questions ? (
              <div className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ) : (() => {
              const visibleQuestions = moduleFocus
                ? questions.filter((q) => q.section === moduleFocus.section && q.module === moduleFocus.module)
                : questions;
              if (visibleQuestions.length === 0) {
                return (
                  <p className="text-sm text-brand-slate">
                    {moduleFocus ? "No questions in this module yet." : "No questions yet for this mock."}
                  </p>
                );
              }
              return (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(() => {
                  // Running per-(section, module) counters so each question shows
                  // its actual position in the exam — Q1, Q2, Q3… — not just a
                  // list index. Questions already arrive sorted by
                  // section, module, position from the API.
                  const seen: Record<string, number> = {};
                  return visibleQuestions.map((q) => {
                    const groupKey = `${q.section}|${q.module}`;
                    seen[groupKey] = (seen[groupKey] ?? 0) + 1;
                    const qNumber = seen[groupKey];
                    return (
                      <div
                        key={q.id}
                        className="flex items-start justify-between gap-3 border border-brand-border rounded-lg p-3"
                      >
                        <div className="min-w-0 flex items-start gap-3">
                          <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 text-brand-navy text-xs font-bold flex items-center justify-center mt-0.5">
                            {qNumber}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                              <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">
                                {q.section}
                              </span>
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
              );
            })()}
          </div>

          {/* Add / edit question form */}
          <div className="card p-6" id="question-form">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-brand-navy">
                {editingId ? "Edit question" : "Add a question"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditQuestion}
                  className="text-xs text-brand-slate underline"
                >
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
                          // Student-produced response (grid-in, no answer
                          // choices) is a Math-only format on the real
                          // Digital SAT — force back to multiple choice
                          // whenever switching to R&W so a stray SPR
                          // question can't end up there.
                          questionType: s === "Math" ? f.questionType : "multiple_choice",
                        }));
                      }}
                      className={`rounded-xl border-2 py-3 text-sm font-semibold transition-colors ${
                        qForm.section === s
                          ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                          : "border-brand-border text-brand-slate hover:bg-slate-50"
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
                        qForm.module === m
                          ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                          : "border-brand-border text-brand-slate hover:bg-slate-50"
                      }`}
                    >
                      Module {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-brand-navy mb-2">Category</p>
                <p className="text-xs text-brand-slate">
                  Detected automatically from the question text below — you don't need to know the taxonomy.
                </p>
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
                            qForm.difficulty === d
                              ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                              : "border-brand-border text-brand-slate hover:bg-slate-50"
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
                    <label className="text-sm text-brand-navy">
                      Estimated time (seconds)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                        value={qForm.estimatedTime}
                        onChange={(e) => setQForm((f) => ({ ...f, estimatedTime: Number(e.target.value) }))}
                      />
                    </label>
                    {qForm.section === "Math" && (
                      <label className="text-sm text-brand-navy">
                        Question type
                        <select
                          className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
                          value={qForm.questionType}
                          onChange={(e) =>
                            setQForm((f) => ({ ...f, questionType: e.target.value as "multiple_choice" | "spr" }))
                          }
                        >
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="spr">Student-produced response (no answer choices)</option>
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {qForm.section === "Reading and Writing" && (
                <div>
                  <p className="text-sm text-brand-navy mb-1">Passage text</p>
                  <FormatToolbar
                    textareaRef={passageTextareaRef}
                    value={qForm.passageText}
                    onChange={(v) => setQForm((f) => ({ ...f, passageText: v }))}
                  />
                  <textarea
                    id="passage-text-field"
                    ref={passageTextareaRef}
                    className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-32"
                    value={qForm.passageText}
                    onChange={(e) => setQForm((f) => ({ ...f, passageText: e.target.value }))}
                    placeholder="The passage shown on the left side of the R&W screen. Use the toolbar above for italics, underlines, and math — or type *italic*, __underline__, $...$ / $$...$$ yourself."
                  />
                  {qForm.passageText.trim() && (
                    <div className="mt-2 rounded-lg border border-brand-border bg-slate-50 px-3 py-2 text-sm text-brand-navy">
                      <p className="text-xs text-brand-slate mb-1">Preview</p>
                      <MathText text={qForm.passageText} />
                    </div>
                  )}
                </div>
              )}

              {/* Optional chart/graph/photo — shown above the passage/stem on
                  the student's left pane. Common in real R&W "data from a
                  graph" items and some Math questions. Stored as a base64
                  data URL directly in the question row — no separate file
                  storage needed for a SQLite-backed single-server app. */}
              <div>
                <p className="text-sm text-brand-navy mb-1">Chart / graph / photo (optional)</p>
                {qForm.imageData ? (
                  <div className="space-y-2">
                    <img
                      src={qForm.imageData}
                      alt="Question figure preview"
                      className="max-w-full h-auto max-h-56 rounded-lg border border-brand-border"
                    />
                    <button
                      type="button"
                      onClick={() => setQForm((f) => ({ ...f, imageData: null }))}
                      className="text-xs text-brand-red underline"
                    >
                      Remove image
                    </button>
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
                  <button
                    type="button"
                    onClick={() => setShowLivePreview((v) => !v)}
                    className="text-[11px] font-medium text-brand-blue underline underline-offset-2"
                  >
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
                  placeholder="Use the toolbar above for italics, underlines, and math — or type *italic*, __underline__, $...$ / $$...$$ yourself, e.g. $x^2 + 3x = 0$"
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
                            <img
                              src={qForm.imageData}
                              alt="Question figure preview"
                              className="max-w-full h-auto rounded-lg border border-brand-border mb-3"
                            />
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
                        <button
                          type="button"
                          onClick={() => removeChoice(i)}
                          className="text-xs text-brand-red px-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addChoice} className="btn-secondary text-xs mt-2">
                    + Add choice
                  </button>
                  <div className="mt-3">
                    <label className="block text-sm text-brand-navy mb-1.5">
                      Correct answer(s) — click every letter that should count as correct
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {qForm.choices.map((c) => {
                        const accepted = qForm.correctAnswer.split(",").map((s) => s.trim()).filter(Boolean);
                        const isCorrect = accepted.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              const next = isCorrect ? accepted.filter((id) => id !== c.id) : [...accepted, c.id];
                              setQForm((f) => ({ ...f, correctAnswer: next.join(",") }));
                            }}
                            title={isCorrect ? "Correct — click to unmark" : "Click to mark as correct"}
                            className={`w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center ${
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
                    <span>
                      Rationale and explanation are written automatically from the question, choices, and correct
                      answer when you save — nothing to fill in here.
                    </span>
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

          {/* AI-assisted import: paste text or a photo, review drafts before saving */}
          <div className="card p-6">
            <h2 className="font-bold text-brand-navy mb-1">AI-assisted import</h2>
            <p className="text-sm text-brand-slate mb-3">
              Paste question text, attach a photo (worksheet, screenshot, textbook page), or upload a full PDF
              (a whole mock, a chapter, whatever you've got). AI extracts draft questions below — nothing is
              saved until you review and approve them.
            </p>

            <div className="mb-3">
              <p className="text-xs font-semibold text-brand-navy mb-1.5">
                This batch is for Module
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {([1, 2] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAiModule(m)}
                    className={`rounded-lg border-2 py-2 text-sm font-semibold transition-colors ${
                      aiModule === m
                        ? "border-brand-blue bg-brand-blue-light text-brand-blue"
                        : "border-brand-border text-brand-slate hover:bg-slate-50"
                    }`}
                  >
                    Module {m}
                  </button>
                ))}
              </div>
              <p className="text-xs text-brand-slate mt-1">
                Every question extracted below is tagged Module {aiModule} automatically — upload one module at a
                time and you won't have to set this per question.
              </p>
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
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleAiPdfChange}
                  disabled={!!aiImage || !!aiText.trim()}
                />
              </label>
              {aiPdf && (
                <button onClick={() => { setAiPdf(null); setAiProgress(null); }} className="text-xs text-brand-red">
                  Remove PDF
                </button>
              )}
              <button
                onClick={handleExtractWithAI}
                disabled={aiExtracting || (!aiText.trim() && !aiImage && !aiPdf)}
                className="btn-primary text-sm ml-auto"
              >
                {aiExtracting ? "Extracting\u2026" : "Extract with AI"}
              </button>
            </div>
            {aiPdf && (
              <p className="text-xs text-brand-slate mt-2">
                Large PDFs are processed a couple of pages at a time so nothing gets cut off — a 50-page file can
                take a few minutes. Leave this tab open until it finishes.
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
                    {aiImporting ? "Importing\u2026" : `Import ${aiDrafts.filter((d) => d.include).length} approved`}
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
                  const needsAnswer =
                    !isSpr &&
                    (!preview.correctAnswer || !preview.choices?.some((c) => c.id === preview.correctAnswer));
                  return (
                    <div key={d.id} className={`border rounded-lg p-3 ${d.include ? "border-brand-border" : "border-brand-border opacity-50"} ${needsAnswer && d.include ? "border-brand-red" : ""}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={d.include}
                          onChange={() => toggleDraftInclude(d.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2 text-xs text-brand-slate mb-1">
                            {preview.section && <span className="px-2 py-0.5 rounded-full bg-brand-blue-light text-brand-blue">{preview.section}</span>}
                            {preview.module && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-brand-navy font-medium">Module {preview.module}</span>}
                            {preview.skill && <span>{preview.skill}</span>}
                            {preview.difficulty && <span>· {preview.difficulty}</span>}
                          </div>
                          {preview.questionText !== undefined && (
                            <div className="mb-2">
                              <textarea
                                value={preview.questionText}
                                onChange={(e) =>
                                  updateDraftField(d.id, (p) => {
                                    p.questionText = e.target.value;
                                  })
                                }
                                className="w-full rounded-lg border border-brand-border px-2.5 py-2 text-sm min-h-16"
                              />
                              {preview.questionText.trim() && (
                                <div className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-sm text-brand-navy">
                                  <MathText text={preview.questionText} />
                                </div>
                              )}
                            </div>
                          )}

                          {!isSpr && preview.choices && preview.choices.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-brand-navy mb-1.5">
                                Choices — edit text, tap a letter to mark it correct
                                {needsAnswer ? (
                                  <span className="text-brand-red font-normal"> — not selected, required before import</span>
                                ) : null}
                              </p>
                              <div className="space-y-1.5">
                                {preview.choices.map((c) => {
                                  const isCorrect = preview.correctAnswer === c.id;
                                  return (
                                    <div key={c.id} className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setDraftCorrectAnswer(d.id, c.id)}
                                        title="Mark as correct"
                                        className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-bold ${
                                          isCorrect
                                            ? "bg-brand-green border-brand-green text-white"
                                            : "border-brand-slate text-brand-slate hover:bg-slate-50"
                                        }`}
                                      >
                                        {c.id}
                                      </button>
                                      <input
                                        value={c.text}
                                        onChange={(e) =>
                                          updateDraftField(d.id, (p) => {
                                            const choice = p.choices?.find((pc: { id: string }) => pc.id === c.id);
                                            if (choice) choice.text = e.target.value;
                                          })
                                        }
                                        className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                                          isCorrect ? "border-brand-green bg-brand-green-light" : "border-brand-border"
                                        }`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {isSpr && (
                            <label className="block text-xs text-brand-navy mb-2">
                              Correct numeric answer
                              <input
                                value={preview.correctAnswer ?? ""}
                                onChange={(e) =>
                                  updateDraftField(d.id, (p) => {
                                    p.correctAnswer = e.target.value;
                                  })
                                }
                                className="mt-1 w-full max-w-[160px] rounded-lg border border-brand-border px-2.5 py-1.5 text-xs"
                              />
                            </label>
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
              Paste a JSON array of question objects (same fields as the form above, camelCase). If a
              question omits <code>mockId</code>, it's added to <strong>{selectedMock.title}</strong>{" "}
              automatically.
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
        </div>
      )}
      </>
      )}
    </div>
  );
}
