/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Loaded self profile and logout; added retryable load errors and operation toasts on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual review remains pending because there is no Figma profile frame.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Loaded the signed-in user's credit balance from the Credit Service, with no-wallet and retryable error states, and linked the transaction history page (#61).
Author review: pending — Jie Yang to record the review.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { sessionFetch, withSessionMutation } from "@/lib/session-client";
import { parseServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { type CreditBalance, creditsPath } from "@/lib/credits";
import { ErrorToast, useErrorFeedback } from "../components/error-feedback";

type Profile = { userId: string; displayName: string; email: string; countryCode: string | null; mobileNumber: string | null };
type BalanceState = { kind: "loading" } | { kind: "ready"; balance: CreditBalance } | { kind: "no-wallet" } | { kind: "error"; message: string };
const profileFallback = "Could not load your profile. Please try again.";
const balanceFallback = "Could not load your credit balance. Please try again.";

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
  const feedback = useErrorFeedback();
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

  const ready = balance.kind === "ready" ? balance.balance : null;

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
          <h2 id="profile-name">{profile?.displayName ?? (loading ? "Loading profile…" : "Your profile")}</h2>
          <p className="profile-email">{profile?.email ?? ""}</p>
          {profile?.mobileNumber && <p>{[profile.countryCode, profile.mobileNumber].filter(Boolean).join(" ")}</p>}
          {error && <div className="load-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1); }}>Retry</button></div>}
          <div className="profile-divider" />
          <button className="outline-link" type="button" disabled={loggingOut} onClick={logout}>{loggingOut ? "Logging out…" : "Log Out"}</button>
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
              ? <span className="credit-history" aria-disabled="true">View transaction history →</span>
              : <Link className="credit-history" href="/credits/history">View transaction history →</Link>}
          </section>
          <div className="profile-stats" aria-label="Order and credit totals">
            <div className="stat-card"><strong>—</strong><span>Orders Requested</span></div>
            <div className="stat-card"><strong>—</strong><span>Orders Delivered</span></div>
            <div className="stat-card"><strong>—</strong><span>Credits Earned</span></div>
          </div>
          <p className="data-note">Order totals and credits earned will appear when Order Service integration is ready.</p>
        </div>
      </div>
      <ErrorToast message={feedback.toast} onDismiss={() => feedback.setToast('')} />
    </AppShell>
  );
}
