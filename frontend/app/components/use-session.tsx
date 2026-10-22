/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Extracted the home page's session check into a hook and fallback screen for the order pages.
Author review: Pending review by Deanson.
*/
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, type SessionState } from "@/lib/session-client";

export type Session = Extract<SessionState, { authenticated: true }>;
type SessionCheck = { status: "loading" } | { status: "error" } | { status: "ready"; session: Session };

// AI-generated (pending review by Deanson)
/** Checks the session once; signed-out users go to /signin. */
export function useSession(): SessionCheck {
  const router = useRouter();
  const [check, setCheck] = useState<SessionCheck>({ status: "loading" });
  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (session.authenticated) setCheck({ status: "ready", session });
      else router.replace("/signin");
    }).catch(() => { if (active) setCheck({ status: "error" }); });
    return () => { active = false; };
  }, [router]);
  return check;
}

export function SessionScreen({ failed }: { failed: boolean }) {
  return <main className="auth-page"><div className="auth-card">{failed
    ? <p>Could not check your session. <button onClick={() => window.location.reload()}>Retry</button></p>
    : <p>Checking your session…</p>}</div></main>;
}
