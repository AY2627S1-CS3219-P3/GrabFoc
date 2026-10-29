/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Added frontend types and error handling for the existing Supplier location contract.
Author review: Jie Yang reviewed this file; live integration verification remains pending.
*/
import { withSessionMutation } from '@/lib/session-client';

export type Location = {
  id: number;
  name: string;
  type: string;
  building: string;
  floor: number;
  location_desc: string;
  lat: number;
  lon: number;
  open_time: string | null;
  close_time: string | null;
  image_url: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
};

export type LocationPage = { items: Location[]; page: number; pageSize: number; total: number };

/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added activeLocations() for the order form's pickup and delivery dropdowns.
Author review: Pending review by Deanson.
*/
// AI-generated (pending review by Deanson)
// The order form needs every ACTIVE location; 21 are seeded and Supplier sets no pageSize limit.
export async function activeLocations(): Promise<Location[]> {
  const response = await withSessionMutation(() => fetch('/api/session/supplier/locations?pageSize=100', { cache: 'no-store' }));
  if (!response.ok) throw new Error(await supplierError(response));
  return (await response.json() as LocationPage).items;
}

// AI-generated (reviewed by Jie Yang)
export async function supplierError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      if ('detail' in body && typeof body.detail === 'string') return body.detail;
      if ('error' in body && typeof body.error === 'string') return body.error;
    }
  } catch { /* use the status fallback */ }
  return `Supplier Service returned ${response.status}.`;
}
