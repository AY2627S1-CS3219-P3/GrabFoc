/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the email and mobile inline edits and the change-password form, each protected by an OTP.
Author review: Pending review by Deanson.
*/
"use client";

import { type FormEvent, useState } from "react";
import { FieldError } from "../components/error-feedback";
import { EditIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { mapFieldErrors, type ServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { accountRequest, type OtpFlow } from "./use-otp-flow";

export type Profile = { userId: string; displayName: string; email: string; countryCode: string | null; mobileNumber: string | null };
type Editing = "email" | "mobile" | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE = "+65";

// AI-generated (pending review by Deanson)
/** The backend's field messages are fragments ("must contain a digit"), so each gets the field's name. */
function formErrors(error: ServiceError, field: string, label: string): string[] {
  const issues = mapFieldErrors(error.fields)[field];
  return issues ? issues.map((issue) => `${label} ${issue}.`) : [userErrorMessage(error)];
}

export function ContactDetails({ profile, flow, onProfile, onToast }: {
  profile: Profile; flow: OtpFlow; onProfile: (profile: Profile) => void; onToast: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);

  function startEditing(field: "email" | "mobile") {
    setDraft(field === "email" ? profile.email : profile.mobileNumber ?? "");
    setErrors([]);
    setEditing(field);
  }

  function stopEditing() {
    setEditing(null);
    setErrors([]);
  }

  async function finish(response: Response) {
    onProfile(await response.json());
    stopEditing();
  }

  function saveEmail() {
    const newEmail = draft.trim();
    if (!newEmail) { setErrors(["Enter an email address."]); return; }
    if (newEmail.toLowerCase() === profile.email.toLowerCase()) { setErrors(["That's already your email address."]); return; }
    if (!EMAIL_PATTERN.test(newEmail)) { setErrors(["Enter a valid email address."]); return; }
    const onError = (error: ServiceError) => setErrors(formErrors(error, "newEmail", "Email"));
    void flow.start({
      kind: "EMAIL_CHANGE",
      submit: (otp) => accountRequest("POST", "email", { newEmail, otp }),
      onDone: () => flow.show({
        kind: "NEW_EMAIL_VERIFY", sentTo: newEmail,
        submit: (otp) => accountRequest("POST", "email/verify", { otp }),
        onDone: finish, onError,
      }),
      onError,
    }, (error) => onToast(userErrorMessage(error)));
  }

  function saveMobile() {
    const mobileNumber = draft.trim();
    if (!mobileNumber) { setErrors(["Enter a mobile number."]); return; }
    if (mobileNumber === profile.mobileNumber) { setErrors(["That's already your mobile number."]); return; }
    if (!/^\d{8}$/.test(mobileNumber)) { setErrors(["Enter an 8-digit mobile number."]); return; }
    void flow.start({
      kind: "MOBILE_CHANGE",
      submit: (otp) => accountRequest("PATCH", "mobile", { countryCode: COUNTRY_CODE, mobileNumber, otp }),
      onDone: finish,
      onError: (error) => setErrors(formErrors(error, "mobileNumber", "Mobile number")),
    }, (error) => onToast(userErrorMessage(error)));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === "email") saveEmail();
    else saveMobile();
  }

  function renderForm(field: "email" | "mobile") {
    const label = field === "email" ? "Email address" : "Mobile number";
    const input = <input id={`profile-${field}-input`} value={draft} autoFocus disabled={flow.requesting}
      type={field === "email" ? "email" : "tel"} inputMode={field === "email" ? "email" : "numeric"}
      autoComplete={field === "email" ? "email" : "tel-national"} maxLength={field === "email" ? undefined : 8}
      aria-invalid={errors.length > 0} aria-describedby={errors.length ? `profile-${field}-error` : undefined}
      onChange={(event) => { setDraft(event.target.value); setErrors([]); }}
      onKeyDown={(event) => { if (event.key === "Escape") stopEditing(); }} />;
    return <form className="profile-name-form profile-contact-form" onSubmit={save} noValidate>
      <label className="sr-only" htmlFor={`profile-${field}-input`}>{label}</label>
      {field === "email" ? input : <div className="profile-mobile-field"><span>{COUNTRY_CODE}</span>{input}</div>}
      <FieldError messages={errors} id={`profile-${field}-error`} />
      <div className="profile-name-actions">
        <button type="button" className="secondary-button" disabled={flow.requesting} onClick={stopEditing}>Cancel</button>
        <button type="submit" className="primary-button" disabled={flow.requesting}>{flow.requesting ? "Sending…" : "Save"}</button>
      </div>
    </form>;
  }

  function renderRow(field: "email" | "mobile", text: string, label: string) {
    return <div className="profile-contact-row">
      <p>{text}</p>
      <button type="button" className="icon-button profile-name-edit" aria-label={label} onClick={() => startEditing(field)}><EditIcon size={16} /></button>
    </div>;
  }

  const mobile = profile.mobileNumber ? [profile.countryCode, profile.mobileNumber].filter(Boolean).join(" ") : "No mobile number";

  return <>
    <div className="profile-contact">
      {editing === "email" ? renderForm("email") : renderRow("email", profile.email, "Edit email address")}
      {editing === "mobile" ? renderForm("mobile") : renderRow("mobile", mobile, "Edit mobile number")}
    </div>
    <button type="button" className="profile-password-button" onClick={() => setChangingPassword(true)}>Change password</button>
    {changingPassword && <PasswordModal flow={flow} onClose={() => setChangingPassword(false)} />}
  </>;
}

function PasswordModal({ flow, onClose }: { flow: OtpFlow; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [confirmError, setConfirmError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) { setPasswordErrors(["Enter a new password."]); return; }
    if (password !== confirm) { setConfirmError("The passwords do not match."); return; }
    const onError = (error: ServiceError) => setPasswordErrors(formErrors(error, "newPassword", "Password"));
    void flow.start({
      kind: "PASSWORD_CHANGE",
      submit: (otp) => accountRequest("POST", "password", { otp, newPassword: password }),
      onDone: () => flow.endSession("Password changed. Please sign in again."),
      onError,
    }, onError);
  }

  return <Modal title="Change password" onClose={onClose}>
    <form className="order-form" onSubmit={submit} noValidate>
      <ul className="profile-password-rules">
        <li>At least 8 characters, at most 72 bytes</li>
        <li>A lowercase letter</li>
        <li>An uppercase letter</li>
        <li>A digit</li>
      </ul>
      <label>New password
        <input type="password" autoComplete="new-password" value={password} autoFocus disabled={flow.requesting}
          aria-invalid={passwordErrors.length > 0} aria-describedby={passwordErrors.length ? "new-password-error" : undefined}
          onChange={(event) => { setPassword(event.target.value); setPasswordErrors([]); }} />
        <FieldError messages={passwordErrors} id="new-password-error" />
      </label>
      <label>Confirm password
        <input type="password" autoComplete="new-password" value={confirm} disabled={flow.requesting}
          aria-invalid={!!confirmError} aria-describedby={confirmError ? "confirm-password-error" : undefined}
          onChange={(event) => { setConfirm(event.target.value); setConfirmError(""); }} />
        <FieldError messages={confirmError ? [confirmError] : []} id="confirm-password-error" />
      </label>
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={flow.requesting}>Cancel</button>
        <button type="submit" className="primary-button" disabled={flow.requesting}>{flow.requesting ? "Sending…" : "Continue"}</button>
      </div>
    </form>
  </Modal>;
}
