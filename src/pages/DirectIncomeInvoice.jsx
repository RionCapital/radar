import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals } from '../lib/deals'
import { loadClients } from '../lib/data'
import { loadSettings, getDealStages } from '../lib/settings'
import {
  ITEM_TYPES, TAX_RATES, DEFAULT_ACCOUNT,
  loadDirectIncomeLocal, loadNextInvoiceNumberLocal, saveDirectIncome,
  invoiceItems, invoiceTotals, mkLineItem, recalcLineItem, loadPayeeOptions,
} from '../lib/directIncome'
import { downloadTaxInvoicePdf, fmt2 } from '../lib/directIncomePdf'
import PayeePicker from '../components/PayeePicker'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

function monthLabel(m) {
  const [y, mo] = (m || '').split('-').map(Number)
  if (!y || !mo) return m || ''
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}
function fmt3(n) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function DirectIncomeInvoice() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [settings] = useState(() => loadSettings())
  const startingInvoiceNumber = settings.companyDetails?.startingInvoiceNumber ?? 1150
  const [entries, setEntries] = useState(() => loadDirectIncomeLocal())
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(() => loadNextInvoiceNumberLocal(startingInvoiceNumber))
  const [deals] = useState(() => loadDeals())
  const [clients] = useState(() => loadClients())
  const payeeOptions = useMemo(() => loadPayeeOptions(clients), [clients])

  const entry = entries.find(e => e.id === id)
  const locked = !!entry?.closed

  const settledDisplay = useMemo(() => getDealStages(loadSettings()).find(s => s.id === 'settled')?.display, [])
  const settledDealsThisMonth = useMemo(() =>
    entry ? deals.filter(d => d.Status === settledDisplay && d['Month of Settlement'] === entry.month) : [],
  [deals, entry, settledDisplay])

  function persist(nextEntries, nextInvNum) {
    setEntries(nextEntries)
    if (nextInvNum !== undefined) setNextInvoiceNumber(nextInvNum)
    saveDirectIncome(nextEntries, nextInvNum !== undefined ? nextInvNum : nextInvoiceNumber)
  }

  // Every edit writes back immediately (matches the rest of the app's
  // live-save convention — no separate Save button). Normalises legacy
  // flat entries into the items[] shape the moment they're actually
  // edited; merely opening an old invoice without changing it never
  // triggers a write, so untouched historic invoices stay exactly as they were.
  function updateEntry(patch) {
    if (locked) return
    persist(entries.map(e => {
      if (e.id !== id) return e
      // Strip the legacy flat line-item fields once we're writing items[] —
      // otherwise they'd sit around stale (harmless since invoiceItems()
      // always prefers items[] when present, but confusing to leave behind).
      const { item, description, qty, price, account, taxRate, taxAmount, amount, ...rest } = e
      return { ...rest, ...patch, items: patch.items || invoiceItems(e) }
    }))
  }
  function updateItem(itemId, patch) {
    if (locked) return
    const items = invoiceItems(entry).map(it => it.id === itemId ? recalcLineItem({ ...it, ...patch }) : it)
    updateEntry({ items })
  }
  function addItem() {
    if (locked) return
    updateEntry({ items: [...invoiceItems(entry), mkLineItem()] })
  }
  function removeItem(itemId) {
    if (locked) return
    const items = invoiceItems(entry).filter(it => it.id !== itemId)
    updateEntry({ items: items.length ? items : [mkLineItem()] })
  }
  function selectDeal(dealName) {
    const deal = settledDealsThisMonth.find(d => d['Transaction Name'] === dealName)
    const clientName = deal ? (deal['RradarClient'] || deal.Contacts?.[0]?.name || '') : ''
    updateEntry({ dealName, clientName })
  }
  function deleteInvoice() {
    const totals = invoiceTotals(entry)
    const label = `${entry.supplierName || 'this invoice'} — $${fmt3(totals.total)} (${monthLabel(entry.month)})`
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return
    persist(entries.filter(e => e.id !== id))
    navigate('/radar/direct-income')
  }

  if (!entry) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
        <button onClick={() => navigate('/radar/direct-income')} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to Direct Income</button>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Invoice not found.</div>
      </div>
    )
  }

  const items = invoiceItems(entry)
  const totals = invoiceTotals(entry)
  const inputStyle = { border: '1px solid #e8eaed', borderRadius: 5, padding: '6px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const label = txt => <div style={{ fontSize: 10, color: '#7A8090', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <datalist id="direct-income-invoice-tax-rates">
        {TAX_RATES.map(t => <option key={t} value={t} />)}
      </datalist>
      <datalist id="direct-income-invoice-clients">
        {clients.map(c => <option key={c.name} value={c.name} />)}
      </datalist>

      <button onClick={() => navigate('/radar/direct-income')} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to Direct Income</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>{entry.invoiceNumber || 'New invoice'}</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>{monthLabel(entry.month)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => downloadTaxInvoicePdf(entry, payeeOptions)}
            style={{ background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>📄 Download PDF</button>
          {!locked && (
            <button onClick={deleteInvoice}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete invoice</button>
          )}
        </div>
      </div>

      {locked && (
        <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92600A' }}>
          🔒 This invoice's month is closed and locked — its commission statement has already been imported. You can still download the PDF, just can't edit or delete it here.
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <div>
            {label('Contact (who to invoice)')}
            <PayeePicker disabled={locked} value={entry.supplierName} onChange={v => updateEntry({ supplierName: v })} options={payeeOptions} />
          </div>
          <div>
            {label('Issue date')}
            <input disabled={locked} type="date" value={entry.issueDate || ''} onChange={e => updateEntry({ issueDate: e.target.value })} style={inputStyle} />
          </div>
          <div>
            {label('Due date')}
            <input disabled={locked} type="date" value={entry.dueDate || ''} onChange={e => updateEntry({ dueDate: e.target.value })} style={inputStyle} />
          </div>
          <div>
            {label('Invoice number')}
            <input disabled={locked} value={entry.invoiceNumber || ''} onChange={e => updateEntry({ invoiceNumber: e.target.value })} style={inputStyle} />
          </div>
          <div>
            {label('Deal (optional)')}
            <select disabled={locked} value={entry.dealName || ''} onChange={e => selectDeal(e.target.value)} style={inputStyle}>
              <option value="">— No deal —</option>
              {settledDealsThisMonth.map(d => <option key={d['Transaction Name']} value={d['Transaction Name']}>{d['Transaction Name']}</option>)}
            </select>
          </div>
          <div>
            {label('Client (optional)')}
            <input disabled={locked} value={entry.clientName || ''} onChange={e => updateEntry({ clientName: e.target.value })}
              list="direct-income-invoice-clients" placeholder="Start typing…" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 900 }}>
            <thead>
              <tr style={{ background: NAVY }}>
                {['Item', 'Description', 'Qty', 'Price', 'Account', 'Tax Rate', 'Tax Amount', 'Amount', ''].map(h => (
                  <th key={h} style={{ padding: '8px 8px', color: '#fff', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', textAlign: ['Qty', 'Price', 'Tax Amount', 'Amount'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 6px' }}>
                    <select disabled={locked} value={it.item} onChange={e => updateItem(it.id, { item: e.target.value })} style={{ ...inputStyle, width: 130 }}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 6px' }}><input disabled={locked} value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })} style={{ ...inputStyle, width: 200 }} /></td>
                  <td style={{ padding: '6px 6px' }}><input disabled={locked} type="number" value={it.qty} onChange={e => updateItem(it.id, { qty: e.target.value })} style={{ ...inputStyle, width: 55, textAlign: 'right' }} /></td>
                  <td style={{ padding: '6px 6px' }}><input disabled={locked} type="number" value={it.price} onChange={e => updateItem(it.id, { price: e.target.value })} style={{ ...inputStyle, width: 90, textAlign: 'right' }} /></td>
                  <td style={{ padding: '6px 6px' }}><input disabled={locked} value={it.account} onChange={e => updateItem(it.id, { account: e.target.value })} style={{ ...inputStyle, width: 180 }} /></td>
                  <td style={{ padding: '6px 6px' }}>
                    <input disabled={locked} value={it.taxRate} onChange={e => updateItem(it.id, { taxRate: e.target.value })}
                      list="direct-income-invoice-tax-rates" style={{ ...inputStyle, width: 130 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}><input disabled={locked} type="number" value={it.taxAmount} onChange={e => updateItem(it.id, { taxAmount: e.target.value === '' ? '' : Number(e.target.value) })} style={{ ...inputStyle, width: 90, textAlign: 'right' }} /></td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>${fmt3(it.amount)}</td>
                  <td style={{ padding: '6px 6px' }}>
                    {!locked && items.length > 1 && (
                      <button onClick={() => removeItem(it.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && (
          <div style={{ padding: '10px 14px' }}>
            <button onClick={addItem} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${PINK}`, background: '#fff', color: PINK, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+ Add row</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', padding: '14px 20px', minWidth: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7A8090', marginBottom: 6 }}>
            <span>Subtotal</span><span>${fmt3(totals.amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7A8090', marginBottom: 10, paddingBottom: 10, borderBottom: '0.5px solid #e8eaed' }}>
            <span>Total GST</span><span>${fmt3(totals.taxAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
            <span>Total</span><span>${fmt3(totals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
