import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle, EditBtn, SaveBtn, CancelBtn, FieldGroup, DateInput } from '../components/UI'
import {
  assetFinanceBalanceHistory, assetFinanceCurrentBalance, assetFinanceMonthlyRepayment,
  assetFinanceTotalMonthlyCost, progressDrawn, progressRemaining, mkProgressPayment,
  PROGRESS_PAYMENT_STATUSES, progressSupplierSummary,
} from '../lib/mafFacilities'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

export default function MafParcel({ clients, updateClient }) {
  const { name, loanIdx, parcelIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const fIdx = parseInt(loanIdx)
  const pIdx = parseInt(parcelIdx)

  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>
  const facility = client.loans[fIdx]
  if (!facility) return <div style={{ padding: 24 }}>Loan not found.</div>
  const parcel = (facility.parcels || [])[pIdx]
  if (!parcel) return <div style={{ padding: 24 }}>Parcel not found.</div>

  const backHref = `/radar/clients/${encodeURIComponent(client.name)}/loan/${fIdx}/maf`

  function updateParcel(patch) {
    updateClient(client.name, c => {
      const loans = [...c.loans]
      const fac = { ...loans[fIdx] }
      const parcels = [...fac.parcels]
      parcels[pIdx] = { ...parcels[pIdx], ...patch }
      fac.parcels = parcels
      loans[fIdx] = fac
      return { ...c, loans }
    })
  }

  function deleteParcel() {
    if (!window.confirm(`Delete this parcel? This can't be undone.`)) return
    updateClient(client.name, c => {
      const loans = [...c.loans]
      const fac = { ...loans[fIdx] }
      fac.parcels = fac.parcels.filter((_, i) => i !== pIdx)
      loans[fIdx] = fac
      return { ...c, loans }
    })
    navigate(backHref)
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #e8eaed', borderRadius: 5, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }
  const label = txt => <div style={{ fontSize: 10, color: '#7A8090', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>

  return (
    // No maxWidth/centering here — matches LoanAccount.jsx's full-width
    // wrapper so an Asset Finance parcel's page (and a Progress facility's)
    // uses the whole screen exactly like a normal loan account page does,
    // rather than sitting narrower in a centered column.
    <div style={{ padding: '16px 24px', fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => navigate(backHref)} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0 }}>
          ← Back to {facility.bank || 'MAF Facility'}
        </button>
        <button onClick={deleteParcel} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete parcel</button>
      </div>

      {parcel.kind === 'progress'
        ? <ProgressParcelView parcel={parcel} updateParcel={updateParcel} inputStyle={inputStyle} label={label} />
        : <AssetFinanceParcelView parcel={parcel} facility={facility} updateParcel={updateParcel} inputStyle={inputStyle} />}
    </div>
  )
}

// Styled to match the standalone Asset Finance loan account page
// (LoanAccount.jsx's isAssetFinance branch) as closely as possible — same
// navy header stat bar, particulars panel, balance chart and Asset Finance
// summary panel — so an Asset Finance parcel drawn under a MAF looks and
// behaves like "a normal loan page", just reached via the MAF's parcels
// list instead of the client's Loans table. Kept as its own component
// (rather than reusing LoanAccount directly) because a parcel is a nested
// record with its own save/delete path, not a top-level client.loans[]
// entry — but every calculation below uses the same lib/mafFacilities.js
// helpers LoanAccount.jsx itself uses for Asset Finance, so the numbers
// are guaranteed to match.
function AssetFinanceParcelView({ parcel, facility, updateParcel }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [tableView, setTableView] = useState('quarterly')

  const p = editing ? draft : parcel
  function startEdit() { setEditing(true); setDraft({ ...parcel }) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() { updateParcel(draft); setEditing(false); setDraft(null) }
  const set = (field, val) => setDraft(d => ({ ...d, [field]: val }))
  const inp = { width: '100%' }

  const todayY = new Date().getFullYear()
  function parseAfMonth(s) { const [mo, yr] = (s || '').split('/').map(Number); return new Date(yr || todayY, (mo || 1) - 1, 15) }

  const balance = assetFinanceCurrentBalance(parcel)
  const monthlyFee = Number(parcel.monthlyFee) || 0
  const monthlyRepayment = assetFinanceMonthlyRepayment(parcel)
  const totalMonthlyCost = assetFinanceTotalMonthlyCost(parcel)
  const history = useMemo(() => assetFinanceBalanceHistory(parcel), [parcel.amount, parcel.rate, parcel.rpmt, parcel.term, parcel.settled])
  const past = history.filter(h => h.isPast)
  const future = history.filter(h => !h.isPast)
  const futureInt = future.reduce((s, h) => s + h.interest, 0)

  const todayP = new Date(); todayP.setHours(0, 0, 0, 0)
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const todayLabel = `${MO[todayP.getMonth()]}-${String(todayP.getFullYear()).slice(2)}`

  // ── Balance chart — settlement through term end (+24mo), same math as
  // LoanAccount.jsx's Asset Finance chart.
  const chartStartD = parcel.settled ? new Date(parcel.settled) : todayP
  const chartEndD = history.length ? parseAfMonth(history[history.length - 1].date) : todayP
  const totalChartMs = Math.max(1, chartEndD - chartStartD)
  const gW = 560, gH = 175, gP = { l: 52, r: 10, t: 12, b: 28 }
  const gPW = gW - gP.l - gP.r, gPH = gH - gP.t - gP.b
  const dateToX = d => gP.l + (Math.max(0, d - chartStartD) / totalChartMs) * gPW
  const todayX = dateToX(todayP)
  const histEndX = todayX

  const stmtPts = past.map(h => ({ d: parseAfMonth(h.date), bal: h.balance })).sort((a, b) => a.d - b.d)
  const allLinePts = history.map(h => ({ d: parseAfMonth(h.date), bal: h.balance }))
  const maxChartBal = Math.max(Number(parcel.amount) || 0, ...allLinePts.map(pt => pt.bal), 1) * 1.06
  const toY = v => gP.t + gPH - (Math.max(0, v) / maxChartBal) * gPH

  const stmtPath = stmtPts.length > 0 ? stmtPts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${dateToX(pt.d).toFixed(1)},${toY(pt.bal).toFixed(1)}`).join(' ') : null
  const projLinePts = [{ d: todayP, bal: balance }, ...future.map(h => ({ d: parseAfMonth(h.date), bal: h.balance }))]
  const projPath = projLinePts.length > 1 ? projLinePts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${dateToX(pt.d).toFixed(1)},${toY(pt.bal).toFixed(1)}`).join(' ') : null

  const yGridVals = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxChartBal * f))
  const xLabels = []
  const startY = chartStartD.getFullYear(); const endY = chartEndD.getFullYear()
  for (let y = Math.ceil(startY / 2) * 2; y <= endY; y += 2) {
    const d = new Date(y, 0, 1)
    if (d > chartStartD && d < chartEndD) xLabels.push({ x: dateToX(d), label: y })
  }

  // ── Amortisation table
  const rowType = parcel.rpmt === 'IO' ? 'IO' : 'P&I'
  const tableHistRows = (tableView === 'monthly' ? past : past.filter((_, i) => i % 3 === 0 || i === past.length - 1)).map((h, i, arr) => {
    const d = parseAfMonth(h.date)
    const dLabel = `${MO[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
    const movement = i > 0 ? Math.max(0, Math.round(arr[i - 1].balance - h.balance)) : Math.max(0, Math.round((Number(parcel.amount) || h.balance) - h.balance))
    return { date: dLabel, balance: h.balance, movement, interest: h.interest, type: 'Estimated' }
  })
  const tableProjRows = (tableView === 'monthly' ? future : future.filter((_, i) => i % 3 === 0 || i === future.length - 1)).map(h => {
    const d = parseAfMonth(h.date)
    const dLabel = `${MO[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
    return { date: dLabel, balance: h.balance, movement: Math.max(0, Math.round((h.repayment || 0) - h.interest)), interest: h.interest, type: rowType }
  })

  const th = { padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td = (extra = {}) => ({ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', fontSize: 11, color: 'var(--text-primary)', verticalAlign: 'middle', ...extra })

  return (
    <div>
      {/* Header */}
      <div style={{ background: '#3D5570', borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginBottom: 4 }}>{parcel.assetDesc || 'Asset Finance parcel'}</div>
            <div style={{ fontSize: 11, color: 'var(--sbl)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#EB99C2', fontWeight: 500 }}>Asset Finance</span>
              <span>Under {facility.bank || 'MAF'} facility · {facility.lname || 'Master Asset Finance'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!editing ? <EditBtn onClick={startEdit} /> : <><SaveBtn onClick={save} /><CancelBtn onClick={cancel} /></>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
          {[
            ['Original limit', fmt(parcel.amount), '#fff'],
            ['Current balance', fmt(balance), '#fff'],
            ['Interest rate', parcel.rate > 0 ? Number(parcel.rate).toFixed(2) + '%' : '—', '#fff'],
            ['Rate type', parcel.rateType || 'Fixed', 'var(--sbl)'],
            ['Repayment', parcel.rpmt || 'P&I', 'var(--sbl)'],
            ['Est. total monthly', totalMonthlyCost ? '$' + Math.round(totalMonthlyCost).toLocaleString() + '/mo' : '—', '#27ae60'],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--sbl)', marginBottom: 2 }}>{lbl}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* LEFT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel>
            <PanelTitle>Loan particulars</PanelTitle>
            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FieldGroup label="Asset description"><input style={inp} value={p.assetDesc || ''} onChange={e => set('assetDesc', e.target.value)} /></FieldGroup>
                <FieldGroup label="Financed amount ($)"><input style={inp} type="number" value={p.amount} onChange={e => set('amount', e.target.value)} /></FieldGroup>
                <FieldGroup label="Interest rate (%)"><input style={inp} type="number" step="0.01" value={p.rate} onChange={e => set('rate', e.target.value)} /></FieldGroup>
                <FieldGroup label="Rate type">
                  <select style={inp} value={p.rateType || 'Fixed'} onChange={e => set('rateType', e.target.value)}>
                    <option>Fixed</option><option>Var</option>
                  </select>
                </FieldGroup>
                <FieldGroup label="Repayment type">
                  <select style={inp} value={p.rpmt || 'P&I'} onChange={e => set('rpmt', e.target.value)}>
                    <option>P&I</option><option>IO</option>
                  </select>
                </FieldGroup>
                <FieldGroup label="Term (years)"><input style={inp} type="number" value={p.term} onChange={e => set('term', e.target.value)} /></FieldGroup>
                <FieldGroup label="Balloon / residual ($, optional)"><input style={inp} type="number" value={p.balloon} onChange={e => set('balloon', e.target.value)} /></FieldGroup>
                <FieldGroup label="One-off fees (optional)"><input style={inp} value={p.fees || ''} onChange={e => set('fees', e.target.value)} placeholder="e.g. $450 establishment" /></FieldGroup>
                <FieldGroup label="Monthly ongoing fee ($, optional)"><input style={inp} type="number" value={p.monthlyFee} onChange={e => set('monthlyFee', e.target.value)} placeholder="e.g. 15" /></FieldGroup>
                <FieldGroup label="Settlement date"><DateInput value={p.settled} onChange={v => set('settled', v)} style={inp} /></FieldGroup>
                <FieldGroup label="Status">
                  <select style={inp} value={p.closed ? 'closed' : 'active'} onChange={e => set('closed', e.target.value === 'closed')}>
                    <option value="active">Active</option>
                    <option value="closed">Closed / paid out</option>
                  </select>
                </FieldGroup>
                <div />
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldGroup label="Notes"><textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={p.notes || ''} onChange={e => set('notes', e.target.value)} /></FieldGroup>
                </div>
              </div>
            ) : (
              <div>
                {[
                  ['Loan type', 'Asset Finance'],
                  ['Asset / property', parcel.assetDesc || '—'],
                  ['Original limit', fmt(parcel.amount)],
                  ['Current balance', fmt(balance)],
                  ['_offset_note', ''],
                  ['Interest rate', parcel.rate > 0 ? Number(parcel.rate).toFixed(2) + '%' : '—'],
                  ['Rate type', parcel.rateType || 'Fixed'],
                  ['Term', parcel.term ? parcel.term + 'y' : '—'],
                  ['Est. monthly repayment', monthlyRepayment ? '$' + Math.round(monthlyRepayment).toLocaleString() : '—'],
                  ...(monthlyFee > 0 ? [['Monthly ongoing fee', '$' + monthlyFee.toLocaleString()]] : []),
                  ...(monthlyFee > 0 ? [['Est. total monthly cost', '$' + Math.round(totalMonthlyCost).toLocaleString()]] : []),
                  ...(parcel.balloon > 0 ? [['Balloon / residual', '$' + Number(parcel.balloon).toLocaleString()]] : []),
                  ...(parcel.fees ? [['One-off fees', parcel.fees]] : []),
                  ['Status', parcel.closed ? 'Closed / paid out' : 'Active'],
                ].map(([lbl, val]) => (
                  lbl === '_offset_note'
                    ? <div key="offset-note" style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', padding: '3px 0 5px', borderBottom: '0.5px solid var(--border-light)' }}>
                        Balance is estimated from the loan terms and time elapsed since settlement — there's no commission statement updating it, so it recalculates automatically every time this page opens.
                      </div>
                    : <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border-light)', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{lbl}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right' }}>{val}</span>
                      </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle>Key dates &amp; expiry flags</PanelTitle>
            <div style={{ padding: '9px 0', borderBottom: '0.5px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Settlement date</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{fmtDate(parcel.settled)}</span>
              </div>
            </div>
            {parcel.balloon > 0 && (
              <div style={{ padding: '9px 0', borderBottom: '0.5px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Balloon / residual</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(parcel.balloon)}</span>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Repayment summary</div>
              {[
                ['Repayment type', parcel.rpmt || 'P&I'],
                ['Est. monthly repayment', monthlyRepayment ? '$' + Math.round(monthlyRepayment).toLocaleString() : '—'],
                ['Est. annual repayment', monthlyRepayment ? '$' + Math.round(monthlyRepayment * 12).toLocaleString() : '—'],
                ...(monthlyFee > 0 ? [['Monthly ongoing fee', '$' + monthlyFee.toLocaleString()]] : []),
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border-light)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lbl}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{val}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* RIGHT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Balance — Estimated (Historic &amp; Predicted)</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
                {stmtPts.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EB99C2' }} /> Estimated</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 14, height: 2, background: '#3D5570' }} /> Predicted</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: 'rgba(235,153,194,0.28)', border: '0.5px solid rgba(235,153,194,0.5)', borderRadius: 2 }} /> Historic period</div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <svg width="100%" viewBox={`0 0 ${gW} ${gH}`} style={{ display: 'block', minWidth: 320 }}>
                <defs>
                  <linearGradient id="histGradParcel" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="rgba(235,153,194,0.22)" />
                    <stop offset="100%" stopColor="rgba(235,153,194,0.08)" />
                  </linearGradient>
                </defs>
                <rect x={gP.l} y={gP.t} width={Math.max(0, histEndX - gP.l)} height={gPH} fill="rgba(235,153,194,0.28)" rx={2} />
                <rect x={gP.l} y={gP.t} width={Math.max(0, histEndX - gP.l)} height={gPH} fill="url(#histGradParcel)" rx={2} />
                <text x={Math.max(gP.l + 4, (gP.l + histEndX) / 2)} y={gP.t - 3} textAnchor="middle" fontSize={9} fill="rgba(180,70,120,0.7)" fontStyle="italic" fontWeight={600}>Historic</text>
                <text x={Math.min(gP.l + gPW - 4, (histEndX + gP.l + gPW) / 2)} y={gP.t - 3} textAnchor="middle" fontSize={9} fill="rgba(61,85,112,0.5)" fontStyle="italic" fontWeight={600}>Predicted</text>
                {yGridVals.map((v, i) => (
                  <g key={i}>
                    <line x1={gP.l} x2={gP.l + gPW} y1={toY(v)} y2={toY(v)} stroke="var(--border-light)" strokeWidth={0.5} />
                    <text x={gP.l - 4} y={toY(v) + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">{v > 0 ? `$${Math.round(v / 1000)}k` : '$0'}</text>
                  </g>
                ))}
                <line x1={todayX} x2={todayX} y1={gP.t} y2={gP.t + gPH} stroke="#EB99C2" strokeWidth={1} strokeDasharray="3,3" opacity={0.7} />
                {stmtPath && <path d={stmtPath} fill="none" stroke="#EB99C2" strokeWidth={2} opacity={0.85} />}
                {stmtPts.map((pt, i) => <circle key={i} cx={dateToX(pt.d)} cy={toY(pt.bal)} r={2.5} fill="#EB99C2" opacity={0.9} />)}
                {projPath && <path d={projPath} fill="none" stroke="#3D5570" strokeWidth={2} />}
                {xLabels.map((xl, i) => (
                  <text key={i} x={xl.x} y={gH - 4} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)">{xl.label}</text>
                ))}
                <text x={todayX} y={gP.t + gPH + 11} textAnchor="middle" fontSize={8} fill="#EB99C2" fontWeight={600}>{todayLabel}</text>
              </svg>
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Asset Finance summary</PanelTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Remaining term', val: future.length ? `${Math.floor(future.length / 12)}y ${future.length % 12}m` : '—', sub: 'Estimated' },
                { label: 'Est. payoff date', val: future.length ? future[future.length - 1].date : (past.length ? past[past.length - 1].date : '—'), sub: 'Estimated' },
                { label: 'Est. repayment / mo', val: monthlyRepayment ? '$' + Math.round(monthlyRepayment).toLocaleString() : '—', sub: 'P&I or IO per loan terms' },
                { label: 'Est. total monthly cost', val: totalMonthlyCost ? '$' + Math.round(totalMonthlyCost).toLocaleString() : '—', sub: monthlyFee > 0 ? `incl. $${monthlyFee.toLocaleString()} fee` : 'No ongoing fee set', color: '#27ae60' },
                { label: 'Est. total interest (remaining)', val: '$' + futureInt.toLocaleString(), sub: 'Future interest only', color: '#c0392b' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: 7, padding: '9px 12px', border: '0.5px solid var(--border-light)' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: s.color || 'var(--text-primary)' }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10.5, color: '#94a3b8' }}>
              There's no commission statement to update this facility's balance, so it's calculated from the amount, rate, term and settlement date instead — it recalculates automatically every time this page opens.
            </div>
          </Panel>

          <Panel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <PanelTitle style={{ margin: 0 }}>Amortisation schedule</PanelTitle>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setTableView('quarterly')} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `1px solid ${tableView === 'quarterly' ? '#3D5570' : 'var(--border)'}`, background: tableView === 'quarterly' ? '#3D5570' : '#fff', color: tableView === 'quarterly' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>Quarterly</button>
                <button onClick={() => setTableView('monthly')} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `1px solid ${tableView === 'monthly' ? '#3D5570' : 'var(--border)'}`, background: tableView === 'monthly' ? '#3D5570' : '#fff', color: tableView === 'monthly' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>Monthly</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    {['Date', 'Balance', 'Movement', 'Est. Interest', 'Type'].map((h, i) => (
                      <th key={h} style={{ ...th, textAlign: i === 0 || i === 4 ? 'left' : 'right', padding: '6px 8px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableHistRows.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '10px 8px', fontSize: 10, color: '#9ca3af', textAlign: 'center', background: 'rgba(235,153,194,0.04)', fontStyle: 'italic' }}>
                      No estimated history yet — set the amount, rate, term and settlement date to calculate it
                    </td></tr>
                  )}
                  {tableHistRows.map((row, i) => (
                    <tr key={`h${i}`} style={{ background: 'rgba(235,153,194,0.06)' }}>
                      <td style={td({ color: 'var(--text-secondary)', fontSize: 10 })}>{row.date}</td>
                      <td style={td({ textAlign: 'right', fontWeight: 500, color: 'var(--pk)' })}>${row.balance.toLocaleString()}</td>
                      <td style={td({ textAlign: 'right', color: '#166534' })}>${(row.movement || 0).toLocaleString()}</td>
                      <td style={td({ textAlign: 'right', color: '#c0392b' })}>{row.interest ? '$' + row.interest.toLocaleString() : '—'}</td>
                      <td style={td({ fontSize: 9 })}><span style={{ background: 'rgba(235,153,194,0.2)', color: '#9b2c6e', padding: '1px 6px', borderRadius: 10, fontSize: 9 }}>{row.type}</span></td>
                    </tr>
                  ))}
                  {tableHistRows.length > 0 && tableProjRows.length > 0 && (
                    <tr><td colSpan={5} style={{ padding: '4px 8px', background: '#f0f4f8', fontSize: 10, fontWeight: 600, color: '#3D5570', textAlign: 'center', letterSpacing: '0.05em' }}>▼ TODAY — PROJECTED BELOW ▼</td></tr>
                  )}
                  {tableProjRows.map((row, i) => (
                    <tr key={`p${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbff' }}>
                      <td style={td({ color: 'var(--text-secondary)', fontSize: 10 })}>{row.date}</td>
                      <td style={td({ textAlign: 'right', fontWeight: 500, color: 'var(--text-primary)' })}>${row.balance.toLocaleString()}</td>
                      <td style={td({ textAlign: 'right', color: '#166534' })}>${row.movement.toLocaleString()}</td>
                      <td style={td({ textAlign: 'right', color: '#c0392b' })}>${row.interest.toLocaleString()}</td>
                      <td style={td({ fontSize: 9 })}><span style={{ background: row.type === 'IO' ? '#fef9c3' : '#f0fdf4', color: row.type === 'IO' ? '#92600a' : '#166534', padding: '1px 6px', borderRadius: 10, fontSize: 9 }}>{row.type}</span></td>
                    </tr>
                  ))}
                  {tableProjRows.length > 0 && (
                    <tr style={{ background: '#f0f4f8' }}>
                      <td colSpan={3} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Total future interest</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#c0392b', fontSize: 11 }}>${futureInt.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

// Days until a due date (negative = overdue) — computed fresh every time
// the page opens rather than stored, so it's always accurate. Blank once
// an invoice is marked paid, since "days" stops being useful once it's
// settled.
function daysUntil(dueDate) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  return Math.round((due - today) / 86400000)
}

function ProgressParcelView({ parcel: p, updateParcel, inputStyle, label }) {
  const drawn = progressDrawn(p)
  const remaining = progressRemaining(p)
  const payments = p.payments || []
  const supplierRows = progressSupplierSummary(p)

  function addPayment() {
    updateParcel({ payments: [...payments, mkProgressPayment()] })
  }
  function updatePayment(id, patch) {
    updateParcel({ payments: payments.map(pay => pay.id === id ? { ...pay, ...patch } : pay) })
  }
  function removePayment(id) {
    if (!window.confirm('Remove this invoice line? This can\'t be undone.')) return
    updateParcel({ payments: payments.filter(pay => pay.id !== id) })
  }

  const cellIn = { ...inputStyle, fontSize: 11, padding: '5px 6px' }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2A3545', margin: 0 }}>{p.name || 'Progress facility'}</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>Progress facility</div>
        </div>
      </div>

      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <FieldGroup label="Name">
            <input style={inputStyle} value={p.name || ''} onChange={e => updateParcel({ name: e.target.value })} placeholder="e.g. Warehouse fitout" />
          </FieldGroup>
          <FieldGroup label="Approved sub-limit ($)">
            <input style={inputStyle} type="number" value={p.approvedLimit} onChange={e => updateParcel({ approvedLimit: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Status">
            <select style={inputStyle} value={p.closed ? 'closed' : (p.status || 'Active')} onChange={e => {
              const v = e.target.value
              updateParcel({ status: v === 'closed' ? 'Active' : v, closed: v === 'closed' })
            }}>
              <option>Active</option><option>Complete</option><option value="closed">Closed</option>
            </select>
          </FieldGroup>
        </div>
        <div style={{ marginTop: 14 }}>
          <FieldGroup label="Notes">
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={p.notes || ''} onChange={e => updateParcel({ notes: e.target.value })} />
          </FieldGroup>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #e8eaed', flexWrap: 'wrap' }}>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approved sub-limit</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(Number(p.approvedLimit) || 0)}</div>
          </div>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total invoiced to date</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(drawn)}</div>
          </div>
          <div style={{ background: remaining < 0 ? '#fef2f2' : '#eefaf2', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remaining on this facility</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: remaining < 0 ? '#dc2626' : '#22c55e' }}>{fmt(remaining)}</div>
          </div>
        </div>
      </Panel>

      {supplierRows.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelTitle>By supplier</PanelTitle>
          <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
            Rolls up the invoice lines below by supplier, so you can see at a glance how much each one is owed in total when a claim bundles several of them together.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead><tr>
                {['Supplier', 'Invoices', 'Total invoiced', 'Paid', 'Outstanding'].map((h, i) => (
                  <th key={h} style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {supplierRows.map(row => (
                  <tr key={row.supplier}>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', fontWeight: 500 }}>{row.supplier}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'center', color: 'var(--text-secondary)' }}>{row.count}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', fontWeight: 600 }}>{fmt(row.total)}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', color: '#166534' }}>{fmt(row.paid)}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', color: row.outstanding > 0 ? '#c0392b' : 'var(--text-secondary)', fontWeight: row.outstanding > 0 ? 600 : 400 }}>{fmt(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0f4f8' }}>
                  <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>All suppliers</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{payments.length}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2A3545', fontSize: 11.5 }}>{fmt(drawn)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 11.5 }}>{fmt(supplierRows.reduce((s, r) => s + r.paid, 0))}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#c0392b', fontSize: 11.5 }}>{fmt(supplierRows.reduce((s, r) => s + r.outstanding, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelTitle action={
          <button onClick={addPayment} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${PINK}`, background: 'transparent', color: PINK, cursor: 'pointer', fontWeight: 600 }}>+ Add invoice line</button>
        }>Progress payments &amp; invoices</PanelTitle>
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
          When one progress claim bundles several supplier invoices, add each invoice as its own line here so it can be tracked and marked paid separately, rather than lumping them into one amount.
        </div>

        {!payments.length ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '18px 0', textAlign: 'center' }}>No invoices recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>
                {['Invoice/Ref', 'Supplier', 'Description', 'Due date', 'Amount', 'Paying to', 'Status', 'Paid', 'Pmt date', 'Bridging rate', 'Days', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '6px 6px', background: '#3D5570', color: '#fff', fontSize: 9.5, textAlign: h === 'Amount' || h === 'Bridging rate' || h === 'Days' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payments.map(pay => {
                  const due = pay.dueDate || pay.date || ''
                  const days = !pay.paid ? daysUntil(due) : null
                  return (
                    <tr key={pay.id}>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 90 }} value={pay.invoiceRef || ''} onChange={e => updatePayment(pay.id, { invoiceRef: e.target.value })} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 130 }} value={pay.supplier || ''} onChange={e => updatePayment(pay.id, { supplier: e.target.value })} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 120 }} value={pay.description || ''} onChange={e => updatePayment(pay.id, { description: e.target.value })} placeholder="e.g. 30% Deposit" />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <DateInput value={due} onChange={v => updatePayment(pay.id, { dueDate: v })} style={{ ...cellIn, width: 108 }} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 90, textAlign: 'right' }} type="number" value={pay.amount} onChange={e => updatePayment(pay.id, { amount: e.target.value })} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <select style={{ ...cellIn, width: 84 }} value={pay.payingTo || 'Supplier'} onChange={e => updatePayment(pay.id, { payingTo: e.target.value })}>
                          <option>Supplier</option><option>Client</option>
                        </select>
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <select style={{ ...cellIn, width: 148 }} value={pay.status || 'Pending'} onChange={e => updatePayment(pay.id, { status: e.target.value })}>
                          {PROGRESS_PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'center' }}>
                        <input type="checkbox" checked={!!pay.paid} onChange={e => updatePayment(pay.id, { paid: e.target.checked, paymentDate: e.target.checked ? (pay.paymentDate || new Date().toISOString().slice(0, 10)) : pay.paymentDate })} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <DateInput value={pay.paymentDate || ''} onChange={v => updatePayment(pay.id, { paymentDate: v })} style={{ ...cellIn, width: 108 }} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 60, textAlign: 'right' }} type="number" step="0.01" value={pay.bridgingRate || ''} onChange={e => updatePayment(pay.id, { bridgingRate: e.target.value })} placeholder="%" />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', fontSize: 10.5, color: days != null && days < 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: days != null && days < 0 ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {days == null ? '—' : (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`)}
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <input style={{ ...cellIn, width: 130 }} value={pay.notes || ''} onChange={e => updatePayment(pay.id, { notes: e.target.value })} />
                      </td>
                      <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border-light)' }}>
                        <button onClick={() => removePayment(pay.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0f4f8' }}>
                  <td colSpan={4} style={{ padding: '7px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Total ({payments.length} invoice{payments.length !== 1 ? 's' : ''})</td>
                  <td style={{ padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#2A3545', textAlign: 'right' }}>{fmt(drawn)}</td>
                  <td colSpan={7}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
