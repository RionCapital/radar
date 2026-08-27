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
export function loadNextInvoiceNumberLocal(fallback = FIRST_INVOICE_NUMBER) {
  return loadState().nextInvoiceNumber || fallback
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
    .reduce((s, e) => s + invoiceTotals(e).total, 0)
}

// ─── Multi-line invoice shape ─────────────────────────────────────────────
// Going forward an entry can carry an `items` array — one invoice, several
// line items (e.g. a commission line + a doc fee line on the same Asset
// Finance invoice). Entries created before this existed have no `items` —
// the entry itself IS the one and only line item. These three helpers let
// every consumer (the list page, the invoice detail page, PDF generation,
// Dashboard's monthly totals) treat both shapes identically, so old records
// never need to be rewritten.
export function invoiceItems(entry) {
  if (Array.isArray(entry.items) && entry.items.length) return entry.items
  return [{
    id: entry.id, item: entry.item, description: entry.description,
    qty: entry.qty, price: entry.price, account: entry.account,
    taxRate: entry.taxRate, taxAmount: entry.taxAmount, amount: entry.amount,
  }]
}

export function invoiceTotals(entry) {
  const items = invoiceItems(entry)
  const amount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const taxAmount = items.reduce((s, it) => s + (Number(it.taxAmount) || 0), 0)
  return {
    amount: Math.round(amount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round((amount + taxAmount) * 100) / 100,
  }
}

// One-line summary for the invoice list — a single item shows its own
// description (or item type if no description), multiple items are
// summarised as a count + the item types involved.
export function invoiceSummaryDescription(entry) {
  const items = invoiceItems(entry)
  if (items.length === 1) return items[0].description || items[0].item || ''
  const types = [...new Set(items.map(it => it.item).filter(Boolean))]
  return `${items.length} line items${types.length ? ' — ' + types.join(', ') : ''}`
}

export function mkLineItem() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item: 'Direct Upfront', description: '', qty: 1, price: '',
    account: DEFAULT_ACCOUNT, taxRate: 'GST on Income', taxAmount: '', amount: '',
  }
}

// Recomputes amount/taxAmount for one line item from qty × price and its
// tax rate — used by the invoice detail page whenever qty/price/taxRate
// change on a row.
export function recalcLineItem(item) {
  const qty = Number(item.qty) || 0
  const price = Number(item.price) || 0
  const amount = Math.round(qty * price * 100) / 100
  const taxAmount = Math.round(amount * taxRateFraction(item.taxRate) * 100) / 100
  return { ...item, amount, taxAmount }
}

// ─── Payee picker data source ─────────────────────────────────────────────
// Marketing's three non-client contact lists (Referral Partners, Lenders,
// Others) — each contact carries name/company/abn/address when set, which
// is exactly what the tax invoice PDF needs for the "bill to" block.
// Client households come from lib/data.js's loadClients() instead (passed
// in by the caller) so this file doesn't need to import the client-book
// loader just for this.
function readMarketingList(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : [] } catch { return [] }
}
export function loadMarketingContacts() {
  return {
    referrers: readMarketingList('rion-marketing-referrers').map(c => ({ ...c, category: 'Referral Partners' })),
    lenders:   readMarketingList('rion-marketing-lenders').map(c => ({ ...c, category: 'Lenders' })),
    others:    readMarketingList('rion-marketing-others').map(c => ({ ...c, category: 'Others' })),
  }
}

// Combines Marketing's contacts with the real client book into one flat,
// de-duped list for the Supplier/Lender payee picker — grouped by category
// so the dropdown can show "Clients", "Referral Partners", "Lenders",
// "Others" the same way Marketing itself does.
export function loadPayeeOptions(clients) {
  const { referrers, lenders, others } = loadMarketingContacts()
  const clientOpts = (clients || [])
    .filter(c => c.name)
    .map(c => ({ name: c.name, category: 'Clients' }))
  return [...clientOpts, ...referrers, ...lenders, ...others].filter(c => c.name)
}
