import { sbLoadDeals, sbSaveDeals } from './supabase'
import { notifySaveFailed } from './saveStatus'

export const STORAGE_KEY = 'rion-crm-deals'
// Tracks when THIS browser session last actually confirmed its state
// against Supabase — same mechanism as clients (see lib/data.js), and for
// the same reason: a tab left open a while still needs a way to tell "am I
// actually stale" apart from "I just made a fresh edit a second ago".
const LAST_SYNCED_KEY = 'rion-crm-deals-lastsync'

function getLastSyncedAt() {
  try { return Number(localStorage.getItem(LAST_SYNCED_KEY)) || 0 } catch { return 0 }
}
function setLastSyncedAt(ts) {
  try { localStorage.setItem(LAST_SYNCED_KEY, String(ts)) } catch {}
}

// Local-only, synchronous load. Handles both the new wrapped
// { data, savedAt } format and the old plain-array format that every deal
// page used to read/write directly.
export function loadDeals() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed
      if (parsed && Array.isArray(parsed.data)) return parsed.data
    }
  } catch {}
  return []
}

export function saveDeals(deals) {
  const payload = { data: deals, savedAt: Date.now(), lastSyncedAt: getLastSyncedAt() }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)) } catch {}
  sbSaveDeals(payload).then(ok => {
    if (ok) {
      // Same fix as clients: a successful save from this session means
      // this session IS up to date, right now — advancing this is what
      // stops this session's own second save (e.g. adding a second deal
      // moments later) from being wrongly judged stale relative to its own
      // first save.
      setLastSyncedAt(Date.now())
    } else {
      notifySaveFailed('deals')
    }
  }).catch(err => {
    notifySaveFailed('deals', { error: String(err) })
  })
  return true
}

// Call this once on mount, wherever deals are loaded. Unlike the old
// version of this function, this ALWAYS checks the cloud and pulls it down
// if it's newer — not just when the local cache happens to be empty. That
// "only rescue an empty cache" behaviour was the actual bug behind deals
// not syncing across devices: a browser that already had any deals cached
// (which is every normal, daily-use browser) would never pull fresh cloud
// data again, no matter what anyone else added or changed elsewhere.
// Clients/Marketing never had this problem because they already compared
// timestamps properly — this brings deals up to the same standard.
export async function syncDealsFromSupabase() {
  try {
    const cloud = await sbLoadDeals()
    if (!cloud) return null

    const cloudDeals = Array.isArray(cloud) ? cloud : cloud.data
    const cloudSavedAt = Array.isArray(cloud) ? 0 : (cloud.savedAt || 0)
    if (!cloudDeals || !Array.isArray(cloudDeals) || cloudDeals.length === 0) return null

    let localSavedAt = 0
    let localHasRealData = false
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY)
      if (localRaw) {
        const localParsed = JSON.parse(localRaw)
        localSavedAt = Array.isArray(localParsed) ? 0 : (localParsed.savedAt || 0)
        localHasRealData = localSavedAt > 0
      }
    } catch {}

    // Whatever happens below, this session has now checked in with the
    // cloud as of right now.
    setLastSyncedAt(Date.now())

    // No real local timestamp (fresh cache, or still on the old plain-array
    // format) — always trust the cloud.
    if (!localHasRealData) {
      const payload = { data: cloudDeals, savedAt: cloudSavedAt || Date.now() }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)) } catch {}
      return cloudDeals
    }

    // Both have timestamps — the newer one wins, exactly like clients.
    if (cloudSavedAt >= localSavedAt) {
      const payload = { data: cloudDeals, savedAt: cloudSavedAt }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)) } catch {}
      return cloudDeals
    }

    // Local is newer — push it up rather than silently doing nothing.
    const localRaw = localStorage.getItem(STORAGE_KEY)
    if (localRaw) {
      const localParsed = JSON.parse(localRaw)
      const localDeals = Array.isArray(localParsed) ? localParsed : localParsed.data
      if (localDeals) sbSaveDeals({ data: localDeals, savedAt: localSavedAt, lastSyncedAt: getLastSyncedAt() }).catch(() => {})
    }
    return null // keep using local — it's already the newer one
  } catch {
    return null
  }
}
