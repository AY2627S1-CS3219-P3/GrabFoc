/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Implemented the user-approved Order database-only plan.
Author review: Design and plan approved by user; implementation review pending.
*/
// AI-generated; human review pending.
import type { PoolConfig } from 'pg';

export function databaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const required = ['ORDER_DB_HOST', 'ORDER_DB_NAME', 'ORDER_DB_USER', 'ORDER_DB_PASSWORD'] as const;
  for (const name of required) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
  }
  const rawPort = env.ORDER_DB_PORT ?? '5432';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('Invalid ORDER_DB_PORT');
  }
  return {
    host: env.ORDER_DB_HOST,
    port: Number(rawPort),
    database: env.ORDER_DB_NAME,
    user: env.ORDER_DB_USER,
    password: env.ORDER_DB_PASSWORD,
    connectionTimeoutMillis: 10000,
    max: 5,
  };
}
