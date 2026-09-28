<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented the frontend's current gateway connection for public registration requests.
Author review: Pending team review and live integration test.
-->

# GrabFoc frontend

The frontend runs on port 3000 by default. Sign-up and OTP resend use a same-origin `/api/gateway/*` rewrite to the API Gateway at `http://localhost:3003`. Set `FRONTEND_GATEWAY_URL` in the frontend process environment if the gateway has another address. The root `.env.example` lists the setting; when running Next.js from `frontend/`, put the value in `frontend/.env.local` or set it in your shell.

Start the gateway and User Service, then run `npm install` and `npm run dev` from this folder. Sign-up calls `POST /auth/register` through the gateway. OTP resend calls `POST /auth/register/resend-otp`. Verification, sign-in, session storage, and protected data are pending the team-approved token flow. The verification UI uses six digits to match User Service.

## Check button destinations

Run `npm run test:routes` from `frontend/`. The browser test uses an installed Microsoft Edge, starts an isolated Next.js instance and a fake gateway, clicks the controls, and asserts which requests arrive at the gateway. It does not require the real User or Supplier services or interrupt an existing Next.js dev server. Sign-in and Confirm currently make no gateway request; sign-up and Resend OTP do.

For a manual check, open the frontend in Edge, press F12, select **Network**, enable **Preserve log**, and click a button. Filter for `gateway`. Sign-up should show `POST /api/gateway/auth/register`; Resend OTP should show `POST /api/gateway/auth/register/resend-otp`. The browser sees the frontend path because Next.js rewrites it; the upstream gateway receives `/auth/register` or `/auth/register/resend-otp`. Never share a Network export containing passwords or tokens.

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
