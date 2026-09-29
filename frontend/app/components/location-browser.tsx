/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Added live Supplier location listing, search, filters, sorting, pagination and admin navigation; added retryable location-type loading and Tailwind responsive layout on 2026-09-29.
Author review: Jie Yang reviewed the earlier implementation; Tailwind layout and team visual verification remain pending.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { withSessionMutation } from "@/lib/session-client";
import { type LocationPage, supplierError } from "@/lib/locations";

type Filters = { name: string; type: string; building: string; time: string; order: "asc" | "desc" };
const initialFilters: Filters = { name: "", type: "", building: "", time: "", order: "asc" };

function hours(value: string | null) { return value ? `${value.slice(0, 2)}:${value.slice(2, 4)}` : ""; }

// AI-generated (earlier version reviewed by Jie Yang; latest edits pending review)
export function LocationBrowser({ role }: { role?: "ADMIN" | "USER" }) {
  const router = useRouter();
  const [types, setTypes] = useState<string[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState("");
  const [typesReload, setTypesReload] = useState(0);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LocationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    withSessionMutation(() => fetch("/api/session/supplier/location-types", { cache: "no-store" }))
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load location types.");
        const result: unknown = await response.json();
        if (!Array.isArray(result) || !result.every((type) => typeof type === "string")) throw new Error("Invalid location types response.");
        if (active) setTypes(result);
      })
      .catch(() => { if (active) setTypesError("Could not load location types. Please try again."); })
      .finally(() => { if (active) setTypesLoading(false); });
    return () => { active = false; };
  }, [typesReload]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setFilters(draft); }, 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), pageSize: "12", order: filters.order });
    if (filters.name.trim()) query.set("name", filters.name.trim());
    if (filters.type) query.set("type", filters.type);
    if (filters.building.trim()) query.set("building", filters.building.trim());
    if (filters.time) query.set("time", filters.time.replace(":", "") + "hrs");
    withSessionMutation(() => fetch(`/api/session/supplier/locations?${query}`, { cache: "no-store", signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) { router.replace("/signin"); return; }
        if (!response.ok) throw new Error(await supplierError(response));
        const result = await response.json() as LocationPage;
        if (!controller.signal.aborted) { setData(result); setError(""); setLoading(false); }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Could not load locations."); setLoading(false); }
      });
    return () => controller.abort();
  }, [filters, page, reload, router]);

  function change<K extends keyof Filters>(key: K, value: Filters[K]) {
    setLoading(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return <section className="home-section" aria-labelledby="locations-title">
    <div className="section-heading flex-col items-stretch sm:flex-row sm:items-start">
      <h2 id="locations-title">Browse Locations</h2>
      {role === "ADMIN" && <Link className="outline-link" href="/admin/locations">Manage Locations</Link>}
    </div>
    <div className="location-filters grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(160px,2fr)_repeat(4,minmax(120px,1fr))]">
      <label><span>Search name</span><input type="search" value={draft.name} onChange={(event) => change("name", event.target.value)} placeholder="Search pickup points" /></label>
      <label><span>Type</span><select value={draft.type} disabled={typesLoading || Boolean(typesError)} onChange={(event) => change("type", event.target.value)}><option value="">All types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label><span>Building</span><input value={draft.building} onChange={(event) => change("building", event.target.value)} placeholder="Exact building" /></label>
      <label><span>Open at</span><input type="time" value={draft.time} onChange={(event) => change("time", event.target.value)} /></label>
      <label><span>Name order</span><select value={draft.order} onChange={(event) => change("order", event.target.value as Filters["order"])}><option value="asc">A–Z</option><option value="desc">Z–A</option></select></label>
    </div>
    {typesLoading && <p role="status">Loading location types…</p>}
    {typesError && <div className="load-error" role="alert"><p>{typesError}</p><button type="button" onClick={() => { setTypesLoading(true); setTypesError(""); setTypesReload((value) => value + 1); }}>Retry location types</button></div>}
    {error && <div className="home-empty" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>Retry</button></div>}
    {!error && loading && <div className="home-empty" role="status">Loading locations…</div>}
    {!error && !loading && data?.items.length === 0 && <div className="home-empty">No locations match these filters.</div>}
    {!error && !loading && data && data.items.length > 0 && <>
      <div className="location-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((location) => <article className="location-card" key={location.id}>
          <div className="location-card-heading"><h3>{location.name}</h3><span>{location.type}</span></div>
          <p>{location.building}, floor {location.floor}</p>
          <p>{location.location_desc}</p>
          {location.open_time && location.close_time && <p>Open {hours(location.open_time)}–{hours(location.close_time)}</p>}
          {location.image_url && <a href={location.image_url} target="_blank" rel="noopener noreferrer">View location image</a>}
        </article>)}
      </div>
      <div className="location-pagination">
        <button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
        <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))} · {data.total} locations</span>
        <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
      </div>
    </>}
  </section>;
}
