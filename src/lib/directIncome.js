import { sbLoadMarketing, sbSaveMarketing } from './supabase'

// Reuses the existing 'marketing' table rather than needing a new Supabase
// table created manually — row allocation so far: 1 = referrers/lenders/
// clientOv, 2 = Project Studio, 3 = acknowledgement flags, 4 = Planner.
// This is 5, previously unused.
const ROW_ID = 5
const STORAGE_KEY = 'rion-direct-income'

export const INCOME_TYPES = ['RCTI', 'Tax Invoice', 'Referral Fee', 'Other']

export function loadDirectIncomeLocal() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : []
  } catch {
    return []
  }
}

function saveLocal(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch {}
}

export function saveDirectIncome(entries) {
  saveLocal(entries)
  return sbSaveMarketing({ entries }, ROW_ID).catch(() => false)
}

export async function syncDirectIncomeFromSupabase() {
  try {
    const cloud = await sbLoadMarketing(ROW_ID)
    if (cloud && Array.isArray(cloud.entries)) {
      saveLocal(cloud.entries)
      return cloud.entries
    }
  } catch {}
  return null
}

// Called once a commission statement has been imported for `month` — locks
// that month's Direct Income entries (no further edits/deletes) since
// they've now been folded into that month's finalized commission figures.
// Safe to call even if there's nothing to close for that month.
export async function closeDirectIncomeMonth(month) {
  const current = loadDirectIncomeLocal()
  if (!current.some(e => e.month === month && !e.closed)) return
  const updated = current.map(e => e.month === month ? { ...e, closed: true } : e)
  await saveDirectIncome(updated)
}

export function directIncomeTotalForMonth(entries, month) {
  return (entries || [])
    .filter(e => e.month === month)
    .reduce((s, e) => s + (Number(e.amountExGst) || 0) + (Number(e.gst) || 0), 0)
}
