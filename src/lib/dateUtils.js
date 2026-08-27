const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fmtDate(val) {
  if (!val) return '—'
  const s = String(val).trim()
  if (!s || s === 'nan' || s === '—') return '—'
  if (/^\d{4}$/.test(s)) return s
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const [dd,mm,yyyy]=s.split('-'); d=new Date(`${yyyy}-${mm}-${dd}`) }
  else d = new Date(s)
  if (isNaN(d)) return s
  return `${String(d.getDate()).padStart(2,'0')}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

export function daysUntil(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '—' || /^\d{4}$/.test(s)) return null
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else d = new Date(s)
  if (isNaN(d)) return null
  return Math.floor((d - new Date()) / 86400000)
}

export function dateStatus(val) {
  const days = daysUntil(val)
  if (days === null) return null
  if (days < 0) return 'overdue'
  if (days <= 120) return 'warn'
  return 'ok'
}

export function dateCellStyle(val) {
  const st = dateStatus(val)
  if (st === 'overdue') return { background:'#fde8e8', color:'#a32d2d', fontWeight:500, borderRadius:4, padding:'2px 6px', display:'inline-block' }
  if (st === 'warn') return { background:'#fef9c3', color:'#854F0B', fontWeight:500, borderRadius:4, padding:'2px 6px', display:'inline-block' }
  return { display:'inline-block' }
}

// Countdown badge — e.g. "47 days" amber, "Overdue 12 days" red
export function expiryBadge(val) {
  const days = daysUntil(val)
  if (days === null) return null
  if (days < 0) {
    return { label: `Overdue ${Math.abs(days)}d`, bg:'#fde8e8', color:'#a32d2d' }
  }
  if (days <= 120) {
    return { label: `${days} days`, bg:'#fef9c3', color:'#854F0B' }
  }
  return { label: `${days} days`, bg:'#e8f5e9', color:'#2e7d32' }
}

export function loanFlag(loan) {
  const fields = [loan.fixed, loan.io, loan.balloon].filter(Boolean)
  if (!fields.length) return null
  const statuses = fields.map(dateStatus).filter(Boolean)
  if (statuses.includes('overdue')) return 'overdue'
  if (statuses.includes('warn')) return 'warn'
  return null
}

export function calcRepayment(loan) {
  if (loan.estRepayment) return loan.estRepayment
  const bal = loan.balance || 0
  const rate = (loan.rate || 0) / 100 / 12
  const ioExpired = loan.io && dateStatus(loan.io) === 'overdue'
  const effectiveRpmt = (loan.rpmt === 'IO' && !ioExpired) ? 'IO' : 'P&I'
  if (!bal || !rate) return null
  if (effectiveRpmt === 'IO') return Math.round(bal * rate)

  // Use remaining months from maturity if available — more accurate than full term
  const balloon = parseFloat(loan.balloon) || 0
  let n
  if (loan.maturity) {
    const mat = new Date(loan.maturity)
    const today = new Date()
    n = Math.max(1, Math.round((mat - today) / (30.44 * 86400000)))
  } else {
    n = (loan.term || 30) * 12
  }
  if (!n) return null

  const factor = Math.pow(1 + rate, n)

  if (balloon > 0 && bal > balloon) {
    // Correct balloon formula: payment that reduces balance from bal to balloon over n months
    // pmt = (PV × (1+r)^n − FV) × r / ((1+r)^n − 1)
    return Math.round((bal * factor - balloon) * rate / (factor - 1))
  }
  if (balloon > 0 && bal <= balloon) {
    // Balance at/below balloon — effectively IO until maturity
    return Math.round(bal * rate)
  }
  // Standard P&I
  return Math.round((bal * rate * factor) / (factor - 1))
}

export function effectiveRpmt(loan) {
  if (loan.rpmt !== 'IO') return loan.rpmt
  if (loan.io && dateStatus(loan.io) === 'overdue') return 'P&I*'
  return 'IO'
}

export function rollingYTD(commData) {
  return commData.slice(-12).reduce((s,m) => s + m.total, 0)
}

export function quarterlyIncome(commData) {
  // Group by proper calendar quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec
  const Q_END = ['Mar', 'Jun', 'Sep', 'Dec']
  const MONTH_IDX = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12}
  const qMap = {}
  commData.forEach(m => {
    const [mon, yr] = m.month.split(' ')
    const monthNum = MONTH_IDX[mon] || 0
    const q = Math.floor((monthNum - 1) / 3) // 0=Jan-Mar,1=Apr-Jun,2=Jul-Sep,3=Oct-Dec
    // Quarter ends in the month of the last month of that quarter
    const endMonth = Q_END[q]
    const key = `${endMonth} ${yr}`
    if (!qMap[key]) qMap[key] = { label: `Q${endMonth} ${yr}`, endMonth, yr: parseInt('20'+yr), q, trail:0, upfront:0, direct:0, total:0, months:[] }
    qMap[key].trail += m.trail
    qMap[key].upfront += m.upfront
    qMap[key].direct += (m.direct || 0)
    qMap[key].total += m.total
    qMap[key].months.push(mon)
  })
  // Sort by year then quarter
  return Object.values(qMap).sort((a,b) => a.yr !== b.yr ? a.yr-b.yr : a.q-b.q)
}

// The maturity date implied by a settlement date + term — used for Asset
// Finance loans/parcels, which don't carry their own separately-entered
// `maturity` field the way other loan types do; it's always derived from
// settled+term instead, so it can never drift out of sync with the terms
// actually on the loan. Returns an ISO date string ('YYYY-MM-DD') so it
// drops straight into fmtDate()/expiryBadge() like any other date field.
export function calcMaturityDate(settled, termYears) {
  if (!settled) return null
  const start = new Date(settled)
  const n = Math.max(1, Math.round((termYears || 30) * 12))
  const d = new Date(start)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

// Build balance history from settlement date through to the loan's actual
// maturity date (settlement + term) — the full contracted life of the
// loan, not an arbitrary window past today, so the curve always reaches
// where the loan actually ends regardless of how far into its term today
// happens to fall. When a balloon/residual is set, the payment amortises
// the balance down to that residual by the second-to-last month (same
// formula the standard loan Predictor uses), then the final month clears
// it to zero — the balloon being paid off/refinanced at maturity, exactly
// like every other loan type's projection already assumes.
export function buildBalanceHistory(loan) {
  if (!loan.settled || !loan.amount) return []
  const start = new Date(loan.settled)
  const rate = (loan.rate || 0) / 100 / 12
  const isIO = loan.rpmt === 'IO'
  const balloon = Number(loan.balloon) || 0
  const n = Math.max(1, Math.round((loan.term || 30) * 12))
  const factor = rate ? Math.pow(1 + rate, n) : 1

  let monthlyPmt
  if (isIO) {
    monthlyPmt = rate ? Math.round(loan.amount * rate) : 0
  } else if (balloon > 0 && rate) {
    // Balloon P&I: payment that reduces balance from amount to balloon
    // over the full term — pmt = (PV×(1+r)^n − FV)×r / ((1+r)^n − 1)
    monthlyPmt = Math.round((loan.amount * factor - balloon) * rate / (factor - 1))
  } else if (rate) {
    monthlyPmt = Math.round((loan.amount * rate * factor) / (factor - 1))
  } else {
    monthlyPmt = Math.round(Math.max(0, loan.amount - balloon) / n)
  }

  const today = new Date()
  const history = []
  let bal = loan.amount

  for (let m = 0; m <= n; m++) {
    const date = new Date(start)
    date.setMonth(date.getMonth() + m)
    const isLastMonth = m === n
    const interest = rate ? Math.round(bal * rate) : 0
    let principal
    if (isLastMonth && balloon > 0) {
      principal = bal // balloon paid off/refinanced at maturity
    } else if (isIO) {
      principal = 0
    } else {
      principal = Math.max(0, monthlyPmt - interest)
      if (balloon > 0) principal = Math.min(principal, Math.max(0, bal - balloon))
    }
    bal = Math.max(0, bal - principal)
    const isPast = date <= today
    history.push({
      date: `${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`,
      balance: Math.round(bal),
      interest,
      repayment: monthlyPmt,
      isPast,
      isBalloonClear: isLastMonth && balloon > 0,
    })
  }
  return history
}
