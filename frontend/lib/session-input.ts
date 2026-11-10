/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added strict frontend session request schemas matching User Service login and verification bodies.
Author review: Jie Yang reviewed this file.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added profileEditInput for the display-name edit (PATCH /users/me).
Author review: Pending review by Deanson.
*/
import { z } from 'zod';

// AI-generated (reviewed by Jie Yang)
export const loginInput = z.object({ email: z.string().min(1), password: z.string().min(1) }).strict();
export const verifyInput = z.object({ email: z.string().min(1), otp: z.string().regex(/^\d{6}$/) }).strict();
// AI-generated (pending review by Deanson): PATCH /users/me body; the User Service stays the authority.
export const profileEditInput = z.object({ displayName: z.string().trim().min(1).max(100) }).strict();
