"use client";

import { MathText } from "@/components/MathText";

interface PreviewChoice {
  id: string;
  text: string;
}

interface QuestionPreviewModalProps {
  section: "Math" | "Reading and Writing";
  module: number;
  passageText: string | null;
  imageData: string | null;
  questionText: string;
  choices: PreviewChoice[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  onClose: () => void;
}

/**
 * Read-only replica of the real exam-taking screen (see
 * src/app/practice/[mockId]/[section]/[module]/page.tsx) — same split-pane
 * layout, number badge, and lettered choice bubbles — so an admin can sanity
 * check formatting/LaTeX/wording exactly as a student will see it, without
 * leaving the admin panel. The correct answer is highlighted green here
 * (never shown that way to students) since this is a review tool, not the
 * live exam.
 */
export function QuestionPreviewModal({
  section,
  module,
  passageText,
  imageData,
  questionText,
  choices,
  correctAnswer,
  questionType,
  onClose,
}: QuestionPreviewModalProps) {
  const isMath = section === "Math";

  return (
    <div className="fixed inset-0 z-50 bg-brand-navy/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-brand-border shrink-0 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-navy">
              Preview — exactly how this looks in the exam
            </span>
            <span className="text-xs text-brand-slate px-2 py-0.5 rounded-full bg-slate-200">
              {section} · Module {module}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-brand-slate hover:text-brand-navy text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            Close ✕
          </button>
        </div>

        {/* Question strip \u2014 mirrors the real exam's full-width strip above both panes */}
        <div className="px-6 sm:px-8 py-3 bg-[#F8FAFC] border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[4px] bg-black text-white text-[15px] font-bold flex items-center justify-center shrink-0">
              ?
            </span>
            <span className="text-sm font-medium text-brand-navy/80 flex items-center gap-1.5">
              Mark for Review
            </span>
            <div className="flex-1" />
            <span className="rounded-[6px] w-11 h-8 flex items-center justify-center text-[13px] font-bold tracking-tight bg-brand-blue text-white">
              ABC
            </span>
          </div>
          <div className="h-0 border-t-2 border-dashed border-black/70 mt-2.5" />
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left pane: stimulus */}
          <div className="overflow-y-auto p-6 sm:p-8 border-b md:border-b-0 md:border-r border-brand-border bg-white md:w-[45%] md:shrink-0">
            {imageData && (
              <img src={imageData} alt="Question figure" className="max-w-full h-auto rounded-lg border border-brand-border mb-4" />
            )}
            <div className="text-[15px] text-brand-navy leading-relaxed">
              <MathText text={isMath ? questionText : passageText || questionText} />
            </div>
          </div>

          {/* Right pane: response area */}
          <div className="flex-1 overflow-y-auto bg-white p-6 sm:p-8">
            {!isMath && passageText && (
              <p className="text-[15px] text-brand-navy leading-relaxed mb-6">
                <MathText text={questionText} />
              </p>
            )}

            {questionType === "spr" ? (
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-brand-slate mb-1.5">Answer</label>
                <input
                  disabled
                  placeholder="Student types their numeric answer here"
                  className="w-full px-3 py-2.5 rounded-lg border border-brand-border bg-slate-50 text-sm text-brand-slate"
                />
                <p className="text-xs text-brand-green font-semibold mt-2">Correct answer: {correctAnswer}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {choices.map((c) => {
                  const isCorrect = c.id === correctAnswer;
                  return (
                    <div
                      key={c.id}
                      className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-md border ${
                        isCorrect ? "border-brand-green bg-brand-green-light" : "border-[#D8D8D8]"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 flex items-center justify-center rounded-full border text-xs font-bold shrink-0 ${
                          isCorrect ? "bg-brand-green border-brand-green text-white" : "border-slate-400 text-slate-700"
                        }`}
                      >
                        {c.id}
                      </span>
                      <span className="text-[15px] text-brand-navy">
                        <MathText text={c.text} />
                      </span>
                      {isCorrect && <span className="ml-auto text-xs font-semibold text-brand-green shrink-0">Correct</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
