import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { totalBal, fmt } from '../lib/data'
import { fmtDate, rollingYTD, quarterlyIncome, expiryBadge, daysUntil } from '../lib/dateUtils'
import { Panel, PanelTitle, DayBadge } from '../components/UI'
import CommissionImport from './CommissionImport'

const COMMISSION = [
  { month:'Mar 25', trail:4509.09,  upfront:18295.28, total:22804.37, balance:29164475 },
  { month:'Apr 25', trail:4541.24,  upfront:9223.03,  total:13764.27, balance:30452525 },
  { month:'May 25', trail:4766.64,  upfront:5999.51,  total:10766.15, balance:31257259 },
  { month:'Jun 25', trail:4769.86,  upfront:15911.98, total:20681.84, balance:33048895 },
  { month:'Jul 25', trail:5059.35,  upfront:0,        total:5059.35,  balance:32726637 },
  { month:'Aug 25', trail:4986.57,  upfront:5777.73,  total:10764.30, balance:32411979 },
  { month:'Sep 25', trail:4998.56,  upfront:31299.46, total:36298.01, balance:36480528 },
  { month:'Oct 25', trail:5401.37,  upfront:4402.19,  total:9803.56,  balance:35568550 },
  { month:'Nov 25', trail:5005.50,  upfront:14214.92, total:19220.42, balance:35226679 },
  { month:'Dec 25', trail:5421.49,  upfront:4673.18,  total:10094.67, balance:34376508 },
  { month:'Jan 26', trail:5639.74,  upfront:0,        total:135.92,   balance:34582950 },
  { month:'Feb 26', trail:5054.41,  upfront:9212.09,  total:14266.50, balance:34734174 },
  { month:'Mar 26', trail:5616.36,  upfront:13322.25, total:18938.61, balance:41224085 },
]

// ─── Panel A: Annual Reviews ──────────────────────────────────────────────────
// Uses c.days which is "Days Past Review" — clients sorted most overdue first
// One row per client (their first active loan), threshold ≥ 365d, max 10
function buildAnnualRows(clients) {
  return clients
    .filter(c => c.days >= 365 && c.loans.filter(l => !l.closed).length > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 10)
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
  clients.forEach(c => {
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
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 10)
}

// ─── Panel C: IO Term Review ──────────────────────────────────────────────────
// Loans with IO expiry date. Sort by expiry ascending. Max 10.
function buildIORows(clients) {
  const rows = []
  clients.forEach(c => {
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
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 10)
}

// ─── Panel D: Maturing Facilities ─────────────────────────────────────────────
// ALL loan types — picks up maturity date within next 10 years
// Covers Asset Finance, Commercial, Home Loans maturing. Max 10.
// Excludes very long-term maturities (>10 years away) — those aren't actionable
function buildMaturingRows(clients) {
  const rows = []
  const now = new Date()
  const cutoff = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate())
  clients.forEach(c => {
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
  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 10)
}

function BarChart({ data, keys, colors, title, formatY }) {
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
          return <g key={i}>
            {keys.map((k, ki) => {
              const val = d[k] || 0, bh = (val / maxVal) * h; yOff -= bh
              return <rect key={ki} x={x} y={yOff} width={barW} height={bh} fill={colors[ki]} rx={1.5}><title>{`${d.month}: $${val.toLocaleString()}`}</title></rect>
            })}
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">{d.month}</text>
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

function PieChart({ pw, comm }) {
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
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Portfolio Split</div>
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
  // Ticked rows stored as Set of unique keys: `${panelKey}-${conn}-${acc}`
  const [tickedKeys, setTickedKeys] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rion-radar-ticked') || '[]')) } catch { return new Set() }
  })

  const latest = COMMISSION[COMMISSION.length - 1]
  const allLoans = clients.flatMap(c => c.loans)
  const pwTotal = clients.filter(c => c.stream === 'Private Wealth').flatMap(c => c.loans).reduce((s, l) => s + (l.balance || 0), 0)
  const commTotal = clients.filter(c => c.stream === 'Commercial').flatMap(c => c.loans).reduce((s, l) => s + (l.balance || 0), 0)
  const overdue = clients.filter(c => c.days >= 365).length
  const triggers = clients.filter(c => c.loans.some(l => l.io || l.fixed || l.balloon)).length
  const rolling12 = rollingYTD(COMMISSION)
  const quarters = quarterlyIncome(COMMISSION)

  const pwRatio = pwTotal / (pwTotal + commTotal || 1)
  const balData = COMMISSION.map(d => ({
    month: d.month,
    private: Math.round(d.balance * pwRatio),
    commercial: Math.round(d.balance * (1 - pwRatio)),
  }))

  // Build all rows
  const annualRows = buildAnnualRows(clients)
  const fixedRows = buildFixedRows(clients)
  const ioRows = buildIORows(clients)
  const maturingRows = buildMaturingRows(clients)

  // Filter out ticked rows
  function filterRows(rows, panelKey) {
    return rows.filter(r => !tickedKeys.has(`${panelKey}-${r.conn}-${r.acc}`))
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
      const noteText = '\u2713 ' + panelLabel + ' actioned \u2014 ' + dateStr
      const updated = clients.map(c => {
        if (c.name !== row.conn) return c
        // Match the specific loan: acc match preferred, then lname, then first active loan
        const hasAcc = row.acc && row.acc !== '\u2014'
        const accMatchExists = hasAcc && c.loans.some(l => l.acc === row.acc)
        return {
          ...c,
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
      })
      onUpdateClients(updated)
    }
    // Mark as ticked (persisted)
    const key = rowKey(panelKey, row)
    setTickedKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      try { localStorage.setItem('rion-radar-ticked', JSON.stringify([...next])) } catch {}
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
          <BarChart data={balData} keys={['private', 'commercial']} colors={['#3D5570', '#EB99C2']} title="Portfolio Balances" formatY={v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : `$${Math.round(v / 1000)}k`} />
        </Panel>
        <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 6px' }}>
          <PieChart pw={pwTotal} comm={commTotal} />
        </Panel>
        <Panel style={{ display: 'flex', flexDirection: 'column' }}>
          <BarChart data={COMMISSION} keys={['trail', 'upfront']} colors={['#3D5570', '#EB99C2']} title="Commission Income" formatY={v => `$${Math.round(v / 1000)}k`} />
        </Panel>
        <Panel style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Summary</div>
          {stat('Month', latest.month)}
          {stat('Connections', clients.length)}
          {stat('Accounts', allLoans.length)}
          {stat('Needs Attention', overdue, '#e8a020')}
          {stat('Active Triggers', triggers, 'var(--pk)')}
          <button onClick={() => setShowImport(true)} style={{ width: '100%', marginTop: 12, padding: '7px', borderRadius: 7, border: '1.5px solid var(--pk)', background: 'transparent', color: 'var(--pk)', fontWeight: 500, fontSize: 11, cursor: 'pointer' }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--pk)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pk)' }}>
            ↑ Import statement
          </button>
        </Panel>
      </div>

      {/* INCOME SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Panel>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Income — This Month</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Trail', val: `$${latest.trail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: 'Upfront', val: `$${latest.upfront.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: 'Total', val: `$${latest.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#27ae60' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: s.color || 'var(--text-primary)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Rolling 12-Month Income &amp; Quarterly Breakdown
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', gridColumn: '1/2' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>Rolling 12m</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#27ae60' }}>${Math.round(rolling12).toLocaleString()}</div>
            </div>
            {quarters.slice(-4).map((q, i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{q.label} ({q.months.split('–')[0]})</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>${Math.round(q.total).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>T: ${Math.round(q.trail / 1000)}k U: ${Math.round(q.upfront / 1000)}k</div>
              </div>
            ))}
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

      {showImport && <CommissionImport clients={clients} onImport={(u, m) => { onImport && onImport(u, m); setShowImport(false) }} onClose={() => setShowImport(false)} />}
    </div>
  )
}
