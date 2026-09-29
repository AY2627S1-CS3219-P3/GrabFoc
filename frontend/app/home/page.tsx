/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Moved the location listing shell to /home; added live Supplier browsing on 2026-09-29.
Author review: Jie Yang reviewed this file; team visual review and live Supplier integration verification remain pending.
*/
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { getSession } from "@/lib/session-client";
import { LocationBrowser } from "../components/location-browser";

// AI-generated (reviewed by Jie Yang)
export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"requester" | "courier">("requester");
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "USER" | undefined>();

  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (session.authenticated) { setRole(session.role); setReady(true); }
      else router.replace("/signin");
    }).catch(() => { if (active) setSessionError(true); });
    return () => { active = false; };
  }, [router]);

  if (!ready) return <main className="auth-page"><div className="auth-card">{sessionError ? <p>Could not check your session. <button onClick={() => window.location.reload()}>Retry</button></p> : <p>Checking your session…</p>}</div></main>;

  return (
    <AppShell section="locations">
      <div className="home-heading">
        <div><h1>Welcome to GrabFoc</h1><p>{mode === "requester" ? "Find a campus pickup point for your next order." : "Browse available orders and earn credits as a courier."}</p></div>
        <div className="mode-switch" role="group" aria-label="Choose mode">
          <button type="button" aria-pressed={mode === "requester"} onClick={() => setMode("requester")}>Requester</button>
          <button type="button" aria-pressed={mode === "courier"} onClick={() => setMode("courier")}>Courier</button>
        </div>
      </div>
      {mode === "requester" ? (
        <>
          <section className="home-section" aria-labelledby="active-orders-title">
            <h2 id="active-orders-title">My Active Orders</h2>
            <div className="home-empty">Your active orders will appear here after sign-in and Order Service integration.</div>
          </section>
          <LocationBrowser role={role} />
        </>
      ) : (
        <>
          <section className="home-section" aria-labelledby="accepted-order-title">
            <h2 id="accepted-order-title">My Accepted Delivery</h2>
            <div className="home-empty">Your accepted order will appear here after sign-in and Order Service integration.</div>
          </section>
          <section className="home-section" aria-labelledby="available-orders-title">
            <h2 id="available-orders-title">Available Orders</h2>
            <div className="home-empty">
              <strong>Available orders are not connected yet</strong>
              <p>Orders will appear here when Order Service integration is ready.</p>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
