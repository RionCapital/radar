// Format date as DD-Mmm-YY e.g. 01-Jan-26
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fmtDate(val) {
  if (!val) return '—'
  const s = String(val).trim()
  if (!s || s === 'nan' || s === '—') return '—'
  if (/^\d{4}$/.test(s)) return s
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const [dd,mm,yyyy] = s.split('-'); d = new Date(`${yyyy}-${mm}-${dd}`) }
  else d = new Date(s)
  if (isNaN(d)) return s
  const dd = String(d.getDate()).padStart(2,'0')
  const mmm = MONTHS[d.getMonth()]
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}-${mmm}-${yy}`
}

export function dateStatus(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '—' || /^\d{4}$/.test(s)) return null
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const [dd,mm,yyyy] = s.split('-'); d = new Date(`${yyyy}-${mm}-${dd}`) }
  else d = new Date(s)
  if (isNaN(d)) return null
  const diffDays = Math.floor((d - new Date()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 120) return 'warn'
  return 'ok'
}

export function dateCellStyle(val) {
  const st = dateStatus(val)
  if (st === 'overdue') return { background:'#fde8e8', color:'#a32d2d', fontWeight:500, borderRadius:4, padding:'2px 6px', display:'inline-block' }
  if (st === 'warn') return { background:'#fef9c3', color:'#854F0B', fontWeight:500, borderRadius:4, padding:'2px 6px', display:'inline-block' }
  return { display:'inline-block' }
}

// Flag indicator for a loan — returns worst status across fixed/io/balloon
export function loanFlag(loan) {
  const fields = [loan.fixed, loan.io, loan.balloon].filter(Boolean)
  if (!fields.length) return null
  const statuses = fields.map(dateStatus).filter(Boolean)
  if (statuses.includes('overdue')) return 'overdue'
  if (statuses.includes('warn')) return 'warn'
  return null
}

// Estimated monthly repayment
export function calcRepayment(loan) {
  if (loan.estRepayment) return loan.estRepayment // manual override
  const bal = loan.balance || 0
  const rate = (loan.rate || 0) / 100 / 12
  const rpmt = loan.rpmt || 'P&I'
  const ioExpired = loan.io && dateStatus(loan.io) === 'overdue'
  const effectiveRpmt = (rpmt === 'IO' && !ioExpired) ? 'IO' : 'P&I'
  if (!bal || !rate) return null
  if (effectiveRpmt === 'IO') return Math.round(bal * rate)
  const n = (loan.term || 30) * 12
  if (!n) return null
  return Math.round((bal * rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1))
}

// Auto-detect if IO has expired and switch to P&I
export function effectiveRpmt(loan) {
  if (loan.rpmt !== 'IO') return loan.rpmt
  if (loan.io && dateStatus(loan.io) === 'overdue') return 'P&I*' // auto-switched
  return 'IO'
}

// Rolling 12 months income
export function rollingYTD(commData) {
  return commData.slice(-12).reduce((s,m) => s + m.total, 0)
}

// Quarterly breakdown
export function quarterlyIncome(commData) {
  const qtrs = []
  for (let i = 0; i < commData.length; i += 3) {
    const slice = commData.slice(i, i+3)
    if (slice.length === 0) break
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
