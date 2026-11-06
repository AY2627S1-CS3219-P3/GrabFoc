/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the signed-in user's credit transaction history from the Credit Service, newest first with Load more paging, and no-wallet and retryable error states (#61).
Author review: pending — Jie Yang to record the review.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { sessionFetch } from "@/lib/session-client";
import { parseServiceError } from "@/lib/service-errors";
import { userErrorMessage } from "@/lib/user-error-copy";
import { type CreditTransaction, type CreditTransactionPage, creditsPath, signedCredits, transactionLabels } from "@/lib/credits";

const historyFallback = "Could not load your transaction history. Please try again.";
const pageSize = 20;
const dateFormat = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" });

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "no-wallet" } | { kind: "error"; message: string };
type Fetched = CreditTransactionPage | { kind: "signed-out" } | { kind: "no-wallet" } | { kind: "error"; message: string };

// AI-generated (review pending)
async function fetchPage(userId: string, before: number | null): Promise<Fetched> {
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (before !== null) query.set("before", String(before));
  const response = await sessionFetch(creditsPath(userId, `/transactions?${query}`));
  if (response.status === 401) return { kind: "signed-out" };
  // Wallets come only from the account's UserRegistered event, so an older account can lack one.
  if (response.status === 404) return { kind: "no-wallet" };
  if (!response.ok) return { kind: "error", message: userErrorMessage(await parseServiceError(response, historyFallback), historyFallback) };
  return response.json();
}

export default function CreditHistoryPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<CreditTransaction[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const profile = await sessionFetch("/api/session/profile");
      if (profile.status === 401) { router.replace("/signin"); return; }
      if (!profile.ok) throw new Error("Profile unavailable");
      const { userId: id }: { userId: string } = await profile.json();
      const page = await fetchPage(id, null);
      if (!active) return;
      if ("items" in page) {
        setUserId(id);
        setItems(page.items);
        setNextBefore(page.nextBefore);
        setStatus({ kind: "ready" });
      } else if (page.kind === "signed-out") router.replace("/signin");
      else setStatus(page);
    })().catch(() => { if (active) setStatus({ kind: "error", message: historyFallback }); });
    return () => { active = false; };
  }, [router, reload]);

  async function loadMore() {
    if (!userId || nextBefore === null) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(userId, nextBefore);
      if ("items" in page) {
        setItems((current) => [...current, ...page.items]);
        setNextBefore(page.nextBefore);
      } else if (page.kind === "signed-out") router.replace("/signin");
      else setStatus(page.kind === "error" ? page : { kind: "error", message: historyFallback });
    } catch { setStatus({ kind: "error", message: historyFallback }); }
    finally { setLoadingMore(false); }
  }

  return (
    <AppShell section="profile">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="dashboard-title !mb-0">Credit Transaction History</h1>
        <Link className="outline-link" href="/profile">Back to Profile</Link>
      </div>
      <section className="credit-card" aria-labelledby="history-heading" aria-busy={status.kind === "loading"}>
        <h2 id="history-heading">Newest first</h2>
        {status.kind === "loading" && <p className="data-note">Loading transactions…</p>}
        {status.kind === "no-wallet" && <p className="data-note">No credit wallet yet, so there are no transactions to show.</p>}
        {status.kind === "error" && <div className="load-error" role="alert"><p>{status.message}</p><button type="button" onClick={() => { setStatus({ kind: "loading" }); setReload((value) => value + 1); }}>Retry</button></div>}
        {status.kind === "ready" && items.length === 0 && <p className="data-note">No transactions yet.</p>}
        {items.length > 0 && <ul className="m-0 list-none divide-y divide-[#e6eaf2] p-0">
          {items.map((item) => <li className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4" key={item.id}>
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold">{transactionLabels[item.type] ?? item.type}</p>
              <p className="m-0 text-xs text-[var(--auth-muted)]">
                <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                {item.orderId && <> · Order <span className="font-mono">{item.orderId.slice(0, 8)}</span></>}
              </p>
            </div>
            <dl className="m-0 flex gap-5 text-sm sm:justify-end">
              <div className="flex gap-1"><dt className="text-[var(--auth-muted)]">Available</dt><dd className="m-0 font-semibold">{signedCredits(item.availableChange)}</dd></div>
              <div className="flex gap-1"><dt className="text-[var(--auth-muted)]">Reserved</dt><dd className="m-0 font-semibold">{signedCredits(item.reservedChange)}</dd></div>
            </dl>
          </li>)}
        </ul>}
        {status.kind === "ready" && nextBefore !== null &&
          <button className="outline-link mt-4 w-full cursor-pointer bg-white sm:w-auto" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load more"}</button>}
      </section>
    </AppShell>
  );
}
