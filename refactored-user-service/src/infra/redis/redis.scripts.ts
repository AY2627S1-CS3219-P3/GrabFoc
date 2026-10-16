/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Merged the five Lua scripts in user-service/src/otp/otp.scripts.ts and auth/lockout.scripts.ts (original disclosures: Claude Code, Claude Opus 5, 2026-09-25/26) into three: VERIFY_OTP (VERIFY_OTP_LUA + CHECK_OTP_LUA), HIT_LIMIT (RATE_LIMIT_LUA + RECORD_LOGIN_FAILURE_LUA) and REPLACE_OTP_CODE (REISSUE_OTP_LUA). Same behaviour.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)

// Lua because each script is several commands that must not interleave with a concurrent
// request; otherwise the attempt cap, the rate limit and the lockout could all be raced.

/**
 * Verify one OTP record.
 *
 * KEYS[1] the record       ARGV[1] the HMAC of the submitted code
 * ARGV[2] max attempts     ARGV[3] now, epoch ms     ARGV[4] consume: '1' deletes on a match, '0' keeps it
 *
 * Returns { status, attemptsRemaining, raw }:
 *   'OK'      correct; `raw` is the stored record (deleted when consume is '1')
 *   'INVALID' wrong; attemptsRemaining is what is left
 *   'EXPIRED' no record, code past its deadline, or the last attempt was just used up
 */
export const VERIFY_OTP = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return {'EXPIRED', 0, ''}
end

local data = cjson.decode(raw)

-- A pending sign-up (15 min) outlives its code (5 min), so the code's deadline is in the
-- record. The record is kept, so the user can ask for a new code instead of starting over.
if data.otpExpiresAt and tonumber(data.otpExpiresAt) <= tonumber(ARGV[3]) then
  return {'EXPIRED', 0, ''}
end

if data.otpHash == ARGV[1] then
  if ARGV[4] == '1' then
    redis.call('DEL', KEYS[1])
  end
  return {'OK', 0, raw}
end

data.attempts = data.attempts + 1
if data.attempts >= tonumber(ARGV[2]) then
  -- Used up. Reported as expired so "wrong code" and "out of tries" look the same.
  redis.call('DEL', KEYS[1])
  return {'EXPIRED', 0, ''}
end

-- KEEPTTL: a wrong guess must not extend the code's life.
redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
return {'INVALID', tonumber(ARGV[2]) - data.attempts, ''}
`;

/**
 * Count one hit against a limit, and start a block on the threshold-th hit. Used for the OTP
 * request limit and the login lockout.
 *
 * KEYS[1] counter   KEYS[2] block
 * ARGV[1] threshold   ARGV[2] window seconds   ARGV[3] block seconds
 *
 * Returns { 'OK', 0 } or { 'BLOCKED', secondsRemaining }
 */
export const HIT_LIMIT = `
local blockTtl = redis.call('TTL', KEYS[2])
if blockTtl > 0 then
  return {'BLOCKED', blockTtl}
end

local count = redis.call('INCR', KEYS[1])
if count == 1 then
  -- Only the first hit sets the expiry, so the window cannot slide forward forever.
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end

if count >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
  redis.call('DEL', KEYS[1])
  return {'BLOCKED', tonumber(ARGV[3])}
end

return {'OK', 0}
`;

/**
 * Put a fresh code into an existing record (resend), keeping the record's remaining life.
 *
 * KEYS[1] the record   ARGV[1] the HMAC of the new code   ARGV[2] its deadline, epoch ms
 *
 * Returns 1 if updated, 0 if there was no record.
 */
export const REPLACE_OTP_CODE = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end

local data = cjson.decode(raw)
data.otpHash = ARGV[1]
data.otpExpiresAt = tonumber(ARGV[2])
data.attempts = 0

-- KEEPTTL: resending replaces the code; it cannot extend the sign-up window.
redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
return 1
`;
