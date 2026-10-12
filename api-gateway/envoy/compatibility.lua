-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-10-12
-- Scope: Preserve gateway header filtering, request-target checks and failure log events.
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
  for _, name in ipairs(removed) do headers:remove(name) end
end
