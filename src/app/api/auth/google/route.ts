import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { hashPassword, setSessionCookie, findUserByEmail } from "@/lib/auth";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export async function POST(req: NextRequest) {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in isn't configured on this server yet" },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const credential = body?.credential as string | undefined;

  if (!credential) {
    return NextResponse.json(
      { error: "Missing Google credential" },
      { status: 400 }
    );
  }

  let payload;
  try {
    const result = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    payload = result.payload;
  } catch (err) {
    console.error("Google token verification failed:", err);
    return NextResponse.json(
      { error: "Couldn't verify that Google sign-in. Please try again." },
      { status: 401 }
    );
  }

  const email = (payload.email as string | undefined)?.toLowerCase();
  const name =
    (payload.name as string | undefined) ||
    (email ? email.split("@")[0] : "Student");
  const emailVerified = payload.email_verified as boolean | undefined;

  if (!email || emailVerified === false) {
    return NextResponse.json(
      { error: "Your Google account's email isn't verified" },
      { status: 401 }
    );
  }

  try {
    // ✅ FIX: await here
    let user = await findUserByEmail(email);

    if (!user) {
      const passwordHash = await hashPassword(newId());
      const id = newId("user");

      await db
        .prepare(
          "INSERT INTO users (id, email, name, password_hash, is_guest) VALUES (?, ?, ?, ?, 0)"
        )
        .run(id, email, name, passwordHash);

      await setSessionCookie(id);
    } else {
      // ✅ safe usage
      await setSessionCookie(user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Google sign-in failed:", err);
    return NextResponse.json(
      { error: "Something went wrong signing you in" },
      { status: 500 }
    );
  }
}
