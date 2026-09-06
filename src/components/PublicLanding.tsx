"use client";
import { AppShell } from "./AppShell";
import { MockCatalog } from "./MockCatalog";
export function PublicLanding({ signedIn, userName }: { signedIn: boolean; userName: string | null }) {
  return <AppShell guest={!signedIn} userName={userName}><MockCatalog guest={!signedIn} /></AppShell>;
}
