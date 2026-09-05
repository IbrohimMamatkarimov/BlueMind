import { randomBytes } from "crypto";

/** Short, URL-safe unique id. Good enough for a single-node SQLite app. */
export function newId(prefix?: string): string {
  const id = randomBytes(12).toString("base64url");
  return prefix ? `${prefix}_${id}` : id;
}
