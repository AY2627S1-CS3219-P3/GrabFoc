/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added strict frontend session request schemas matching User Service login and verification bodies.
Author review: Jie Yang reviewed this file.
*/
import { z } from 'zod';

// AI-generated (pending human review)
export const loginInput = z.object({ email: z.string().min(1), password: z.string().min(1) }).strict();
export const verifyInput = z.object({ email: z.string().min(1), otp: z.string().regex(/^\d{6}$/) }).strict();
