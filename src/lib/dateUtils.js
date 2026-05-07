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
  const n = (loan.term || 30) * 12
  if (!n) return null
  return Math.round((bal * rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1))
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
  const qtrs = []
  for (let i = 0; i < commData.length; i += 3) {
    const slice = commData.slice(i, i+3)
    if (!slice.length) break
    qtrs.push({
      label: `Q${Math.floor(i/3)+1}`,
      months: slice.map(m=>m.month).join('–'),
      trail: slice.reduce((s,m)=>s+m.trail,0),
      upfront: slice.reduce((s,m)=>s+m.upfront,0),
      total: slice.reduce((s,m)=>s+m.total,0),
    })
  }
  return qtrs
}

// Build balance history from settlement date
export function buildBalanceHistory(loan) {
  if (!loan.settled || !loan.amount) return []
  const start = new Date(loan.settled)
  const rate = (loan.rate || 0) / 100 / 12
  const isIO = loan.rpmt === 'IO'
  const n = (loan.term || 30) * 12
  const monthlyPmt = (!rate || isIO)
    ? (rate ? Math.round(loan.amount * rate) : 0)
    : Math.round((loan.amount * rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1))

  const today = new Date()
  const history = []
  let bal = loan.amount

  // From settlement to today (history) then 24 months forward (projection)
  const totalMonths = Math.floor((today - start) / (30.44 * 86400000)) + 24

  for (let m = 0; m <= totalMonths; m++) {
    const date = new Date(start)
    date.setMonth(date.getMonth() + m)
    const interest = rate ? Math.round(bal * rate) : 0
    const principal = isIO ? 0 : Math.max(0, monthlyPmt - interest)
    bal = Math.max(0, bal - principal)
    const isPast = date <= today
    history.push({
      date: `${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`,
      balance: Math.round(bal),
      interest,
      repayment: monthlyPmt,
      isPast,
    })
  }
  return history
}
