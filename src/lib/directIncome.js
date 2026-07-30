import { sbLoadMarketing, sbSaveMarketing } from './supabase'

// Reuses the existing 'marketing' table rather than needing a new Supabase
// table created manually — row allocation so far: 1 = referrers/lenders/
// clientOv, 2 = Project Studio, 3 = acknowledgement flags, 4 = Planner.
// This is 5, previously unused.
const ROW_ID = 5
const STORAGE_KEY = 'rion-direct-income'

export const ITEM_TYPES = ['Direct Upfront', 'Mandate', 'Other']
export const TAX_RATES = ['GST on Income', 'BAS Excluded', 'GST Free']
export const DEFAULT_ACCOUNT = '002 - Upfront Business - Commission'
export const FIRST_INVOICE_NUMBER = 1150

// GST on Income is the only one of the three that actually carries tax —
// BAS Excluded and GST Free both mean 0% for this line, they just mean
// different things to Xero/your BAS reporting, which is why both need to
// exist as distinct options rather than collapsing to one "no GST" choice.
export function taxRateFraction(rate) {
  return rate === 'GST on Income' ? 0.10 : 0
}

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : { entries: [], nextInvoiceNumber: FIRST_INVOICE_NUMBER }
  } catch {
    return { entries: [], nextInvoiceNumber: FIRST_INVOICE_NUMBER }
  }
}
function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function loadDirectIncomeLocal() {
  return loadState().entries
}
export function loadNextInvoiceNumberLocal() {
  return loadState().nextInvoiceNumber || FIRST_INVOICE_NUMBER
}

export function saveDirectIncome(entries, nextInvoiceNumber) {
  const state = { entries, nextInvoiceNumber: nextInvoiceNumber ?? loadNextInvoiceNumberLocal() }
  saveState(state)
  return sbSaveMarketing(state, ROW_ID).catch(() => false)
}

export async function syncDirectIncomeFromSupabase() {
  try {
    const cloud = await sbLoadMarketing(ROW_ID)
    if (cloud && Array.isArray(cloud.entries)) {
      saveState({ entries: cloud.entries, nextInvoiceNumber: cloud.nextInvoiceNumber || FIRST_INVOICE_NUMBER })
      return cloud
    }
  } catch {}
  return null
}

// Called once a commission statement has been imported for `month` — locks
// that month's Direct Income entries (no further edits/deletes) since
// they've now been folded into that month's finalized commission figures.
// Safe to call even if there's nothing to close for that month.
export async function closeDirectIncomeMonth(month) {
  const state = loadState()
  if (!state.entries.some(e => e.month === month && !e.closed)) return
  const updated = state.entries.map(e => e.month === month ? { ...e, closed: true } : e)
  await saveDirectIncome(updated, state.nextInvoiceNumber)
}

export function directIncomeTotalForMonth(entries, month) {
  return (entries || [])
    .filter(e => e.month === month)
    .reduce((s, e) => s + (Number(e.amount) || 0) + (Number(e.taxAmount) || 0), 0)
}
