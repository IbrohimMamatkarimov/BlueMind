import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// The BlueMind database is in Singapore. Keeping authenticated app renders
// nearby avoids a trans-Pacific database round trip before the dashboard can
// start loading its client data.
export const preferredRegion = "sin1";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell userName={user.name} isAdmin={user.isAdmin} avatarData={user.avatarData} guest={user.isGuest}>
      {children}
    </AppShell>
  );
}
