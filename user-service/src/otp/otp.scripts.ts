/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the two Lua scripts that make OTP verification and rate limiting atomic.
 * Author review: Read in full; `npm run test:int` passes (18 tests against a real Redis), including the concurrency cases the scripts exist for.
 */

/**
 * Verify one OTP.
 *
 * Why Lua: checking the hash, incrementing the attempt counter and deleting the key on the
 * third failure are three operations. As three separate commands, two requests arriving
 * together can interleave between them, and a caller gets more than the three attempts the
 * policy allows (U2.3.2). A Lua script runs to completion without interruption, so the cap
 * cannot be raced and a correct code cannot be used twice.
 *
 * KEYS[1] the otp:{purpose}:{userId} key
 * ARGV[1] the HMAC of the submitted code
 * ARGV[2] the maximum number of attempts
 *
 * Returns { status, attemptsRemaining, payload }
 *   status 'OK'      correct; the key is deleted and the stored payload returned
 *   status 'INVALID' wrong; attemptsRemaining is what is left
 *   status 'EXPIRED' no key, or the last attempt was just used up
 */
export const VERIFY_OTP_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return {'EXPIRED', 0, ''}
end

local data = cjson.decode(raw)

if data.otpHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {'OK', 0, raw}
end

data.attempts = data.attempts + 1
if data.attempts >= tonumber(ARGV[2]) then
  -- Used up. Treated as expired so a caller cannot tell "wrong code" from "out of tries".
  redis.call('DEL', KEYS[1])
  return {'EXPIRED', 0, ''}
end

-- KEEPTTL: a wrong guess must not extend the code's five-minute life.
redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
return {'INVALID', tonumber(ARGV[2]) - data.attempts, ''}
`;

/**
 * Count one OTP request against the rate limit, and start a block once it is exceeded.
 *
 * Also Lua, for the same reason: reading the counter and deciding to block are separate
 * steps, and three simultaneous requests could each see a count below the limit.
 *
 * KEYS[1] otpreq:{subject}   KEYS[2] otpblock:{subject}
 * ARGV[1] max requests       ARGV[2] window seconds    ARGV[3] block seconds
 *
 * Returns { 'OK', 0 } or { 'BLOCKED', secondsRemaining }
 */
export const RATE_LIMIT_LUA = `
local blockTtl = redis.call('TTL', KEYS[2])
if blockTtl > 0 then
  return {'BLOCKED', blockTtl}
end

local count = redis.call('INCR', KEYS[1])
if count == 1 then
  -- Only the first request in a window sets the expiry, so the window does not slide
  -- forward on every request and become unbounded.
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end

if count > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
  redis.call('DEL', KEYS[1])
  return {'BLOCKED', tonumber(ARGV[3])}
end

return {'OK', 0}
`;
