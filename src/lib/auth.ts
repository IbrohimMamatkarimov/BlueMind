import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { newId } from "./id";

const COOKIE_NAME = "bluemind_session";
const SESSION_DAYS = 30;

const ADMIN_EMAILS = [
  "ibrohimmamatkarimov0928@gmail.com",
  ...((process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)),
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }

  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
  isAdmin: boolean;
  avatarData: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.userId as string;

    let avatarData: string | null = null;

    try {
      const avatarRow = (await db
        .prepare("SELECT avatar_data FROM users WHERE id = ?")
        .get(userId)) as
        | { avatar_data: string | null }
        | undefined;

      avatarData = avatarRow?.avatar_data ?? null;
    } catch {
      // avatar_data may not exist in older databases.
    }

    const row = (await db
      .prepare(
        "SELECT id, email, name, is_guest as isGuest FROM users WHERE id = ?"
      )
      .get(userId)) as
      | {
          id: string;
          email: string;
          name: string;
          isGuest: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      isGuest: !!row.isGuest,
      isAdmin: isAdminEmail(row.email),
      avatarData,
    };
  } catch {
    return null;
  }
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string,
  isGuest = false
): Promise<string> {
  const id = newId("user");

  await db
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, is_guest) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, email, name, passwordHash, isGuest ? 1 : 0);

  return id;
}

export async function findUserByEmail(email: string) {
  return (await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email)) as
    | {
        id: string;
        email: string;
        name: string;
        password_hash: string;
        is_guest: number;
      }
    | undefined;
}
