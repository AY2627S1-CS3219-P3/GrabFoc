/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the Lua script that counts a failed login and starts the lockout.
 * Author review: Read in full; `npm run test:int` covers the concurrency case it exists for.
 */

/**
 * Count one failed login, and lock the account once the limit is reached (U2.3.1).
 *
 * Why Lua, exactly as for the OTP request limit: incrementing the counter and deciding to
 * lock are separate steps. Five wrong passwords submitted at the same moment would each read
 * a count below the limit and each be told "wrong password", so a script that tries
 * passwords in parallel would never trip the lockout at all.
 *
 * KEYS[1] loginfail:{emailHash}   KEYS[2] loginlock:{emailHash}
 * ARGV[1] max failures            ARGV[2] counter window seconds   ARGV[3] lock seconds
 *
 * Returns { 'FAILED', 0 } or { 'LOCKED', secondsRemaining }
 */
export const RECORD_LOGIN_FAILURE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  -- Only the first failure sets the expiry, so the window measures "failures since the first
  -- one", not "failures since the last one" — otherwise someone guessing slowly but steadily
  -- would keep the window open forever and never trip the lock.
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end

if count >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
  -- The counter has done its job; the lock's own TTL now governs.
  redis.call('DEL', KEYS[1])
  return {'LOCKED', tonumber(ARGV[3])}
end

return {'FAILED', 0}
`;
