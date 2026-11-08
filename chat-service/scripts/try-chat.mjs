/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated a terminal Socket.IO client for manual testing, in case Postman can't send the
 *        handshake auth payload.
 * Author review: Reviewed by Deanson, 2026-11-09.
 *
 * Usage (from chat-service/, after `npm install`):
 *   npm run try-chat -- <ticket> [url] [path]
 *   defaults: url http://localhost:3003 (Envoy), path /gateway/socket.io/
 *   without Envoy: npm run try-chat -- <ticket> http://localhost:3008 /socket.io/
 *
 * Then type a line to send it. Commands: /history, /older <beforeId>, /missed <afterId>, /quit.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { io } from 'socket.io-client';

const [ticket, url = 'http://localhost:3003', path = '/gateway/socket.io/'] = process.argv.slice(2);
if (!ticket) {
  console.error('Usage: npm run try-chat -- <ticket> [url] [path]');
  process.exit(1);
}

// One ticket, no reconnection: a ticket lasts 10 seconds, so a reconnect would need a new one.
const socket = io(url, { path, transports: ['websocket'], auth: { ticket }, reconnection: false });
const show = (label, value) => console.log(`${label} ${JSON.stringify(value, null, 2)}`);

socket.on('connect', () => console.log(`connected (${socket.id}). Type a message, or /history, /older N, /missed N, /quit`));
socket.on('connect_error', (err) => {
  console.error(`connect_error: ${err.message}`);
  process.exit(1);
});
socket.on('disconnect', (reason) => {
  console.log(`disconnected: ${reason}`);
  process.exit(0);
});
socket.on('newMessage', (message) => show('newMessage', message));

async function ack(event, payload) {
  try {
    show(`${event} ack`, await socket.timeout(5000).emitWithAck(event, payload));
  } catch {
    console.log(`${event}: no ack within 5 s`);
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const [command, arg] = line.trim().split(/\s+/);
  if (command === '/quit') return socket.disconnect();
  if (command === '/history') return ack('getHistory', {});
  if (command === '/older') return ack('getHistory', { beforeId: Number(arg) });
  if (command === '/missed') return ack('getMissedMessages', { afterId: Number(arg) });
  return ack('sendMessage', { clientMsgId: randomUUID(), content: line });
});
