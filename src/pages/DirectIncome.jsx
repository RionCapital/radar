import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadDeals, syncDealsFromSupabase } from '../lib/deals'
import {
  ITEM_TYPES, TAX_RATES, DEFAULT_ACCOUNT, FIRST_INVOICE_NUMBER, taxRateFraction,
  loadDirectIncomeLocal, loadNextInvoiceNumberLocal, saveDirectIncome, syncDirectIncomeFromSupabase,
} from '../lib/directIncome'

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
function todayISO() { return new Date().toISOString().slice(0, 10) }
function plus14Days(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
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
  const [entries, setEntries] = useState(() => loadDirectIncomeLocal())
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(() => loadNextInvoiceNumberLocal())
  const [deals, setDeals] = useState(() => loadDeals())
  const [suppliers, setSuppliers] = useState(() => loadLenderList())
  const [month, setMonth] = useState(currentMonthKey())

  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => {
      if (cloud) {
        setEntries(cloud.entries)
        setNextInvoiceNumber(cloud.nextInvoiceNumber || FIRST_INVOICE_NUMBER)
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

  const settledDealsThisMonth = useMemo(() =>
    deals.filter(d => d.Status === '7. Settled' && d['Month of Settlement'] === month),
  [deals, month])

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

  function downloadTaxInvoice(e) {
    const supplier = suppliers.find(s => s.name === e.supplierName)
    const doc = new jsPDF()
    let y = 20

    doc.setFontSize(18); doc.setTextColor(61, 79, 107)
    doc.text('TAX INVOICE', 14, y); y += 10

    doc.setFontSize(10); doc.setTextColor(80)
    doc.text('RION Capital Investments Pty Ltd', 14, y); y += 5
    doc.text('SUITE 201, 90 Podium Way, ORAN PARK NSW 2570', 14, y); y += 10

    doc.setFontSize(10); doc.setTextColor(40)
    doc.text('Invoice Number: ' + e.invoiceNumber, 140, 20)
    doc.text('Issue Date: ' + e.issueDate, 140, 26)
    doc.text('Due Date: ' + e.dueDate, 140, 32)

    doc.setFontSize(11); doc.setTextColor(61, 79, 107)
    doc.text('Bill To:', 14, y); y += 5
    doc.setFontSize(10); doc.setTextColor(40)
    doc.text(e.supplierName || '—', 14, y); y += 5
    if (supplier && supplier.address) { doc.text(supplier.address, 14, y); y += 5 }
    if (supplier && supplier.abn) { doc.text('ABN: ' + supplier.abn, 14, y); y += 5 }
    y += 6

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Description', 'Qty', 'Price', 'Account', 'Tax Rate', 'Tax Amount', 'Amount']],
      body: [[
        e.item, e.description || '', e.qty, '$' + fmt2(e.price), e.account, e.taxRate,
        '$' + fmt2(e.taxAmount), '$' + fmt2(e.amount),
      ]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [61, 79, 107] },
    })

    const total = (Number(e.amount) || 0) + (Number(e.taxAmount) || 0)
    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(11); doc.setTextColor(61, 79, 107)
    doc.text('Total: $' + fmt2(total), 150, finalY)

    doc.save(e.invoiceNumber + '.pdf')
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

      <button onClick={() => navigate('/radar/dashboard')} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to dashboard</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>Direct Income</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>RCTIs, mandates, and other income that doesn't come through your commission statement. Enter once here, download the tax invoice, and the same figures are what you upload into Xero.</div>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 1600 }}>
            <thead>
              <tr style={{ background: NAVY }}>
                {['Invoice #', 'Issue Date', 'Due Date', 'Supplier/Lender', 'Deal', 'Client', 'Item', 'Description', 'Qty', 'Price', 'Account', 'Tax Rate', 'Tax Amount', 'Amount', 'Total', '', ''].map((h, i) => (
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
                    <td style={{ padding: '6px 6px' }}><input disabled={monthClosed} value={e.clientName} onChange={ev => updateRow(e.id, { clientName: ev.target.value })} style={{ ...inputStyle, width: 110 }} /></td>
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
                        style={{ background: '#fff', color: NAVY, border: '1px solid ' + NAVY, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10.5, whiteSpace:'nowrap' }}>📄 Invoice</button>
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
            <button onClick={addRow} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid ' + PINK, background: '#fff', color: PINK, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+ Add row</button>
          </div>
        )}
      </div>
    </div>
  )
}
