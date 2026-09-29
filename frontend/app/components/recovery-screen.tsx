/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added password recovery forms for User Service forgot and reset routes.
Author review: Pending frontend owner review.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

function noSubscription() { return () => {}; }
function pendingEmail() { return sessionStorage.getItem("pendingResetEmail") ?? ""; }
function emptyEmail() { return ""; }

// AI-generated (pending human review)
export function RecoveryScreen({ step }: { step: "forgot" | "reset" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const rememberedEmail = useSyncExternalStore(noSubscription, pendingEmail, emptyEmail);
  const [email, setEmail] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const newPassword = String(data.get("newPassword") ?? "");
    if (step === "reset" && newPassword !== data.get("confirmPassword")) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(step === "forgot" ? "/api/gateway/auth/password/forgot" : "/api/gateway/auth/password/reset", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(step === "forgot" ? { email } : { email, otp: String(data.get("otp") ?? ""), newPassword }),
      });
      if (!response.ok) {
        let detail = "Could not process your request. Please try again.";
        try { const body = await response.json(); if (typeof body?.error?.message === "string") detail = body.error.message; } catch { /* keep fallback */ }
        setMessage(detail);
        return;
      }
      if (step === "forgot") {
        sessionStorage.setItem("pendingResetEmail", email);
        router.push("/reset-password");
      } else {
        sessionStorage.removeItem("pendingResetEmail");
        setDone(true);
      }
    } catch { setMessage("Could not reach the service. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="recovery-title">
    <h1 id="recovery-title">{step === "forgot" ? "Forgot your password?" : "Reset your password"}</h1>
    {done ? <p>Your password was reset. <Link href="/signin">Sign in</Link></p> : <form className="auth-form" onSubmit={submit}>
      <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" value={email ?? (step === "reset" ? rememberedEmail : "")} onChange={(event) => setEmail(event.target.value)} required /></label>
      {step === "reset" && <>
        <label className="auth-field"><span>Six-digit code</span><input name="otp" inputMode="numeric" pattern="[0-9]{6}" required /></label>
        <label className="auth-field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label className="auth-field"><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
      </>}
      <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : step === "forgot" ? "Send reset code" : "Reset password"}</button>
    </form>}
    {message && <p className="auth-message" role="status">{message}</p>}
    <p className="auth-footer"><Link href="/signin">Back to Sign In</Link></p>
  </section></main>;
}
