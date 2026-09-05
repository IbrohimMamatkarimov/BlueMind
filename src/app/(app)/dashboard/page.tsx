import { redirect } from "next/navigation";

// The score/points dashboard was removed from the signed-in flow — /mocks is
// now the landing page after login/signup/guest. This route stays in place
// only to catch stale links/bookmarks and bounce them to /mocks.
export default function DashboardPage() {
  redirect("/mocks");
}
