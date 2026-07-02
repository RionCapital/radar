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

export async function sbLoadTicked() {
  const { data, error } = await supabase
    .from('ticked_items')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveTicked(ticked) {
  const { error } = await supabase
    .from('ticked_items')
    .upsert({ id: 1, data: ticked, updated_at: new Date().toISOString() })
  return !error
}

// ─── Marketing (all 4 stores: referrers, lenders, others, clientOv) ───────────

export async function sbLoadMarketing() {
  const { data, error } = await supabase
    .from('marketing')
    .select('data')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveMarketing(marketingData) {
  const { error } = await supabase
    .from('marketing')
    .upsert({ id: 1, data: marketingData, updated_at: new Date().toISOString() })
  return !error
}
