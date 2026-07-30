import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadDeals, syncDealsFromSupabase } from '../lib/deals'
import { BANKS } from '../lib/data'
import { INCOME_TYPES, loadDirectIncomeLocal, saveDirectIncome, syncDirectIncomeFromSupabase } from '../lib/directIncome'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}
function mkId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function fmt2(n) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function DirectIncome() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState(() => loadDirectIncomeLocal())
  const [deals, setDeals] = useState(() => loadDeals())
  const [month, setMonth] = useState(currentMonthKey())

  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => { if (cloud) setEntries(cloud) })
    syncDealsFromSupabase().then(cloud => { if (cloud) setDeals(cloud) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function persist(next) {
    setEntries(next)
    saveDirectIncome(next)
  }

  const monthEntries = entries.filter(e => e.month === month)
  const monthClosed = monthEntries.some(e => e.closed)

  // Only deals actually settled in the month being viewed — keeps the
  // dropdown short and relevant rather than showing the whole pipeline.
  const settledDealsThisMonth = useMemo(() =>
    deals.filter(d => d.Status === '7. Settled' && d['Month of Settlement'] === month),
  [deals, month])

  function addRow() {
    if (monthClosed) return
    persist([...entries, {
      id: mkId(), month, incomeType: 'RCTI', supplier: '', dealName: '', clientName: '',
      amountExGst: '', gst: '', closed: false,
    }])
  }
  function updateRow(id, patch) {
    persist(entries.map(e => e.id === id ? { ...e, ...patch } : e))
  }
  function removeRow(id) {
    if (monthClosed) return
    persist(entries.filter(e => e.id !== id))
  }
  // Picking a deal auto-fills the client from that deal's own linked
  // Rradar client (or its first contact if it isn't linked) — still just a
  // starting point, editable afterward same as anything else here.
  function selectDeal(id, dealName) {
    const deal = settledDealsThisMonth.find(d => d['Transaction Name'] === dealName)
    const clientName = deal ? (deal['RradarClient'] || deal.Contacts?.[0]?.name || '') : ''
    updateRow(id, { dealName, clientName })
  }
  // GST defaults to 10% of the entered amount but stays fully editable —
  // some entries won't be a standard 10% (partial GST, GST-free supplies).
  function updateAmount(id, raw) {
    const num = raw === '' ? '' : Number(raw)
    const gst = num === '' ? '' : Math.round(num * 0.10 * 100) / 100
    updateRow(id, { amountExGst: num, gst })
  }

  const monthTotal = monthEntries.reduce((s, e) => s + (Number(e.amountExGst) || 0) + (Number(e.gst) || 0), 0)

  const monthOptions = useMemo(() => {
    const opts = []
    const now = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return opts
  }, [])

  const inputStyle = { border: '1px solid #e8eaed', borderRadius: 5, padding: '5px 7px', fontSize: 11.5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <datalist id="direct-income-suppliers">
        {BANKS.map(b => <option key={b} value={b} />)}
      </datalist>

      <button onClick={() => navigate('/radar/dashboard')} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to dashboard</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>Direct Income</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>RCTIs, invoices, and other income that doesn't come through your commission statement — for non-bank facilities and one-off fees.</div>
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ border: '1px solid #e8eaed', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#2A3545' }}>
          {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {monthClosed && (
        <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92600A' }}>
          🔒 This month is closed — its commission statement has already been imported, and these entries were folded into that month's totals. Locked to keep the finalized record intact.
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ background: NAVY }}>
                {['Income Type', 'Supplier/Lender', 'Deal', 'Client', 'Amount (excl GST)', 'GST', 'Total', ''].map((h, i) => (
                  <th key={h} style={{ padding: '8px 10px', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: i >= 4 && i <= 6 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthEntries.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No direct income entries for {monthLabel(month)} yet.</td></tr>
              )}
              {monthEntries.map(e => {
                const total = (Number(e.amountExGst) || 0) + (Number(e.gst) || 0)
                return (
                  <tr key={e.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <select disabled={monthClosed} value={e.incomeType} onChange={ev => updateRow(e.id, { incomeType: ev.target.value })} style={inputStyle}>
                        {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input disabled={monthClosed} value={e.supplier} onChange={ev => updateRow(e.id, { supplier: ev.target.value })}
                        list="direct-income-suppliers" placeholder="e.g. CBA, Private Lender…" style={inputStyle} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <select disabled={monthClosed} value={e.dealName} onChange={ev => selectDeal(e.id, ev.target.value)} style={inputStyle}>
                        <option value="">— No deal —</option>
                        {settledDealsThisMonth.map(d => <option key={d['Transaction Name']} value={d['Transaction Name']}>{d['Transaction Name']}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input disabled={monthClosed} value={e.clientName} onChange={ev => updateRow(e.id, { clientName: ev.target.value })} placeholder="Client name" style={inputStyle} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input disabled={monthClosed} type="number" value={e.amountExGst} onChange={ev => updateAmount(e.id, ev.target.value)} style={{ ...inputStyle, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input disabled={monthClosed} type="number" value={e.gst} onChange={ev => updateRow(e.id, { gst: ev.target.value === '' ? '' : Number(ev.target.value) })} style={{ ...inputStyle, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(total)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {!monthClosed && <button onClick={() => removeRow(e.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', borderTop: '1.5px solid #e8eaed' }}>
                <td colSpan={6} style={{ padding: '9px 10px', fontWeight: 700, fontSize: 12, color: '#2A3545' }}>Total — {monthLabel(month)}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(monthTotal)}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
        {!monthClosed && (
          <div style={{ padding: '10px 14px' }}>
            <button onClick={addRow} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${PINK}`, background: '#fff', color: PINK, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+ Add row</button>
          </div>
        )}
      </div>
    </div>
  )
}
