// Format date as DD-MM-YY
export function fmtDate(val) {
  if (!val) return '—'
  const s = String(val).trim()
  if (!s || s === 'nan' || s === '—') return '—'
  // Try parsing various formats
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const [dd,mm,yyyy] = s.split('-'); d = new Date(`${yyyy}-${mm}-${dd}`) }
  else if (/^\d{4}$/.test(s)) return s // just a year like "2027"
  else d = new Date(s)
  if (isNaN(d)) return s
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}-${mm}-${yy}`
}

// Returns 'overdue' | 'warn' | 'ok' | null
export function dateStatus(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '—' || /^\d{4}$/.test(s)) return null
  let d
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s)
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const [dd,mm,yyyy] = s.split('-'); d = new Date(`${yyyy}-${mm}-${dd}`) }
  else d = new Date(s)
  if (isNaN(d)) return null
  const now = new Date()
  const diffDays = Math.floor((d - now) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 120) return 'warn'
  return 'ok'
}

export function dateCellStyle(val) {
  const st = dateStatus(val)
  if (st === 'overdue') return { background: '#fde8e8', color: '#a32d2d', fontWeight: 500, borderRadius: 4, padding: '2px 5px' }
  if (st === 'warn') return { background: '#fef9c3', color: '#854F0B', fontWeight: 500, borderRadius: 4, padding: '2px 5px' }
  return {}
}
