"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MathText } from "@/components/MathText";
import { BrainMark } from "@/components/BrainLogo";
import { CoachMarkdown } from "@/components/CoachMarkdown";
import { CoachSlideshow } from "@/components/CoachSlideshow";

/* ---------------------------------------------------------------------- */
/* Types                                                                   */
/* ---------------------------------------------------------------------- */

type Mode = "hint" | "explain" | "teach" | "similar_question" | "diagnose" | "study_plan" | "chat" | "photo";

interface CoachStructuredResponse {
  diagnosis: string;
  mistake_type: string;
  concept: string;
  hint: string;
  explanation: string;
  next_step: string;
  recommended_skill: string;
  difficulty: string;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  mode: Mode;
  text: string;
  note?: string; // short callout shown in the green "Note" box, assistant only
  imagePreview?: string;
}

interface QuestionContext {
  id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: string;
  passageText: string | null;
  questionText: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  questionType: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const MODE_LABELS: Record<Exclude<Mode, "chat" | "photo">, string> = {
  hint: "Hint",
  explain: "Explain",
  teach: "Teach me",
  similar_question: "Similar question",
  diagnose: "Diagnose my mistake",
  study_plan: "What should I study next?",
};

/** Splits a structured Gemini response into a main chat line plus an
 * optional short "Note" callout — mirrors the reference chat UI's pattern
 * of a short highlighted takeaway under the main answer. */
function renderTurn(mode: Mode, data: CoachStructuredResponse): { text: string; note?: string } {
  switch (mode) {
    case "hint":
      return { text: data.hint };
    case "explain":
      return { text: data.explanation, note: data.concept || undefined };
    case "teach":
      return { text: data.concept, note: data.explanation || undefined };
    case "similar_question":
      return { text: data.next_step };
    case "diagnose":
      return {
        text: data.diagnosis,
        note: data.mistake_type !== "n/a" ? `Likely cause: ${data.mistake_type.replace(/_/g, " ")}` : data.next_step || undefined,
      };
    case "study_plan":
      return { text: data.next_step, note: data.recommended_skill ? `Focus next: ${data.recommended_skill}` : undefined };
    case "photo":
      return { text: data.explanation || data.diagnosis, note: data.concept || undefined };
    case "chat":
    default:
      return { text: data.explanation || data.diagnosis || data.next_step || data.hint };
  }
}

function renderStoredAssistant(raw: string): { text: string; note?: string } {
  try {
    const data = JSON.parse(raw) as CoachStructuredResponse;
    const text = data.explanation || data.concept || data.diagnosis || data.hint || data.next_step || "";
    const note =
      [data.concept, data.explanation].find((v) => v && v !== text) ||
      (data.recommended_skill ? `Focus next: ${data.recommended_skill}` : undefined);
    return { text, note: note || undefined };
  } catch {
    return { text: raw };
  }
}

/* ---------------------------------------------------------------------- */
/* Icons                                                                   */
/* ---------------------------------------------------------------------- */

/** Turns markdown into plain, speakable text — without this, the Web
 * Speech API reads formatting symbols out loud verbatim ("## " becomes
 * "hash hash", "**" becomes "asterisk asterisk"), since Coach's raw
 * responses contain the same "## Title" / "**bold**" / "- bullet" / "$math$"
 * markup CoachSlideshow parses visually. */
function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/^#{1,6}\s*\d*\.?\s*/gm, "") // "## 3. Title" -> "Title"
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold** -> bold
    .replace(/\*(.*?)\*/g, "$1") // *italic* -> italic
    .replace(/^[-•]\s+/gm, "") // bullet markers
    .replace(/→|->/g, " to ") // arrows spoken naturally
    .replace(/\$\$?(.*?)\$\$?/g, "$1") // strip LaTeX $ delimiters, keep content
    .replace(/`([^`]*)`/g, "$1") // inline code backticks
    .replace(/[#*_~`]/g, "") // any leftover markdown symbols
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l16-7-6.5 16-2.5-7-7-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 12.5l6.5-6.5a3 3 0 114.2 4.2l-7.8 7.8a5 5 0 11-7.1-7.1l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" fill={active ? "currentColor" : "none"} />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {active ? (
        <path d="M16.5 8.5a5 5 0 010 7M19.2 6a9 9 0 010 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M16 9.5a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function ThumbUpIcon({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} aria-hidden="true">
      <path d="M7 11v9H4v-9h3zm3 9h7.5a2 2 0 001.9-1.4l1.9-5.7a1.5 1.5 0 00-1.4-2H15l.6-3.6A1.6 1.6 0 0014 5l-4 5.5V20z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function ThumbDownIcon({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} aria-hidden="true">
      <path d="M17 13V4h3v9h-3zm-3-9H6.5a2 2 0 00-1.9 1.4L2.7 11a1.5 1.5 0 001.4 2H9l-.6 3.6A1.6 1.6 0 0010 19l4-5.5V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 10L4 15l5 5M4 15h10a6 6 0 006-6V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Page                                                                    */
/* ---------------------------------------------------------------------- */

export default function CoachPage() {
  const searchParams = useSearchParams();
  const questionId = searchParams.get("questionId");
  const studentAnswerParam = searchParams.get("studentAnswer");

  const [question, setQuestion] = useState<QuestionContext | null>(null);
  const [questionLoading, setQuestionLoading] = useState(!!questionId);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [reactions, setReactions] = useState<Record<string, "up" | "down" | undefined>>({});

  // Chat history sidebar
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadConversations() {
    try {
      const res = await fetch("/api/coach/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations);
    } catch {
      // sidebar history is a nice-to-have — fail silently
    }
  }
  useEffect(() => {
    loadConversations();
  }, []);

  async function openConversation(id: string) {
    setSidebarOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/coach/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const loaded: ChatTurn[] = (data.messages as { role: "user" | "assistant"; content: string }[]).map((m, i) => {
        if (m.role === "user") {
          return { id: `${id}-${i}`, role: "user", mode: "chat", text: m.content.replace(/^\[|\]$/g, "") };
        }
        const { text, note } = renderStoredAssistant(m.content);
        return { id: `${id}-${i}`, role: "assistant", mode: "chat", text, note };
      });
      setTurns(loaded);
      setConversationId(id);
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setTurns([]);
    setConversationId(undefined);
    setInput("");
    setImage(null);
    setSidebarOpen(false);
  }

  // Voice narration (output) — Web Speech API. Picks the best-quality voice
  // available instead of leaving it to whatever the browser defaults to
  // (on Chrome/Windows that default is often a low-quality "Microsoft
  // David/Zira" robotic voice). Prefers Google's natural-sounding voices,
  // falls back to any local English voice, then whatever's first.
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const bestVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  function pickBestVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const byPreference =
      voices.find((v) => /Google US English/i.test(v.name)) ||
      voices.find((v) => /Google UK English Female/i.test(v.name)) ||
      voices.find((v) => /Natural/i.test(v.name) && /en/i.test(v.lang)) ||
      voices.find((v) => v.localService && /en-US/i.test(v.lang)) ||
      voices.find((v) => /en/i.test(v.lang)) ||
      voices[0];
    return byPreference ?? null;
  }

  useEffect(() => {
    const supported = typeof window !== "undefined" && "speechSynthesis" in window;
    setSpeechSupported(supported);
    if (!supported) return;
    bestVoiceRef.current = pickBestVoice();
    // Voice list loads asynchronously in most browsers — refresh once it's ready.
    const handle = () => {
      bestVoiceRef.current = pickBestVoice();
    };
    window.speechSynthesis.addEventListener("voiceschanged", handle);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handle);
      window.speechSynthesis.cancel();
    };
  }, []);

  function speak(id: string, text: string) {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text));
    if (bestVoiceRef.current) utterance.voice = bestVoiceRef.current;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  // Voice dictation (input) — SpeechRecognition, feeds the text box.
  const [dictating, setDictating] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setDictationSupported(!!SR);
  }, []);
  function toggleDictation() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (dictating) {
      recognitionRef.current?.stop();
      setDictating(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setDictating(false);
    recognition.onerror = () => setDictating(false);
    recognitionRef.current = recognition;
    recognition.start();
    setDictating(true);
  }

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!questionId) return;
    fetch(`/api/questions/${questionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setQuestion(data);
      })
      .finally(() => setQuestionLoading(false));
  }, [questionId]);

  async function runMode(mode: Mode, userMessage?: string) {
    if (loading) return;
    setLoading(true);

    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: "user",
      mode,
      text: userMessage || (mode === "photo" ? "Attached a photo of a question" : MODE_LABELS[mode as keyof typeof MODE_LABELS] || "Message"),
      imagePreview: image?.preview,
    };
    setTurns((t) => [...t, userTurn]);
    setInput("");
    const attachedImage = image;
    setImage(null);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          conversationId,
          questionId: question?.id,
          questionText: question?.questionText,
          choices: question?.choices,
          correctAnswer: question?.correctAnswer,
          studentAnswer: studentAnswerParam ?? undefined,
          skill: question?.skill,
          difficulty: question?.difficulty,
          userMessage,
          examMode: false,
          imageBase64: attachedImage?.base64,
          imageMimeType: attachedImage?.mimeType,
        }),
      });
      const data = await res.json();
      const isNewConversation = !conversationId;
      setConversationId(data.conversationId);
      if (isNewConversation) loadConversations();

      const { text, note } = renderTurn(mode, data);
      const assistantTurn: ChatTurn = {
        id: crypto.randomUUID(),
        role: "assistant",
        mode,
        text,
        note,
      };
      setTurns((t) => [...t, assistantTurn]);
      if (voiceEnabled) speak(assistantTurn.id, assistantTurn.text);
    } catch {
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          mode,
          text: "Coach is unavailable right now — nothing was lost, try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (image) {
      runMode("photo", input.trim() || undefined);
      return;
    }
    if (!input.trim()) return;
    runMode("chat", input.trim());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Downscale + adaptively compress before sending. Vision models charge
    // (and spend latency) roughly proportional to image resolution, not
    // just file size, so this isn't just about staying under Groq's 20MB
    // request cap — a smaller image is directly fewer tokens per request.
    // A typed/printed SAT question is still perfectly legible for OCR at
    // 1024px on the longest edge, so that's the new ceiling (was 1600).
    // On top of that, quality steps down in a loop until the encoded size
    // is actually small, rather than a single fixed-quality pass — a busy
    // photo (glare, background clutter, dense text) can stay large even
    // after resizing at a fixed quality, so this keeps ratcheting down
    // until it's under target or hits a legibility floor.
    const MAX_EDGE = 1024;
    const TARGET_BYTES = 280_000; // ~280KB — comfortably small for a text photo
    const MIN_QUALITY = 0.4;

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
          // Canvas unavailable for some reason — fall back to the original file.
          const [meta, base64] = dataUrl.split(",");
          const mimeType = meta.match(/data:(.*);base64/)?.[1] ?? file.type;
          setImage({ base64, mimeType, preview: dataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = 0.75;
        let resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
        let sizeBytes = Math.round((resizedDataUrl.length * 3) / 4); // base64 -> bytes estimate
        while (sizeBytes > TARGET_BYTES && quality > MIN_QUALITY) {
          quality = Math.max(MIN_QUALITY, quality - 0.1);
          resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
          sizeBytes = Math.round((resizedDataUrl.length * 3) / 4);
        }

        const [, base64] = resizedDataUrl.split(",");
        setImage({ base64, mimeType: "image/jpeg", preview: resizedDataUrl });
      };
      img.onerror = () => {
        // Not decodable as an image (rare) — send the raw file through as-is.
        const [meta, base64] = dataUrl.split(",");
        const mimeType = meta.match(/data:(.*);base64/)?.[1] ?? file.type;
        setImage({ base64, mimeType, preview: dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function toggleReaction(id: string, kind: "up" | "down") {
    setReactions((prev) => ({ ...prev, [id]: prev[id] === kind ? undefined : kind }));
  }

  function handleReply(text: string) {
    setInput((prev) => (prev ? prev : `Regarding "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}": `));
    inputRef.current?.focus();
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <button
        onClick={startNewChat}
        className="flex items-center justify-center gap-2 bg-brand-blue text-white text-sm font-semibold rounded-full py-2.5 mb-5 hover:bg-brand-blue-dark transition-colors"
      >
        <PlusIcon />
        New chat
      </button>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-slate mb-2">Chat history</p>
      <div className="flex-1 overflow-y-auto space-y-0.5 -mx-2">
        {!conversations ? (
          <div className="h-24 bg-slate-100 rounded-lg animate-pulse mx-2" />
        ) : conversations.length === 0 ? (
          <p className="text-xs text-brand-slate px-2">No conversations yet.</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full text-left px-2 py-2 rounded-lg text-sm truncate ${
                conversationId === c.id ? "bg-brand-blue-light text-brand-blue font-medium" : "text-brand-navy hover:bg-slate-100"
              }`}
            >
              {c.title || "New chat"}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-6">
      {/* Sidebar — desktop */}
      <aside className="hidden md:block w-56 shrink-0 border-r border-brand-border pr-5">{sidebar}</aside>

      {/* Sidebar — mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 bg-white h-full p-4 shadow-card-hover">{sidebar}</div>
          <div className="flex-1 bg-brand-navy/20" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-full border border-brand-border flex items-center justify-center text-brand-navy shrink-0"
              aria-label="Chat history"
            >
              ☰
            </button>
            <div className="w-9 h-9 rounded-full bg-brand-blue-light border border-brand-blue flex items-center justify-center shrink-0">
              <BrainMark size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-brand-navy leading-tight">BlueMind Coach</h1>
              <p className="text-xs text-brand-slate">Photo questions, chat, or ask about a mistake</p>
            </div>
          </div>
          {speechSupported && (
            <button
              onClick={() => {
                setVoiceEnabled((v) => !v);
                if (voiceEnabled) window.speechSynthesis.cancel();
              }}
              className={`flex items-center gap-1.5 text-xs font-medium border rounded-full px-3 py-1.5 shrink-0 ${
                voiceEnabled ? "border-brand-blue bg-brand-blue-light text-brand-blue" : "border-brand-border text-brand-navy hover:bg-slate-50"
              }`}
            >
              <SpeakerIcon active={voiceEnabled} />
              {voiceEnabled ? "Voice on" : "Voice off"}
            </button>
          )}
        </div>

        {questionId && (
          <div className="card p-4 mb-4 shrink-0">
            {questionLoading ? (
              <p className="text-xs text-brand-slate">Loading question context…</p>
            ) : question ? (
              <>
                <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide mb-1.5">
                  About this question · {question.skill}
                </p>
                <p className="text-sm text-brand-navy leading-snug">
                  <MathText text={question.questionText} />
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(Object.keys(MODE_LABELS) as (keyof typeof MODE_LABELS)[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => runMode(m)}
                      disabled={loading}
                      className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-brand-red">Couldn't load that question — you can still chat below.</p>
            )}
          </div>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto space-y-5 px-1 pb-4">
          {turns.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-brand-slate">
                Ask a question, describe what's confusing you, or attach a photo of an SAT question to get started.
              </p>
            </div>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
              {turn.role === "user" ? (
                <div className="max-w-[80%]">
                  {turn.imagePreview && (
                    <img src={turn.imagePreview} alt="Attached question" className="rounded-lg border border-brand-border mb-1.5 max-h-48" />
                  )}
                  <div className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line bg-slate-100 text-brand-navy">
                    {turn.text}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] w-full">
                  <CoachSlideshow text={turn.text} />
                  {turn.note && (
                    <div className="mt-3 flex items-start gap-2 bg-brand-green-light border border-green-200 rounded-lg px-3.5 py-2.5">
                      <span className="text-brand-green text-sm shrink-0">📝</span>
                      <div>
                        <p className="text-xs font-semibold text-brand-green mb-0.5">Note</p>
                        <p className="text-xs text-brand-navy leading-relaxed">{turn.note}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-6 h-6 rounded-full bg-brand-blue-light border border-brand-blue flex items-center justify-center shrink-0">
                      <BrainMark size={13} />
                    </div>
                    <button
                      onClick={() => toggleReaction(turn.id, "up")}
                      className={`flex items-center gap-1 text-xs ${reactions[turn.id] === "up" ? "text-brand-blue" : "text-brand-slate hover:text-brand-navy"}`}
                    >
                      <ThumbUpIcon active={reactions[turn.id] === "up"} /> Like
                    </button>
                    <button
                      onClick={() => toggleReaction(turn.id, "down")}
                      className={`flex items-center gap-1 text-xs ${reactions[turn.id] === "down" ? "text-brand-red" : "text-brand-slate hover:text-brand-navy"}`}
                    >
                      <ThumbDownIcon active={reactions[turn.id] === "down"} /> Dislike
                    </button>
                    <button
                      onClick={() => handleReply(turn.text)}
                      className="flex items-center gap-1 text-xs text-brand-slate hover:text-brand-navy"
                    >
                      <ReplyIcon /> Reply
                    </button>
                    {speechSupported && (
                      <button
                        onClick={() => speak(turn.id, turn.text)}
                        className={`flex items-center gap-1 text-xs ${speakingId === turn.id ? "text-brand-blue" : "text-brand-slate hover:text-brand-navy"}`}
                      >
                        <SpeakerIcon active={speakingId === turn.id} />
                        {speakingId === turn.id ? "Stop" : "Listen"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <p className="text-sm text-brand-slate">BlueMind Coach is thinking…</p>
            </div>
          )}
        </div>

        <div className="shrink-0 pt-3">
          {image && (
            <div className="flex items-center gap-2 mb-2">
              <img src={image.preview} alt="Preview" className="h-14 w-14 object-cover rounded-md border border-brand-border" />
              <button onClick={() => setImage(null)} className="text-brand-slate hover:text-brand-red">
                <CloseIcon />
              </button>
              <span className="text-xs text-brand-slate">Photo attached — describe what you need, or just send.</span>
            </div>
          )}
          <div className="flex items-end gap-2 bg-slate-100 rounded-3xl px-3 py-2">
            <label className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-brand-slate hover:text-brand-navy hover:bg-slate-200 cursor-pointer transition-colors">
              <PaperclipIcon />
              <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </label>
            {dictationSupported && (
              <button
                onClick={toggleDictation}
                title={dictating ? "Stop dictation" : "Speak your question"}
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  dictating ? "bg-brand-red text-white" : "text-brand-slate hover:text-brand-navy hover:bg-slate-200"
                }`}
              >
                <MicIcon active={dictating} />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={image ? "Add a note about this photo (optional)…" : dictating ? "Listening…" : "Type your question…"}
              rows={1}
              className="flex-1 resize-none bg-transparent px-1 py-1.5 outline-none text-sm text-brand-navy placeholder:text-brand-slate"
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !image)}
              className="shrink-0 w-9 h-9 rounded-full bg-brand-blue text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-blue-dark transition-colors"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
