<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented frontend gateway requests, server-managed sessions and local configuration.
Author review: Pending team review and live integration test.
-->

# GrabFoc frontend

The frontend runs on port 3000 by default. Copy `frontend/.env.example` to `frontend/.env.local` and set `FRONTEND_GATEWAY_URL` if the gateway is not at `http://localhost:3003`.

Start the gateway and User Service, then run `npm install` and `npm run dev` from this folder. The sign-in screen is `/signin`, the app Home is `/home`, and `/` checks the session before redirecting. `/locations` redirects to `/home`.

Registration, resend, and password recovery use the same-origin `/api/gateway/*` rewrite. Sign-in and registration verification call Next.js `/api/session/*` handlers, which call the gateway and put tokens in HttpOnly, SameSite cookies. Protected profile reads go through these handlers with a bearer access token. Refresh rotates the cookie token through `POST /auth/refresh`; browser tabs coordinate refresh with Web Locks. The six-digit registration code is sent to `/auth/register/verify`. Profile displays User Service data; credit and order totals remain pending their own services.

## Check button destinations

Run `npm run test:routes` from `frontend/`. The browser test uses an installed Microsoft Edge, starts an isolated Next.js instance and a fake gateway, and checks login, registration, verification, recovery, profile, logout and concurrent refresh. It does not require the real User or Supplier services or interrupt an existing Next.js dev server.

For a manual check, open the frontend in Edge, press F12, select **Network**, enable **Preserve log**, and click a button. Sign-up should show `POST /api/gateway/auth/register`; Sign In should show `POST /api/session/login`. The browser sees frontend paths; Next.js sends the corresponding requests to the gateway. Never share a Network export containing passwords or tokens.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
