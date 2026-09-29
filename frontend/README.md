<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented frontend gateway requests, BFF-managed refresh, local configuration, reusable User Service error feedback, and Supplier browsing and management; removed the obsolete /locations redirect reference, added Compose setup, and recorded the styling choice on 2026-09-30.
Author review: Jie Yang reviewed the earlier documentation and confirmed Tailwind CSS with shadcn/ui; live integration and team visual review remain pending.
-->

# GrabFoc frontend

The team chose Tailwind CSS with shadcn/ui for frontend styling. Supplier browsing and management use Tailwind responsive layout utilities; existing controls remain unchanged.

The frontend runs on port 3000 by default. Copy `frontend/.env.example` to `frontend/.env.local` and set `FRONTEND_GATEWAY_URL` if the gateway is not at `http://localhost:3003`.

From the repository root, copy `.env.example` to `.env`, fill in the required User and Supplier settings, and run `docker compose up --build`. The frontend will be at `http://localhost:3000`; its server uses `http://api-gateway:3003` inside the Compose network. To run only this container, use `docker compose -f frontend/compose.yaml up --build`; requests to the gateway require the gateway container to be running in the same `foc` project.

Start the gateway, User Service, and Supplier Service, then run `npm install` and `npm run dev` from this folder. The sign-in screen is `/signin`, the app Home is `/home`, and `/` checks the session before redirecting. Home shows live Supplier locations with name search, type, building, opening-time and name-order filters, plus pagination. Admins can use `/admin/locations` to create, edit, deactivate and restore locations; Supplier Service enforces the role independently.

Registration, resend, and password recovery use the same-origin `/api/gateway/*` rewrite. Sign-in and registration verification call Next.js `/api/session/*` handlers, which call the gateway and put tokens in HttpOnly, SameSite cookies. Protected profile and status requests send the bearer access token from Next.js. On a missing or rejected access token, Next.js calls `POST /auth/refresh` through the gateway, rotates both cookies, and retries the protected request once. Refresh 401 clears both cookies; an unavailable refresh keeps the session retryable. Browser tabs use Web Locks to serialize cookie-backed requests and session mutations; the Next.js process also coalesces requests presenting the same refresh token. Process coordination does not extend across multiple Next.js instances. Logout clears local cookies even if User Service logout fails; Sign In then warns that remote token revocation was not confirmed. The six-digit registration code is sent to `/auth/register/verify`. Profile displays User Service data; credit and order totals remain pending their own services.

User Service errors are parsed into a shared frontend shape. Known codes control messages and retry details, validation fields appear beside inputs, and operation failures appear in a dismissible toast. The parser also accepts Supplier Service's current RFC 9457 Problem Details response so later services can use the same UI components without changing their response contracts.

## Check button destinations

Run `npm run test:routes` from `frontend/`. The browser test uses an installed Microsoft Edge, starts an isolated Next.js instance and a fake gateway, and checks login, registration, verification, recovery, profile, logout, concurrent refresh, location browsing, and admin management. It does not require the real User or Supplier services or interrupt an existing Next.js dev server.

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
