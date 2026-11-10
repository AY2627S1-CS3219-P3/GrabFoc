/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the shared OTP flow for Profile: requesting a code, submitting it, resending, and ending the session after a password change or deactivation.
Author review: Pending review by Deanson.
*/
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OtpKind } from "../components/otp-modal";
import { withSessionMutation } from "@/lib/session-client";
import { parseServiceError, type ServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";

export type OtpStep = {
  kind: OtpKind;
  sentTo?: string;
  submit: (otp: string) => Promise<Response>;
  onDone: (response: Response) => void | Promise<void>;
  onError: (error: ServiceError) => void;
};

const sendFallback = "Could not send a code. Please try again.";
const submitFallback = "Could not check that code. Please try again.";

// AI-generated (pending review by Deanson)
export function accountRequest(method: "POST" | "PATCH", path: string, body: unknown): Promise<Response> {
  return withSessionMutation(() => fetch(`/api/session/account/${path}`, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

function networkError(message: string): ServiceError {
  return { status: 0, message, fields: [] };
}

export function useOtpFlow() {
  const router = useRouter();
  const [step, setStep] = useState<OtpStep | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /** Returns null once the code is on its way. A 401 redirects and returns "signed-out". */
  async function sendCode(purpose: OtpKind): Promise<ServiceError | "signed-out" | null> {
    try {
      const response = await accountRequest("POST", "otp", { purpose });
      if (response.status === 401) { router.replace("/signin"); return "signed-out"; }
      return response.ok ? null : await parseServiceError(response, sendFallback);
    } catch { return networkError(sendFallback); }
  }

  /** Opens a step without requesting a code, for the code POST /email has already sent. */
  function show(next: OtpStep) {
    setError("");
    setNotice("");
    setStep(next);
  }

  async function start(next: OtpStep, onRequestError: (error: ServiceError) => void) {
    setRequesting(true);
    const failure = await sendCode(next.kind);
    setRequesting(false);
    if (failure === "signed-out") return;
    if (failure) onRequestError(failure);
    else show(next);
  }

  async function submit(otp: string) {
    if (!step || busy) return;
    if (!/^\d{6}$/.test(otp)) { setError("Enter the six-digit code."); return; }
    const current = step;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await current.submit(otp);
      if (response.status === 401) { setStep(null); router.replace("/signin"); return; }
      if (response.ok) {
        setStep(null);
        await current.onDone(response);
        return;
      }
      const failure = await parseServiceError(response, submitFallback);
      if (failure.code === "OTP_EXPIRED" && current.kind === "NEW_EMAIL_VERIFY") {
        setError("That code has expired. Close this and start the email change again.");
      } else if (failure.code === "OTP_INVALID" || failure.code === "OTP_EXPIRED") {
        setError(userErrorMessage(failure));
      } else {
        setStep(null);
        current.onError(failure);
      }
    } catch {
      setStep(null);
      current.onError(networkError(submitFallback));
    } finally { setBusy(false); }
  }

  async function resend() {
    if (!step || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const failure = await sendCode(step.kind);
    setBusy(false);
    if (failure === "signed-out") return;
    if (failure) setError(userErrorMessage(failure));
    else setNotice("A new code has been sent.");
  }

  function close() {
    if (!busy) setStep(null);
  }

  /** Both changes that call this have already revoked the session; the logout route clears the cookies. */
  async function endSession(signInNotice?: string) {
    if (signInNotice) sessionStorage.setItem("logoutNotice", signInNotice);
    else sessionStorage.removeItem("logoutNotice");
    try { await withSessionMutation(() => fetch("/api/session/logout", { method: "POST" })); }
    catch { /* The change is saved either way, so sign-in is still the right place to go. */ }
    router.replace("/signin");
  }

  return { step, requesting, busy, error, notice, show, start, submit, resend, close, endSession };
}

export type OtpFlow = ReturnType<typeof useOtpFlow>;
