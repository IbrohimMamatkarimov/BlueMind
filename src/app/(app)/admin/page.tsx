import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/dashboard");

  return <AdminDashboard />;
}
