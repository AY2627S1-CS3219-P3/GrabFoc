/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added browser tests for frontend button navigation and requests through the gateway rewrite.
Author review: Pending team review and local browser verification.
*/
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

// AI-generated (pending human review)
const requests = [];
const gateway = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requests.push({ method: request.method, path: request.url, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") });
  response.writeHead(request.url === "/auth/register" ? 201 : 202, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function freePort() {
  const server = net.createServer();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  }));
}

let app;
let browser;
let baseUrl;

before(async () => {
  const gatewayPort = await listen(gateway);
  const frontendPort = await freePort();
  baseUrl = `http://localhost:${frontendPort}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(frontendPort)], {
    cwd: process.cwd(),
    env: { ...process.env, FRONTEND_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`, FRONTEND_TEST_DIST_DIR: ".next-route-tests" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let appOutput = "";
  app.stdout.on("data", (chunk) => { appOutput = (appOutput + chunk).slice(-8000); });
  app.stderr.on("data", (chunk) => { appOutput = (appOutput + chunk).slice(-8000); });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error(`Next.js exited before becoming ready: ${appOutput}`);
    try {
      const response = await fetch(`${baseUrl}/signup`);
      if (response.ok) break;
    } catch { /* Next.js is starting. */ }
    if (attempt === 59) throw new Error(`Next.js did not start within 30 seconds: ${appOutput}`);
    await delay(500);
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
});

after(async () => {
  await browser?.close();
  app?.kill();
  await new Promise((resolve) => gateway.close(resolve));
});

test("sign-up and resend buttons reach the gateway; unfinished buttons stay local", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    try {
      await page.getByRole("status").waitFor({ timeout: 5000 });
    } catch {
      throw new Error(`Sign-in status missing at ${new URL(page.url()).pathname}: ${(await page.locator("body").innerText()).slice(0, 600)}`);
    }
    assert.equal(await page.getByRole("status").textContent(), "This action is unavailable right now. Please try again later.");
    assert.equal(requests.length, 0);

    await page.getByRole("link", { name: "Sign Up" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Full Name").fill("Alex Tan");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Mobile Number").fill("91234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rdSafe");
    await page.getByLabel("Confirm Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.waitForURL("**/verify");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      method: "POST", path: "/auth/register",
      body: { displayName: "Alex Tan", email: "alex@u.nus.edu", countryCode: "+65", mobileNumber: "91234567", password: "Passw0rdSafe" },
    });

    await page.getByRole("button", { name: "Resend OTP" }).click();
    await page.getByRole("status").getByText("A new verification code has been sent.").waitFor();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], { method: "POST", path: "/auth/register/resend-otp", body: { email: "alex@u.nus.edu" } });

    for (let digit = 1; digit <= 6; digit++) await page.getByLabel(`Digit ${digit}`).fill(String(digit));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("status").getByText("This action is unavailable right now. Please try again later.").waitFor();
    assert.equal(requests.length, 2);

    await page.goto(`${baseUrl}/locations`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Courier" }).click();
    await page.getByRole("heading", { name: "Available Orders" }).waitFor();
    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL("**/profile");
    assert.equal(requests.length, 2);
  } finally {
    await page.close();
  }
});
