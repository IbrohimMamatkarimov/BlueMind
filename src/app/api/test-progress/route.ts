import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isProgressKey } from "@/lib/progress-keys";
import { deleteTestProgress, getTestProgress, isStaleProgress, listTestProgress, reconcileTestProgress, saveTestProgress } from "@/lib/test-progress";

export const dynamic = "force-dynamic";

const Key = z.string().min(1).max(200).refine(isProgressKey, "Unknown progress key.");
const SaveSchema = z.object({ key: Key, state: z.record(z.string(), z.unknown()) });
const ReconcileSchema = z.object({ entries: z.array(z.object({ key: Key, state: z.unknown() })).max(50) });

/** `?key=` returns that saved test (plus whether `&submissionId=` was already
 * submitted); without it, every unfinished mock module and full exam. Guests
 * get empty answers so the runner can call this unconditionally. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const key = req.nextUrl.searchParams.get("key");
  if (key === null) {
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return NextResponse.json({ progress: await listTestProgress(user.id) });
  }
  if (!user) return NextResponse.json({ progress: null, submitted: false });
  const parsed = Key.safeParse(key);
  if (!parsed.success) return NextResponse.json({ error: "Unknown progress key." }, { status: 400 });
  const submissionId = req.nextUrl.searchParams.get("submissionId");
  const [progress, submitted] = await Promise.all([
    getTestProgress(user.id, parsed.data),
    isStaleProgress(user.id, parsed.data, submissionId),
  ]);
  return NextResponse.json({ progress, submitted });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  const result = await saveTestProgress(user.id, parsed.data.key, parsed.data.state);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

/** The catalog sends everything saved in this browser; see reconcileTestProgress. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = ReconcileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  return NextResponse.json(await reconcileTestProgress(user.id, parsed.data.entries));
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Key.safeParse(req.nextUrl.searchParams.get("key"));
  if (!parsed.success) return NextResponse.json({ error: "Unknown progress key." }, { status: 400 });
  await deleteTestProgress(user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
