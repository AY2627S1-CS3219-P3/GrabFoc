/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Defined the gateway route contract for declarative service routing.
Author review: Jie Yang reviewed this file.
*/

// AI-generated (reviewed by Jie Yang)
export type ServiceName = 'user' | 'supplier';

export type GatewayRoute = {
  method: string;
  pattern: RegExp;
  service: ServiceName;
  auth: 'public' | 'authenticated';
};
