-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-10-13
-- Scope: Preserve header filtering and map confirmed JWKS availability failures to 503.
-- Author review: Pending human review.
-- AI-generated; review pending.
local removed = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "x-user-id", "x-user-role", "cookie"}

function envoy_on_request(handle)
  local headers = handle:headers()
  local target = headers:get(":path") or "/"
  handle:streamInfo():dynamicMetadata():set("foc", "path", target:match("^[^?]*"))
  if target:sub(1, 1) ~= "/" or target:sub(1, 2) == "//" or target:find("[%z\1-\32\\#]") then
    handle:respond({[":status"] = "400", ["content-type"] = "application/json"},
      '{"error":"Invalid request target"}')
    return
  end
  for _, name in ipairs(removed) do headers:remove(name) end
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
  for _, name in ipairs(removed) do headers:remove(name) end
end
