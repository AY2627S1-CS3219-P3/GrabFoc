/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Loaded self profile and logout; added retryable load errors and operation toasts on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual review remains pending because there is no Figma profile frame.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Loaded the signed-in user's credit balance from the Credit Service, with no-wallet and retryable error states, and linked the transaction history page (#61).
Author review: pending — Jie Yang to record the review.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Dropped the arrow from the transaction-history link (redesign copy rules).
Author review: Pending review by Jie Yang.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Filled Orders Requested (/orders/mine total) and Orders Delivered (/orders/assigned?status=COMPLETED total), with a retryable error; removed the "Order totals… integration is ready" note.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Removed the Credits Earned stat card (it had no data source).
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added inline display-name editing (pencil button, non-empty and changed checks, PATCH /api/session/profile; on error closes the editor and shows a toast).
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Grouped the email and mobile number in one .profile-contact div with shared styling.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Wired the OTP-protected email, mobile and password changes (ContactDetails) and account deactivation.
Author review: Pending review by Deanson.
*/
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { sessionFetch, withSessionMutation } from "@/lib/session-client";
import { parseServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { type CreditBalance, creditsPath } from "@/lib/credits";
import { countOrders, isUnauthorized, orderKeys } from "@/lib/orders";
import { ErrorToast, useErrorFeedback } from "../components/error-feedback";
import { EditIcon } from "../components/icons";
import { ConfirmModal } from "../components/modal";
import { OtpModal } from "../components/otp-modal";
import { ContactDetails, type Profile } from "./contact-details";
import { accountRequest, useOtpFlow } from "./use-otp-flow";

type BalanceState = { kind: "loading" } | { kind: "ready"; balance: CreditBalance } | { kind: "no-wallet" } | { kind: "error"; message: string };
const profileFallback = "Could not load your profile. Please try again.";
const balanceFallback = "Could not load your credit balance. Please try again.";
const nameFallback = "Could not update your display name. Please try again.";

// AI-generated (reviewed by Jie Yang)
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [reload, setReload] = useState(0);
  const [balance, setBalance] = useState<BalanceState>({ kind: "loading" });
  const [balanceReload, setBalanceReload] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const feedback = useErrorFeedback();
  const flow = useOtpFlow();
  const userId = profile?.userId;

  useEffect(() => {
    let active = true;
    sessionFetch("/api/session/profile").then(async (response) => {
      if (!active) return;
      if (response.status === 401) { router.replace("/signin"); return; }
      if (!response.ok) {
        const message = userErrorMessage(await parseServiceError(response, profileFallback), profileFallback);
        if (active) setError(message);
        return;
      }
      const data: Profile = await response.json();
      if (active) setProfile(data);
    }).catch(() => { if (active) setError(profileFallback); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, reload]);

  // AI-generated (review pending)
  useEffect(() => {
    if (!userId) return;
    let active = true;
    sessionFetch(creditsPath(userId)).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { router.replace("/signin"); return; }
      // Wallets come only from the account's UserRegistered event, so an older account can lack one.
      if (response.status === 404) { setBalance({ kind: "no-wallet" }); return; }
      if (!response.ok) {
        const message = userErrorMessage(await parseServiceError(response, balanceFallback), balanceFallback);
        if (active) setBalance({ kind: "error", message });
        return;
      }
      const data: CreditBalance = await response.json();
      if (active) setBalance({ kind: "ready", balance: data });
    }).catch(() => { if (active) setBalance({ kind: "error", message: balanceFallback }); });
    return () => { active = false; };
  }, [router, userId, balanceReload]);

  // AI-generated (pending review by Deanson): each total is one 1-item page; only `total` is read.
  const requested = useQuery({ queryKey: orderKeys.count("mine"), queryFn: () => countOrders("mine"), enabled: Boolean(userId) });
  const delivered = useQuery({
    queryKey: orderKeys.count("assigned", "COMPLETED"), queryFn: () => countOrders("assigned", "COMPLETED"), enabled: Boolean(userId),
  });
  const totalsError = requested.error ?? delivered.error;
  useEffect(() => { if (isUnauthorized(totalsError)) router.replace("/signin"); }, [totalsError, router]);

  const ready = balance.kind === "ready" ? balance.balance : null;

  // AI-generated (pending review by Deanson)
  function startEditingName() {
    if (!profile) return;
    setDraftName(profile.displayName);
    setNameError("");
    setEditingName(true);
  }

  function stopEditingName() {
    setEditingName(false);
    setNameError("");
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const displayName = draftName.trim();
    if (!displayName) { setNameError("Enter a display name."); return; }
    if (displayName === profile.displayName) { setNameError("That's already your display name."); return; }
    setSavingName(true);
    try {
      const response = await withSessionMutation(() => fetch("/api/session/profile", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }),
      }));
      if (response.status === 401) { router.replace("/signin"); return; }
      if (!response.ok) {
        stopEditingName();
        feedback.setToast(userErrorMessage(await parseServiceError(response, nameFallback), nameFallback));
        return;
      }
      setProfile(await response.json());
      stopEditingName();
    } catch {
      stopEditingName();
      feedback.setToast(nameFallback);
    } finally { setSavingName(false); }
  }

  // AI-generated (pending review by Deanson)
  async function startDeactivation() {
    const showError = (error: Parameters<typeof userErrorMessage>[0]) => feedback.setToast(userErrorMessage(error));
    await flow.start({
      kind: "DEACTIVATION",
      submit: (otp) => accountRequest("POST", "deactivate", { otp }),
      onDone: () => flow.endSession(),
      onError: showError,
    }, showError);
    setConfirmingDeactivation(false);
  }

  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      const response = await withSessionMutation(() => fetch("/api/session/logout", { method: "POST" }));
      if (!response.ok) {
        const fallback = "Could not log out. Please try again.";
        feedback.setToast(userErrorMessage(await parseServiceError(response, fallback), fallback));
        return;
      }
      const result: { remoteRevoked?: boolean } = await response.json();
      if (result.remoteRevoked === false) sessionStorage.setItem("logoutNotice", "Signed out here, but the service could not confirm remote logout.");
      else sessionStorage.removeItem("logoutNotice");
      router.replace("/signin");
    } catch { feedback.setToast("Could not log out. Please try again."); }
    finally { setLoggingOut(false); }
  }

  return (
    <AppShell section="profile">
      <h1 className="dashboard-title">Profile &amp; Settings</h1>
      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-name">
          <div className="profile-avatar" aria-hidden="true">{profile?.displayName.slice(0, 1).toUpperCase() ?? "?"}</div>
          {editingName ? (
            <form className="profile-name-form" onSubmit={saveName} noValidate>
              <label className="sr-only" htmlFor="profile-name-input">Display name</label>
              <input id="profile-name-input" value={draftName} maxLength={100} autoFocus disabled={savingName}
                aria-invalid={!!nameError} aria-describedby={nameError ? "profile-name-error" : undefined}
                onChange={(event) => { setDraftName(event.target.value); setNameError(""); }}
                onKeyDown={(event) => { if (event.key === "Escape") stopEditingName(); }} />
              {nameError && <p className="field-error" id="profile-name-error" role="alert">{nameError}</p>}
              <div className="profile-name-actions">
                <button type="button" className="secondary-button" disabled={savingName} onClick={stopEditingName}>Cancel</button>
                <button type="submit" className="primary-button" disabled={savingName}>{savingName ? "Saving…" : "Save"}</button>
              </div>
            </form>
          ) : (
            <div className="profile-name-row">
              <h2 id="profile-name">{profile?.displayName ?? (loading ? "Loading profile…" : "Your profile")}</h2>
              {profile && <button type="button" className="icon-button profile-name-edit" aria-label="Edit display name" onClick={startEditingName}><EditIcon size={16} /></button>}
            </div>
          )}
          {profile && <ContactDetails profile={profile} flow={flow} onProfile={setProfile} onToast={feedback.setToast} />}
          {error && <div className="load-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1); }}>Retry</button></div>}
          <div className="profile-divider" />
          <button className="outline-link" type="button" disabled={loggingOut} onClick={logout}>{loggingOut ? "Logging out…" : "Log Out"}</button>
          {profile && <button type="button" className="profile-deactivate" onClick={() => setConfirmingDeactivation(true)}>Deactivate account</button>}
        </section>
        <div className="profile-content">
          <section className="credit-card" aria-labelledby="credit-heading">
            <h2 id="credit-heading">Credit Balance</h2>
            <div className="credit-values" aria-busy={balance.kind === "loading"}>
              <div><strong className="credit-available">{ready ? ready.available : "—"}</strong><span>available</span></div>
              <div><strong className="credit-reserved">{ready ? ready.reserved : "—"}</strong><span>reserved for active orders</span></div>
            </div>
            {balance.kind === "no-wallet" && <p className="data-note">No credit wallet yet. Accounts receive their starting credits when they are created.</p>}
            {balance.kind === "error" && <div className="load-error" role="alert"><p>{balance.message}</p><button type="button" aria-label="Retry credit balance" onClick={() => { setBalance({ kind: "loading" }); setBalanceReload((value) => value + 1); }}>Retry</button></div>}
            {balance.kind === "no-wallet"
              ? <span className="credit-history" aria-disabled="true">View transaction history</span>
              : <Link className="credit-history" href="/credits/history">View transaction history</Link>}
          </section>
          <div className="profile-stats" aria-label="Order totals" aria-busy={requested.isPending || delivered.isPending}>
            <div className="stat-card"><strong>{requested.data ?? "—"}</strong><span>Orders Requested</span></div>
            <div className="stat-card"><strong>{delivered.data ?? "—"}</strong><span>Orders Delivered</span></div>
          </div>
          {totalsError && !isUnauthorized(totalsError) && <div className="load-error" role="alert"><p>{totalsError.message}</p>
            <button type="button" aria-label="Retry order totals" onClick={() => {
              if (requested.error) void requested.refetch();
              if (delivered.error) void delivered.refetch();
            }}>Retry</button></div>}
        </div>
      </div>
      {confirmingDeactivation && <ConfirmModal title="Deactivate your account?" confirmLabel="Continue" busy={flow.requesting}
        message="Are you sure? You will be signed out and will not be able to log in again."
        onConfirm={startDeactivation} onClose={() => setConfirmingDeactivation(false)} />}
      {flow.step && <OtpModal key={flow.step.kind} kind={flow.step.kind} sentTo={flow.step.sentTo} busy={flow.busy}
        error={flow.error} notice={flow.notice} onSubmit={flow.submit} onClose={flow.close}
        onResend={flow.step.kind === "NEW_EMAIL_VERIFY" ? undefined : flow.resend} />}
      <ErrorToast message={feedback.toast} onDismiss={() => feedback.setToast('')} />
    </AppShell>
  );
}
