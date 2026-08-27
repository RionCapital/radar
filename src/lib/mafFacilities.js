// Master Asset Finance (MAF) facility limits — a per-client parent limit
// (e.g. "$5.5m MAF with CBA") that individual parcels are drawn against:
// either Asset Finance loans (a fixed-term, fully-amortising facility for
// one asset) or Progress facilities (an approved sub-limit drawn down in
// stages via progress payments, e.g. for a construction/fitout).
//
// Stored directly on the client record (client.mafFacilities), the same
// way client.loans/client.securities/client.notes already are — so it
// rides along on the existing client save/sync path with no new Supabase
// row or separate store to keep in sync.
import { buildBalanceHistory } from './dateUtils'

export function mkId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function blankMafFacility() {
  return {
    id: mkId(),
    lender: '',
    limit: '',
    startDate: new Date().toISOString().slice(0, 10),
    reviewDate: '',
    notes: '',
    closed: false,
    parcels: [],
  }
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

export function mkProgressPayment() {
  return { id: mkId(), date: new Date().toISOString().slice(0, 10), amount: '', description: '' }
}

// Full month-by-month balance projection for an Asset Finance parcel,
// straight from the same buildBalanceHistory() used on the Loans tab —
// keeps the estimate consistent with how the rest of Radar already
// amortises a loan (standard P&I/IO to zero over the term; like the
// existing Loan Predictor, this doesn't special-case a balloon amount).
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

export function progressDrawn(parcel) {
  return (parcel.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
}

export function progressRemaining(parcel) {
  return (Number(parcel.approvedLimit) || 0) - progressDrawn(parcel)
}

// The parcel's contribution to the parent MAF limit right now — an Asset
// Finance parcel's estimated outstanding balance, or a Progress facility's
// amount actually drawn to date (not its full approved sub-limit — only
// what's been drawn counts against the limit as "current balance").
export function parcelCurrentValue(parcel) {
  if (parcel.closed) return 0
  return parcel.kind === 'progress' ? progressDrawn(parcel) : assetFinanceCurrentBalance(parcel)
}

// What the parcel was originally approved/settled for — used for display,
// not for the headroom calc.
export function parcelOriginalValue(parcel) {
  return parcel.kind === 'progress' ? (Number(parcel.approvedLimit) || 0) : (Number(parcel.amount) || 0)
}

export function parcelLabel(parcel) {
  if (parcel.kind === 'progress') return parcel.name || 'Progress facility'
  return parcel.assetDesc || 'Asset Finance'
}

export function facilityUtilized(facility) {
  return (facility.parcels || []).reduce((s, p) => s + parcelCurrentValue(p), 0)
}

export function facilityHeadroom(facility) {
  return (Number(facility.limit) || 0) - facilityUtilized(facility)
}
