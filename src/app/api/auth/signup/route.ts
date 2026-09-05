import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createUser,
  findUserByEmail,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = SignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid input",
      },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // findUserByEmail is async, so it must be awaited.
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const userId = await createUser(
    normalizedEmail,
    name,
    passwordHash
  );

  await setSessionCookie(userId);

  return NextResponse.json({
    ok: true,
    user: {
      id: userId,
      name,
      email: normalizedEmail,
    },
  });
}
