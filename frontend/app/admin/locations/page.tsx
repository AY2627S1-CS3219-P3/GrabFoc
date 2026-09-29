/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Added an admin-only interface to list, create, edit, deactivate and restore Supplier locations; made type loading retryable and reset stale forms on 2026-09-29.
Author review: Pending team review and visual verification.
*/
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { getSession, withSessionMutation } from "@/lib/session-client";
import { type Location, type LocationPage, supplierError } from "@/lib/locations";

function timeField(value: string | null) { return value ? `${value.slice(0, 2)}:${value.slice(2, 4)}` : ""; }
function apiTime(value: string) { return value ? value.replace(":", "") + "hrs" : null; }

// AI-generated (pending human review)
export default function ManageLocationsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState("");
  const [typesReload, setTypesReload] = useState(0);
  const [data, setData] = useState<LocationPage | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [createRevision, setCreateRevision] = useState(0);

  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (!session.authenticated) router.replace("/signin");
      else if (session.role !== "ADMIN") router.replace("/home");
      else setAllowed(true);
    }).catch(() => { if (active) { setError("Could not check your session."); setLoading(false); } });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed, typesReload]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setAppliedName(name); }, 300);
    return () => window.clearTimeout(timer);
  }, [name]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ includeInactive: "true", page: String(page), pageSize: "20" });
    if (appliedName.trim()) query.set("name", appliedName.trim());
    withSessionMutation(() => fetch(`/api/session/supplier/locations?${query}`, { cache: "no-store", signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) { router.replace("/signin"); return; }
        if (response.status === 403) { router.replace("/home"); return; }
        if (!response.ok) throw new Error(await supplierError(response));
        const result = await response.json() as LocationPage;
        if (!controller.signal.aborted) { setData(result); setError(""); setLoading(false); }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Could not load locations."); setLoading(false); }
      });
    return () => controller.abort();
  }, [allowed, appliedName, page, reload, router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: String(form.get("name") ?? "").trim(),
      type: String(form.get("type") ?? ""),
      building: String(form.get("building") ?? "").trim(),
      floor: Number(form.get("floor")),
      location_desc: String(form.get("location_desc") ?? "").trim(),
      lat: Number(form.get("lat")),
      lon: Number(form.get("lon")),
      open_time: apiTime(String(form.get("open_time") ?? "")),
      close_time: apiTime(String(form.get("close_time") ?? "")),
      image_url: String(form.get("image_url") ?? "").trim() || null,
    };
    if (editing) body.version = editing.version;
    setBusy(true);
    setError("");
    try {
      const response = await withSessionMutation(() => fetch(
        editing ? `/api/session/supplier/locations/${editing.id}` : "/api/session/supplier/locations",
        { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      ));
      if (!response.ok) throw new Error(await supplierError(response));
      if (!editing) setCreateRevision((value) => value + 1);
      setEditing(null);
      setReload((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the location."); }
    finally { setBusy(false); }
  }

  async function changeStatus(location: Location) {
    setBusy(true);
    setError("");
    try {
      const action = location.status === "ACTIVE" ? "deactivate" : "restore";
      const response = await withSessionMutation(() => fetch(`/api/session/supplier/locations/${location.id}/${action}`, { method: "POST" }));
      if (!response.ok) throw new Error(await supplierError(response));
      setEditing((current) => current?.id === location.id ? null : current);
      setReload((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the location status."); }
    finally { setBusy(false); }
  }

  if (!allowed) return <main className="auth-page"><div className="auth-card">{error || "Checking admin access…"}</div></main>;

  return <AppShell section="locations"><div className="section-heading"><div><h1 className="dashboard-title">Manage Locations</h1><p>Active and inactive campus pickup points</p></div><Link className="outline-link" href="/home">Browse locations</Link></div>
    {error && <p className="auth-message" role="alert">{error}</p>}
    <div className="manage-layout">
      <section className="manage-list" aria-labelledby="manage-list-title">
        <h2 id="manage-list-title">Locations</h2>
        <label className="manage-search"><span>Search name</span><input type="search" value={name} onChange={(event) => { setLoading(true); setName(event.target.value); }} /></label>
        {loading && <p role="status">Loading locations…</p>}
        {!loading && data?.items.length === 0 && <p>No locations found.</p>}
        {!loading && data?.items.map((location) => <div className="manage-row" key={location.id}>
          <div><strong>{location.name}</strong><span>{location.type} · {location.building} · {location.status}</span></div>
          <div className="manage-actions"><button type="button" disabled={busy} onClick={() => setEditing(location)}>Edit</button><button type="button" disabled={busy} onClick={() => changeStatus(location)}>{location.status === "ACTIVE" ? "Deactivate" : "Restore"}</button></div>
        </div>)}
        {data && <div className="location-pagination"><button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button><span>Page {data.page} · {data.total} locations</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button></div>}
      </section>
      <section className="manage-form" aria-labelledby="manage-form-title">
        <h2 id="manage-form-title">{editing ? `Edit ${editing.name}` : "Add Location"}</h2>
        {editing && <button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel edit</button>}
        {typesLoading ? <p role="status">Loading location types…</p> : typesError ? <div className="load-error" role="alert"><p>{typesError}</p><button type="button" onClick={() => { setTypesLoading(true); setTypesError(""); setTypesReload((value) => value + 1); }}>Retry location types</button></div> : types.length === 0 ? <p role="status">No location types available.</p> : <form key={`${editing?.id ?? "new"}-${createRevision}`} onSubmit={save}>
          <label>Name<input name="name" defaultValue={editing?.name} maxLength={100} required /></label>
          <label>Type<select name="type" defaultValue={editing?.type ?? types[0] ?? ""} required>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>Building<input name="building" defaultValue={editing?.building} required /></label>
          <label>Floor<input name="floor" type="number" step="1" defaultValue={editing?.floor} required /></label>
          <label>Description<textarea name="location_desc" defaultValue={editing?.location_desc} required /></label>
          <div className="manage-form-pair"><label>Latitude<input name="lat" type="number" step="any" defaultValue={editing?.lat} required /></label><label>Longitude<input name="lon" type="number" step="any" defaultValue={editing?.lon} required /></label></div>
          <div className="manage-form-pair"><label>Opens<input name="open_time" type="time" defaultValue={timeField(editing?.open_time ?? null)} /></label><label>Closes<input name="close_time" type="time" defaultValue={timeField(editing?.close_time ?? null)} /></label></div>
          <label>Image URL (optional)<input name="image_url" type="url" defaultValue={editing?.image_url ?? ""} /></label>
          <button type="submit" className="auth-submit" disabled={busy || types.length === 0}>{busy ? "Saving…" : editing ? "Save Changes" : "Add Location"}</button>
        </form>}
      </section>
    </div>
  </AppShell>;
}
