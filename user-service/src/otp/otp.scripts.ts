/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the Lua scripts that make OTP verification, reissue and rate limiting
 *        atomic.
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
 * KEYS[1] the record: otp:{purpose}:{subject}, or reg:{emailHash} for a pending sign-up
 * ARGV[1] the HMAC of the submitted code
 * ARGV[2] the maximum number of attempts
 * ARGV[3] the current time in epoch milliseconds
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

-- A pending sign-up outlives its code: reg:{emailHash} lives 15 minutes so the code can be
-- resent, while each code is valid for 5. One key TTL cannot express both, so the code's own
-- deadline travels inside the record. For otp:* keys the two coincide and this never fires.
--
-- The record is deliberately NOT deleted: letting a code lapse must not throw away a sign-up
-- that is still inside its window, or the user would have to start over instead of asking for
-- a new code. Nothing is guessable here either, because this runs before the hash comparison
-- and so answers identically whatever was submitted.
if data.otpExpiresAt and tonumber(data.otpExpiresAt) <= tonumber(ARGV[3]) then
  return {'EXPIRED', 0, ''}
end

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

/**
 * Put a fresh code into a record that already exists, for `POST /auth/register/resend-otp`.
 *
 * Lua again: read, modify and write back is three commands, and a resend arriving alongside a
 * verify could otherwise resurrect a record the verify had just consumed.
 *
 * KEYS[1] the record   ARGV[1] the HMAC of the new code   ARGV[2] its deadline, epoch ms
 *
 * Returns 1 if the record was found and updated, 0 if there was nothing to resend.
 */
export const REISSUE_OTP_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end

local data = cjson.decode(raw)
data.otpHash = ARGV[1]
data.otpExpiresAt = tonumber(ARGV[2])
-- A new code starts with a full set of attempts; the old code's failures do not carry over.
data.attempts = 0

-- KEEPTTL: the sign-up window belongs to the record, not to the code. Resending replaces the
-- code inside the window; it cannot extend the window, which would otherwise let a caller keep
-- a pending sign-up alive indefinitely.
redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
return 1
`;
