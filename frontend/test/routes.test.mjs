/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Verified session flows, denial logging, and refresh-only logout revocation with local clearing on 2026-09-29.
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
let failLogout = false;
let refreshOutcome = 200;
let rejectRotatedAccess = false;
let denyProfile = false;
let breakRotatedProfile = false;
let stallLogin = false;
const stalledResponses = new Set();
const consumedRefreshTokens = new Set();
let loginCount = 0;
const gateway = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  requests.push({ method: request.method, path: request.url, body, authorization: request.headers.authorization });
  if (request.url === "/users/me") {
    if (breakRotatedProfile && request.headers.authorization === "Bearer new-access") {
      response.destroy();
      return;
    }
    if (denyProfile) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    const accepted = request.headers.authorization === "Bearer test-access" ||
      (request.headers.authorization === "Bearer new-access" && !rejectRotatedAccess);
    response.writeHead(accepted ? 200 : 401, { "content-type": "application/json" });
    response.end(JSON.stringify({ userId: "user-1", displayName: "Alex Tan", email: "alex@u.nus.edu", countryCode: "+65", mobileNumber: "91234567" }));
    return;
  }
  if (request.url === "/auth/login" && body.email === "wrong@u.nus.edu") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Invalid email or password." } }));
    return;
  }
  if (request.url === "/auth/login" && body.email === "forbidden@u.nus.edu") {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Sign-in forbidden." } }));
    return;
  }
  if (request.url === "/auth/logout" && failLogout) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Service unavailable" } }));
    return;
  }
  if (request.url === "/auth/login" && body.email === "malformed@u.nus.edu") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: "test-access", expiresIn: 900 }));
    return;
  }
  if (["/auth/login", "/auth/register/verify", "/auth/refresh"].includes(request.url)) {
    if (request.url === "/auth/login" && stallLogin) {
      stalledResponses.add(response);
      response.on("close", () => stalledResponses.delete(response));
      return;
    }
    if (request.url === "/auth/refresh" && refreshDelay) { refreshStarted?.(); await refreshDelay; }
    if (request.url === "/auth/refresh" && consumedRefreshTokens.has(body.refreshToken)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Consumed refresh token" }));
      return;
    }
    if (request.url === "/auth/refresh" && refreshOutcome !== 200) {
      response.writeHead(refreshOutcome, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Refresh failed" }));
      return;
    }
    if (request.url === "/auth/refresh") consumedRefreshTokens.add(body.refreshToken);
    const otherUser = request.url === "/auth/login" && body.email === "new@u.nus.edu";
    const fresh = request.url === "/auth/refresh";
    const refreshToken = fresh ? `rotated-${body.refreshToken}` : otherUser ? "new-refresh" :
      ++loginCount === 1 ? "test-refresh" : `test-refresh-${loginCount}`;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: fresh || otherUser ? "new-access" : "test-access", refreshToken, expiresIn: 900 }));
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
let appOutput = "";
let appLogs = "";

before(async () => {
  const gatewayPort = await listen(gateway);
  const frontendPort = await freePort();
  baseUrl = `http://localhost:${frontendPort}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(frontendPort)], {
    cwd: process.cwd(),
    env: { ...process.env, FRONTEND_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`, FRONTEND_TEST_DIST_DIR: ".next-route-tests" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => { appLogs += chunk; appOutput = (appOutput + chunk).slice(-8000); });
  app.stderr.on("data", (chunk) => { appLogs += chunk; appOutput = (appOutput + chunk).slice(-8000); });
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
  for (const response of stalledResponses) response.destroy();
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
    assert.equal(await page.evaluate(() => document.cookie.includes("foc_")), false);
    assert.equal(await page.evaluate(() => JSON.stringify(sessionStorage).includes("test-access")), false);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("test-access")), false);
    const refreshesBeforeProfile = requests.filter((request) => request.path === "/auth/refresh").length;
    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL("**/profile");
    await page.getByRole("heading", { name: "Alex Tan" }).waitFor();
    assert.ok(requests.some((request) => request.path === "/users/me" && request.authorization === "Bearer test-access"));
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length, refreshesBeforeProfile);
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

test("remote logout failure still clears browser cookies and shows a warning", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL("**/profile");
    failLogout = true;
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/signin");
    await page.getByRole("status").getByText("Signed out here, but the service could not confirm remote logout.").waitFor();
    assert.equal((await page.context().cookies()).some((cookie) => cookie.name === "foc_access" || cookie.name === "foc_refresh"), false);
  } finally {
    failLogout = false;
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

test("upstream login 401 and 403 are logged without credentials", async () => {
  const logStart = appLogs.length;
  for (const [email, expectedStatus] of [["wrong@u.nus.edu", 401], ["forbidden@u.nus.edu", 403]]) {
    const response = await fetch(`${baseUrl}/api/session/login`, {
      method: "POST", headers: { origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "secret-for-log-test" }),
    });
    assert.equal(response.status, expectedStatus);
  }
  const emitted = appLogs.slice(logStart);
  for (const status of [401, 403]) {
    assert.ok(emitted.includes(JSON.stringify({ event: "unauthorized_access", status, method: "POST", path: "/api/session/login" })));
  }
  assert.equal(emitted.includes("secret-for-log-test"), false);
  assert.equal(emitted.includes("forbidden@u.nus.edu"), false);
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
    await login.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.ok(refreshCookie);
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    const before = requests.filter((request) => request.path === "/auth/refresh").length;
    const second = await context.newPage();
    await Promise.all([login.goto(`${baseUrl}/profile`), second.goto(`${baseUrl}/profile`)]);
    await Promise.all([login.getByRole("heading", { name: "Alex Tan" }).waitFor(), second.getByRole("heading", { name: "Alex Tan" }).waitFor()]);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length - before, 1);
    const rotated = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.equal(rotated?.value, `rotated-${refreshCookie.value}`);
    assert.equal((await context.cookies()).find((cookie) => cookie.name === "foc_access")?.value, "new-access");
  } finally { await context.close(); }
});

test("a protected BFF request refreshes after gateway 401 and retries once", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/session/login"));
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    assert.deepEqual(await (await loginResponse).json(), { ok: true });
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const context = page.context();
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([refreshCookie, { name: "foc_access", value: "invalid-access", domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const before = requests.length;
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/session/profile");
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.displayName, "Alex Tan");
    const relevant = requests.slice(before);
    assert.deepEqual(relevant.map((request) => request.path), ["/users/me", "/auth/refresh", "/users/me"]);
    assert.equal(relevant[0].authorization, "Bearer invalid-access");
    assert.equal(relevant[2].authorization, "Bearer new-access");
    assert.equal((await context.cookies()).find((cookie) => cookie.name === "foc_refresh")?.value, `rotated-${refreshCookie.value}`);
  } finally { await page.close(); }
});

test("refresh 401 clears cookies and 503 leaves the session retryable without looping", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    refreshOutcome = 503;
    let before = requests.filter((request) => request.path === "/auth/refresh").length;
    let status = await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status));
    assert.equal(status, 502);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length - before, 1);
    assert.ok((await context.cookies()).some((cookie) => cookie.name === "foc_refresh"));
    refreshOutcome = 401;
    before = requests.filter((request) => request.path === "/auth/refresh").length;
    status = await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status));
    assert.equal(status, 401);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length - before, 1);
    assert.equal((await context.cookies()).some((cookie) => cookie.name.startsWith("foc_")), false);
    await page.goto(`${baseUrl}/home`);
    await page.waitForURL("**/signin");
  } finally { refreshOutcome = 200; await context.close(); }
});

test("a second protected 401 stops after one retry and ends the local session", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    rejectRotatedAccess = true;
    const before = requests.length;
    const status = await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status));
    assert.equal(status, 401);
    assert.deepEqual(requests.slice(before).map((request) => request.path), ["/auth/refresh", "/users/me"]);
    assert.equal((await context.cookies()).some((cookie) => cookie.name.startsWith("foc_")), false);
  } finally { rejectRotatedAccess = false; await context.close(); }
});

test("simultaneous server requests share an in-flight rotation but reject stale arrivals", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let release;
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([refreshCookie]);
    refreshDelay = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { refreshStarted = resolve; });
    const before = requests.filter((request) => request.path === "/auth/refresh").length;
    const pending = page.evaluate(() => Promise.all([
      fetch("/api/session/status").then((response) => response.status),
      ...Array.from({ length: 3 }, () => fetch("/api/session/profile").then((response) => response.status)),
    ]));
    await started;
    await delay(500);
    release();
    const statuses = await pending;
    assert.equal(statuses.length, 4);
    assert.ok(statuses.filter((status) => status === 200).length >= 2);
    assert.ok(statuses.every((status) => status === 200 || status === 401));
    assert.ok(requests.filter((request) => request.path === "/auth/refresh").length - before >= 1);
  } finally {
    release?.();
    refreshDelay = undefined;
    refreshStarted = undefined;
    await context.close();
  }
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
    await oldTab.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
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

test("a completed rotation never replays credentials to the consumed token", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const oldRefresh = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.ok(oldRefresh);
    await context.clearCookies();
    await context.addCookies([oldRefresh]);
    const first = await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status));
    assert.equal(first, 200);
    const rotated = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    assert.notEqual(rotated?.value, oldRefresh.value);
    const before = requests.filter((request) => request.path === "/auth/refresh").length;
    const stale = await fetch(`${baseUrl}/api/session/profile`, {
      headers: { cookie: `foc_refresh=${oldRefresh.value}`, "sec-fetch-site": "same-origin" },
    });
    assert.equal(stale.status, 401);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length - before, 1);
  } finally { await context.close(); }
});

test("a failed protected retry retains newly rotated cookies", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const oldRefresh = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([oldRefresh]);
    breakRotatedProfile = true;
    assert.equal(await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status)), 502);
    assert.equal((await context.cookies()).find((cookie) => cookie.name === "foc_refresh")?.value, `rotated-${oldRefresh.value}`);
    breakRotatedProfile = false;
    assert.equal(await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status)), 200);
  } finally { breakRotatedProfile = false; await context.close(); }
});

test("403 stays forbidden, is logged, and does not rotate or clear cookies", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const refreshes = requests.filter((request) => request.path === "/auth/refresh").length;
    const logStart = appLogs.length;
    denyProfile = true;
    assert.equal(await page.evaluate(() => fetch("/api/session/profile").then((response) => response.status)), 403);
    await delay(100);
    assert.match(appLogs.slice(logStart), /"event":"unauthorized_access","status":403,"method":"GET","path":"\/api\/session\/profile"/);
    assert.equal(requests.filter((request) => request.path === "/auth/refresh").length, refreshes);
    assert.ok((await context.cookies()).some((cookie) => cookie.name === "foc_refresh"));
  } finally { denyProfile = false; await context.close(); }
});

test("cross-origin cookie reads and mutations are logged and cannot refresh", async () => {
  const logStart = appLogs.length;
  const refreshes = requests.filter((request) => request.path === "/auth/refresh").length;
  for (const path of ["profile", "status"]) {
    const response = await fetch(`${baseUrl}/api/session/${path}`, {
      headers: { cookie: "foc_refresh=stale", "sec-fetch-site": "cross-site" },
    });
    assert.equal(response.status, 403);
  }
  const forgedOrigin = await fetch(`${baseUrl}/api/session/profile`, {
    headers: { cookie: "foc_refresh=stale", origin: "https://example.com", "sec-fetch-site": "same-origin" },
  });
  assert.equal(forgedOrigin.status, 403);
  const mutation = await fetch(`${baseUrl}/api/session/refresh`, {
    method: "POST", headers: { origin: "https://example.com", cookie: "foc_refresh=stale" },
  });
  assert.equal(mutation.status, 403);
  await delay(100);
  assert.match(appLogs.slice(logStart), /"event":"unauthorized_access","status":403/);
  assert.equal(requests.filter((request) => request.path === "/auth/refresh").length, refreshes);
});

test("gateway login times out after ten seconds with the unavailable response", async () => {
  stallLogin = true;
  try {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/api/session/login`, {
      method: "POST", headers: { origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ email: "alex@u.nus.edu", password: "Passw0rdSafe" }),
    });
    assert.equal(response.status, 502);
    assert.ok(Date.now() - started >= 9_000);
    assert.deepEqual(await response.json(), { error: { message: "Gateway unavailable. Please try again." } });
  } finally {
    stallLogin = false;
    for (const response of stalledResponses) response.destroy();
  }
});

test("profile logout clears cookies even when session refresh is unavailable", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    const refresh = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
    await context.clearCookies();
    await context.addCookies([refresh]);
    refreshOutcome = 503;
    await page.goto(`${baseUrl}/profile`);
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/signin");
    assert.equal((await context.cookies()).some((cookie) => cookie.name.startsWith("foc_")), false);
  } finally { refreshOutcome = 200; await context.close(); }
});

test("logout with only a refresh cookie rotates before revocation and always clears cookies", async () => {
  for (const remoteFailure of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/signin`);
      await page.getByLabel("Email").fill("alex@u.nus.edu");
      await page.getByLabel("Password").fill("Passw0rdSafe");
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForURL("**/home");
      await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
      const oldRefresh = (await context.cookies()).find((cookie) => cookie.name === "foc_refresh");
      assert.ok(oldRefresh);
      await context.clearCookies();
      await context.addCookies([oldRefresh]);
      failLogout = remoteFailure;
      const before = requests.length;
      const result = await page.evaluate(async () => {
        const response = await fetch("/api/session/logout", { method: "POST" });
        return { status: response.status, body: await response.json() };
      });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { ok: true, remoteRevoked: !remoteFailure });
      const relevant = requests.slice(before);
      assert.deepEqual(relevant.map((request) => request.path), ["/auth/refresh", "/auth/logout"]);
      assert.deepEqual(relevant[0].body, { refreshToken: oldRefresh.value });
      assert.equal(relevant[1].authorization, "Bearer new-access");
      assert.deepEqual(relevant[1].body, { refreshToken: `rotated-${oldRefresh.value}` });
      assert.equal((await context.cookies()).some((cookie) => cookie.name.startsWith("foc_")), false);
    } finally {
      failLogout = false;
      await context.close();
    }
  }
});
