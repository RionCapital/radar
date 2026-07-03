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

export async function sbSaveClients(clients) {
  const { error } = await supabase
    .from('clients')
    .upsert({ id: 1, data: clients, updated_at: new Date().toISOString() })
  return !error
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
  const { error } = await supabase
    .from('deals')
    .upsert({ id: 1, data: deals, updated_at: new Date().toISOString() })
  return !error
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

export async function sbSaveReferrers(referrers) {
  const { error } = await supabase
    .from('referrers')
    .upsert({ id: 1, data: referrers, updated_at: new Date().toISOString() })
  return !error
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
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 1, data: settings, updated_at: new Date().toISOString() })
  return !error
}

// ─── Ticked Items ─────────────────────────────────────────────────────────────
// id 1 = Dashboard/LoanAccount "ticked row" state. id 2 = Birthday "already sent"
// state. These used to share id 1, which meant saving one silently wiped out
// the other (each save is a full overwrite of that row). Kept as separate rows
// in the same table rather than a schema change.

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
