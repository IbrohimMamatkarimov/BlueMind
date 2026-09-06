"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import PracticePage from "@/app/(app)/practice/page";
import BrowsePage from "@/app/(app)/practice/browse/page";
export default function DesignCheck() {
  const [view, setView] = useState("progress");
  useEffect(() => { setView(new URLSearchParams(location.search).get("view") ?? "progress"); }, []);
  return <AppShell userName="Emperor">{view === "practice" ? <PracticePage /> : view === "browse" ? <BrowsePage /> : <ProgressDashboard />}</AppShell>;
}
