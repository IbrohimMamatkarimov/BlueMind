import { StudioMotion } from "@/components/StudioMotion";
import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ActivityHeartbeat } from "@/components/ActivityHeartbeat";

export const metadata: Metadata = {
  title: "BlueMind",
  description: "SAT practice and progress.",
  icons: { icon: "/study-mark.svg", shortcut: "/study-mark.svg", apple: "/study-mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-brand-bg text-brand-navy">
        <ActivityHeartbeat />
        <StudioMotion />
        {children}
      </body>
    </html>
  );
}
