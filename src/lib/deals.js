import { sbLoadDeals, sbSaveDeals } from './supabase'

const STORAGE_KEY = 'rion-crm-deals'

// Local-only load — same as before, just centralised. Callers should follow
// this up with syncDealsFromSupabase() on mount (see below) so a cleared
// cache doesn't fall back to old baked-in seed data.
export function loadDeals() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

export function saveDeals(deals) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deals)) } catch {}
  sbSaveDeals(deals).catch(() => {})
  return true
}

// Call this once on mount, wherever deals are loaded. If the local cache is
// genuinely empty (e.g. cache just cleared), pull the real data down from
// Supabase and hydrate localStorage with it. If local data already exists,
// leave it alone — this only rescues the "empty cache" case, it never
// clobbers a live, already-loaded session.
//
// This mirrors the same fix already applied to client data: previously,
// deals pages fell back to a hardcoded seed (PIPELINE_DATA) whenever the
// cache was empty, and any edit made from there would push that stale seed
// straight to Supabase, overwriting real deals. There was no cloud-pull path
// for deals at all before this.
export async function syncDealsFromSupabase() {
  try {
    const localRaw = localStorage.getItem(STORAGE_KEY)
    if (localRaw) return null // real local data already present — don't touch it

    const cloud = await sbLoadDeals()
    if (!cloud || !Array.isArray(cloud) || cloud.length === 0) return null

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud)) } catch {}
    return cloud
  } catch {
    return null
  }
}
