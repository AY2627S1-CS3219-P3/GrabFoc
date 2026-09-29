/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Created shared authentication UI; connected registration, login and verification; added reusable error feedback on 2026-09-29.
Author review: Pending team review and visual verification.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ClipboardEvent } from "react";
import { withSessionMutation } from "@/lib/session-client";
import { parseServiceError, mapFieldErrors } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { ErrorToast, FieldError, useErrorFeedback } from "./error-feedback";

type View = "signin" | "signup" | "verify";

function noSubscription() { return () => {}; }
function pendingEmailSnapshot() { return sessionStorage.getItem("pendingRegistrationEmail") ?? ""; }
function logoutNoticeSnapshot() { return sessionStorage.getItem("logoutNotice") ?? ""; }
function emptySnapshot() { return ""; }

// AI-generated (pending human review)
function Brand() {
  return (
    <div className="auth-brand">
      <span className="auth-logo" aria-label="GrabFoc">F</span>
      <span className="auth-tagline">GrabFoc</span>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  errors?: string[];
};

// AI-generated (pending human review)
function Field({ label, name, type = "text", placeholder, autoComplete, minLength, errors }: FieldProps) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input name={name} type={type} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required aria-invalid={!!errors?.length} aria-describedby={errors?.length ? `${name}-error` : undefined} />
      <FieldError messages={errors} id={`${name}-error`} />
    </label>
  );
}

// AI-generated (pending human review)
function OtpInputs({ onChange, invalid }: { onChange: (code: string) => void; invalid: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState(Array(6).fill("") as string[]);

  function update(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = digits.map((entry, position) => position === index ? digit : entry);
    setDigits(next);
    onChange(next.join(""));
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ""));
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className="otp-inputs" role="group" aria-label="Verification code" onPaste={onPaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          aria-label={`Digit ${index + 1}`}
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          value={digit}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'otp-error' : undefined}
          onChange={(event) => update(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          required
        />
      ))}
    </div>
  );
}

// AI-generated (pending human review)
export function AuthScreen({ view }: { view: View }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const pendingEmail = useSyncExternalStore(noSubscription, pendingEmailSnapshot, emptySnapshot);
  const logoutNotice = useSyncExternalStore(noSubscription, logoutNoticeSnapshot, emptySnapshot);
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState("");
  const feedback = useErrorFeedback();

  async function showError(response: Response, fallback: string, names: Record<string, string> = {}) {
    const error = await parseServiceError(response, fallback);
    const fields = mapFieldErrors(error.fields, names);
    if (error.code === 'EMAIL_TAKEN' && !fields.email) fields.email = [userErrorMessage(error)];
    if (error.code === 'OTP_INVALID' && !fields.otp) fields.otp = [userErrorMessage(error)];
    const visible = new Set(view === 'verify' ? ['otp'] : view === 'signin' ? ['email', 'password'] : ['fullName', 'email', 'countryCode', 'mobileNumber', 'password', 'confirmPassword']);
    const shown = Object.fromEntries(Object.entries(fields).filter(([field]) => visible.has(field)));
    const hidden = Object.entries(fields).filter(([field]) => !visible.has(field));
    feedback.setFields(shown);
    feedback.setToast(hidden.length
      ? `${hidden.map(([field, messages]) => `${field}: ${messages.join(' ')}`).join(' ')}${view === 'verify' ? ' Return to sign-up to correct your email.' : ''}`
      : error.fields.length && Object.keys(shown).length ? 'Please check the highlighted fields.' : userErrorMessage(error));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (view === "verify") {
      if (!pendingEmail || otp.length !== 6) { feedback.setToast("Enter the six-digit code sent to your email."); return; }
      setSubmitting(true);
      setMessage("");
      feedback.clear();
      try {
        const response = await withSessionMutation(() => fetch("/api/session/verify", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: pendingEmail, otp }),
        }));
        if (!response.ok) { await showError(response, "Could not verify your code."); return; }
        sessionStorage.removeItem("pendingRegistrationEmail");
        router.replace("/home");
      } catch { feedback.setToast("Could not reach the service. Please try again."); }
      finally { setSubmitting(false); }
      return;
    }
    if (view === "signin") {
      setSubmitting(true);
      setMessage("");
      feedback.clear();
      try {
        const response = await withSessionMutation(() => fetch("/api/session/login", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: String(data.get("email") ?? "").trim().toLowerCase(), password: String(data.get("password") ?? "") }),
        }));
        if (!response.ok) { await showError(response, "Could not sign in."); return; }
        sessionStorage.removeItem("logoutNotice");
        router.replace("/home");
      } catch { feedback.setToast("Could not reach the service. Please try again."); }
      finally { setSubmitting(false); }
      return;
    }
    const password = String(data.get("password") ?? "");
    if (password !== data.get("confirmPassword")) {
      feedback.setFields({ confirmPassword: ["Passwords do not match."] });
      return;
    }
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    setSubmitting(true);
    setMessage("");
    feedback.clear();
    try {
      const response = await fetch("/api/gateway/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: String(data.get("fullName") ?? "").trim(),
          email,
          countryCode: String(data.get("countryCode") ?? "+65"),
          mobileNumber: String(data.get("mobileNumber") ?? "").trim(),
          password,
        }),
      });
      if (!response.ok) {
        await showError(response, "Could not start sign-up. Please try again.", { displayName: 'fullName' });
        return;
      }
      sessionStorage.setItem("pendingRegistrationEmail", email);
      router.push("/verify");
    } catch {
      feedback.setToast("Could not reach the service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    if (!pendingEmail) {
      setMessage("Start sign-up first so we know where to send your code.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    feedback.clear();
    try {
      const response = await fetch("/api/gateway/auth/register/resend-otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      if (response.ok) setMessage("A new verification code has been sent.");
      else await showError(response, "Could not resend the code. Please try again.");
    } catch {
      feedback.setToast("Could not reach the service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`auth-page auth-page--${view}`}>
      <section className="auth-card" aria-labelledby="auth-title">
        <Brand />
        <h1 id="auth-title">
          {view === "signin" ? "Sign in to your account" : view === "signup" ? "Create An Account" : "Verification Code"}
        </h1>

        {view === "verify" ? (
          <form className="auth-form auth-form--verify" onSubmit={handleSubmit}>
            <p className="verify-description">{pendingEmail ? `We have sent a verification code to ${pendingEmail}` : "Start sign-up to receive a verification code."}</p>
            <Link href="/signup">Use a different email</Link>
            <OtpInputs onChange={(code) => { setOtp(code); feedback.clearField('otp'); }} invalid={!!feedback.fields.otp?.length} />
            <FieldError messages={feedback.fields.otp} id="otp-error" />
            <p className="otp-resend">Didn’t receive the code? <button type="button" onClick={resendOtp} disabled={submitting}>Resend OTP</button></p>
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait…" : "Confirm"}</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} onChange={(event) => {
            const target: EventTarget = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) feedback.clearField(target.name);
          }}>
            {view === "signup" && <Field label="Full Name" name="fullName" placeholder="James Doe" autoComplete="name" errors={feedback.fields.fullName} />}
            <Field label="Email" name="email" type="email" placeholder="james_doe@gmail.com" autoComplete="email" errors={feedback.fields.email} />
            {view === "signup" && (
              <div className="auth-field">
                <label htmlFor="mobile-number">Mobile Number</label>
                <div className="phone-fields">
                  <select aria-label="Country code" name="countryCode" defaultValue="+65">
                    <option value="+65">+65</option>
                  </select>
                  <input id="mobile-number" name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel-national" required aria-invalid={!!feedback.fields.mobileNumber?.length} aria-describedby={feedback.fields.mobileNumber?.length ? 'mobile-number-error' : undefined} />
                </div>
                <FieldError messages={feedback.fields.mobileNumber} id="mobile-number-error" />
              </div>
            )}
            <Field label="Password" name="password" type="password" placeholder={view === "signin" ? "Password" : "*******"} autoComplete={view === "signin" ? "current-password" : "new-password"} minLength={view === "signup" ? 8 : undefined} errors={feedback.fields.password} />
            {view === "signup" && <Field label="Confirm Password" name="confirmPassword" type="password" placeholder="*******" autoComplete="new-password" minLength={8} errors={feedback.fields.confirmPassword} />}
            {view === "signin" && <Link className="forgot-link" href="/forgot-password">Forgot password?</Link>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait…" : view === "signin" ? "Sign In" : "Sign Up"}</button>
          </form>
        )}

        {view === "signin" && logoutNotice && <p className="auth-message" role="status">{logoutNotice}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        {view !== "verify" && (
          <p className="auth-footer">
            {view === "signin" ? "Don't have an account?" : "Already Have An Account?"}{" "}
            <Link href={view === "signin" ? "/signup" : "/signin"}>{view === "signin" ? "Sign Up" : "Login"}</Link>
          </p>
        )}
      </section>
      <ErrorToast message={feedback.toast} onDismiss={() => feedback.setToast('')} />
    </main>
  );
}
