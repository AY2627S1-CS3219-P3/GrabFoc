/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Server page that reads the chat socket address at request time and renders the client order page, which moved to order-page.tsx (the chat plan). Earlier history of the page is in order-page.tsx.
Author review: Reviewed by Deanson, 2026-11-09.
*/
import { connection } from "next/server";
import { OrderPage } from "./order-page";

// AI-generated (reviewed by Deanson, 2026-11-09)
// Read per request, never baked into the image: the image is promoted from staging to production
// unchanged, so these are server variables, not NEXT_PUBLIC_ ones. Unset URL = the page's own origin.
export default async function Page() {
  await connection();
  return <OrderPage
    socketUrl={process.env.CHAT_SOCKET_URL || undefined}
    socketPath={process.env.CHAT_SOCKET_PATH || "/gateway/socket.io/"}
  />;
}
