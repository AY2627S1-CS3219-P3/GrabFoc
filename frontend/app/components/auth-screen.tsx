/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-24
Scope: Created shared authentication UI; connected public registration and resend requests through the gateway, with six-digit OTP input, on 2026-09-27.
Author review: Pending team review and visual verification.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ClipboardEvent } from "react";

type View = "signin" | "signup" | "verify";

function noSubscription() { return () => {}; }
function pendingEmailSnapshot() { return sessionStorage.getItem("pendingRegistrationEmail") ?? ""; }
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
};

// AI-generated (pending human review)
function Field({ label, name, type = "text", placeholder, autoComplete, minLength }: FieldProps) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input name={name} type={type} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required />
    </label>
  );
}

// AI-generated (pending human review)
function OtpInputs() {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState(Array(6).fill("") as string[]);

  function update(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((entry, position) => position === index ? digit : entry));
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
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view !== "signup") {
      setMessage("This action is unavailable right now. Please try again later.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== data.get("confirmPassword")) {
      setMessage("Passwords do not match.");
      return;
    }
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    setSubmitting(true);
    setMessage("");
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
        const body: unknown = await response.json();
        const detail = typeof body === "object" && body !== null && "error" in body &&
          typeof body.error === "object" && body.error !== null && "message" in body.error &&
          typeof body.error.message === "string" ? body.error.message : "Could not start sign-up. Please try again.";
        setMessage(detail);
        return;
      }
      sessionStorage.setItem("pendingRegistrationEmail", email);
      router.push("/verify");
    } catch {
      setMessage("Could not reach the service. Please try again.");
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
    try {
      const response = await fetch("/api/gateway/auth/register/resend-otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      setMessage(response.ok ? "A new verification code has been sent." : "Could not resend the code. Please try again.");
    } catch {
      setMessage("Could not reach the service. Please try again.");
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
            <OtpInputs />
            <p className="otp-resend">Didn’t receive the code? <button type="button" onClick={resendOtp} disabled={submitting}>Resend OTP</button></p>
            <button className="auth-submit" type="submit">Confirm</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {view === "signup" && <Field label="Full Name" name="fullName" placeholder="James Doe" autoComplete="name" />}
            <Field label="Email" name="email" type="email" placeholder="james_doe@gmail.com" autoComplete="email" />
            {view === "signup" && (
              <div className="auth-field">
                <label htmlFor="mobile-number">Mobile Number</label>
                <div className="phone-fields">
                  <select aria-label="Country code" name="countryCode" defaultValue="+65">
                    <option value="+65">+65</option>
                  </select>
                  <input id="mobile-number" name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel-national" required />
                </div>
              </div>
            )}
            <Field label="Password" name="password" type="password" placeholder={view === "signin" ? "Password" : "*******"} autoComplete={view === "signin" ? "current-password" : "new-password"} minLength={view === "signup" ? 8 : undefined} />
            {view === "signup" && <Field label="Confirm Password" name="confirmPassword" type="password" placeholder="*******" autoComplete="new-password" minLength={8} />}
            {view === "signin" && <button className="forgot-link" type="button" onClick={() => setMessage("Password reset is unavailable right now. Please try again later.")}>Forgot password?</button>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait…" : view === "signin" ? "Sign In" : "Sign Up"}</button>
          </form>
        )}

        {message && <p className="auth-message" role="status">{message}</p>}
        {view !== "verify" && (
          <p className="auth-footer">
            {view === "signin" ? "Don't have an account?" : "Already Have An Account?"}{" "}
            <Link href={view === "signin" ? "/signup" : "/"}>{view === "signin" ? "Sign Up" : "Login"}</Link>
          </p>
        )}
      </section>
    </main>
  );
}
