// Portfolio export — a high-level list of every connection and the loans
// under it, as CSV. Deliberately light on detail: connection, stream, and one
// row per loan with the figures that matter (limit, current balance, lender,
// settlement), so it opens straight into Excel and pivots cleanly.
import { assetFinanceCurrentBalance, facilityUtilized } from './mafFacilities'
import { loanStream } from './settings'

// The balance to report for a loan. Mirrors the Dashboard's directLoanValue:
// a MAF is worth what its parcels currently draw, an Asset Finance loan is
// worth its amortised balance (there's no statement updating it), and
// everything else reports the balance it carries.
export function loanCurrentValue(loan) {
  if (!loan) return 0
  if (loan.type === 'MAF') return facilityUtilized(loan)
  if (loan.type === 'Asset Finance') return assetFinanceCurrentBalance(loan)
  return Number(loan.balance) || 0
}

// One row per loan; a connection with no loans still gets a row so nothing
// silently disappears from the list. Closed loans are included only when
// asked for, and marked as such.
export function buildPortfolioRows(clients, { includeClosed = false, settings } = {}) {
  const rows = []
  ;(clients || [])
    .filter(c => !c._demo)
    .sort((a, b) => (Number(a.connNo) || 0) - (Number(b.connNo) || 0))
    .forEach(c => {
      const loans = (c.loans || []).filter(l => includeClosed || !l.closed)
      if (!loans.length) {
        rows.push({
          connNo: c.connNo || '', connection: c.name, stream: c.stream || '',
          loanName: '', acc: '', type: '', lender: '', limit: '', balance: '',
          settled: '', status: 'No loans', direct: '',
        })
        return
      }
      loans.forEach(l => {
        rows.push({
          connNo: c.connNo || '', connection: c.name, stream: loanStream(l, c, settings),
          loanName: l.lname || '', acc: l.acc || '', type: l.type || '', lender: l.bank || '',
          limit: Number(l.amount) || 0, balance: Math.round(loanCurrentValue(l)),
          settled: l.settled || '', status: l.closed ? 'Closed' : 'Active',
          direct: l.direct ? 'Direct' : 'Statement',
        })
      })
    })
  return rows
}

const COLS = [
  ['connNo', 'Connection #'], ['connection', 'Connection'], ['stream', 'Stream'],
  ['loanName', 'Loan'], ['acc', 'Account no.'], ['type', 'Loan type'], ['lender', 'Lender'],
  ['limit', 'Limit'], ['balance', 'Current balance'], ['settled', 'Settled'],
  ['status', 'Status'], ['direct', 'Source'],
]

export function portfolioCsv(rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = COLS.map(([, label]) => esc(label)).join(',')
  const body = rows.map(r => COLS.map(([key]) => esc(r[key])).join(','))
  // Trailing total line — a portfolio list is nearly always read alongside
  // "and what's that worth in total".
  const total = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const limit = rows.reduce((s, r) => s + (Number(r.limit) || 0), 0)
  const totals = COLS.map(([key]) =>
    key === 'connection' ? esc(`${new Set(rows.map(r => r.connection)).size} connections, ${rows.filter(r => r.acc || r.loanName).length} loans`)
    : key === 'limit' ? esc(limit)
    : key === 'balance' ? esc(total)
    : key === 'connNo' ? esc('TOTAL') : esc('')).join(',')
  return [head, ...body, totals].join('\n')
}

export function downloadPortfolioCsv(clients, opts = {}) {
  const rows = buildPortfolioRows(clients, opts)
  const blob = new Blob([portfolioCsv(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Rion_Portfolio_${new Date().toLocaleDateString('en-AU').replace(/\//g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return rows.length
}
