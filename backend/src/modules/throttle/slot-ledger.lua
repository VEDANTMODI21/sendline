-- Sendline slot ledger — decides, atomically, when one email may leave a given sender.
--
-- Two independent rules:
--   pacing : consecutive sends from one sender are >= `gap` ms apart          (sender cursor)
--   quota  : <= sCap sends per sender and <= cCap per campaign in each window  (window counters)
--
-- Phase 1 books a window that still has quota (rolling forward past full windows).
-- Phase 2 only happens when the booked window is the *current* pacing window: it takes the
-- next pacing slot and advances the cursor. Emails booked into a future window are parked at
-- windowStart + ordinal, so they wake in FIFO order and are paced then. Keeping the cursor
-- near-term means a burst deferred hours ahead never blocks other campaigns on the same sender.
--
-- ARGV: now, gap, sCap, cCap, windowMs, senderPrefix, campaignPrefix, notBefore, bookedWindow(-1)
-- Returns: { at, window, paced(0/1), blockedWindow(-1), notify(0/1), blockedScope }

local now       = tonumber(ARGV[1])
local gap       = tonumber(ARGV[2])
local sCap      = tonumber(ARGV[3])
local cCap      = tonumber(ARGV[4])
local win       = tonumber(ARGV[5])
local sPrefix   = ARGV[6]
local cPrefix   = ARGV[7]
local notBefore = tonumber(ARGV[8])
local booked    = tonumber(ARGV[9])

local cursorKey = sPrefix .. ':cursor'
local cursor = tonumber(redis.call('GET', cursorKey) or '0')
local paceAt = math.max(now, notBefore, cursor)
local paceWin = math.floor(paceAt / win)

local function sKey(w) return sPrefix .. ':w:' .. w end
local function cKey(w) return cPrefix .. ':w:' .. w end

local w = booked
local blocked = -1
local scope = ''

if booked < 0 or booked < paceWin then
  -- (re)book: release a stale booking first so quota is not double counted
  if booked >= 0 then
    if tonumber(redis.call('GET', sKey(booked)) or '0') > 0 then redis.call('DECR', sKey(booked)) end
    if tonumber(redis.call('GET', cKey(booked)) or '0') > 0 then redis.call('DECR', cKey(booked)) end
  end
  w = paceWin
  for _ = 1, 100000 do
    local sUsed = tonumber(redis.call('GET', sKey(w)) or '0')
    local cUsed = tonumber(redis.call('GET', cKey(w)) or '0')
    if sUsed < sCap and cUsed < cCap then break end
    if blocked < 0 then
      blocked = w
      if sUsed >= sCap then scope = 'sender' else scope = 'campaign' end
    end
    w = w + 1
  end
  local keepMs = (w + 2) * win - now
  redis.call('INCR', sKey(w)); redis.call('PEXPIRE', sKey(w), keepMs)
  redis.call('INCR', cKey(w)); redis.call('PEXPIRE', cKey(w), keepMs)
end

-- One Slack alert per scope per real window, however many emails a burst defers.
local notify = 0
if blocked >= 0 then
  local p = sPrefix
  if scope == 'campaign' then p = cPrefix end
  if redis.call('SET', p .. ':alerted:' .. math.floor(now / win), '1', 'NX', 'PX', 2 * win) then notify = 1 end
end

if w == paceWin then
  redis.call('SET', cursorKey, paceAt + gap, 'PX', (paceAt + gap - now) + win)
  return { paceAt, w, 1, blocked, notify, scope }
end

-- Parked in a future window: FIFO ordinal (in ms) keeps wake-up order stable.
local ordKey = sPrefix .. ':ord:' .. w
local ord = redis.call('INCR', ordKey)
redis.call('PEXPIRE', ordKey, (w + 2) * win - now)
return { w * win + ord, w, 0, blocked, notify, scope }
