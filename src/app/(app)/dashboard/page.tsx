import { redirect } from "next/navigation";

// Keep stale dashboard links useful by sending learners to their daily plan.
export default function DashboardPage() {
  redirect("/today");
}
