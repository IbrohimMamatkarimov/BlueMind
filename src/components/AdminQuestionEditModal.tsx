"use client";

import { useRef, useState } from "react";
import { DOMAINS, DIFFICULTIES } from "@/lib/sat-constants";
import { MathText } from "@/components/MathText";
import { FormatToolbar } from "@/components/FormatToolbar";

type Section = "Math" | "Reading and Writing";
type Choice = { id: string; text: string; imageData?: string | null };

/** Same paragraph-splitting behavior as the real exam page's PassageText
 * (blank-line-separated paragraphs, quoted-dialogue indent) — duplicated
 * here rather than imported since the exam page doesn't export it, so this
 * preview matches exactly what a student will actually see. */
function PassagePreview({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length <= 1) return <MathText text={text} />;
  return (
    <div>
      {paragraphs.map((p, i) => {
        const isQuoted = /^[\u201c"\u2018']/.test(p.trim());
        return (
          <p key={i} className={`mb-3 last:mb-0 ${isQuoted ? "pl-6" : ""}`}>
            <MathText text={p.trim()} />
          </p>
        );
      })}
    </div>
  );
}

export interface EditableQuestion {
  id: string;
  domain: string;
  skill: string;
  difficulty: string;
  passageText: string | null;
  imageData: string | null;
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
}

const domainOptionsForSection = (section: Section) => Object.keys(DOMAINS).filter((d) => DOMAINS[d].section === section);

/**
 * Add/edit a single question, used two ways:
 *  - "Manage Questions" on the signed-in Mocks page now opens the real exam
 *    page in admin mode, and THIS modal is what the little Edit/Delete/Add
 *    buttons there open — same content, no separate gray form screen.
 *  - Could also be reused anywhere else a quick single-question editor is
 *    useful later.
 *
 * All writes go through the existing admin-gated routes
 * (/api/admin/questions[, /:id]) — the same server-side requireAdmin()
 * check used everywhere else, so this is real authorization, not just a
 * hidden button.
 */
export function AdminQuestionEditModal({
  mockId,
  section,
  module,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  mockId: string;
  section: Section;
  module: 1 | 2;
  existing: EditableQuestion | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const firstDomain = domainOptionsForSection(section)[0];
  const [domain, setDomain] = useState(existing?.domain || firstDomain);
  const [skill, setSkill] = useState(existing?.skill || DOMAINS[existing?.domain || firstDomain]?.skills[0] || "");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>(
    (existing?.difficulty as (typeof DIFFICULTIES)[number]) || "Medium"
  );
  const [passageText, setPassageText] = useState(existing?.passageText ?? "");
  const [imageData, setImageData] = useState<string | null>(existing?.imageData ?? null);
  const [questionText, setQuestionText] = useState(existing?.questionText ?? "");
  const [questionType, setQuestionType] = useState<"multiple_choice" | "spr">(
    section === "Math" ? existing?.questionType ?? "multiple_choice" : "multiple_choice"
  );
  const [choices, setChoices] = useState<Choice[]>(
    existing?.choices?.length
      ? existing.choices
      : [
          { id: "A", text: "" },
          { id: "B", text: "" },
          { id: "C", text: "" },
          { id: "D", text: "" },
        ]
  );
  const [correctAnswer, setCorrectAnswer] = useState(existing?.correctAnswer ?? "A");
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [explanation, setExplanation] = useState(existing?.explanation ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passageRef = useRef<HTMLTextAreaElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  function updateChoice(i: number, text: string) {
    setChoices((cs) => cs.map((c, ci) => (ci === i ? { ...c, text } : c)));
  }

  // Smaller target size than the main passage/question image — an
  // answer-choice figure displays much smaller, so there's no reason to
  // keep it as large.
  function updateChoiceImage(i: number, file: File) {
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
          setChoices((cs) => cs.map((c, ci) => (ci === i ? { ...c, imageData: dataUrl } : c)));
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
        setChoices((cs) => cs.map((c, ci) => (ci === i ? { ...c, imageData: out } : c)));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setError(null);
    if (!questionText.trim()) {
      setError("Question text is required.");
      return;
    }
    if (questionType === "multiple_choice" && choices.some((c) => !c.text.trim() && !c.imageData)) {
      setError("Every choice needs text, an image, or both.");
      return;
    }
    if (!correctAnswer.trim()) {
      setError("Correct answer is required.");
      return;
    }

    const payload = {
      mockId,
      section,
      module,
      domain,
      skill,
      difficulty,
      passageText: section === "Reading and Writing" ? passageText.trim() || null : null,
      imageData,
      questionText: questionText.trim(),
      choices: questionType === "multiple_choice" ? choices : [],
      correctAnswer: correctAnswer.trim(),
      questionType,
      rationale: rationale.trim() || "—",
      explanation: explanation.trim() || "—",
    };

    setSaving(true);
    try {
      const res = existing
        ? await fetch(`/api/admin/questions/${existing.id}`, {
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
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing || !confirm("Delete this question? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/questions/${existing.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-brand-navy/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy">{existing ? "Edit question" : "Add a question"}</h2>
          <button onClick={onClose} className="text-brand-slate hover:text-brand-navy text-sm">
            Close
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm text-brand-navy">
            Domain
            <select
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setSkill(DOMAINS[e.target.value].skills[0]);
              }}
            >
              {domainOptionsForSection(section).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-brand-navy">
            Skill
            <select
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            >
              {DOMAINS[domain].skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-brand-navy">
            Difficulty
            <select
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm bg-white"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        {section === "Reading and Writing" && (
          <div>
            <p className="text-sm text-brand-navy mb-1">Passage text</p>
            <FormatToolbar textareaRef={passageRef} value={passageText} onChange={setPassageText} />
            <textarea
              ref={passageRef}
              className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-28"
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="The passage shown on the left side of the R&W screen."
            />
          </div>
        )}

        <div>
          <p className="text-sm text-brand-navy mb-1">Chart / graph / photo (optional)</p>
          {imageData ? (
            <div className="space-y-2">
              <img src={imageData} alt="" className="max-w-full h-auto max-h-48 rounded-lg border border-brand-border" />
              <button onClick={() => setImageData(null)} className="text-xs text-brand-red underline">
                Remove image
              </button>
            </div>
          ) : (
            <label className="inline-block text-xs px-3 py-2 rounded-lg border border-brand-border text-brand-navy hover:bg-slate-50 cursor-pointer">
              Attach image
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          )}
        </div>

        <div>
          <p className="text-sm text-brand-navy mb-1">Question text</p>
          <FormatToolbar textareaRef={questionRef} value={questionText} onChange={setQuestionText} />
          <textarea
            ref={questionRef}
            className="w-full rounded-b-lg border border-brand-border px-3 py-2 text-sm min-h-20"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Use the toolbar above for italics, underlines, and math, e.g. $x^2 + 3x = 0$"
          />
        </div>

        {/* Live preview — exactly how this renders on the real exam page,
            side by side matching the actual left/right split, updating as
            you type. */}
        {(passageText.trim() || questionText.trim()) && (
          <div>
            <p className="text-xs font-semibold text-brand-slate mb-1.5">Live preview — exactly how this looks in the mock</p>
            <div className="grid sm:grid-cols-2 gap-3 border border-brand-border rounded-lg overflow-hidden">
              <div className="p-4 bg-slate-50 border-b sm:border-b-0 sm:border-r border-brand-border">
                {passageText.trim() ? (
                  <div className={`text-sm text-brand-navy leading-relaxed ${section === "Reading and Writing" ? "font-serif" : ""}`}>
                    <PassagePreview text={passageText} />
                  </div>
                ) : (
                  <p className="text-xs text-brand-slate italic">No passage — left panel will be blank.</p>
                )}
              </div>
              <div className="p-4 bg-slate-50">
                {questionText.trim() ? (
                  <p className="text-sm text-brand-navy leading-relaxed">
                    <MathText text={questionText} />
                  </p>
                ) : (
                  <p className="text-xs text-brand-slate italic">Question text will appear here.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Student-produced response ("grid-in", no answer choices) is a
            Math-only format on the real Digital SAT — Reading & Writing
            never has it, so this toggle only shows for Math. */}
        {section === "Math" && (
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={questionType === "multiple_choice"} onChange={() => setQuestionType("multiple_choice")} />
              Multiple choice
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={questionType === "spr"} onChange={() => setQuestionType("spr")} />
              Student-produced response (no answer choices — student types a number)
            </label>
          </div>
        )}

        {questionType === "multiple_choice" ? (
          <div className="space-y-2">
            <p className="text-xs text-brand-slate">
              Click every letter that should count as correct — most questions have just one, but multi-select is
              supported.
            </p>
            {choices.map((c, i) => {
              const acceptedIds = correctAnswer.split(",").map((s) => s.trim()).filter(Boolean);
              const isCorrect = acceptedIds.includes(c.id);
              return (
              <div key={c.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = isCorrect ? acceptedIds.filter((id) => id !== c.id) : [...acceptedIds, c.id];
                    setCorrectAnswer(next.join(","));
                  }}
                  title={isCorrect ? "Correct answer — click to unmark" : "Click to mark as correct"}
                  className={`shrink-0 mt-1.5 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold ${
                    isCorrect ? "bg-brand-green border-brand-green text-white" : "border-brand-border text-brand-navy hover:border-brand-green"
                  }`}
                >
                  {c.id}
                </button>
                <div className="flex-1 min-w-0">
                  <input
                    value={c.text}
                    onChange={(e) => updateChoice(i, e.target.value)}
                    placeholder={c.imageData ? "Optional — leave blank for an image-only choice" : `Choice ${c.id} text`}
                    className="w-full rounded-lg border border-brand-border px-3 py-1.5 text-sm"
                  />
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
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) updateChoiceImage(i, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setChoices((cs) => cs.map((pc, pi) => (pi === i ? { ...pc, imageData: null } : pc)))}
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
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) updateChoiceImage(i, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <label className="block text-sm text-brand-navy">
            Correct numeric answer
            <input
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-sm"
            />
          </label>
        )}

        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Explanation (shown to students after they answer)"
          className="w-full min-h-20 rounded-lg border border-brand-border px-3 py-2 text-sm"
        />
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Short rationale (why the correct answer is correct)"
          className="w-full min-h-16 rounded-lg border border-brand-border px-3 py-2 text-sm"
        />

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          {existing ? (
            <button onClick={handleDelete} disabled={deleting} className="text-sm text-brand-red font-medium disabled:opacity-50">
              {deleting ? "Deleting…" : "Delete question"}
            </button>
          ) : (
            <span />
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 disabled:opacity-50">
            {saving ? "Saving…" : existing ? "Save changes" : "Add question"}
          </button>
        </div>
      </div>
    </div>
  );
}
