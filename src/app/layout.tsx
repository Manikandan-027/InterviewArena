import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Karla, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InterviewArena — Grammar, Verbal & Reasoning Practice",
  description:
    "Interview-grade grammar, verbal, logical, reading and listening drills. Fresh questions every round, live scoring and Email score alerts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${karla.variable}`}>
      <body className="bg-ink text-cream antialiased">{children}</body>
    </html>
  );
}
