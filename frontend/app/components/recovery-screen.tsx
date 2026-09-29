/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added password recovery forms; mapped service errors to reusable toast and field feedback on 2026-09-29.
Author review: Jie Yang reviewed this file.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { parseServiceError, mapFieldErrors } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { ErrorToast, FieldError, useErrorFeedback } from "./error-feedback";

function noSubscription() { return () => {}; }
function pendingEmail() { return sessionStorage.getItem("pendingResetEmail") ?? ""; }
function emptyEmail() { return ""; }

// AI-generated (reviewed by Jie Yang)
export function RecoveryScreen({ step }: { step: "forgot" | "reset" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const rememberedEmail = useSyncExternalStore(noSubscription, pendingEmail, emptyEmail);
  const [email, setEmail] = useState<string | undefined>();
  const feedback = useErrorFeedback();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const newPassword = String(data.get("newPassword") ?? "");
    if (step === "reset" && newPassword !== data.get("confirmPassword")) { feedback.setFields({ confirmPassword: ["Passwords do not match."] }); return; }
    setBusy(true);
    setMessage("");
    feedback.clear();
    try {
      const response = await fetch(step === "forgot" ? "/api/gateway/auth/password/forgot" : "/api/gateway/auth/password/reset", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(step === "forgot" ? { email } : { email, otp: String(data.get("otp") ?? ""), newPassword }),
      });
      if (!response.ok) {
        const error = await parseServiceError(response, "Could not process your request. Please try again.");
        feedback.setFields(mapFieldErrors(error.fields));
        feedback.setToast(error.fields.length ? 'Please check the highlighted fields.' : userErrorMessage(error));
        return;
      }
      if (step === "forgot") {
        sessionStorage.setItem("pendingResetEmail", email);
        router.push("/reset-password");
      } else {
        sessionStorage.removeItem("pendingResetEmail");
        setDone(true);
      }
    } catch { feedback.setToast("Could not reach the service. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="recovery-title">
    <h1 id="recovery-title">{step === "forgot" ? "Forgot your password?" : "Reset your password"}</h1>
    {done ? <p>Your password was reset. <Link href="/signin">Sign in</Link></p> : <form className="auth-form" onSubmit={submit} onChange={(event) => {
      const target: EventTarget = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) feedback.clearField(target.name);
    }}>
      <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" value={email ?? (step === "reset" ? rememberedEmail : "")} onChange={(event) => setEmail(event.target.value)} required aria-invalid={!!feedback.fields.email?.length} aria-describedby={feedback.fields.email?.length ? 'recovery-email-error' : undefined} /><FieldError messages={feedback.fields.email} id="recovery-email-error" /></label>
      {step === "reset" && <>
        <label className="auth-field"><span>Six-digit code</span><input name="otp" inputMode="numeric" pattern="[0-9]{6}" required aria-invalid={!!feedback.fields.otp?.length} aria-describedby={feedback.fields.otp?.length ? 'recovery-otp-error' : undefined} /><FieldError messages={feedback.fields.otp} id="recovery-otp-error" /></label>
        <label className="auth-field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={8} required aria-invalid={!!feedback.fields.newPassword?.length} aria-describedby={feedback.fields.newPassword?.length ? 'recovery-password-error' : undefined} /><FieldError messages={feedback.fields.newPassword} id="recovery-password-error" /></label>
        <label className="auth-field"><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required aria-invalid={!!feedback.fields.confirmPassword?.length} aria-describedby={feedback.fields.confirmPassword?.length ? 'recovery-confirm-error' : undefined} /><FieldError messages={feedback.fields.confirmPassword} id="recovery-confirm-error" /></label>
      </>}
      <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : step === "forgot" ? "Send reset code" : "Reset password"}</button>
    </form>}
    {message && <p className="auth-message" role="status">{message}</p>}
    <p className="auth-footer"><Link href="/signin">Back to Sign In</Link></p>
  </section><ErrorToast message={feedback.toast} onDismiss={() => feedback.setToast('')} /></main>;
}
