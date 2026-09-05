import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlueMind",
  description:
    "Free SAT mock tests and a personal learning coach. Take a mock, understand your mistakes, know what to practice next, track your improvement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-brand-bg text-brand-navy">{children}</body>
    </html>
  );
}
