/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Loaded self profile and logout; added retryable load errors and operation toasts on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual review remains pending because there is no Figma profile frame.
*/
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { sessionFetch, withSessionMutation } from "@/lib/session-client";
import { parseServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { ErrorToast, useErrorFeedback } from "../components/error-feedback";

type Profile = { userId: string; displayName: string; email: string; countryCode: string | null; mobileNumber: string | null };
const profileFallback = "Could not load your profile. Please try again.";

// AI-generated (pending human review)
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [reload, setReload] = useState(0);
  const feedback = useErrorFeedback();

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
            <div className="credit-values">
              <div><strong className="credit-available">—</strong><span>available</span></div>
              <div><strong className="credit-reserved">—</strong><span>reserved for active orders</span></div>
            </div>
            <span className="credit-history" aria-disabled="true">View transaction history →</span>
          </section>
          <div className="profile-stats" aria-label="Order and credit totals">
            <div className="stat-card"><strong>—</strong><span>Orders Requested</span></div>
            <div className="stat-card"><strong>—</strong><span>Orders Delivered</span></div>
            <div className="stat-card"><strong>—</strong><span>Credits Earned</span></div>
          </div>
          <p className="data-note">Your account and credit information will appear when User and Credit Service integration is ready.</p>
        </div>
      </div>
      <ErrorToast message={feedback.toast} onDismiss={() => feedback.setToast('')} />
    </AppShell>
  );
}
