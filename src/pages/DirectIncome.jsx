import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadClients } from '../lib/data'
import { loadSettings } from '../lib/settings'
import {
  DEFAULT_ACCOUNT,
  loadDirectIncomeLocal, loadNextInvoiceNumberLocal, saveDirectIncome, syncDirectIncomeFromSupabase,
  invoiceItems, invoiceTotals, invoiceSummaryDescription, mkLineItem, loadPayeeOptions,
} from '../lib/directIncome'
import { downloadTaxInvoicePdf, fmt2 as fmt2Pdf, fmtDateAU } from '../lib/directIncomePdf'

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
const fmt2 = fmt2Pdf
function todayISO() { return new Date().toISOString().slice(0, 10) }
function plus14Days(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

// ─── Bulk CSV import (e.g. an accounting-system invoice export) ──────────────
// Handles quoted fields (a ContactName with an embedded comma, e.g.
// `"Smith, John"`) since that's a real shape for company/trust names.
function parseCsvLine(line) {
  const cells = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}
// "16-05-24" style dates → ISO. 2-digit years assumed 20xx (this app has no
// data predating 2000).
function parseAuDate(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec((s || '').trim())
  if (!m) return null
  let [, d, mo, y] = m
  d = Number(d); mo = Number(mo); y = Number(y)
  if (y < 100) y += 2000
  const dt = new Date(y, mo - 1, d)
  if (isNaN(dt)) return null
  return dt.toISOString().slice(0, 10)
}

export default function DirectIncome() {
  const navigate = useNavigate()
  const [settings] = useState(() => loadSettings())
  const startingInvoiceNumber = settings.companyDetails?.startingInvoiceNumber ?? 1150
  const [entries, setEntries] = useState(() => loadDirectIncomeLocal())
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(() => loadNextInvoiceNumberLocal(startingInvoiceNumber))
  const [clients, setClients] = useState(() => loadClients())
  const payeeOptions = useMemo(() => loadPayeeOptions(clients), [clients])
  const [month, setMonth] = useState(currentMonthKey())
  const [view, setView] = useState('current') // 'current' | 'history'
  const [importPreview, setImportPreview] = useState(null) // { parsed, skippedRows, fileName } | null

  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => {
      if (cloud) {
        setEntries(cloud.entries)
        setNextInvoiceNumber(cloud.nextInvoiceNumber || startingInvoiceNumber)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function persist(nextEntries, nextInvNum) {
    setEntries(nextEntries)
    if (nextInvNum !== undefined) setNextInvoiceNumber(nextInvNum)
    saveDirectIncome(nextEntries, nextInvNum !== undefined ? nextInvNum : nextInvoiceNumber)
  }

  const monthEntries = entries.filter(e => e.month === month)
  const monthClosed = monthEntries.some(e => e.closed)

  // Creates a blank invoice (one empty line item) and jumps straight into
  // its detail page — mirrors how Xero opens a fresh invoice into its own
  // page rather than an inline row.
  function addInvoice() {
    if (monthClosed) return
    const invNum = `INV-${nextInvoiceNumber}`
    const newEntry = {
      id: mkId(), month, invoiceNumber: invNum,
      issueDate: todayISO(), dueDate: plus14Days(todayISO()),
      supplierName: '', dealName: '', clientName: '',
      items: [mkLineItem()], closed: false,
    }
    persist([...entries, newEntry], nextInvoiceNumber + 1)
    navigate(`/radar/direct-income/${newEntry.id}`)
  }
  // History rows are closed (locked against the normal edit/delete in the
  // Current tab) — this is a separate, deliberately-confirmed path for
  // fixing genuine mistakes in already-closed months, e.g. a duplicate row
  // that came in from a bulk CSV import.
  function removeClosedEntry(e) {
    const label = `${e.supplierName || 'this entry'} — $${fmt2(invoiceTotals(e).total)} (${monthLabel(e.month)})`
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return
    persist(entries.filter(x => x.id !== e.id))
  }

  // Bulk import from a CSV export (ContactName, Description, InvoiceDate,
  // PlannedDate, Total, TaxTotal, Invoice Amount) — e.g. an accounting
  // system's invoice history. Every row becomes a Direct Income entry
  // (regardless of whether its Description says "Mandate" or "Commission" —
  // that word is kept as-is in the Description field so it's still visible),
  // marked closed since it's finalized history, not something still open for
  // this month. Total is GST-inclusive; the pre-tax amount is Total minus
  // TaxTotal. Doesn't touch the live invoice-number sequence — these are
  // backfilled records, not new invoices going out, so they get no
  // INV-#### number (blank), leaving the counter to keep tracking real new
  // invoices uninterrupted.
  function handleImportFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      let rows
      try { rows = parseCsv(String(reader.result)) } catch { rows = [] }
      const parsed = rows.map(r => {
        const contact = r.ContactName || ''
        const descRaw = (r.Description || '').trim()
        const issueDate = parseAuDate(r.InvoiceDate)
        const total = Number(r.Total) || 0
        const taxTotal = Number(r.TaxTotal) || 0
        const amount = Math.round((total - taxTotal) * 100) / 100
        const monthKey = issueDate ? issueDate.slice(0, 7) : null
        const item = /^mandate$/i.test(descRaw) ? 'Mandate' : 'Other'
        const alreadyExists = !!monthKey && entries.some(e =>
          e.month === monthKey && e.supplierName === contact && Math.abs((Number(e.amount) || 0) - amount) < 0.01)
        return {
          contact, descRaw, issueDate, monthKey, amount, taxAmount: taxTotal, total, item,
          alreadyExists, valid: !!issueDate && !!contact,
          include: !!issueDate && !!contact && !alreadyExists,
        }
      })
      setImportPreview({ parsed, fileName: file.name })
    }
    reader.readAsText(file)
  }
  function toggleImportRow(idx) {
    setImportPreview(prev => ({ ...prev, parsed: prev.parsed.map((p, i) => i === idx ? { ...p, include: !p.include } : p) }))
  }
  function cancelImport() { setImportPreview(null) }
  function confirmImport() {
    const toAdd = importPreview.parsed.filter(p => p.include && p.valid).map(p => ({
      id: mkId(), month: p.monthKey,
      items: [{
        id: mkId(), item: p.item, description: p.descRaw,
        qty: 1, price: p.amount, account: DEFAULT_ACCOUNT, taxRate: 'GST on Income',
        taxAmount: p.taxAmount, amount: p.amount,
      }],
      issueDate: p.issueDate, dueDate: plus14Days(p.issueDate),
      invoiceNumber: '', supplierName: p.contact, dealName: '', clientName: '', closed: true,
    }))
    persist([...entries, ...toAdd])
    setImportPreview(null)
  }

  const monthTotal = monthEntries.reduce((s, e) => s + invoiceTotals(e).total, 0)

  const monthOptions = useMemo(() => {
    const opts = []
    const now = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return opts
  }, [])

  // All closed entries, most recent month first — the History view, for
  // collecting/re-downloading invoices from months that are already locked.
  const closedByMonth = useMemo(() => {
    const closed = entries.filter(e => e.closed)
    const months = Array.from(new Set(closed.map(e => e.month))).sort().reverse()
    return months.map(m => ({ month: m, entries: closed.filter(e => e.month === m) }))
  }, [entries])

  function downloadTaxInvoice(e) { downloadTaxInvoicePdf(e, payeeOptions) }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1500, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <button onClick={() => navigate('/radar/dashboard')} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to dashboard</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>Direct Income</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>RCTIs, mandates, and other income that doesn't come through your commission statement. Enter once here, download the tax invoice, and the same figures are what you upload into Xero.</div>
        </div>
        {view === 'current' && (
          <select value={month} onChange={e => setMonth(e.target.value)}
            style={{ border: '1px solid #e8eaed', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#2A3545' }}>
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('current')} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${view === 'current' ? NAVY : '#e8eaed'}`, background: view === 'current' ? NAVY : '#fff', color: view === 'current' ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Current</button>
          <button onClick={() => setView('history')} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${view === 'history' ? NAVY : '#e8eaed'}`, background: view === 'history' ? NAVY : '#fff', color: view === 'history' ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>History</button>
        </div>
        <label style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
          ⬆ Import CSV
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={ev => { const f = ev.target.files?.[0]; if (f) handleImportFile(f); ev.target.value = '' }} />
        </label>
      </div>

      {importPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 980, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #e8eaed' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2A3545' }}>Import Direct Income — {importPreview.fileName}</div>
              <div style={{ fontSize: 11.5, color: '#7A8090', marginTop: 3 }}>
                {importPreview.parsed.filter(p => p.include).length} of {importPreview.parsed.length} rows will be added, marked as historic/closed entries.
                Rows already matching an existing entry (same month, contact and amount) are unticked automatically — tick them if you want a duplicate anyway.
              </div>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['', 'Contact', 'Description', 'Issue Date', 'Amount', 'Tax', 'Total', ''].map((h, i) => (
                      <th key={`${h}-${i}`} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, color: '#7A8090', fontWeight: 700, textTransform: 'uppercase', borderBottom: '0.5px solid #e8eaed', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.parsed.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0', opacity: p.valid ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="checkbox" checked={p.include} disabled={!p.valid} onChange={() => toggleImportRow(i)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>{p.contact || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{p.descRaw || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{p.issueDate ? fmtDateAU(p.issueDate) : <span style={{ color: '#dc2626' }}>unparseable date</span>}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>${fmt2(p.amount)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>${fmt2(p.taxAmount)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>${fmt2(p.total)}</td>
                      <td style={{ padding: '6px 8px' }}>{p.alreadyExists && <span style={{ fontSize: 10, color: '#92600A', background: '#FEF9E7', padding: '2px 6px', borderRadius: 10 }}>already in Radar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '0.5px solid #e8eaed', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={cancelImport} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmImport} disabled={!importPreview.parsed.some(p => p.include)}
                style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: importPreview.parsed.some(p => p.include) ? 1 : 0.5 }}>
                Import {importPreview.parsed.filter(p => p.include).length} {importPreview.parsed.filter(p => p.include).length === 1 ? 'entry' : 'entries'}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'current' && (
        <>
          {monthClosed && (
            <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92600A' }}>
              🔒 This month is closed — its commission statement has already been imported, and these entries were folded into that month's totals. Locked to keep the finalized record intact. Find it under the History tab any time.
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: NAVY }}>
                    {['Invoice #', 'Description', 'Who it\'s to', 'Issue Date', 'Due Date', 'Amount', ''].map((h) => (
                      <th key={h} style={{ padding: '9px 10px', color: '#fff', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', textAlign: h === 'Amount' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthEntries.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No direct income entries for {monthLabel(month)} yet.</td></tr>
                  )}
                  {monthEntries.map(e => (
                    <tr key={e.id} onClick={() => navigate(`/radar/direct-income/${e.id}`)}
                      style={{ borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer' }}
                      onMouseEnter={ev => { ev.currentTarget.style.background = '#F9FAFB' }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = '#fff' }}>
                      <td style={{ padding: '10px 10px', color: '#7A8090' }}>{e.invoiceNumber || '—'}</td>
                      <td style={{ padding: '10px 10px', color: '#2A3545' }}>{invoiceSummaryDescription(e) || '—'}</td>
                      <td style={{ padding: '10px 10px', color: '#2A3545', fontWeight: 600 }}>{e.supplierName || '—'}{e.closed && ' 🔒'}</td>
                      <td style={{ padding: '10px 10px', color: '#7A8090', whiteSpace: 'nowrap' }}>{fmtDateAU(e.issueDate)}</td>
                      <td style={{ padding: '10px 10px', color: '#7A8090', whiteSpace: 'nowrap' }}>{fmtDateAU(e.dueDate)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(invoiceTotals(e).total)}</td>
                      <td style={{ padding: '10px 10px', color: '#cbd5e1' }}>›</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8f9fa', borderTop: '1.5px solid #e8eaed' }}>
                    <td colSpan={5} style={{ padding: '9px 10px', fontWeight: 700, fontSize: 12, color: '#2A3545' }}>Total — {monthLabel(month)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(monthTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!monthClosed && (
              <div style={{ padding: '10px 14px' }}>
                <button onClick={addInvoice} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${PINK}`, background: '#fff', color: PINK, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+ Add invoice</button>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'history' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden' }}>
          {closedByMonth.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No closed months yet — entries land here once a commission statement has been imported for that month.</div>
          )}
          {closedByMonth.map(({ month: m, entries: monthClosedEntries }) => {
            const mTotal = monthClosedEntries.reduce((s, e) => s + invoiceTotals(e).total, 0)
            return (
              <div key={m} style={{ borderBottom: '0.5px solid #e8eaed' }}>
                <div style={{ background: '#f8f9fa', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2A3545' }}>🔒 {monthLabel(m)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>${fmt2(mTotal)}</span>
                </div>
                {monthClosedEntries.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: '0.5px solid #f7f7f7', fontSize: 11.5 }}>
                    <span style={{ width: 80, color: '#7A8090' }}>{e.invoiceNumber}</span>
                    <span style={{ flex: 1, color: '#2A3545' }}>{e.supplierName || '—'} — {invoiceSummaryDescription(e)}</span>
                    <span style={{ width: 90, textAlign: 'right', fontWeight: 600 }}>${fmt2(invoiceTotals(e).total)}</span>
                    <button onClick={() => downloadTaxInvoice(e)} style={{ background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10.5, whiteSpace:'nowrap' }}>📄 Invoice</button>
                    <button onClick={() => removeClosedEntry(e)} title="Delete this entry" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
