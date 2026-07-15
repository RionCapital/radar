import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uudxlflyoeffcertpkrj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_CI6JvPKvNuCHM7nJdgEUew_z_z1IFBj'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function sbLoadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

// Serializes writes to a given Supabase table. Without this, two saves
// triggered close together (e.g. importing April, then May, moments later)
// each start their own independent read-merge-write round trip — and
// there's no guarantee they complete in the order they started. If the
// first save's network response is slow for any reason, it can land AFTER
// the second one and silently overwrite it with older data, even though
// the second save's own read-merge-write logic was completely correct at
// the time it ran. Queuing forces each save to fully complete (read, merge,
// write) before the next one even starts its own read, which removes the
// race entirely rather than trying to out-guess network timing.
const saveQueues = {}
function queued(table, fn) {
  const prior = saveQueues[table] || Promise.resolve()
  const next = prior.then(fn, fn)
  saveQueues[table] = next.catch(() => {})
  return next
}

export async function sbSaveClients(payload) {
  return queued('clients', () => _doSaveClients(payload))
}

async function _doSaveClients(payload) {
  try {
    // Merge-safe write, same reasoning as sbSaveDeals below. Client saves
    // always arrive wrapped as { data: [...clients], savedAt }, per the
    // convention in lib/data.js — handled here, with a plain-array fallback
    // kept for safety in case something ever calls this directly.
    const { data: existing } = await supabase
      .from('clients')
      .select('data,updated_at')
      .eq('id', 1)
      .single()

    const incomingArr = Array.isArray(payload) ? payload : (payload?.data || [])
    // lastSyncedAt — not savedAt — is the real freshness signal here. savedAt
    // is Date.now() at save time, so it's "fresh" even from a stale tab
    // making a live edit. lastSyncedAt only moves when this session last
    // actually pulled/confirmed the cloud's state, so a tab left open for
    // two days still shows its true age here even though savedAt wouldn't.
    const incomingLastSyncedAt = Array.isArray(payload) ? 0 : (payload?.lastSyncedAt || 0)
    const cloudWrapped = existing?.data
    const cloudArr = Array.isArray(cloudWrapped) ? cloudWrapped : (cloudWrapped?.data || [])
    const cloudUpdatedAt = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0

    // Staleness guard: if this session's last confirmed check-in with the
    // cloud predates the cloud's most recent write by more than the
    // threshold, something else has changed the data since this session
    // last looked — e.g. a browser tab or device left open for a while.
    // Don't let it clobber clients that have moved on since. Only clients
    // genuinely missing from the cloud (new additions) get pulled in from
    // a stale save; anything present in both keeps the cloud's (newer)
    // version. Threshold is generous on purpose — this should only ever
    // catch a real stale-session case, not normal back-to-back saves.
    const STALE_THRESHOLD_MS = 5 * 60 * 1000
    const isStale = cloudUpdatedAt > 0 && incomingLastSyncedAt > 0 && (cloudUpdatedAt - incomingLastSyncedAt) > STALE_THRESHOLD_MS

    let mergedArr
    if (isStale && Array.isArray(cloudArr) && cloudArr.length > 0) {
      const cloudNames = new Set(cloudArr.map(c => c.name))
      const newFromStaleSave = incomingArr.filter(c => !cloudNames.has(c.name))
      mergedArr = [...cloudArr, ...newFromStaleSave]
      console.warn(`[sbSaveClients] Stale save detected (session last synced ${Math.round((cloudUpdatedAt - incomingLastSyncedAt)/60000)} min before the cloud's last update) — kept cloud data for existing clients, only added ${newFromStaleSave.length} new one(s).`)
    } else {
      mergedArr = incomingArr
      if (Array.isArray(cloudArr) && cloudArr.length > 0) {
        const localNames = new Set(incomingArr.map(c => c.name))
        const cloudOnly = cloudArr.filter(c => !localNames.has(c.name))
        if (cloudOnly.length > 0) mergedArr = [...incomingArr, ...cloudOnly]
      }
    }

    const mergedPayload = Array.isArray(payload) ? mergedArr : { ...payload, data: mergedArr }

    const { error } = await supabase
      .from('clients')
      .upsert({ id: 1, data: mergedPayload, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}

// ─── Deals (CRM) ──────────────────────────────────────────────────────────────

export async function sbLoadDeals() {
  const { data, error } = await supabase
    .from('deals')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveDeals(deals) {
  return queued('deals', () => _doSaveDeals(deals))
}

async function _doSaveDeals(deals) {
  try {
    // Merge-safe write. Every save previously pushed the caller's full local
    // array straight over whatever Supabase held — so a save from one
    // device/tab could silently wipe a deal that was added or edited
    // elsewhere in the meantime (the same shape of bug that lost the
    // April/May commission data). Before writing, pull the freshest cloud
    // copy and fold back in any deal that exists there but is missing from
    // what we're about to write, keyed on 'Transaction Name'.
    //
    // This lives here rather than in deals.js because CRM.jsx and
    // NewOpportunityModal.jsx each define their own local saveDeals()
    // wrapper that calls sbSaveDeals() directly, bypassing deals.js
    // entirely — putting the merge here protects every save path at once.
    //
    // IMPORTANT: this recovery logic assumes anything missing from the local
    // write is missing by accident (a stale save), never on purpose. Now
    // that a real "Delete deal" exists (see sbDeleteDeal below), deletion
    // deliberately does NOT go through this function — it would otherwise
    // get silently undone by the exact protection meant to prevent data
    // loss.
    const { data: existing } = await supabase
      .from('deals')
      .select('data')
      .eq('id', 1)
      .single()

    let merged = deals
    if (existing?.data && Array.isArray(existing.data)) {
      const localNames = new Set(deals.map(d => d['Transaction Name']))
      const cloudOnly = existing.data.filter(d => !localNames.has(d['Transaction Name']))
      if (cloudOnly.length > 0) merged = [...deals, ...cloudOnly]
    }

    const { error } = await supabase
      .from('deals')
      .upsert({ id: 1, data: merged, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}

// Deliberate deletion — reads the freshest cloud copy, removes exactly the
// named deal, and writes the result straight back with no recovery logic.
// Kept separate from sbSaveDeals on purpose (see note above it).
export async function sbDeleteDeal(transactionName) {
  return queued('deals', () => _doDeleteDeal(transactionName))
}

async function _doDeleteDeal(transactionName) {
  try {
    const { data: existing } = await supabase
      .from('deals')
      .select('data')
      .eq('id', 1)
      .single()

    const current = Array.isArray(existing?.data) ? existing.data : []
    const filtered = current.filter(d => d['Transaction Name'] !== transactionName)

    const { error } = await supabase
      .from('deals')
      .upsert({ id: 1, data: filtered, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}

// ─── Referrers (Marketing) ────────────────────────────────────────────────────

export async function sbLoadReferrers() {
  const { data, error } = await supabase
    .from('referrers')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

// Note: this table/function pair doesn't appear to be called anywhere in the
// app currently — referral partner data actually persists through
// sbSaveMarketing (id 1) instead (see note below). Fixed here anyway for
// consistency in case it gets wired up later; costs nothing to have it safe.
export async function sbSaveReferrers(referrers) {
  try {
    const { data: existing } = await supabase
      .from('referrers')
      .select('data')
      .eq('id', 1)
      .single()

    let merged = referrers
    if (existing?.data && Array.isArray(existing.data)) {
      const localNames = new Set(referrers.map(r => r.name))
      const cloudOnly = existing.data.filter(r => !localNames.has(r.name))
      if (cloudOnly.length > 0) merged = [...referrers, ...cloudOnly]
    }

    const { error } = await supabase
      .from('referrers')
      .upsert({ id: 1, data: merged, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function sbLoadSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveSettings(settings) {
  try {
    // Shallow merge-safe write, same pattern as sbSaveMarketing below. Settings
    // is a single object (commission rates, broker profile, users list) rather
    // than an array, so the merge is a plain object spread: any top-level key
    // missing from this save falls back to what's already in the cloud,
    // instead of being wiped. Nested arrays/objects (e.g. commissionRates,
    // users) are still replaced wholesale if that key is present in the save —
    // a deeper merge isn't needed today since there's only one user account,
    // but worth knowing if that changes.
    const { data: existing } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 1)
      .single()
    const merged = { ...(existing?.data || {}), ...settings }
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 1, data: merged, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}

// ─── Ticked Items ─────────────────────────────────────────────────────────────
// id 1 = Dashboard/LoanAccount "ticked row" state. id 2 = Birthday "already sent"
// state. These used to share id 1, which meant saving one silently wiped out
// the other (each save is a full overwrite of that row). Kept as separate rows
// in the same table rather than a schema change.
//
// Deliberately NOT given the same merge-recovery treatment as deals/clients/
// referrers below. Those arrays only ever grow (records aren't deleted), so
// "recover anything cloud has that local doesn't" is always safe. Ticked
// arrays are different: unticking a row (LoanAccount.jsx, BirthdayNotifier.jsx)
// is a legitimate removal, saved as a shorter filtered array. Recovering
// "missing" entries here would silently undo every untick — the opposite of
// what merge-safety is for. Low stakes either way (a tick just controls
// whether a reminder still shows), so left as a plain overwrite.

export async function sbLoadTicked(id = 1) {
  const { data, error } = await supabase
    .from('ticked_items')
    .select('data')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveTicked(ticked, id = 1) {
  const { error } = await supabase
    .from('ticked_items')
    .upsert({ id, data: ticked, updated_at: new Date().toISOString() })
  return !error
}

// ─── Marketing table ───────────────────────────────────────────────────────
// id 1 = Marketing.jsx's referrers/lenders/others/clientOv (all four saved
// together in one call, so no cross-feature race there).
// id 2 = Project Studio (_studio)
// id 3 = ClientDashboard acknowledgement flags (_acknFlags)
//
// These used to all share id 1. The JS-side "read row, merge, write row"
// approach looked safe but wasn't: if two features saved within moments of
// each other, the second one could read the row before the first one's write
// landed, then write its own merge back over top — silently reverting the
// first save. Splitting into separate rows removes the race entirely, since
// nothing ever reads-then-writes a row another feature owns.

export async function sbLoadMarketing(id = 1) {
  const { data, error } = await supabase
    .from('marketing')
    .select('data')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveMarketing(partialData, id = 1) {
  try {
    const { data: existing } = await supabase
      .from('marketing')
      .select('data')
      .eq('id', id)
      .single()
    const merged = { ...(existing?.data || {}), ...partialData }
    const { error } = await supabase
      .from('marketing')
      .upsert({ id, data: merged, updated_at: new Date().toISOString() })
    return !error
  } catch {
    return false
  }
}
