import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { askCoach, type AskCoachParams } from "@/lib/groq";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";

// Signed-in Coach — text chat + photo upload, persisted to
// coach_conversations so a student's coaching history survives a refresh.
// (The guest-facing /api/public/coach route stays separate and stateless.)

const BodySchema = z.object({
  mode: z.enum(["hint", "explain", "teach", "similar_question", "diagnose", "study_plan", "chat", "photo"]),
  questionId: z.string().optional(),
  attemptId: z.string().optional(),
  conversationId: z.string().optional(),
  questionText: z.string().optional(),
  choices: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctAnswer: z.string().optional(),
  studentAnswer: z.string().optional(),
  skill: z.string().optional(),
  difficulty: z.string().optional(),
  userMessage: z.string().optional(),
  examMode: z.boolean().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
});

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const coachParams: AskCoachParams = {
    mode: input.mode,
    questionText: input.questionText,
    choices: input.choices,
    correctAnswer: input.correctAnswer,
    studentAnswer: input.studentAnswer,
    skill: input.skill,
    difficulty: input.difficulty,
    userMessage: input.userMessage,
    examMode: !!input.examMode,
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  };

  const result = await askCoach(coachParams);

  // Persist the turn. Reuse an existing conversation if conversationId was
  // passed (continuing a thread), otherwise start a fresh one.
  const userTurn: StoredMessage = {
    role: "user",
    content: input.userMessage || (input.mode === "photo" ? "[photo]" : `[${input.mode}]`),
    createdAt: new Date().toISOString(),
  };
  const assistantTurn: StoredMessage = {
    role: "assistant",
    content: JSON.stringify(result.data),
    createdAt: new Date().toISOString(),
  };

  let conversationId = input.conversationId;
  try {
    if (conversationId) {
      const existing = (await db
        .prepare("SELECT messages FROM coach_conversations WHERE id = ? AND user_id = ?")
        .get(conversationId, user.id)) as { messages: string } | undefined;
      if (existing) {
        const messages: StoredMessage[] = JSON.parse(existing.messages);
        messages.push(userTurn, assistantTurn);
        await db
          .prepare("UPDATE coach_conversations SET messages = ?, updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') WHERE id = ?")
          .run(JSON.stringify(messages), conversationId);
      } else {
        conversationId = undefined; // stale id from client — fall through to create new
      }
    }
    if (!conversationId) {
      conversationId = newId("conv");
      await db
        .prepare(
          `INSERT INTO coach_conversations (id, user_id, attempt_id, question_id, mode, messages)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          conversationId,
          user.id,
          input.attemptId ?? null,
          input.questionId ?? null,
          input.mode,
          JSON.stringify([userTurn, assistantTurn])
        );
    }
  } catch {
    // Persisting history is best-effort — never fail the coaching response
    // itself just because the conversation log couldn't be written.
  }

  return NextResponse.json({ ...result.data, conversationId, ok: result.ok });
}
