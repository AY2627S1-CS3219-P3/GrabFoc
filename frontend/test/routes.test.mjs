/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Verified session flows, denial logging, refresh-only logout, reusable error feedback, Supplier browsing and management filters, retries, refreshed edits, and downstream 401 handling; removed the obsolete /locations redirect check and added Supplier responsive-layout assertions on 2026-09-30.
Author review: Jie Yang reviewed the earlier tests; responsive-layout assertions and local visual verification await his review.
*/
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

// AI-generated (earlier version reviewed by Jie Yang; responsive test pending review)
const requests = [];
const adminAccess = `header.${Buffer.from(JSON.stringify({ role: "ADMIN" })).toString("base64url")}.signature`;
const locations = [
  { id: 1, name: "COM3 Basement", type: "Food", building: "COM3", floor: -1, location_desc: "Campus pickup point", lat: 1.295, lon: 103.773, open_time: "0900hrs", close_time: "1800hrs", image_url: null, status: "ACTIVE", version: 1 },
  { id: 2, name: "UTown Print", type: "Printing", building: "UTown", floor: 1, location_desc: "Print counter", lat: 1.304, lon: 103.773, open_time: null, close_time: null, image_url: null, status: "ACTIVE", version: 1 },
];
let refreshDelay;
let refreshStarted;
let failLogout = false;
let refreshOutcome = 200;
let rejectRotatedAccess = false;
let denyProfile = false;
let malformedProfile = false;
let breakRotatedProfile = false;
let stallLogin = false;
let failTypes = false;
let supplier401 = false;
let authorityStatus = 200;
let authorityRejectOriginal = false;
const stalledResponses = new Set();
const consumedRefreshTokens = new Set();
let loginCount = 0;
const gateway = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  requests.push({ method: request.method, path: request.url, body, authorization: request.headers.authorization });
  if (request.url === "/location-types") {
    response.writeHead(failTypes ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(failTypes ? { error: "Unavailable" } : ["Food", "Printing"]));
    return;
  }
  if (request.url?.startsWith("/locations")) {
    if (supplier401) { response.writeHead(401).end(); return; }
    const admin = request.headers.authorization === `Bearer ${adminAccess}`;
    const url = new URL(request.url, "http://gateway.local");
    if (!request.headers.authorization) { response.writeHead(401).end(); return; }
    if ((url.searchParams.get("includeInactive") === "true" || request.method !== "GET") && !admin) {
      response.writeHead(403, { "content-type": "application/problem+json" });
      response.end(JSON.stringify({ detail: "This action requires the ADMIN role." }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/locations") {
      let items = locations.filter((item) => url.searchParams.get("includeInactive") === "true" || item.status === "ACTIVE");
      if (url.searchParams.has("name")) items = items.filter((item) => item.name.toLowerCase().includes(url.searchParams.get("name").toLowerCase()));
      if (url.searchParams.has("type")) items = items.filter((item) => item.type === url.searchParams.get("type"));
      if (url.searchParams.has("building")) items = items.filter((item) => item.building === url.searchParams.get("building"));
      if (url.searchParams.has("time")) items = items.filter((item) => item.open_time && item.close_time && item.open_time <= url.searchParams.get("time") && item.close_time > url.searchParams.get("time"));
      items = items.toSorted((a, b) => (url.searchParams.get("order") === "desc" ? -1 : 1) * a.name.localeCompare(b.name));
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/locations") {
      const item = { ...body, id: Math.max(...locations.map((entry) => entry.id)) + 1, status: "ACTIVE", version: 1 };
      locations.push(item);
      response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify(item));
      return;
    }
    const id = Number(url.pathname.split("/")[2]);
    const item = locations.find((entry) => entry.id === id);
    if (!item) { response.writeHead(404).end(); return; }
    if (request.method === "PATCH") Object.assign(item, body, { version: item.version + 1 });
    if (url.pathname.endsWith("/deactivate")) { item.status = "INACTIVE"; item.version++; }
    if (url.pathname.endsWith("/restore")) { item.status = "ACTIVE"; item.version++; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(item));
    return;
  }
  if (request.url === "/users/me") {
    if (authorityStatus !== 200) { response.writeHead(authorityStatus).end(); return; }
    if (authorityRejectOriginal && request.headers.authorization === "Bearer test-access") { response.writeHead(401).end(); return; }
    if (breakRotatedProfile && request.headers.authorization === "Bearer new-access") {
      response.destroy();
      return;
    }
    if (denyProfile) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "UNKNOWN_PROFILE_ERROR", message: "Internal user table detail" } }));
      return;
    }
    if (malformedProfile) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{");
      return;
    }
    const accepted = request.headers.authorization === `Bearer ${adminAccess}` ||
      request.headers.authorization === "Bearer test-access" ||
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
  if (request.url === "/auth/login" && body.email === "locked@u.nus.edu") {
    response.writeHead(423, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "ACCOUNT_LOCKED", message: "Account locked", details: { retryAfterSeconds: 120 } } }));
    return;
  }
  if (request.url === "/auth/register" && body.email === "invalid@u.nus.edu") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "The request is invalid.", details: { fields: [
      { field: "displayName", message: "must be at least 2 characters" },
      { field: "email", message: "must be an NUS address" },
      { field: "email", message: "must be unique" },
    ] } } }));
    return;
  }
  if (request.url === "/auth/register" && body.email === "taken@u.nus.edu") {
    response.writeHead(409, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "EMAIL_TAKEN", message: "Email conflict" } }));
    return;
  }
  if (request.url === "/auth/register" && body.email === "broken@u.nus.edu") {
    response.writeHead(502, { "content-type": "text/plain" });
    response.end("upstream error");
    return;
  }
  if (request.url === "/auth/register/verify" && body.otp === "111111") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "OTP_INVALID", message: "Wrong code", details: { attemptsRemaining: 2 } } }));
    return;
  }
  if (request.url === "/auth/register/verify" && body.otp === "222222") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "OTP_EXPIRED", message: "Expired code" } }));
    return;
  }
  if ((request.url === "/auth/register/verify" || request.url === "/auth/register/resend-otp") && body.email === "invalid-verify@u.nus.edu") {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "The request is invalid.", details: { fields: [{ field: "email", message: "must be an NUS address" }] } } }));
    return;
  }
  if (request.url === "/auth/password/reset" && body.otp === "333333") {
    response.writeHead(429, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Slow down", details: { retryAfterSeconds: 90 } } }));
    return;
  }
  if (request.url === "/auth/password/reset" && body.otp === "444444") {
    response.writeHead(400, { "content-type": "application/problem+json" });
    response.end(JSON.stringify({ type: "about:blank", title: "Bad Request", status: 400, detail: "Invalid reset code" }));
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
  if (request.url === "/auth/login" && body.email === "admin@u.nus.edu") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: adminAccess, refreshToken: "admin-refresh", expiresIn: 900 }));
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
    await page.waitForURL("**/signup");
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
    await page.getByRole("alert").getByText("Invalid email or password.").waitFor();
    assert.equal(new URL(page.url()).pathname, "/signin");
  } finally { await page.close(); }
});

test("registration validation maps service fields and the toast can be dismissed", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signup`);
    await page.locator('[name="fullName"]').fill("Alex Tan");
    await page.locator('[name="email"]').fill("invalid@u.nus.edu");
    await page.locator('[name="mobileNumber"]').fill("91234567");
    await page.locator('[name="password"]').fill("Passw0rdSafe");
    await page.locator('[name="confirmPassword"]').fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByText("must be at least 2 characters").waitFor();
    await page.getByText("must be an NUS address").waitFor();
    await page.getByText("must be unique").waitFor();
    assert.equal(await page.locator('[name="fullName"]').getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator('[name="email"]').getAttribute("aria-invalid"), "true");
    await page.getByRole("alert").getByText("Please check the highlighted fields.").waitFor();
    await page.getByRole("button", { name: "Dismiss error" }).click();
    assert.equal(await page.locator(".error-toast").count(), 0);
    await page.locator('[name="email"]').fill("taken@u.nus.edu");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByRole("alert").getByText("This email is already registered.").waitFor();
    await page.getByText("This email is already registered.").first().waitFor();
    await page.locator('[name="email"]').fill("broken@u.nus.edu");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByRole("alert").getByText("Could not start sign-up. Please try again.").waitFor();
  } finally { await page.close(); }
});

test("lockout and OTP errors use service codes and retry details", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("locked@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByRole("alert").getByText("This account is temporarily locked. Try again in 2 minutes.").waitFor();
    await page.goto(`${baseUrl}/signup`);
    await page.getByLabel("Full Name").fill("Alex Tan");
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Mobile Number").fill("91234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rdSafe");
    await page.getByLabel("Confirm Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.waitForURL("**/verify");
    for (let digit = 1; digit <= 6; digit++) await page.getByLabel(`Digit ${digit}`).fill("1");
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("alert").getByText("That code is incorrect. 2 attempts remaining.").waitFor();
    for (let digit = 1; digit <= 6; digit++) await page.getByLabel(`Digit ${digit}`).fill("2");
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("alert").getByText("That code has expired. Request a new one.").waitFor();
  } finally { await page.close(); }
});

test("verification surfaces validation for an email absent from the form", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/verify`);
    await page.evaluate(() => sessionStorage.setItem("pendingRegistrationEmail", "invalid-verify@u.nus.edu"));
    await page.reload();
    for (let digit = 1; digit <= 6; digit++) await page.getByLabel(`Digit ${digit}`).fill("3");
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("alert").getByText("email: must be an NUS address Return to sign-up to correct your email.").waitFor();
    await page.getByRole("link", { name: "Use a different email" }).waitFor();
    await page.getByRole("button", { name: "Resend OTP" }).click();
    await page.getByRole("alert").getByText("email: must be an NUS address Return to sign-up to correct your email.").waitFor();
  } finally { await page.close(); }
});

test("recovery keeps unknown accounts indistinguishable and handles rate limits and Problem Details", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/forgot-password`);
    await page.getByLabel("Email").fill("unknown@u.nus.edu");
    await page.getByRole("button", { name: "Send reset code" }).click();
    await page.waitForURL("**/reset-password");
    await page.getByLabel("New password").fill("NewPassw0rd");
    await page.getByLabel("Confirm password").fill("NewPassw0rd");
    await page.getByLabel("Six-digit code").fill("333333");
    await page.getByRole("button", { name: "Reset password" }).click();
    await page.getByRole("alert").getByText("Too many attempts. Please try again later. Try again in 2 minutes.").waitFor();
    await page.getByLabel("Six-digit code").fill("444444");
    await page.getByRole("button", { name: "Reset password" }).click();
    await page.getByRole("alert").getByText("Invalid reset code").waitFor();
  } finally { await page.close(); }
});

test("profile load failure keeps a retry action", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "Welcome to GrabFoc" }).waitFor();
    denyProfile = true;
    await page.goto(`${baseUrl}/profile`);
    await page.getByRole("button", { name: "Retry" }).waitFor();
    await page.getByRole("alert").getByText("Could not load your profile. Please try again.").waitFor();
    assert.equal(await page.getByText("Internal user table detail").count(), 0);
    denyProfile = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("heading", { name: "Alex Tan" }).waitFor();
  } finally { denyProfile = false; await page.close(); }
});

test("malformed successful profile response shows a safe retry message", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/signin`);
    await page.getByLabel("Email").fill("alex@u.nus.edu");
    await page.getByLabel("Password").fill("Passw0rdSafe");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/home");
    malformedProfile = true;
    await page.goto(`${baseUrl}/profile`);
    await page.getByRole("alert").getByText("Could not load your profile. Please try again.").waitFor();
    malformedProfile = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("heading", { name: "Alex Tan" }).waitFor();
  } finally { malformedProfile = false; await page.close(); }
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
    await page.getByRole("alert").getByText("Gateway unavailable. Please try again.").waitFor();
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
    await login.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await oldTab.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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
    await page.getByRole("heading", { name: "COM3 Basement" }).waitFor();
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

test("users browse and filter locations while only admins manage them", async () => {
  const user = await browser.newPage();
  const admin = await browser.newPage();
  try {
    await user.goto(`${baseUrl}/signin`);
    await user.getByLabel("Email").fill("alex@u.nus.edu");
    await user.getByLabel("Password").fill("Passw0rdSafe");
    await user.getByRole("button", { name: "Sign In" }).click();
    await user.waitForURL("**/home");
    await user.getByRole("heading", { name: "COM3 Basement" }).waitFor();
    assert.equal(await user.getByRole("link", { name: "Manage Locations" }).count(), 0);
    await user.getByLabel("Search name").fill("UTown");
    await user.getByRole("heading", { name: "UTown Print" }).waitFor();
    await user.getByRole("heading", { name: "COM3 Basement" }).waitFor({ state: "detached" });
    const denied = await user.evaluate(() => fetch("/api/session/supplier/locations", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }).then((response) => response.status));
    assert.equal(denied, 403);

    await admin.goto(`${baseUrl}/signin`);
    await admin.getByLabel("Email").fill("admin@u.nus.edu");
    await admin.getByLabel("Password").fill("Passw0rdSafe");
    await admin.getByRole("button", { name: "Sign In" }).click();
    await admin.waitForURL("**/home");
    await admin.getByRole("link", { name: "Manage Locations" }).click();
    await admin.waitForURL("**/admin/locations");
    await admin.getByRole("heading", { name: "Manage Locations" }).waitFor();
    await admin.locator("form [name=name]").fill("New Pickup");
    await admin.locator("form [name=building]").fill("COM3");
    await admin.locator("form [name=floor]").fill("1");
    await admin.locator("form [name=location_desc]").fill("Near the entrance");
    await admin.locator("form [name=lat]").fill("1.295");
    await admin.locator("form [name=lon]").fill("103.773");
    await admin.getByRole("button", { name: "Add Location" }).click();
    const row = admin.locator(".manage-row", { hasText: "New Pickup" });
    await row.waitFor();
    assert.equal(await admin.locator("form [name=name]").inputValue(), "");
    await admin.locator("form [name=name]").fill("Second Pickup");
    await admin.locator("form [name=building]").fill("COM3");
    await admin.locator("form [name=floor]").fill("2");
    await admin.locator("form [name=location_desc]").fill("Second entrance");
    await admin.locator("form [name=lat]").fill("1.295");
    await admin.locator("form [name=lon]").fill("103.773");
    await admin.getByRole("button", { name: "Add Location" }).click();
    await admin.locator(".manage-row", { hasText: "Second Pickup" }).waitFor();
    await row.getByRole("button", { name: "Edit" }).click();
    await admin.getByRole("heading", { name: "Edit New Pickup" }).waitFor();
    await row.getByRole("button", { name: "Deactivate" }).click();
    await row.getByText("INACTIVE").waitFor();
    await admin.getByRole("heading", { name: "Add Location" }).waitFor();
    await row.getByRole("button", { name: "Restore" }).click();
    await row.getByText("ACTIVE").waitFor();
    assert.ok(requests.some((request) => request.method === "POST" && request.path === "/locations" && request.authorization === `Bearer ${adminAccess}`));
  } finally { await user.close(); await admin.close(); }
});

test("Supplier browsing and management use responsive Tailwind layouts", async () => {
  const admin = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const columns = (selector) => admin.locator(selector).first().evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
  try {
    await admin.goto(`${baseUrl}/signin`);
    await admin.getByLabel("Email").fill("admin@u.nus.edu");
    await admin.getByLabel("Password").fill("Passw0rdSafe");
    await admin.getByRole("button", { name: "Sign In" }).click();
    await admin.waitForURL("**/home");
    await admin.getByRole("heading", { name: "COM3 Basement" }).waitFor();
    assert.equal(await columns(".home-section .location-filters"), 1);
    assert.equal(await columns(".location-grid"), 1);

    await admin.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await columns(".home-section .location-filters"), 5);
    assert.equal(await columns(".location-grid"), 3);

    await admin.getByRole("link", { name: "Manage Locations" }).click();
    await admin.waitForURL("**/admin/locations");
    assert.equal(await columns(".manage-layout"), 2);
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.equal(await columns(".manage-layout"), 1);
    assert.equal(await columns(".manage-form-pair"), 1);
  } finally { await admin.close(); }
});

test("admin can retry location types without reloading the page", async () => {
  const admin = await browser.newPage();
  failTypes = true;
  try {
    await admin.goto(`${baseUrl}/signin`);
    await admin.getByLabel("Email").fill("admin@u.nus.edu");
    await admin.getByLabel("Password").fill("Passw0rdSafe");
    await admin.getByRole("button", { name: "Sign In" }).click();
    await admin.waitForURL("**/home");
    await admin.goto(`${baseUrl}/admin/locations`);
    await admin.getByRole("alert").getByText("Could not load location types. Please try again.").waitFor();
    failTypes = false;
    await admin.getByRole("button", { name: "Retry location types" }).click();
    await admin.locator("form [name=type]").waitFor();
  } finally { failTypes = false; await admin.close(); }
});

test("Home can retry location types without reloading the page", async () => {
  const user = await browser.newPage();
  failTypes = true;
  try {
    await user.goto(`${baseUrl}/signin`);
    await user.getByLabel("Email").fill("alex@u.nus.edu");
    await user.getByLabel("Password").fill("Passw0rdSafe");
    await user.getByRole("button", { name: "Sign In" }).click();
    await user.waitForURL("**/home");
    await user.getByRole("alert").getByText("Could not load location types. Please try again.").waitFor();
    failTypes = false;
    await user.getByRole("button", { name: "Retry location types" }).click();
    await user.getByLabel("Type").locator('option[value="Food"]').waitFor({ state: "attached" });
  } finally { failTypes = false; await user.close(); }
});

test("admin management filters and sorting reach Supplier", async () => {
  const admin = await browser.newPage();
  try {
    await admin.goto(`${baseUrl}/signin`);
    await admin.getByLabel("Email").fill("admin@u.nus.edu");
    await admin.getByLabel("Password").fill("Passw0rdSafe");
    await admin.getByRole("button", { name: "Sign In" }).click();
    await admin.waitForURL("**/home");
    await admin.goto(`${baseUrl}/admin/locations`);
    const list = admin.getByRole("region", { name: "Locations" });
    await list.getByLabel("Type").selectOption("Food");
    await list.getByLabel("Building").fill("COM3");
    await list.getByLabel("Open at").fill("10:00");
    await list.getByLabel("Name order").selectOption("desc");
    let expected = false;
    for (let attempt = 0; attempt < 30 && !expected; attempt++) {
      expected = requests.some((request) => request.path?.startsWith("/locations?") &&
        new URL(request.path, "http://gateway.local").searchParams.get("type") === "Food" &&
        new URL(request.path, "http://gateway.local").searchParams.get("building") === "COM3" &&
        new URL(request.path, "http://gateway.local").searchParams.get("time") === "1000hrs" &&
        new URL(request.path, "http://gateway.local").searchParams.get("order") === "desc");
      if (!expected) await delay(100);
    }
    assert.ok(expected);
  } finally { await admin.close(); }
});

test("editing a refreshed location uses its latest version and fields", async () => {
  const admin = await browser.newPage();
  const location = locations.find((item) => item.id === 1);
  const previous = { ...location };
  try {
    await admin.goto(`${baseUrl}/signin`);
    await admin.getByLabel("Email").fill("admin@u.nus.edu");
    await admin.getByLabel("Password").fill("Passw0rdSafe");
    await admin.getByRole("button", { name: "Sign In" }).click();
    await admin.waitForURL("**/home");
    await admin.goto(`${baseUrl}/admin/locations`);
    await admin.locator(".manage-row", { hasText: previous.name }).getByRole("button", { name: "Edit" }).click();
    assert.equal(await admin.locator("form [name=name]").inputValue(), previous.name);
    location.name = "Concurrent update";
    location.version++;
    await admin.locator(".manage-row", { hasText: "UTown Print" }).getByRole("button", { name: "Deactivate" }).click();
    await admin.locator(".manage-row", { hasText: "Concurrent update" }).getByRole("button", { name: "Edit" }).click();
    assert.equal(await admin.locator("form [name=name]").inputValue(), "Concurrent update");
  } finally {
    Object.assign(location, previous);
    await admin.close();
  }
});

test("Supplier-only 401 preserves a valid session and does not refresh", async () => {
  supplier401 = true;
  try {
    const before = requests.length;
    const response = await fetch(`${baseUrl}/api/session/supplier/locations`, {
      headers: { cookie: "foc_access=test-access; foc_refresh=supplier-valid", "sec-fetch-site": "same-origin" },
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.deepEqual(requests.slice(before).map((request) => request.path), ["/locations", "/users/me"]);
  } finally { supplier401 = false; }
});

test("Supplier 401 refreshes only after User Service rejects access and retains rotated cookies", async () => {
  supplier401 = true;
  authorityRejectOriginal = true;
  try {
    const before = requests.length;
    // The authority rejects the original access token, then accepts the rotated one.
    const response = await fetch(`${baseUrl}/api/session/supplier/locations`, {
      headers: { cookie: "foc_access=test-access; foc_refresh=supplier-rotate", "sec-fetch-site": "same-origin" },
    });
    assert.equal(response.status, 502);
    assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("foc_refresh=rotated-supplier-rotate")));
    assert.deepEqual(requests.slice(before).map((request) => request.path), ["/locations", "/users/me", "/auth/refresh", "/locations", "/users/me"]);
  } finally { supplier401 = false; authorityRejectOriginal = false; }
});

test("Supplier 401 keeps cookies if authority confirmation is unavailable", async () => {
  supplier401 = true;
  authorityStatus = 503;
  try {
    const before = requests.length;
    const response = await fetch(`${baseUrl}/api/session/supplier/locations`, {
      headers: { cookie: "foc_access=test-access; foc_refresh=supplier-pending", "sec-fetch-site": "same-origin" },
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.deepEqual(requests.slice(before).map((request) => request.path), ["/locations", "/users/me"]);
  } finally { supplier401 = false; authorityStatus = 200; }
});

test("Supplier 401 clears cookies when User Service and refresh reject the session", async () => {
  supplier401 = true;
  authorityStatus = 401;
  refreshOutcome = 401;
  try {
    const response = await fetch(`${baseUrl}/api/session/supplier/locations`, {
      headers: { cookie: "foc_access=test-access; foc_refresh=supplier-invalid", "sec-fetch-site": "same-origin" },
    });
    assert.equal(response.status, 401);
    assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("foc_access=")));
  } finally { supplier401 = false; authorityStatus = 200; refreshOutcome = 200; }
});
