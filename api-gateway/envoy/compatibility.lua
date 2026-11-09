-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-10-13
-- Scope: Preserve header filtering and map confirmed JWKS availability failures to 503.
-- Author review: Pending human review.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Keep upgrade and connection on the chat socket path only (the chat plan).
-- Author review: Reviewed by Deanson, 2026-11-09; Jie Yang (gateway owner) to approve.
-- AI-generated; review pending.
local removed = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "x-user-id", "x-user-role", "cookie"}

-- The chat socket keeps the two headers a WebSocket upgrade needs. Every other route still loses
-- them, so upgrades only work there. Cookies are stripped everywhere, the socket included.
local socket_paths = {["/socket.io/"] = true, ["/gateway/socket.io/"] = true}
local upgrade_headers = {["upgrade"] = true, ["connection"] = true}

local function strip(headers, path)
  local socket = socket_paths[path]
  for _, name in ipairs(removed) do
    if not (socket and upgrade_headers[name]) then headers:remove(name) end
  end
end

function envoy_on_request(handle)
  local headers = handle:headers()
  local target = headers:get(":path") or "/"
  local path = target:match("^[^?]*")
  handle:streamInfo():dynamicMetadata():set("foc", "path", path)
  if target:sub(1, 1) ~= "/" or target:sub(1, 2) == "//" or target:find("[%z\1-\32\\#]") then
    handle:respond({[":status"] = "400", ["content-type"] = "application/json"},
      '{"error":"Invalid request target"}')
    return
  end
  strip(headers, path)
end

function envoy_on_response(handle)
  local headers = handle:headers()
  -- JWT verifier status codes, verified by integration tests on pinned Envoy 1.38.6:
  -- parse error, missing keys, bad keys, no valid keys, and fetch failure.
  -- Kid/algorithm mismatch (32) remains an authentication failure.
  local metadata = handle:streamInfo():dynamicMetadata():get("envoy.filters.http.jwt_authn")
  local failure = metadata and metadata.verification_failure
  local unavailable = {[28] = true, [29] = true, [30] = true, [31] = true, [40] = true}
  if headers:get(":status") == "401" and failure and unavailable[failure.code] then
    headers:replace(":status", "503")
  end
  local foc = handle:streamInfo():dynamicMetadata():get("foc")
  strip(headers, foc and foc.path)
end
