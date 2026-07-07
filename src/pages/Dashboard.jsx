import React, { useState, useEffect } from 'react'
import { totalBal, fmt } from '../lib/data'
import { fmtDate, rollingYTD, quarterlyIncome, expiryBadge, daysUntil } from '../lib/dateUtils'
import { Panel, PanelTitle, DayBadge } from '../components/UI'
import { sbSaveTicked, sbLoadTicked } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const COMMISSION = [
  { month:'Jun 22', trail:98.52, upfront:4018.98, total:4117.5, balance:1629518 },
  { month:'Jul 22', trail:268.2, upfront:6200.66, total:6468.86, balance:2802203 },
  { month:'Aug 22', trail:297.82, upfront:7378.8, total:7676.62, balance:4024690 },
  { month:'Sep 22', trail:683.12, upfront:19422.26, total:20105.38, balance:8324568 },
  { month:'Oct 22', trail:803.66, upfront:2649.53, total:3453.19, balance:6232974 },
  { month:'Nov 22', trail:810.2, upfront:4660.19, total:5470.39, balance:7122607 },
  { month:'Dec 22', trail:1000.15, upfront:2791.36, total:3791.51, balance:7400757 },
  { month:'Jan 23', trail:1062.85, upfront:4204.95, total:5267.8, balance:8217729 },
  { month:'Feb 23', trail:1114.4, upfront:6304.18, total:7418.58, balance:9379168 },
  { month:'Mar 23', trail:1222.99, upfront:5341.7, total:6564.69, balance:9913429 },
  { month:'Apr 23', trail:1407.3, upfront:9316.12, total:10723.42, balance:12035499 },
  { month:'May 23', trail:1645.47, upfront:7821.96, total:9467.43, balance:13887158 },
  { month:'Jun 23', trail:1794.69, upfront:14210.21, total:16004.9, balance:15444316 },
  { month:'Jul 23', trail:2036.03, upfront:17320.23, total:19356.26, balance:18638688 },
  { month:'Aug 23', trail:2280.4, upfront:2129.11, total:4409.51, balance:16884658 },
  { month:'Sep 23', trail:2232.79, upfront:0.0, total:2232.79, balance:16390236 },
  { month:'Oct 23', trail:2293.11, upfront:11337.94, total:13631.05, balance:16832238 },
  { month:'Nov 23', trail:2465.3, upfront:6005.63, total:8470.93, balance:19232658 },
  { month:'Dec 23', trail:2635.28, upfront:5532.03, total:8167.31, balance:19786368 },
  { month:'Jan 24', trail:2659.84, upfront:10903.58, total:13563.42, balance:19043645 },
  { month:'Feb 24', trail:2721.64, upfront:5809.92, total:8531.56, balance:22251788 },
  { month:'Mar 24', trail:3041.7, upfront:4309.02, total:7350.72, balance:22591038 },
  { month:'Apr 24', trail:3015.09, upfront:5402.89, total:8417.98, balance:22454482 },
  { month:'May 24', trail:3174.91, upfront:1354.43, total:4529.34, balance:22868285 },
  { month:'Jun 24', trail:3133.8, upfront:5236.02, total:8369.82, balance:24335446 },
  { month:'Jul 24', trail:3421.93, upfront:8753.47, total:12175.4, balance:25180407 },
  { month:'Aug 24', trail:3396.48, upfront:17589.0, total:20985.48, balance:28962959 },
  { month:'Sep 24', trail:4113.04, upfront:4754.95, total:8867.99, balance:33028507 },
  { month:'Oct 24', trail:4173.99, upfront:3675.68, total:7849.67, balance:27801096 },
  { month:'Nov 24', trail:4027.16, upfront:2726.92, total:6754.08, balance:28156235 },
  { month:'Dec 24', trail:4317.59, upfront:5319.6, total:9637.19, balance:28259620 },
  { month:'Jan 25', trail:4283.19, upfront:8443.57, total:12726.76, balance:28249881 },
  { month:'Feb 25', trail:4012.24, upfront:4238.08, total:8250.32, balance:29404971 },
  { month:'Mar 25', trail:4509.09, upfront:18295.28, total:22804.37, balance:31624809 },
  { month:'Apr 25', trail:4541.24, upfront:9223.03, total:13764.27, balance:31988964 },
  { month:'May 25', trail:4766.64, upfront:5999.51, total:10766.15, balance:32080635 },
  { month:'Jun 25', trail:4769.86, upfront:15911.98, total:20681.84, balance:35033975 },
  { month:'Jul 25', trail:5059.35, upfront:0.0, total:5059.35, balance:32860815 },
  { month:'Aug 25', trail:4986.57, upfront:5777.73, total:10764.3, balance:33227588 },
  { month:'Sep 25', trail:4998.56, upfront:31299.46, total:36298.02, balance:40827196 },
  { month:'Oct 25', trail:5401.37, upfront:3970.01, total:9371.38, balance:35835899 },
  { month:'Nov 25', trail:5005.5, upfront:14214.92, total:19220.42, balance:37573995 },
  { month:'Dec 25', trail:5421.49, upfront:4673.18, total:10094.67, balance:36072298 },
  { month:'Jan 26', trail:5639.74, upfront:-5503.82, total:135.92, balance:34869016 },
  { month:'Feb 26', trail:5054.41, upfront:9212.09, total:14266.5, balance:35276533 },
  { month:'Mar 26', trail:5616.36, upfront:13322.25, total:18938.61, balance:47054962 },
]

// Compute real commission from imported client data — supplements hardcoded COMMISSION array
function computeImportedCommission(clients) {
  const monthMap = {}
  ;(clients || []).forEach(c => {
    ;(c.loans || []).forEach(l => {
      ;(l.commissionHistory || []).forEach(h => {
        if (!monthMap[h.month]) monthMap[h.month] = { trail: 0, upfront: 0, total: 0 }
        monthMap[h.month].trail   += h.trailComm   || 0
        monthMap[h.month].upfront += h.upfrontComm || 0
        monthMap[h.month].total   += h.totalPaid   || 0
      })
    })
  })
  return monthMap
}

// Compute portfolio balance per month from client balance history
function computeBalanceByMonth(clients) {
  const balMap = {}
  ;(clients || []).filter(c => !c._demo).forEach(c => {
    ;(c.loans || []).forEach(l => {
      ;(l.balanceHistory || []).forEach(h => {
        if (!balMap[h.month]) balMap[h.month] = 0
        balMap[h.month] += (h.balance || 0)
      })
    })
  })
  return balMap
}

// Merge hardcoded + real imported data — real data wins where available
function mergeCommission(clients) {
  const real = computeImportedCommission(clients)
  const balByMonth = computeBalanceByMonth(clients)
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Convert real map to COMMISSION format
  const realMonths = Object.entries(real).map(([k, v]) => {
    const [y, m] = k.split('-')
    return { month: `${MO[parseInt(m)-1]} ${y.slice(2)}`, _key: k, trail: v.trail, upfront: v.upfront, total: v.total, balance: Math.round(balByMonth[k] || 0) }
  }).sort((a, b) => a._key.localeCompare(b._key))

  // Start with hardcoded, then append any real months not already present
  const existing = new Set(COMMISSION.map(c => c.month))
  const extras = realMonths.filter(m => !existing.has(m.month))
  return [...COMMISSION, ...extras]
}

// ─── Panel A: Annual Reviews ──────────────────────────────────────────────────
// Uses c.days which is "Days Past Review" — clients sorted most overdue first
// One row per client (their first active loan), threshold ≥ 365d, max 10
function buildAnnualRows(clients) {
  return clients
    .filter(c => !c._demo && c.days >= 365 && c.loans.filter(l => !l.closed).length > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 30)
    .map(c => {
      const loan = c.loans.find(l => !l.closed) || c.loans[0]
      return {
        conn: c.name,
        client: loan.lname || c.name,
        acc: loan.acc || '—',
        balance: loan.balance || 0,
        days: c.days,
        score: c.score || 0,
      }
    })
}

// ─── Panel B: Fixed Term Expiries ─────────────────────────────────────────────
// Fixed rate loans only — no maturities. Sort by expiry date ascending. Max 10.
function buildFixedRows(clients) {
  const rows = []
  clients.filter(c => !c._demo).forEach(c => {
    c.loans.filter(l => !l.closed && l.fixed && l.fixed.trim()).forEach(l => {
      rows.push({
        conn: c.name,
        client: l.lname || c.name,
        acc: l.acc || '—',
        balance: l.balance || 0,
        days: c.days || 0,
        score: c.score || 0,
        expiryDate: l.fixed,
      })
    })
  })
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 30)
}

// ─── Panel C: IO Term Review ──────────────────────────────────────────────────
// Loans with IO expiry date. Sort by expiry ascending. Max 10.
function buildIORows(clients) {
  const rows = []
  clients.filter(c => !c._demo).forEach(c => {
    c.loans.filter(l => !l.closed && l.io && l.io.trim()).forEach(l => {
      rows.push({
        conn: c.name,
        client: l.lname || c.name,
        acc: l.acc || '—',
        balance: l.balance || 0,
        days: c.days || 0,
        score: c.score || 0,
        expiryDate: l.io,
      })
    })
  })
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 30)
}

// ─── Panel D: Maturing Facilities ─────────────────────────────────────────────
// ALL loan types — picks up maturity date within next 10 years
// Covers Asset Finance, Commercial, Home Loans maturing. Max 10.
// Excludes very long-term maturities (>10 years away) — those aren't actionable
function buildMaturingRows(clients) {
  const rows = []
  const now = new Date()
  const cutoff = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate())
  clients.filter(c => !c._demo).forEach(c => {
    c.loans.filter(l => {
      if (l.closed) return false
      if (!l.maturity || !l.maturity.trim()) return false
      const d = new Date(l.maturity)
      if (isNaN(d)) return false
      // Only show loans maturing within 10 years (actionable horizon)
      return d <= cutoff
    }).forEach(l => {
      rows.push({
        conn: c.name,
        client: l.lname || c.name,
        acc: l.acc || '—',
        loanType: l.type || '',
        balance: l.balance || 0,
        days: c.days || 0,
        score: c.score || 0,
        expiryDate: l.maturity,
      })
    })
  })
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 30)
}

function BarChart({ data, keys, colors, title, formatY, onBarHover, onBarLeave, hoveredIdx }) {
  const maxVal = Math.max(...data.map(d => keys.reduce((s, k) => s + (d[k] || 0), 0))) * 1.1 || 1
  const h = 120, barW = Math.max(12, Math.floor(420 / data.length) - 3)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 6 }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${data.length * (barW + 3) + 42} ${h + 34}`} style={{ overflow: 'visible', display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line x1={38} x2={data.length * (barW + 3) + 38} y1={h - p * h} y2={h - p * h} stroke="var(--border-light)" strokeWidth={0.5} />
            <text x={34} y={h - p * h + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">{formatY ? formatY(maxVal * p) : Math.round(maxVal * p / 1000) + 'k'}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = 40 + i * (barW + 3); let yOff = h
          const isHovered = onBarHover && hoveredIdx === i
          return <g key={i}>
            {keys.map((k, ki) => {
              const val = Math.max(0, d[k] || 0), bh = maxVal > 0 ? (val / maxVal) * h : 0; yOff -= bh
              return <rect key={ki} x={x} y={yOff} width={barW} height={bh} fill={colors[ki]} rx={1.5} opacity={isHovered ? 1 : (onBarHover && hoveredIdx != null ? 0.45 : 1)}><title>{`${d.month}: $${val.toLocaleString()}`}</title></rect>
            })}
            {onBarHover && (
              <rect x={x} y={0} width={barW} height={h} fill="transparent" style={{ cursor:'pointer' }}
                onMouseEnter={()=>onBarHover(i)} onMouseLeave={()=>onBarLeave && onBarLeave()} />
            )}
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize={8} fontWeight={isHovered?700:400} fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}>{d.month}</text>
          </g>
        })}
      </svg>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 2 }}>
        {keys.map((k, i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
            {k === 'trail' ? 'Trail' : k === 'upfront' ? 'Upfront' : k === 'private' ? 'Private Wealth' : 'Commercial'}
          </div>
        ))}
      </div>
    </div>
  )
}

function PieChart({ pw, comm, label }) {
  const total = pw + comm
  if (!total) return null
  const pwAngle = (pw / total) * 360
  const r = 70, cx = 90, cy = 80
  function polarToXY(deg, radius) {
    const rad = (deg - 90) * Math.PI / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }
  function arc(startDeg, endDeg, color) {
    const start = polarToXY(startDeg, r)
    const end = polarToXY(endDeg, r)
    const large = (endDeg - startDeg) > 180 ? 1 : 0
    return <path d={`M${cx},${cy} L${start.x},${start.y} A${r},${r} 0 ${large},1 ${end.x},${end.y} Z`} fill={color} />
  }
  const mid1 = polarToXY(pwAngle / 2 - 90 + 90, r * 0.6)
  const mid2 = polarToXY(pwAngle + (360 - pwAngle) / 2 - 90 + 90, r * 0.6)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: label ? 0 : 8 }}>Portfolio Split</div>
      {label && <div style={{ fontSize: 9, color: 'var(--pk)', fontWeight: 600, marginBottom: 6 }}>{label}</div>}
      <svg width={180} height={160} viewBox="0 0 180 160">
        {arc(0, pwAngle, '#EB99C2')}
        {arc(pwAngle, 360, '#2A3D54')}
        <text x={mid1.x} y={mid1.y} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={500}>{`$${(pw / 1e6).toFixed(1)}m`}</text>
        <text x={mid2.x} y={mid2.y} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={500}>{`$${(comm / 1e6).toFixed(1)}m`}</text>
      </svg>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', fontSize: 10, color: 'var(--text-secondary)', marginTop: -8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#EB99C2' }} /> Private Wealth</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#2A3D54' }} /> Commercial</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginTop: 6 }}>Total: ${(total / 1e6).toFixed(1)}m</div>
    </div>
  )
}

// ─── Confirmation Modal ────────────────────────────────────────────────────────
function ConfirmModal({ row, panelLabel, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 32px', maxWidth: 420, width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)'
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a2535', marginBottom: 8 }}>
          Mark as actioned?
        </div>
        <div style={{ fontSize: 13, color: '#4a5568', lineHeight: 1.6, marginBottom: 20 }}>
          <strong>{row.conn}</strong> — {row.client}<br />
          <span style={{ fontSize: 11, color: '#718096' }}>{panelLabel}</span>
        </div>
        <div style={{
          background: '#f0f7ff', border: '1px solid #c3dafe', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#3b5a9a', marginBottom: 20, lineHeight: 1.5
        }}>
          ✓ This will be logged on the client's loan account with today's date and removed from the dashboard.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e0',
            background: '#fff', color: '#4a5568', fontSize: 13, cursor: 'pointer', fontWeight: 500
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: 'var(--pk)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600
          }}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ─── Radar Table ──────────────────────────────────────────────────────────────
function RadarTable({ title, panelKey, rows, navigate, onTick, showExpiry, showLoanType }) {
  const [pending, setPending] = useState(null) // {rowIdx, row}

  const th = { padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap', background: '#f8fafc' }
  const td = (extra = {}) => ({ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', verticalAlign: 'middle', fontSize: 11, ...extra })

  const baseCols = showExpiry
    ? ['Connection', 'Client', 'Account No.', 'Balance', showLoanType ? 'Type' : null, 'Expiry date', 'Days to expiry', 'Opp. Score'].filter(Boolean)
    : ['Connection', 'Client', 'Account No.', 'Balance', 'Days Since Review', 'Opp. Score']

  function handleCheckbox(idx, row) {
    setPending({ rowIdx: idx, row })
  }

  function handleConfirm() {
    if (pending) {
      onTick(pending.rowIdx, pending.row)
      setPending(null)
    }
  }

  return (
    <>
      {pending && (
        <ConfirmModal
          row={pending.row}
          panelLabel={title}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
      <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div style={{ background: '#3D5570', padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{title}</span>
          <span style={{ opacity: 0.6, fontWeight: 400 }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>
              <th style={{ ...th, width: 32, textAlign: 'center' }}>✓</th>
              {baseCols.map(h => (
                <th key={h} style={{ ...th, textAlign: ['Balance', 'Days Since Review', 'Days to expiry', 'Opp. Score'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.length > 0 ? rows.map((r, i) => (
                <tr key={i}
                  onMouseOver={e => e.currentTarget.style.background = '#fdf0f6'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={td({ textAlign: 'center' })}>
                    <input type="checkbox"
                      onChange={() => handleCheckbox(i, r)}
                      style={{ cursor: 'pointer', accentColor: 'var(--pk)', width: 14, height: 14 }} />
                  </td>
                  <td style={td({ fontWeight: 500, color: 'var(--pk)', cursor: 'pointer' })}
                    onClick={() => { navigate(`/radar/clients/${encodeURIComponent(r.conn)}`); window.scrollTo(0, 0) }}>
                    {r.conn}
                  </td>
                  <td style={{ ...td(), maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.client}</td>
                  <td style={{ ...td(), fontFamily: 'DM Mono,monospace', fontSize: 10, color: 'var(--text-secondary)' }}>{r.acc}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 500 })}>{fmt(r.balance)}</td>
                  {showLoanType && showExpiry && (
                    <td style={td({ fontSize: 10, color: 'var(--text-secondary)' })}>{r.loanType || '—'}</td>
                  )}
                  {showExpiry ? (
                    <>
                      <td style={td()}>{fmtDate(r.expiryDate)}</td>
                      <td style={td({ textAlign: 'right' })}>
                        {r.expiryDate ? (() => {
                          const b = expiryBadge(r.expiryDate)
                          return b ? <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: b.bg, color: b.color }}>{b.label}</span> : '—'
                        })() : '—'}
                      </td>
                    </>
                  ) : (
                    <td style={{ ...td(), textAlign: 'right' }}><DayBadge days={r.days} /></td>
                  )}
                  <td style={td({ textAlign: 'right' })}>
                    {r.score > 0 ? <span style={{ background: '#fdf0f6', color: 'var(--pk)', padding: '2px 7px', borderRadius: 20, fontSize: 9, fontWeight: 500 }}>{r.score}</span> : '—'}
                  </td>
                </tr>
              )) : <tr><td colSpan={10} style={td({ textAlign: 'center', color: 'var(--text-tertiary)', padding: 14 })}>No items</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard({ clients, onImport, onUpdateClients }) {
  const navigate = useNavigate()
  const [showImport, setShowImport] = useState(false)
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState(null)
  const hasPendingImport = !!localStorage.getItem('rion-pending-import')
  // Ticked rows stored as Set of unique keys: `${panelKey}-${conn}-${acc}`
  const [tickedKeys, setTickedKeys] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rion-radar-ticked') || '[]')) } catch { return new Set() }
  })

  // Sync ticked items from Supabase on load
  useEffect(() => {
    sbLoadTicked().then(cloud => {
      if (cloud && Array.isArray(cloud) && cloud.length > 0) {
        const merged = new Set([...tickedKeys, ...cloud])
        setTickedKeys(merged)
        try { localStorage.setItem('rion-radar-ticked', JSON.stringify([...merged])) } catch {}
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const COMM = mergeCommission(clients)
  const latest = COMM[COMM.length - 1]
  const allLoans = clients.flatMap(c => c.loans)
  const pwTotal = clients.filter(c => c.stream === 'Private Wealth' && !c._demo).flatMap(c => c.loans).reduce((s, l) => s + (l.balance || 0), 0)
  const commTotal = clients.filter(c => c.stream === 'Commercial' && !c._demo).flatMap(c => c.loans).reduce((s, l) => s + (l.balance || 0), 0)
  const overdue = clients.filter(c => !c._demo && c.days >= 365).length
  const triggers = clients.filter(c => !c._demo && c.loans.some(l => l.io || l.fixed || l.balloon)).length
  const rolling12 = rollingYTD(COMM)
  const quarters = quarterlyIncome(COMM)

  const pwRatio = pwTotal / (pwTotal + commTotal || 1)
  const last12 = COMM.slice(-12)
  const balData = last12.map(d => ({
    month: d.month,
    private: Math.round(d.balance * pwRatio),
    commercial: Math.round(d.balance * (1 - pwRatio)),
  }))

  // Build all rows
  const annualRows = buildAnnualRows(clients)
  const fixedRows = buildFixedRows(clients)
  const ioRows = buildIORows(clients)
  const maturingRows = buildMaturingRows(clients)

  // Filter out ticked rows, then cap at 10 so panel always shows up to 10 active items
  function filterRows(rows, panelKey) {
    return rows.filter(r => !tickedKeys.has(`${panelKey}-${r.conn}-${r.acc}`)).slice(0, 10)
  }

  function rowKey(panelKey, row) {
    return `${panelKey}-${row.conn}-${row.acc}`
  }

  // Handle tick: confirm modal → write action note to client loan → remove from dashboard
  function handleTick(panelKey, panelLabel, idx, row) {
    // Write action note to the client's loan record
    if (onUpdateClients) {
      const today = new Date()
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const dateStr = String(today.getDate()).padStart(2,'0') + '-' + MONTHS[today.getMonth()] + '-' + today.getFullYear()
      const todayISO = today.toISOString().slice(0, 10)
      const noteText = '\u2713 ' + panelLabel + ' actioned \u2014 ' + dateStr
      const updated = clients.map(c => {
        if (c.name !== row.conn) return c
        // Match the specific loan: acc match preferred, then lname, then first active loan
        const hasAcc = row.acc && row.acc !== '\u2014'
        const accMatchExists = hasAcc && c.loans.some(l => l.acc === row.acc)
        const updatedClient = {
          ...c,
          // If this is an Annual Review action, update the client's lastReviewDate to today
          ...(panelKey === 'A' ? { lastReviewDate: todayISO, days: 0 } : {}),
          loans: c.loans.map((l, li) => {
            let isMatch = false
            if (accMatchExists) {
              isMatch = l.acc === row.acc
            } else if (l.lname === row.client) {
              isMatch = true
            } else {
              // Final fallback: first non-closed loan for this client
              const firstActive = c.loans.findIndex(x => !x.closed)
              isMatch = li === firstActive
            }
            if (!isMatch) return l
            return { ...l, actionNotes: [...(l.actionNotes || []), noteText] }
          })
        }
        return updatedClient
      })
      onUpdateClients(updated)
    }
    // Mark as ticked (persisted)
    const key = rowKey(panelKey, row)
    setTickedKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      try { localStorage.setItem('rion-radar-ticked', JSON.stringify([...next])) } catch {}
      sbSaveTicked([...next]).catch(() => {})
      return next
    })
  }

  const stat = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid var(--border-light)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ padding: '16px 24px' }}>

      {/* TOP ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 1fr 200px', gap: 14, marginBottom: 14, alignItems: 'start' }}>
        <Panel style={{ display: 'flex', flexDirection: 'column' }}>
          <BarChart data={balData} keys={['private', 'commercial']} colors={['#EB99C2', '#3D5570']} title="Portfolio Balances" formatY={v => v >= 1e6 ? `$${Math.round(v / 5e6) * 5}m` : `$${Math.round(v / 5000) * 5}k`} onBarHover={setHoveredMonthIdx} onBarLeave={()=>setHoveredMonthIdx(null)} hoveredIdx={hoveredMonthIdx} />
        </Panel>
        <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 6px' }}>
          {(() => {
            const idx = hoveredMonthIdx != null ? hoveredMonthIdx : balData.length - 1
            const point = balData[idx]
            if (point) return <PieChart pw={point.private} comm={point.commercial} label={hoveredMonthIdx != null ? point.month : null} />
            const latestBal = last12[last12.length - 1]?.balance || (pwTotal + commTotal)
            const ratio = pwTotal / (pwTotal + commTotal || 1)
            return <PieChart pw={Math.round(latestBal * ratio)} comm={Math.round(latestBal * (1 - ratio))} />
          })()}
        </Panel>
        <Panel style={{ display: 'flex', flexDirection: 'column' }}>
          <BarChart data={last12} keys={['trail', 'upfront']} colors={['#3D5570', '#EB99C2']} title="Commission Income" formatY={v => `$${Math.round(v / 1000)}k`} />
        </Panel>
        <Panel style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Summary</div>
          {stat('Month', latest.month)}
          {stat('Connections', clients.length)}
          {stat('Accounts', allLoans.length)}
          {stat('Needs Attention', overdue, '#e8a020')}
          {stat('Active Triggers', triggers, 'var(--pk)')}
          <button onClick={() => navigate('/radar/import')} style={{ width: '100%', marginTop: 12, padding: '7px', borderRadius: 7, border: '1.5px solid var(--pk)', background: 'transparent', color: 'var(--pk)', fontWeight: 500, fontSize: 11, cursor: 'pointer' }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--pk)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pk)' }}>
            {hasPendingImport ? '⚠ Resume import' : '↑ Import statement'}
          </button>
        </Panel>
      </div>

      {/* INCOME SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 16 }}>

        {/* LEFT — Rolling 3 months */}
        <Panel>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Income — Last 3 Months</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {COMM.slice(-3).map((m, i) => {
              const isClawback = m.upfront < 0
              // Find same month prior year (12 positions back from this month's position in COMM)
              const thisIdx = COMM.length - 3 + i
              const priorIdx = thisIdx - 12
              const prior = priorIdx >= 0 ? COMM[priorIdx] : null
              const pct = prior && prior.total > 0 ? Math.round((m.total - prior.total) / prior.total * 100) : null
              return (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500 }}>{m.month}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isClawback ? 'var(--pk)' : i === 2 ? '#27ae60' : 'var(--text-primary)' }}>
                    ${Math.round(m.total).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>T: ${Math.round(m.trail).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: isClawback ? 'var(--pk)' : 'var(--text-tertiary)', marginTop: 1 }}>U: ${Math.round(m.upfront).toLocaleString()}</div>
                  {isClawback && <div style={{ fontSize: 9, color: 'var(--pk)', marginTop: 3, fontWeight: 500 }}>Clawback</div>}
                  {prior && (
                    <div style={{ marginTop: 5, paddingTop: 5, borderTop: '0.5px solid var(--border-light)' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{prior.month}: ${Math.round(prior.total).toLocaleString()}</div>
                      {pct !== null && (
                        <div style={{ fontSize: 9, fontWeight: 600, color: pct >= 0 ? '#27ae60' : '#c0392b', marginTop: 1 }}>
                          {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs prior yr
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>3-month total</span>
              {(() => {
                const prior3 = COMM.slice(-15, -12)
                if (prior3.length === 3) {
                  const priorTotal = prior3.reduce((s, m) => s + m.total, 0)
                  const currTotal = COMM.slice(-3).reduce((s, m) => s + m.total, 0)
                  const pct = priorTotal > 0 ? Math.round((currTotal - priorTotal) / priorTotal * 100) : null
                  return pct !== null ? (
                    <span style={{ fontSize: 9, fontWeight: 600, color: pct >= 0 ? '#27ae60' : '#c0392b', marginLeft: 8 }}>
                      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs prior yr
                    </span>
                  ) : null
                }
                return null
              })()}
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              ${COMM.slice(-3).reduce((s, m) => s + m.total, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </Panel>

        {/* RIGHT — Rolling 12m + quarterly with prior year comparison */}
        <Panel>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Rolling 12-Month Income &amp; Quarterly Breakdown
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'start' }}>

            {/* Rolling 12m with prior year */}
            {(() => {
              const prior12 = rollingYTD(COMM.slice(0, -12))
              const pct = prior12 > 0 ? Math.round((rolling12 - prior12) / prior12 * 100) : null
              return (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>Rolling 12m</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#27ae60' }}>${Math.round(rolling12).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    T: ${Math.round(COMM.slice(-12).reduce((s,m)=>s+m.trail,0)/1000)}k U: ${Math.round(COMM.slice(-12).reduce((s,m)=>s+m.upfront,0)/1000)}k
                  </div>
                  {pct !== null && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 20, fontWeight: 500, background: pct >= 0 ? '#eaf3de' : '#FCEBEB', color: pct >= 0 ? '#3B6D11' : '#A32D2D' }}>
                        {pct >= 0 ? '+' : ''}{pct}% vs prior yr
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-light)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>Prior 12m</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>${Math.round(prior12).toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      T: ${Math.round(COMM.slice(-24,-12).reduce((s,m)=>s+m.trail,0)/1000)}k U: ${Math.round(COMM.slice(-24,-12).reduce((s,m)=>s+m.upfront,0)/1000)}k
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Vertical divider */}
            <div style={{ width: 1, background: 'var(--border-light)', alignSelf: 'stretch', margin: '0 2px' }} />

            {/* Last 4 quarters with prior year same quarter */}
            {(() => {
              // Only show quarters with all 3 months present (complete quarters only)
              const completeQtrs = quarters.filter(q => q.months.length === 3)
              const currentQtrs = completeQtrs.slice(-4)
              const priorQtrs = completeQtrs.slice(-8, -4)
              return currentQtrs.map((q, i) => {
                const prior = priorQtrs[i]
                const pct = prior && prior.total > 0 ? Math.round((q.total - prior.total) / prior.total * 100) : null
                const hasClawback = q.upfront < 0
                return (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{q.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>${Math.round(q.total).toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>T: ${Math.round(q.trail / 1000)}k U: ${Math.round(q.upfront / 1000)}k</div>
                    {hasClawback && <div style={{ fontSize: 9, color: 'var(--pk)', marginTop: 2, fontWeight: 500 }}>Clawback</div>}
                    {pct !== null && (
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 20, fontWeight: 500, background: pct >= 0 ? '#eaf3de' : '#FCEBEB', color: pct >= 0 ? '#3B6D11' : '#A32D2D' }}>
                          {pct >= 0 ? '+' : ''}{pct}% vs prior yr
                        </span>
                      </div>
                    )}
                    {prior && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-light)' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{prior.label}</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>${Math.round(prior.total).toLocaleString()}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>T: ${Math.round(prior.trail / 1000)}k U: ${Math.round(prior.upfront / 1000)}k</div>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </Panel>
      </div>

      {/* OPPORTUNITY RADAR */}
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 14, background: 'var(--pk)', borderRadius: 2 }} />
        Opportunity Radar
      </div>

      {/* PANELS A & C */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <RadarTable
          title="Annual Reviews (A)"
          panelKey="A"
          rows={filterRows(annualRows, 'A')}
          navigate={navigate}
          onTick={(idx, row) => handleTick('A', 'Annual Review', idx, row)}
        />
        <RadarTable
          title="IO Term Review (C)"
          panelKey="C"
          rows={filterRows(ioRows, 'C')}
          navigate={navigate}
          onTick={(idx, row) => handleTick('C', 'IO Term Review', idx, row)}
          showExpiry
        />
      </div>

      {/* PANELS B & D */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <RadarTable
          title="Fixed Term Expiries (B)"
          panelKey="B"
          rows={filterRows(fixedRows, 'B')}
          navigate={navigate}
          onTick={(idx, row) => handleTick('B', 'Fixed Term Expiry', idx, row)}
          showExpiry
        />
        <RadarTable
          title="Maturing Facilities (D)"
          panelKey="D"
          rows={filterRows(maturingRows, 'D')}
          navigate={navigate}
          onTick={(idx, row) => handleTick('D', 'Maturing Facility', idx, row)}
          showExpiry
          showLoanType
        />
      </div>


    </div>
  )
}
