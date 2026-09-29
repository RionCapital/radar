import React, { useMemo, useState } from 'react'
import { buildAccountingCsv, downloadAccountingCsv, getFormat } from '../lib/accountingExport'
import { invoiceTotals } from '../lib/directIncome'

// ─── Export Direct Income for accounting ─────────────────────────────────────
// Opens from the Direct Income page. Picks a range of months rather than just
// the one on screen, so a whole quarter or financial year can go into the
// accounting package in one file — which is how these uploads actually get
// done (a BAS quarter, an EOFY catch-up), not one month at a time.
//
// Entries are filtered on the month they're FILED under, not their invoice
// date — that's the month shown on the page, and the month a commission
// statement closes off, so what you pick is what you were looking at.

const NAVY = '#3D4F6B'
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const monthLabel = m => {
  const [y, mo] = (m || '').split('-')
  return y && mo ? `${MO[Number(mo) - 1]} ${y}` : (m || '—')
}
const money = n => '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const addMonths = (key, delta) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Australian financial year — 1 July to 30 June.
function fyRange(offsetYears = 0) {
  const now = new Date()
  const startYear = (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1) + offsetYears
  return { from: `${startYear}-07`, to: `${startYear + 1}-06` }
}
const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AccountingExportModal({ entries, pkg, payees, defaultMonth, onClose }) {
  const allMonths = useMemo(
    () => [...new Set((entries || []).map(e => e.month).filter(Boolean))].sort(),
    [entries]
  )
  const [from, setFrom] = useState(defaultMonth || allMonths[0] || thisMonth())
  const [to, setTo] = useState(defaultMonth || allMonths[allMonths.length - 1] || thisMonth())

  // A backwards range is a slip, not an intention — read it either way round
  // rather than silently exporting nothing.
  const lo = from <= to ? from : to
  const hi = from <= to ? to : from

  const selected = useMemo(
    () => (entries || []).filter(e => e.month && e.month >= lo && e.month <= hi),
    [entries, lo, hi]
  )
  const preview = useMemo(() => buildAccountingCsv(selected, pkg, payees), [selected, pkg, payees])
  const totals = selected.reduce((acc, e) => {
    const t = invoiceTotals(e)
    acc.amount += t.amount; acc.tax += t.taxAmount; acc.total += t.total
    return acc
  }, { amount: 0, tax: 0, total: 0 })

  // Months inside the range that actually carry invoices — worth showing, so
  // an empty stretch is obvious before the file is opened in the package.
  const monthsInRange = allMonths.filter(m => m >= lo && m <= hi)

  const presets = [
    { label: 'This month', range: () => ({ from: thisMonth(), to: thisMonth() }) },
    { label: 'Last month', range: () => ({ from: addMonths(thisMonth(), -1), to: addMonths(thisMonth(), -1) }) },
    { label: 'Last 3 months', range: () => ({ from: addMonths(thisMonth(), -2), to: thisMonth() }) },
    { label: 'This FY', range: () => fyRange(0) },
    { label: 'Last FY', range: () => fyRange(-1) },
    { label: 'All', range: () => ({ from: allMonths[0] || thisMonth(), to: allMonths[allMonths.length - 1] || thisMonth() }) },
  ]
  const applyPreset = p => { const r = p.range(); setFrom(r.from); setTo(r.to) }

  function doExport() {
    const label = lo === hi ? monthLabel(lo) : `${monthLabel(lo)}_to_${monthLabel(hi)}`
    downloadAccountingCsv(selected, pkg, payees, label)
    onClose()
  }

  const inp = { border: '1px solid #e8eaed', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: '#2A3545' }
  const presetBtn = { fontSize: 11, padding: '5px 11px', borderRadius: 20, border: '1px solid #e8eaed', background: '#fff', color: '#64748b', cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 620, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #e8eaed', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2A3545' }}>Export for {pkg}</div>
            <div style={{ fontSize: 11.5, color: '#7A8090', marginTop: 3 }}>
              Pick the months to include. Change the package in Settings → Rradar → Accounting.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: '#7A8090', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>From month</div>
              <input type="month" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', paddingBottom: 9 }}>→</div>
            <div>
              <div style={{ fontSize: 10, color: '#7A8090', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>To month</div>
              <input type="month" value={to} onChange={e => setTo(e.target.value)} style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {presets.map(p => <button key={p.label} onClick={() => applyPreset(p)} style={presetBtn}>{p.label}</button>)}
          </div>

          <div style={{ marginTop: 16, background: '#f8fafc', border: '0.5px solid #e8eaed', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: '#2A3545', fontWeight: 600, marginBottom: 6 }}>
              {selected.length === 0
                ? 'Nothing in this range'
                : `${selected.length} invoice${selected.length === 1 ? '' : 's'} · ${preview.lines} line${preview.lines === 1 ? '' : 's'} · ${monthsInRange.length} month${monthsInRange.length === 1 ? '' : 's'}`}
            </div>
            {selected.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.7 }}>
                Ex-GST <strong style={{ color: '#2A3545' }}>{money(totals.amount)}</strong> · GST {money(totals.tax)} · Total {money(totals.total)}
                <br />
                Months with invoices: {monthsInRange.map(monthLabel).join(', ')}
              </div>
            )}
            {selected.length === 0 && (
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                {allMonths.length
                  ? `There are invoices in ${monthLabel(allMonths[0])} – ${monthLabel(allMonths[allMonths.length - 1])}. Try widening the range or hit "All".`
                  : 'No Direct Income invoices have been entered yet.'}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, lineHeight: 1.6 }}>
            Invoices are picked by the month they're filed under on this page, not their invoice date.
            One CSV row per invoice line, {getFormat(pkg).headers.length} columns.
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '0.5px solid #e8eaed', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={doExport} disabled={!preview.lines}
            style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 12, cursor: preview.lines ? 'pointer' : 'default', opacity: preview.lines ? 1 : 0.5 }}>
            ⬇ Download {preview.lines ? `${preview.lines} line${preview.lines === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
