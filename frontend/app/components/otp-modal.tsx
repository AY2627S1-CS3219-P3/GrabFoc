/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the OTP modal for the account changes on Profile, with copy for each purpose.
Author review: Pending review by Deanson.
*/
"use client";

import { type FormEvent, useState } from "react";
import { OtpInputs } from "./auth-screen";
import { Modal } from "./modal";

export type OtpKind = "EMAIL_CHANGE" | "NEW_EMAIL_VERIFY" | "MOBILE_CHANGE" | "PASSWORD_CHANGE" | "DEACTIVATION";

// AI-generated (pending review by Deanson)
function otpMessage(kind: OtpKind, sentTo?: string): string {
  switch (kind) {
    case "EMAIL_CHANGE": return "Please key in the OTP sent to your current email to change your email address.";
    case "NEW_EMAIL_VERIFY": return `Please key in the OTP sent to ${sentTo} to confirm your new email address.`;
    case "MOBILE_CHANGE": return "Please key in the OTP sent to your email to change your mobile number.";
    case "PASSWORD_CHANGE": return "Please key in the OTP sent to your email to change your password.";
    case "DEACTIVATION": return "Please key in the OTP sent to your email to deactivate your account.";
  }
}

export function OtpModal({ kind, sentTo, busy, error, notice, onSubmit, onResend, onClose }: {
  kind: OtpKind; sentTo?: string; busy: boolean; error: string; notice: string;
  onSubmit: (otp: string) => void; onResend?: () => void; onClose: () => void;
}) {
  const [otp, setOtp] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(otp);
  }

  return <Modal title="Enter your OTP" onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <p className="order-modal-text">{otpMessage(kind, sentTo)}</p>
      <OtpInputs onChange={setOtp} invalid={!!error} />
      {error && <p className="field-error otp-modal-message" id="otp-error" role="alert">{error}</p>}
      {notice && <p className="otp-modal-message otp-modal-notice" role="status">{notice}</p>}
      {onResend && <p className="otp-resend">Didn’t receive the code? <button type="button" onClick={onResend} disabled={busy}>Resend OTP</button></p>}
      <div className="order-modal-actions otp-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
      </div>
    </form>
  </Modal>;
}
