/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Redirected the root route according to the gateway-backed session state.
Author review: Pending team review and visual verification.
*/
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureSession } from "@/lib/session-client";

// AI-generated (pending human review)
export default function Home() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    ensureSession().then((authenticated) => {
      if (active) router.replace(authenticated ? "/home" : "/signin");
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [router]);
  return <main className="auth-page"><div className="auth-card"><h1>Opening GrabFoc</h1>{error ? <p>Could not check your session. <button onClick={() => window.location.reload()}>Retry</button></p> : <p>Checking your session…</p>}</div></main>;
}
