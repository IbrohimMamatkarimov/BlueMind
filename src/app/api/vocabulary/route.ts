import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createVocabularyWord, getVocabularyWords, reviewVocabularyWord, updateVocabularyWord } from "@/lib/vocabulary";

const WordFields = {
  word: z.string().trim().min(1, "Enter a word to save.").max(120, "Keep the word under 120 characters."),
  definition: z.string().max(2000, "Keep the definition under 2,000 characters."),
  pronunciation: z.string().max(200).optional(),
  synonyms: z.string().max(1000).optional(),
  wordForms: z.string().max(1000).optional(),
  exampleSentence: z.string().max(2000).optional(),
};

const CreateSchema = z.object({
  ...WordFields,
  questionId: z.string().min(1).max(200).optional(),
  sourcePath: z.string().max(1000).refine(
    (value) => value.startsWith("/practice/") && !value.includes("://") && !value.includes(".."),
    "Invalid question link.",
  ).optional(),
  questionNumber: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  const sourceValues = [value.questionId, value.sourcePath, value.questionNumber];
  if (sourceValues.some((item) => item !== undefined) && sourceValues.some((item) => item === undefined)) {
    context.addIssue({ code: "custom", message: "Question source details must be provided together." });
  }
});

const UpdateSchema = z.object({ id: z.string().min(1).max(200), ...WordFields });
const ReviewSchema = z.object({ id: z.string().min(1).max(200), rating: z.enum(["again", "hard", "got_it"]) });

function invalid(parsed: { success: false; error: z.ZodError }) {
  return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid vocabulary entry." }, { status: 400 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await getVocabularyWords(user.id));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save words to your vocabulary." }, { status: 401 });
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed);
  const result = await createVocabularyWord(user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ word: result.word }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const review = ReviewSchema.safeParse(body);
  if (review.success) {
    const result = await reviewVocabularyWord(user.id, review.data.id, review.data.rating);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ word: result.word });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed);
  const result = await updateVocabularyWord(user.id, parsed.data.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ word: result.word });
}
