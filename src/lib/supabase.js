import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uudxlflyoeffcertpkrj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_CI6JvPKvNuCHM7nJdgEUew_z_z1IFBj'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function sbLoadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('data')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveClients(clients) {
  // Check if a row exists
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('clients')
      .update({ data: clients, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return !error
  } else {
    const { error } = await supabase
      .from('clients')
      .insert({ data: clients })
    return !error
  }
}

// ─── Deals (CRM) ──────────────────────────────────────────────────────────────

export async function sbLoadDeals() {
  const { data, error } = await supabase
    .from('deals')
    .select('data')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveDeals(deals) {
  const { data: existing } = await supabase
    .from('deals')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('deals')
      .update({ data: deals, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return !error
  } else {
    const { error } = await supabase
      .from('deals')
      .insert({ data: deals })
    return !error
  }
}

// ─── Referrers (Marketing) ────────────────────────────────────────────────────

export async function sbLoadReferrers() {
  const { data, error } = await supabase
    .from('referrers')
    .select('data')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) return null
  return data.data
}

export async function sbSaveReferrers(referrers) {
  const { data: existing } = await supabase
    .from('referrers')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('referrers')
      .update({ data: referrers, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return !error
  } else {
    const { error } = await supabase
      .from('referrers')
      .insert({ data: referrers })
    return !error
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
