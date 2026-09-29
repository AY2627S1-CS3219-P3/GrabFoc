/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Reduced the gateway entry point to configuration and startup.
Author review: Jie Yang reviewed this file.
*/
import { createGateway } from './app.js';
import { loadConfig } from './config.js';

export { createGateway } from './app.js';

// AI-generated (pending human review)
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const config = loadConfig();
  createGateway(config).listen(config.port, () => console.log(JSON.stringify({ event: 'gateway_started', port: config.port })));
}
