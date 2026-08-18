import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadDeals, syncDealsFromSupabase } from '../lib/deals'
import { loadClients } from '../lib/data'
import { loadSettings, getDealStages } from '../lib/settings'
import { RION_LOGO_PNG } from '../lib/logoBase64'
import {
  ITEM_TYPES, TAX_RATES, DEFAULT_ACCOUNT, taxRateFraction,
  loadDirectIncomeLocal, loadNextInvoiceNumberLocal, saveDirectIncome, syncDirectIncomeFromSupabase,
} from '../lib/directIncome'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const NAVY_RGB = [61, 79, 107]
const PINK_RGB = [235, 153, 194]

// Built from Settings > Business Details (Company details) so invoices
// always reflect the current company info without needing a code change —
// falls back to sensible defaults if Settings hasn't been touched yet.
function loadIssuer() {
  const s = loadSettings()
  const c = s.companyDetails || {}
  return {
    name: c.fullCompanyName || 'Rion Capital Investments Pty Ltd',
    abn: c.abn || '76 641 258 040',
    addressLine1: c.address || '201/90 Podium Way, ORAN PARK NSW 2570, AUSTRALIA',
    addressLine2: '',
    country: '',
    bankName: c.bankName || 'Rion Capital Investments Pty Ltd',
    bsb: c.bsb || '062 - 656',
    account: c.accountNumber || '1049 3213',
  }
}

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
function fmtDateAU(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function plus14Days(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

// Splits a single address string into "Number Street" / "Suburb State
// Postcode", and separates out the country if there is one — dropping it
// entirely when it's Australia, since that's the default and doesn't need
// stating. Assumes the common "Street, Suburb State Postcode[, Country]"
// pattern; addresses that don't follow it just fall back to one line
// rather than guessing wrong.
function formatAddressLines(raw) {
  if (!raw) return { line1: '', line2: '', country: '' }
  let parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  let country = ''
  if (parts.length > 1 && /^australia$/i.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1)
  } else if (parts.length > 2 && !/^australia$/i.test(parts[parts.length - 1])) {
    // Genuinely a different country — keep it, shown separately
    country = parts[parts.length - 1]
    parts = parts.slice(0, -1)
  }
  if (parts.length <= 1) return { line1: parts[0] || '', line2: '', country }
  const line2 = parts[parts.length - 1]
  const line1 = parts.slice(0, -1).join(', ')
  return { line1, line2, country }
}

function loadLenderList() {
  try {
    const lenders = JSON.parse(localStorage.getItem('rion-marketing-lenders') || '[]')
    const others = JSON.parse(localStorage.getItem('rion-marketing-others') || '[]')
    return [...lenders, ...others]
  } catch { return [] }
}

export default function DirectIncome() {
  const navigate = useNavigate()
  const [settings] = useState(() => loadSettings())
  const startingInvoiceNumber = settings.companyDetails?.startingInvoiceNumber ?? 1150
  const [entries, setEntries] = useState(() => loadDirectIncomeLocal())
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(() => loadNextInvoiceNumberLocal(startingInvoiceNumber))
  const [deals, setDeals] = useState(() => loadDeals())
  const [clients, setClients] = useState(() => loadClients())
  const [suppliers, setSuppliers] = useState(() => loadLenderList())
  const [month, setMonth] = useState(currentMonthKey())
  const [view, setView] = useState('current') // 'current' | 'history'

  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => {
      if (cloud) {
        setEntries(cloud.entries)
        setNextInvoiceNumber(cloud.nextInvoiceNumber || startingInvoiceNumber)
      }
    })
    syncDealsFromSupabase().then(cloud => { if (cloud) setDeals(cloud) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function persist(nextEntries, nextInvNum) {
    setEntries(nextEntries)
    if (nextInvNum !== undefined) setNextInvoiceNumber(nextInvNum)
    saveDirectIncome(nextEntries, nextInvNum !== undefined ? nextInvNum : nextInvoiceNumber)
  }

  const monthEntries = entries.filter(e => e.month === month)
  const monthClosed = monthEntries.some(e => e.closed)

  // Stage names/order come from Settings > CRM > Stages — "Settled" is
  // resolved by its permanent id so this keeps recognising settled deals
  // even if that stage gets renamed or reordered.
  const settledDisplay = useMemo(() => getDealStages(loadSettings()).find(s => s.id === 'settled')?.display, [])
  const settledDealsThisMonth = useMemo(() =>
    deals.filter(d => d.Status === settledDisplay && d['Month of Settlement'] === month),
  [deals, month, settledDisplay])

  function addRow() {
    if (monthClosed) return
    const invNum = `INV-${nextInvoiceNumber}`
    persist([...entries, {
      id: mkId(), month, item: 'Direct Upfront', description: '', qty: 1, price: '',
      account: DEFAULT_ACCOUNT, taxRate: 'GST on Income', taxAmount: '', amount: '',
      issueDate: todayISO(), dueDate: plus14Days(todayISO()), invoiceNumber: invNum,
      supplierName: '', dealName: '', clientName: '', closed: false,
    }], nextInvoiceNumber + 1)
  }
  function updateRow(id, patch) {
    persist(entries.map(e => e.id === id ? { ...e, ...patch } : e))
  }
  function removeRow(id) {
    if (monthClosed) return
    persist(entries.filter(e => e.id !== id))
  }
  function selectDeal(id, dealName) {
    const deal = settledDealsThisMonth.find(d => d['Transaction Name'] === dealName)
    const clientName = deal ? (deal['RradarClient'] || deal.Contacts?.[0]?.name || '') : ''
    updateRow(id, { dealName, clientName })
  }
  function recalc(id, patch) {
    const e = entries.find(x => x.id === id)
    const next = { ...e, ...patch }
    const qty = Number(next.qty) || 0
    const price = Number(next.price) || 0
    const amount = Math.round(qty * price * 100) / 100
    const taxAmount = Math.round(amount * taxRateFraction(next.taxRate) * 100) / 100
    updateRow(id, { ...patch, amount, taxAmount })
  }

  const monthTotal = monthEntries.reduce((s, e) => s + (Number(e.amount) || 0) + (Number(e.taxAmount) || 0), 0)

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
    return months.map(m => ({ month: m, items: closed.filter(e => e.month === m) }))
  }, [entries])

  function downloadTaxInvoice(e) {
    const issuer = loadIssuer()
    const supplier = suppliers.find(s => s.name === e.supplierName)
    // Full Legal Name (Marketing's "company" field) is the correct name for
    // a tax invoice — falls back to whatever was typed if there's no
    // matching supplier record or it has no legal name set.
    const billToName = supplier?.company || e.supplierName || '—'
    const supplierAddr = formatAddressLines(supplier?.address)
    const issuerAddr = formatAddressLines(issuer.addressLine1)
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    const rightMargin = 195

    function drawInvoiceBlock(startY) {
      let y = startY
      // Logo, top-right — sized and positioned so it never runs off the
      // page regardless of how large it gets.
      const logoW = 92, logoH = 37.4
      try { doc.addImage(RION_LOGO_PNG, 'PNG', rightMargin - logoW, 12, logoW, logoH) } catch {}

      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NAVY_RGB)
      doc.text('TAX INVOICE', 14, y); y += 10

      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40)
      doc.text(billToName, 14, y); y += 5
      if (supplierAddr.line1) { doc.text(supplierAddr.line1, 14, y); y += 5 }
      if (supplierAddr.line2) { doc.text(supplierAddr.line2, 14, y); y += 5 }
      if (supplierAddr.country) { doc.text(supplierAddr.country, 14, y); y += 5 }
      if (supplier?.abn) { doc.text(`ABN ${supplier.abn}`, 14, y); y += 5 }

      // Invoice metadata block (Date / Number / ABN) — starts below the
      // (now taller) logo rather than beside it, so there's no overlap.
      let my = 58
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY_RGB)
      doc.text('Invoice Date', 95, my)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
      doc.text(fmtDateAU(e.issueDate), 95, my + 5); my += 12
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
      doc.text('Invoice Number', 95, my)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
      doc.text(e.invoiceNumber, 95, my + 5); my += 12
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
      doc.text('ABN', 95, my)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
      doc.text(issuer.abn, 95, my + 5)

      // Issuer identity block, far right — same 2-line address format
      let iy = 58
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40)
      doc.text(issuer.name, 140, iy); iy += 4.5
      doc.text(`ABN ${issuer.abn}`, 140, iy); iy += 4.5
      if (issuerAddr.line1) { doc.text(issuerAddr.line1, 140, iy); iy += 4.5 }
      if (issuerAddr.line2) { doc.text(issuerAddr.line2, 140, iy); iy += 4.5 }
      if (issuerAddr.country) { doc.text(issuerAddr.country, 140, iy) }

      y = Math.max(y, my, iy) + 14

      const taxPct = Math.round(taxRateFraction(e.taxRate) * 100)
      autoTable(doc, {
        startY: y,
        head: [['Description', 'Quantity', 'Unit Price', 'GST', 'Amount AUD']],
        body: [[
          `${e.item}${e.description ? ' - ' + e.description : ''}`,
          Number(e.qty || 0).toFixed(2), `${fmt2(e.price)}`, `${taxPct}%`, fmt2(e.amount),
        ]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })

      let ty = doc.lastAutoTable.finalY + 8
      const total = (Number(e.amount) || 0) + (Number(e.taxAmount) || 0)
      doc.setFontSize(9.5); doc.setTextColor(60)
      doc.text('Subtotal', 150, ty); doc.text(fmt2(e.amount), rightMargin, ty, { align: 'right' }); ty += 6
      doc.text(`TOTAL  GST  ${taxPct}%`, 150, ty); doc.text(fmt2(e.taxAmount), rightMargin, ty, { align: 'right' }); ty += 3
      doc.setDrawColor(...NAVY_RGB); doc.line(140, ty, rightMargin, ty); ty += 5
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY_RGB)
      doc.text('TOTAL AUD', 150, ty); doc.text(fmt2(total), rightMargin, ty, { align: 'right' })
      ty += 14

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40)
      doc.text(`Due Date: ${fmtDateAU(e.dueDate)}`, 14, ty); ty += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text(`NAME: ${issuer.bankName}`, 14, ty); ty += 4.5
      doc.text(`BSB: ${issuer.bsb}`, 14, ty); ty += 4.5
      doc.text(`Account: ${issuer.account}`, 14, ty)

      return total
    }

    const total = drawInvoiceBlock(64)

    // Perforated cut line + Payment Advice tear-off, matching the layout
    // Cameron's existing template already uses.
    let cy = 230
    doc.setDrawColor(...PINK_RGB); doc.setLineDashPattern([2, 2], 0)
    doc.line(14, cy, rightMargin, cy)
    doc.setLineDashPattern([], 0)
    cy += 12

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY_RGB)
    doc.text('PAYMENT ADVICE', 14, cy)
    let ay = cy + 10
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40)
    doc.text('To:', 14, ay)
    doc.text(issuer.name, 30, ay); ay += 4.5
    doc.text(`ABN ${issuer.abn}`, 30, ay); ay += 4.5
    if (issuerAddr.line1) { doc.text(issuerAddr.line1, 30, ay); ay += 4.5 }
    if (issuerAddr.line2) { doc.text(issuerAddr.line2, 30, ay); ay += 4.5 }
    if (issuerAddr.country) { doc.text(issuerAddr.country, 30, ay) }

    let py = cy + 10
    const rows = [
      ['Customer', billToName],
      ['Invoice Number', e.invoiceNumber],
      ['Amount Due', fmt2(total)],
      ['Due Date', fmtDateAU(e.dueDate)],
    ]
    rows.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
      doc.text(label, 120, py)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
      doc.text(String(val), 195, py, { align: 'right' })
      py += 6
    })
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
    doc.text('Amount Enclosed', 120, py); py += 5
    doc.setDrawColor(180); doc.line(120, py, 195, py); py += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text('Enter the amount you are paying above', 120, py)

    doc.save(`${e.invoiceNumber}.pdf`)
  }

  const inputStyle = { border: '1px solid #e8eaed', borderRadius: 5, padding: '5px 7px', fontSize: 11, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1500, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <datalist id="direct-income-suppliers">
        {suppliers.map(s => <option key={s.name} value={s.name} />)}
      </datalist>
      <datalist id="direct-income-tax-rates">
        {TAX_RATES.map(t => <option key={t} value={t} />)}
      </datalist>
      <datalist id="direct-income-clients">
        {clients.map(c => <option key={c.name} value={c.name} />)}
      </datalist>

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

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setView('current')} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${view === 'current' ? NAVY : '#e8eaed'}`, background: view === 'current' ? NAVY : '#fff', color: view === 'current' ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Current</button>
        <button onClick={() => setView('history')} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${view === 'history' ? NAVY : '#e8eaed'}`, background: view === 'history' ? NAVY : '#fff', color: view === 'history' ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>History</button>
      </div>

      {view === 'current' && (
        <>
          {monthClosed && (
            <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92600A' }}>
              🔒 This month is closed — its commission statement has already been imported, and these entries were folded into that month's totals. Locked to keep the finalized record intact. Find it under the History tab any time.
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 1650 }}>
                <thead>
                  <tr style={{ background: NAVY }}>
                    {['Invoice #', 'Issue Date', 'Due Date', 'Supplier/Lender', 'Deal', 'Client', 'Item', 'Description', 'Qty', 'Price', 'Account', 'Tax Rate', 'Tax Amount', 'Amount', 'Total', '', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 8px', color: '#fff', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', textAlign: ['Qty','Price','Tax Amount','Amount','Total'].includes(h) ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthEntries.length === 0 && (
                    <tr><td colSpan={17} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No direct income entries for {monthLabel(month)} yet.</td></tr>
                  )}
                  {monthEntries.map(e => {
                    const total = (Number(e.amount) || 0) + (Number(e.taxAmount) || 0)
                    return (
                      <tr key={e.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} value={e.invoiceNumber} onChange={ev => updateRow(e.id, { invoiceNumber: ev.target.value })} style={{ ...inputStyle, width: 80 }} /></td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} type="date" value={e.issueDate} onChange={ev => updateRow(e.id, { issueDate: ev.target.value })} style={{ ...inputStyle, width: 130 }} /></td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} type="date" value={e.dueDate} onChange={ev => updateRow(e.id, { dueDate: ev.target.value })} style={{ ...inputStyle, width: 130 }} /></td>
                        <td style={{ padding: '6px 6px' }}>
                          <div style={{ display:'flex', gap:4 }}>
                            <input disabled={monthClosed} value={e.supplierName} onChange={ev => updateRow(e.id, { supplierName: ev.target.value })}
                              list="direct-income-suppliers" placeholder="Start typing…" style={{ ...inputStyle, width: 130 }} />
                            <button type="button" onClick={() => window.open('/radar/marketing', '_blank')}
                              title="Add a new lender in Marketing" style={{ border:'1px solid #e8eaed', borderRadius:5, background:'#fff', color:'#7A8090', fontSize:14, cursor:'pointer', padding:'0 6px', flexShrink:0 }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <select disabled={monthClosed} value={e.dealName} onChange={ev => selectDeal(e.id, ev.target.value)} style={{ ...inputStyle, width: 130 }}>
                            <option value="">— No deal —</option>
                            {settledDealsThisMonth.map(d => <option key={d['Transaction Name']} value={d['Transaction Name']}>{d['Transaction Name']}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <input disabled={monthClosed} value={e.clientName} onChange={ev => updateRow(e.id, { clientName: ev.target.value })}
                            list="direct-income-clients" placeholder="Start typing…" style={{ ...inputStyle, width: 110 }} />
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <select disabled={monthClosed} value={e.item} onChange={ev => updateRow(e.id, { item: ev.target.value })} style={{ ...inputStyle, width: 110 }}>
                            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} value={e.description} onChange={ev => updateRow(e.id, { description: ev.target.value })} style={{ ...inputStyle, width: 160 }} /></td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} type="number" value={e.qty} onChange={ev => recalc(e.id, { qty: ev.target.value })} style={{ ...inputStyle, width: 55, textAlign:'right' }} /></td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} type="number" value={e.price} onChange={ev => recalc(e.id, { price: ev.target.value })} style={{ ...inputStyle, width: 85, textAlign:'right' }} /></td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} value={e.account} onChange={ev => updateRow(e.id, { account: ev.target.value })} style={{ ...inputStyle, width: 170 }} /></td>
                        <td style={{ padding: '6px 6px' }}>
                          <input disabled={monthClosed} value={e.taxRate} onChange={ev => recalc(e.id, { taxRate: ev.target.value })}
                            list="direct-income-tax-rates" style={{ ...inputStyle, width: 120 }} />
                        </td>
                        <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} type="number" value={e.taxAmount} onChange={ev => updateRow(e.id, { taxAmount: ev.target.value === '' ? '' : Number(ev.target.value) })} style={{ ...inputStyle, width: 85, textAlign:'right' }} /></td>
                        <td style={{ padding: '6px 6px', textAlign:'right', fontWeight:600, whiteSpace:'nowrap' }}>${fmt2(e.amount)}</td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(total)}</td>
                        <td style={{ padding: '6px 6px' }}>
                          <button onClick={() => downloadTaxInvoice(e)} title="Download Tax Invoice"
                            style={{ background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10.5, whiteSpace:'nowrap' }}>📄 Invoice</button>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          {!monthClosed && <button onClick={() => removeRow(e.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8f9fa', borderTop: '1.5px solid #e8eaed' }}>
                    <td colSpan={14} style={{ padding: '9px 8px', fontWeight: 700, fontSize: 12, color: '#2A3545' }}>Total — {monthLabel(month)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#22c55e', whiteSpace: 'nowrap' }}>${fmt2(monthTotal)}</td>
                    <td></td><td></td>
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
        </>
      )}

      {view === 'history' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden' }}>
          {closedByMonth.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No closed months yet — entries land here once a commission statement has been imported for that month.</div>
          )}
          {closedByMonth.map(({ month: m, items }) => {
            const mTotal = items.reduce((s, e) => s + (Number(e.amount) || 0) + (Number(e.taxAmount) || 0), 0)
            return (
              <div key={m} style={{ borderBottom: '0.5px solid #e8eaed' }}>
                <div style={{ background: '#f8f9fa', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2A3545' }}>🔒 {monthLabel(m)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>${fmt2(mTotal)}</span>
                </div>
                {items.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: '0.5px solid #f7f7f7', fontSize: 11.5 }}>
                    <span style={{ width: 80, color: '#7A8090' }}>{e.invoiceNumber}</span>
                    <span style={{ flex: 1, color: '#2A3545' }}>{e.supplierName || '—'} — {e.item}{e.description ? ' · ' + e.description : ''}</span>
                    <span style={{ width: 90, textAlign: 'right', fontWeight: 600 }}>${fmt2((Number(e.amount)||0)+(Number(e.taxAmount)||0))}</span>
                    <button onClick={() => downloadTaxInvoice(e)} style={{ background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10.5, whiteSpace:'nowrap' }}>📄 Invoice</button>
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
