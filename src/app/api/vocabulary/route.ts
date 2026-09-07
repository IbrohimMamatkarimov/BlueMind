import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createVocabularyWord, getVocabularyWords, updateVocabularyWord } from "@/lib/vocabulary";

const WordFields = {
  word: z.string().trim().min(1, "Enter a word to save.").max(120, "Keep the word under 120 characters."),
  definition: z.string().max(2000, "Keep the definition under 2,000 characters."),
};

const CreateSchema = z.object({
  ...WordFields,
  questionId: z.string().min(1).max(200),
  sourcePath: z.string().max(1000).refine(
    (value) => value.startsWith("/practice/") && !value.includes("://") && !value.includes(".."),
    "Invalid question link.",
  ),
  questionNumber: z.number().int().positive(),
});

const UpdateSchema = z.object({ id: z.string().min(1).max(200), ...WordFields });

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
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed);
  const result = await updateVocabularyWord(user.id, parsed.data.id, parsed.data.word, parsed.data.definition);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ word: result.word });
}
