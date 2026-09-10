// Master Asset Finance (MAF) facility limits and standalone Asset Finance
// loans — both share the same math, so it lives in one place.
//
// A MAF is just a normal entry in client.loans (type: 'MAF') like any other
// loan — its "limit" is the loan's own `amount` field, same as every other
// loan type's original limit. What makes it a MAF is that it also carries a
// `parcels` array: the individual Asset Finance loans and Progress
// facilities drawn against that master limit. There's no separate top-level
// store — it rides along on the existing client save/sync path exactly the
// way client.loans/client.securities/client.notes already do.
//
// A standalone Asset Finance loan (type: 'Asset Finance', not sitting under
// a MAF) uses these same helpers directly on the loan record itself — its
// field names (amount, rate, rpmt, term, settled, monthlyFee) already match
// what a "parcel" below expects, so no adapting is needed either way.
import { buildBalanceHistory } from './dateUtils'

export function mkId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Asset Finance parcels reuse the exact field names lib/dateUtils.js's
// buildBalanceHistory()/calcRepayment() already expect on a loan (amount,
// rate, rpmt, term, settled) — so the same tested amortisation math that
// drives the Loans tab elsewhere in Radar works here unmodified, and the
// balance is always estimated live from the loan terms + elapsed time
// rather than needing a commission statement to update it.
export function blankAssetFinanceParcel() {
  return {
    id: mkId(),
    kind: 'assetFinance',
    assetDesc: '',
    amount: '',
    rate: '',
    rateType: 'Fixed',
    rpmt: 'P&I',
    term: 5,
    balloon: '',
    fees: '', // one-off fees (establishment etc.) — free text, informational only
    monthlyFee: '', // ongoing account-keeping fee — doesn't reduce principal, but is added on top of the P&I repayment for the real monthly cost
    settled: new Date().toISOString().slice(0, 10),
    notes: '',
    closed: false,
  }
}

// Progress facilities are a lighter record — an approved sub-limit plus a
// running list of progress payments drawn against it over time. No
// balance/rate history the way a loan gets — just draws.
export function blankProgressParcel() {
  return {
    id: mkId(),
    kind: 'progress',
    name: '',
    approvedLimit: '',
    status: 'Active',
    notes: '',
    closed: false,
    payments: [],
  }
}

// A Progress facility's invoices are organised into supplier groups — one
// table per supplier, each with its own invoice lines and subtotal, mirroring
// how Cameron already tracks these in his own spreadsheet (a dark section
// band per supplier, invoices underneath, a subtotal row). `parcel.supplierGroups`
// is the live shape; see getSupplierGroups() below for the read path.
export function mkSupplierGroup(supplierName = '') {
  return { id: mkId(), supplier: supplierName, invoices: [] }
}

// A single invoice line within a supplier group. The supplier name itself
// lives on the group, not the invoice, since every invoice in a group
// belongs to that one supplier.
export function mkProgressInvoice() {
  return {
    id: mkId(),
    invoiceRef: '',
    description: '',
    dueDate: new Date().toISOString().slice(0, 10),
    amount: '',
    payingTo: 'Supplier',
    status: 'Pending',
    paid: false,
    paymentDate: '',
    notes: '',
    bridgingRate: '',
  }
}

export const PROGRESS_PAYMENT_STATUSES = ['Pending', 'Approved For Funding', 'Submitted for Payment', 'Completed']

// ─── Import Lease parcels ──────────────────────────────────────────────────
// An Import Lease parcel is a trade-finance-style facility: instead of one
// amortising loan (Asset Finance) or a single approved sub-limit with its
// own invoices (Progress), it's a running list of individual bills — each
// with its own book date, maturity date and interest — grouped by customer
// the same way Progress groups invoices by supplier. Unlike Progress and
// Asset Finance, an Import Lease parcel does NOT carry its own approved
// limit: the limit is shared across every Import Lease parcel under the
// same MAF (facility.importLeaseLimit — see importLeaseSubLimitUtilized/
// importLeaseSubLimitHeadroom below), since Cameron tracks one combined
// Import Lease ceiling per MAF, not one per parcel.
export function blankImportLeaseParcel() {
  return {
    id: mkId(),
    kind: 'importLease',
    name: '',
    notes: '',
    closed: false,
    customerGroups: [],
  }
}

// One customer's group of bills — mirrors mkSupplierGroup above.
export function mkCustomerGroup(customerName = '') {
  return { id: mkId(), customer: customerName, bills: [] }
}

// A single trade-finance bill line within a customer group. Field names
// follow the bank statement columns directly: OUR REF NUM, BOOK DATE,
// MATURITY DATE, BILL CCY, BILL AMT, TENOR, INT RATE, INT DUE AMT, and
// AMOUNT DUE AT MATURITY (P+I) — CUSTOMER NAME lives on the group, same as
// a Progress invoice's supplier.
export function mkImportLeaseBill() {
  return {
    id: mkId(),
    refNum: '',
    bookDate: new Date().toISOString().slice(0, 10),
    maturityDate: '',
    billCcy: 'AUD',
    billAmt: '',
    tenor: '',
    intRate: '',
    intDueAmt: '',
    amountDueAtMaturity: '',
    repaid: false,
    notes: '',
  }
}

export function getCustomerGroups(parcel) {
  return parcel.customerGroups || []
}

// Rolls up one customer group's bill lines — count, total face value, how
// much has been repaid vs. is still outstanding. NOTE the polarity here is
// the opposite of a Progress group's subtotal: a Progress invoice draws on
// the facility once it's PAID, but a trade finance bill draws on the
// facility from the moment it's booked and stays drawn until it's REPAID —
// so "outstanding" (not yet repaid) is what counts as utilised, not "paid".
export function billGroupSubtotal(bills) {
  return (bills || []).reduce((acc, b) => {
    const amt = Number(b.billAmt) || 0
    acc.count += 1
    acc.total += amt
    if (b.repaid) acc.repaid += amt
    else acc.outstanding += amt
    return acc
  }, { count: 0, total: 0, repaid: 0, outstanding: 0 })
}

// What's actually drawn against the shared Import Lease sub-limit (and, in
// turn, the MAF's own limit) right now — every bill still outstanding
// (not yet repaid), across every customer group in this one parcel.
export function importLeaseDrawn(parcel) {
  return getCustomerGroups(parcel).reduce((s, g) => s + billGroupSubtotal(g.bills).outstanding, 0)
}

// Total face value of every bill ever booked under this parcel (repaid or
// not) — used for display only, same role parcelOriginalValue plays for
// the other parcel kinds.
export function importLeaseTotalExposure(parcel) {
  return getCustomerGroups(parcel).reduce((s, g) => s + billGroupSubtotal(g.bills).total, 0)
}

// There's one Import Lease sub-limit per MAF, shared across every Import
// Lease parcel drawn under it (not one per parcel) — so utilisation has to
// be summed across all of them, not read off a single parcel.
export function importLeaseSubLimitUtilized(facility) {
  return (facility.parcels || [])
    .filter(p => p.kind === 'importLease' && !p.closed)
    .reduce((s, p) => s + importLeaseDrawn(p), 0)
}
export function importLeaseSubLimitHeadroom(facility) {
  return (Number(facility.importLeaseLimit) || 0) - importLeaseSubLimitUtilized(facility)
}


// Reads a Progress facility's invoices as supplier groups. If the parcel
// already has `supplierGroups` (saved from this page), that's returned
// directly. Otherwise this falls back to grouping the older flat
// `payments` array (from before per-supplier tables shipped) by its
// `supplier` field, so nothing entered before this update disappears —
// it just displays grouped until the parcel is next saved, at which point
// the grouped shape is what gets written back.
export function getSupplierGroups(parcel) {
  if (parcel.supplierGroups) return parcel.supplierGroups
  const payments = parcel.payments || []
  if (!payments.length) return []
  const bySupplier = {}
  const order = []
  payments.forEach(pay => {
    const key = pay.supplier || ''
    if (!bySupplier[key]) { bySupplier[key] = []; order.push(key) }
    const { supplier, date, ...rest } = pay
    bySupplier[key].push({ ...rest, dueDate: rest.dueDate || date || '' })
  })
  return order.map(key => ({ id: mkId(), supplier: key, invoices: bySupplier[key] }))
}

// Rolls up one supplier group's invoice lines — count, total, paid,
// outstanding — for that group's subtotal row.
export function groupSubtotal(invoices) {
  return (invoices || []).reduce((acc, inv) => {
    const amt = Number(inv.amount) || 0
    acc.count += 1
    acc.total += amt
    if (inv.paid) acc.paid += amt
    else acc.outstanding += amt
    return acc
  }, { count: 0, total: 0, paid: 0, outstanding: 0 })
}

// Full month-by-month balance projection for an Asset Finance parcel,
// straight from the same buildBalanceHistory() used on the Loans tab —
// keeps the estimate consistent with how the rest of Radar already
// amortises a loan (P&I/IO over the full settlement-to-maturity term,
// amortising down to a balloon/residual by the final month if one is set,
// same as the standard loan projection does).
export function assetFinanceBalanceHistory(parcel) {
  return buildBalanceHistory(parcel)
}

// Today's estimated outstanding balance for an Asset Finance parcel —
// the most recent "isPast" entry in the projection, or the original
// amount if it hasn't settled yet / has no rate+term set.
export function assetFinanceCurrentBalance(parcel) {
  const amount = Number(parcel.amount) || 0
  if (!parcel.settled || !amount) return amount
  const history = assetFinanceBalanceHistory(parcel)
  const past = history.filter(h => h.isPast)
  if (!past.length) return amount
  return past[past.length - 1].balance
}

export function assetFinanceMonthlyRepayment(parcel) {
  const history = assetFinanceBalanceHistory(parcel)
  return history.length ? history[0].repayment : 0
}

// The ongoing monthly fee doesn't amortise the loan (it's not applied to
// principal), so it never changes the balance projection itself — but it's
// real money going out every month alongside the P&I repayment, so the
// "total monthly cost" figure shown to Cameron needs to include it.
export function assetFinanceTotalMonthlyCost(parcel) {
  return assetFinanceMonthlyRepayment(parcel) + (Number(parcel.monthlyFee) || 0)
}

// The actual drawdown against a Progress facility's sub-limit — only
// invoices that have been marked Paid count, not everything that's been
// invoiced. An invoice sitting unpaid hasn't drawn on the facility yet,
// so it shouldn't reduce the "remaining" figure or count as utilised.
export function progressDrawn(parcel) {
  return getSupplierGroups(parcel).reduce((s, g) => s + groupSubtotal(g.invoices).paid, 0)
}

export function progressRemaining(parcel) {
  return (Number(parcel.approvedLimit) || 0) - progressDrawn(parcel)
}

// The parcel's contribution to the parent MAF limit right now — an Asset
// Finance parcel's estimated outstanding balance, a Progress facility's
// amount actually drawn to date, or an Import Lease parcel's outstanding
// (not yet repaid) bill total — never the full approved/face amount, only
// what currently counts against the limit.
export function parcelCurrentValue(parcel) {
  if (parcel.closed) return 0
  if (parcel.kind === 'progress') return progressDrawn(parcel)
  if (parcel.kind === 'importLease') return importLeaseDrawn(parcel)
  return assetFinanceCurrentBalance(parcel)
}

// What the parcel was originally approved/settled for — used for display,
// not for the headroom calc.
export function parcelOriginalValue(parcel) {
  if (parcel.kind === 'progress') return Number(parcel.approvedLimit) || 0
  if (parcel.kind === 'importLease') return importLeaseTotalExposure(parcel)
  return Number(parcel.amount) || 0
}

export function parcelLabel(parcel) {
  if (parcel.kind === 'progress') return parcel.name || 'Progress facility'
  if (parcel.kind === 'importLease') return parcel.name || 'Import Lease'
  return parcel.assetDesc || 'Asset Finance'
}

export function facilityUtilized(facility) {
  return (facility.parcels || []).reduce((s, p) => s + parcelCurrentValue(p), 0)
}

// `facility` here is a normal client.loans[] record of type 'MAF' — its
// limit is that loan's own `amount` field, same as any other loan type.
export function facilityHeadroom(facility) {
  return (Number(facility.amount) || 0) - facilityUtilized(facility)
}
