import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PublicLanding } from "@/components/PublicLanding";

export default async function RootPage() {
  const user = await getCurrentUser();
  // Signed-in users go straight to the real (redesigned) app shell instead
  // of the old guest-facing landing page — that's what was causing "old
  // design on open, new design after clicking something": the root URL was
  // still rendering the never-updated PublicLanding component even for
  // logged-in users, and only navigating to /mocks reached the new AppShell.
  if (user) redirect("/mocks");
  return <PublicLanding signedIn={false} userName={null} />;
}
