/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Updated page metadata and removed starter font styling for the Figma UI; renamed page metadata to GrabFoc on 2026-09-27.
Author review: Pending team review and visual verification.
*/
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrabFoc",
  description: "Sign in to GrabFoc",
};

// AI-generated (pending human review)
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
