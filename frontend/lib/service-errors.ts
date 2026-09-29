/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Normalized User Service errors and RFC 9457 Problem Details for reusable frontend feedback.
Author review: Jie Yang reviewed this file.
*/
export type FieldIssue = { field: string; message: string };
export type ServiceError = {
  status: number;
  code?: string;
  message: string;
  fields: FieldIssue[];
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

// AI-generated (reviewed by Jie Yang)
export async function parseServiceError(response: Response, fallback: string): Promise<ServiceError> {
  const result: ServiceError = { status: response.status, message: fallback, fields: [] };
  let body: unknown;
  try { body = await response.json(); } catch { return result; }
  const root = record(body);
  if (!root) return result;
  const user = record(root.error);
  const source = user ?? root;
  const details = record(source.details);
  if (typeof source.code === 'string' && source.code.trim()) result.code = source.code;
  if (typeof source.message === 'string' && source.message.trim()) result.message = source.message;
  else if (typeof source.detail === 'string' && source.detail.trim()) result.message = source.detail;
  result.attemptsRemaining = nonnegativeNumber(details?.attemptsRemaining);
  result.retryAfterSeconds = nonnegativeNumber(details?.retryAfterSeconds);
  const fields = details?.fields;
  if (Array.isArray(fields)) result.fields = fields.flatMap((item): FieldIssue[] => {
    const issue = record(item);
    return issue && typeof issue.field === 'string' && typeof issue.message === 'string'
      ? [{ field: issue.field, message: issue.message }] : [];
  });
  return result;
}

export function mapFieldErrors(issues: FieldIssue[], names: Record<string, string> = {}): Record<string, string[]> {
  const mapped: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = names[issue.field] ?? issue.field;
    (mapped[field] ??= []).push(issue.message);
  }
  return mapped;
}
