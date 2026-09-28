/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Verified User auth, profile, recovery and navigation through the gateway rewrite and server session.
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
let refreshDelay;
let refreshStarted;
const gateway = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  requests.push({ method: request.method, path: request.url, body, authorization: request.headers.authorization });
  if (request.url === "/users/me") {
    response.writeHead(["Bearer test-access", "Bearer new-access"].includes(request.headers.authorization) ? 200 : 401, { "content-type": "application/json" });
    response.end(JSON.stringify({ userId: "user-1", displayName: "Alex Tan", email: "alex@u.nus.edu", countryCode: "+65", mobileNumber: "91234567" }));
    return;
  }
  if (request.url === "/auth/login" && body.email === "wrong@u.nus.edu") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Invalid email or password." } }));
    return;
  }
  if (request.url === "/auth/login" && body.email === "malformed@u.nus.edu") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: "test-access", expiresIn: 900 }));
    return;
  }
  if (["/auth/login", "/auth/register/verify", "/auth/refresh"].includes(request.url)) {
    if (request.url === "/auth/refresh" && refreshDelay) { refreshStarted?.(); await refreshDelay; }
    const otherUser = request.url === "/auth/login" && body.email === "new@u.nus.edu";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: otherUser ? "new-access" : "test-access", refreshToken: otherUser ? "new-refresh" : "test-refresh", expiresIn: 900 }));
    return;
  }
  response.writeHead(request.url === "/auth/register" ? 201 : request.url === "/auth/password/reset" || request.url === "/auth/logout" ? 204 : 202, { "content-type": "application/json" });
  response.end(request.url === "/auth/password/reset" || request.url === "/auth/logout" ? undefined : JSON.stringify({ ok: true }));
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

test("login, profile, logout, registration, recovery and Home navigation reach the gateway", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/`);
    await page.waitForURL("**/signin");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    const cookies = await page.context().cookies();
    for (const name of ["foc_access", "foc_refresh"]) {
      const cookie = cookies.find((item) => item.name === name);
      assert.ok(cookie, `${name} cookie exists`);
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.sameSite, "Lax");
      assert.equal(cookie.path, "/");
      assert.equal(cookie.secure, false, "local HTTP development uses non-Secure cookies");
    }
    assert.deepEqual(requests.find((request) => request.path === "/auth/login")?.body,
      { email: "alex@u.nus.edu", password: "Passw0rdSafe" });
    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL("**/profile");
    await page.getByRole("heading", { name: "Alex Tan" }).waitFor();
    assert.ok(requests.some((request) => request.path === "/users/me" && request.authorization === "Bearer test-access"));
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/signin");
    assert.equal((await page.context().cookies()).some((cookie) => cookie.name === "foc_access" || cookie.name === "foc_refresh"), false);
    assert.deepEqual(requests.find((request) => request.path === "/auth/logout")?.body, { refreshToken: "test-refresh" });

    await page.getByRole("link", { name: "Sign Up" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Full Name").fill("Alex Tan");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Mobile Number").fill("91234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rdSafe");
    await page.getByLabel("Confirm Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.waitForURL("**/verify");
    assert.deepEqual(requests.find((request) => request.path === "/auth/register")?.body,
      { displayName: "Alex Tan", email: "alex@u.nus.edu", countryCode: "+65", mobileNumber: "91234567", password: "Passw0rdSafe" });

    await page.getByRole("button", { name: "Resend OTP" }).click();
    await page.getByRole("status").getByText("A new verification code has been sent.").waitFor();
    assert.deepEqual(requests.find((request) => request.path === "/auth/register/resend-otp")?.body, { email: "alex@u.nus.edu" });

    for (let digit = 1; digit <= 6; digit++) await page.getByLabel(`Digit ${digit}`).fill(String(digit));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL("**/home");
    assert.deepEqual(requests.find((request) => request.path === "/auth/register/verify")?.body, { email: "alex@u.nus.edu", otp: "123456" });

    await page.goto(`${baseUrl}/locations`);
    await page.waitForURL("**/home");
    await page.getByRole("button", { name: "Courier" }).click();
    await page.getByRole("heading", { name: "Available Orders" }).waitFor();
    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL("**/profile");
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/signin");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.waitForURL("**/forgot-password");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByRole("button", { name: "Send reset code" }).click();
    await page.waitForURL("**/reset-password");
    await page.getByLabel("Six-digit code").fill("123456");
    await page.getByLabel("New password").fill("NewPassw0rd");
    await page.getByLabel("Confirm password").fill("NewPassw0rd");
    await page.getByRole("button", { name: "Reset password" }).click();
    await page.getByText("Your password was reset.").waitFor();
    assert.deepEqual(requests.find((request) => request.path === "/auth/password/forgot")?.body, { email: "alex@u.nus.edu" });
    assert.deepEqual(requests.find((request) => request.path === "/auth/password/reset")?.body,
      { email: "alex@u.nus.edu", otp: "123456", newPassword: "NewPassw0rd" });
  } finally {
    await page.close();
  }
});

test("invalid credentials stay on Sign In and show the service error", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("wrong@u.nus.edu");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByRole("status").getByText("Invalid email or password.").waitFor();
    assert.equal(new URL(page.url()).pathname, "/signin");
  } finally { await page.close(); }
});

test("malformed token response does not create a browser session", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("malformed@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByRole("status").getByText("Gateway unavailable. Please try again.").waitFor();
    assert.equal((await page.context().cookies()).some((cookie) => cookie.name === "foc_access" || cookie.name === "foc_refresh"), false);
  } finally { await page.close(); }
});

test("session handlers reject unknown login and verification fields before reaching the gateway", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    const before = requests.length;
    const statuses = await page.evaluate(async () => {
      const options = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return Promise.all([
        fetch("/api/session/login", options({ email: "alex@u.nus.edu", password: "Passw0rdSafe", role: "ADMIN" })).then((response) => response.status),
        fetch("/api/session/verify", options({ email: "alex@u.nus.edu", otp: "123456", userId: "forged" })).then((response) => response.status),
      ]);
    });
    assert.deepEqual(statuses, [400, 400]);
    assert.equal(requests.length, before);
  } finally { await page.close(); }
});

test("expired access cookie refreshes once across simultaneous tabs", async () => {
  const context = await browser.newContext();
  const login = await context.newPage();
  try {
    await login.goto(`${baseUrl}/signin`);
    await login.getByLabel("Email").fill("alex@u.nus.edu");
    await login.getByLabel("Password").fill("Passw0rdSafe");
    await login.getByRole("button", { name: "Sign In" }).click();
    await login.waitForURL("**/home");
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.ok(refreshCookie);
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    const before = requests.filter((request) => request.path === "/auth/refresh").length;
    const second = await context.newPage();
    await Promise.all([login.goto(`${baseUrl}/profile`), second.goto(`${baseUrl}/profile`)]);
    await Promise.all([login.getByRole("heading", { name: "Alex Tan" }).waitFor(), second.getByRole("heading", { name: "Alex Tan" }).waitFor()]);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length - before, 1);
  } finally { await context.close(); }
});

test("sign-in waits for an in-progress refresh before replacing the session", async () => {
  const context = await browser.newContext();
  const oldTab = await context.newPage();
  let release;
  try {
    await oldTab.goto(`${baseUrl}/signin`);
    await oldTab.getByLabel("Email").fill("alex@u.nus.edu");
    await oldTab.getByLabel("Password").fill("Passw0rdSafe");
    await oldTab.getByRole("button", { name: "Sign In" }).click();
    await oldTab.waitForURL("**/home");
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.ok(refreshCookie);
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    refreshDelay = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { refreshStarted = resolve; });
    const oldNavigation = oldTab.goto(`${baseUrl}/profile`);
    await started;
    const newTab = await context.newPage();
    await newTab.goto(`${baseUrl}/signin`);
    await newTab.getByLabel("Email").fill("new@u.nus.edu");
    await newTab.getByLabel("Password").fill("Passw0rdSafe");
    const click = newTab.getByRole("button", { name: "Sign In" }).click();
    await delay(300);
    assert.equal(requests.some((request) => request.path === "/auth/login" && request.body.email === "new@u.nus.edu"), false);
    release();
    await click;
    await oldNavigation;
    await newTab.waitForURL("**/home");
    assert.equal((await context.cookies()).find((cookie) => cookie.name === "foc_access")?.value, "new-access");
  } finally {
    release?.();
    refreshDelay = undefined;
    refreshStarted = undefined;
    await context.close();
  }
});
