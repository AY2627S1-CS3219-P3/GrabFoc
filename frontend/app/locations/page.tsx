/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added the location listing route and requester/courier mode switch with unconnected states and no mock data.
Author review: Pending team review; no Figma location frame or Supplier API contract exists.
*/
"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "../components/app-shell";

// AI-generated (pending human review)
export default function LocationsPage() {
  const [mode, setMode] = useState<"requester" | "courier">("requester");

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
          <section className="home-section" aria-labelledby="locations-title">
            <h2 id="locations-title">Browse Locations</h2>
            <div className="browse-controls">
              <label className="browse-search"><span className="sr-only">Search locations</span><input type="search" placeholder="Search locations" disabled aria-describedby="locations-state" /></label>
              <div className="filter-chips" aria-label="Location type filters"><span aria-current="true">All</span><span>Food</span><span>Print</span><span>Convenience</span></div>
            </div>
            <div className="home-empty" id="locations-state">
              <strong>Locations are not available yet</strong>
              <p>Sign in and connect Supplier Service to browse live campus pickup points.</p>
              <Link className="outline-link" href="/">Go to sign in</Link>
            </div>
          </section>
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
