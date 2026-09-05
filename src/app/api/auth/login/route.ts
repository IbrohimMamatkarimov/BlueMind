import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findUserByEmail,
  verifyPassword,
  setSessionCookie,
} from "@/lib/auth";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
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

  const parsed = LoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid input",
      },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  // FIX: findUserByEmail is asynchronous, so we must await it.
  const user = await findUserByEmail(email.toLowerCase());

  if (!user) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!valid) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 }
    );
  }

  await setSessionCookie(user.id);

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}

