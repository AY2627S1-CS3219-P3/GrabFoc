-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
-- Scope: Header handling for the edge listener's frontend route (deploy part 1, #141): keep the session
--        cookie and Host, and take X-Forwarded-Proto only from CloudFront.
-- Author review: Pending Jie Yang's review.
-- AI-generated; review pending. Replaces compatibility.lua on the frontend route only.
local removed = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "x-user-id", "x-user-role"}
local hop_by_hop = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade"}

function envoy_on_request(handle)
  local headers = handle:headers()
  local target = headers:get(":path") or "/"
  handle:streamInfo():dynamicMetadata():set("foc", "path", target:match("^[^?]*"))
  if target:sub(1, 1) ~= "/" or target:sub(1, 2) == "//" or target:find("[%z\1-\32\\#]") then
    handle:respond({[":status"] = "400", ["content-type"] = "application/json"},
      '{"error":"Invalid request target"}')
    return
  end
  -- Read CloudFront's header before removing anything a client could have sent.
  local proto = headers:get("cloudfront-forwarded-proto")
  for _, name in ipairs(removed) do headers:remove(name) end
  if proto == "http" or proto == "https" then headers:add("x-forwarded-proto", proto) end
end

function envoy_on_response(handle)
  local headers = handle:headers()
  for _, name in ipairs(hop_by_hop) do headers:remove(name) end
end
