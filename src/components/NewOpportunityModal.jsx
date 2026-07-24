import React, { useState, useEffect, useRef } from 'react'
import { loadDeals, saveDeals as libSaveDeals } from '../lib/deals'
import { mapRradarContactToDealContact } from '../lib/data'

const STAGES = ['1. Lead','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional','7. Settled','8. Withdrawn']
// Kept in sync with the same taxonomy in src/pages/DealPage.jsx — Category
// drives which Transaction Types are valid. If this list changes, update it
// in both places (no shared constants file yet).
const CATEGORIES = ['Residential','Commercial','Full Commercial (BANK RM)','SMSF','Business Loan','Trade & Invoice Finance','Asset Finance','Development']
const CATEGORY_TRANSACTION_TYPES = {
  'Residential': ['Purchase','Refinance','Pre-approval','Equity Release','Variation','Construction','FHO','Business Loan'],
  'Commercial': ['Purchase','Refinance','Pre-approval','Equity Release','Variation','Construction','FHO','Business Loan'],
  'Full Commercial (BANK RM)': ['New','Refinance','Variation','Equity Release','Business Loan','Maturity','Asset Finance','Trade & Working Capital'],
  'SMSF': ['Purchase','Refinance','Pre-approval','Construction'],
  'Business Loan': ['New','Refinance','Variation','Equity Release','Business Loan','Maturity','Asset Finance','Trade & Working Capital'],
  'Trade & Invoice Finance': ['New','Refinance','Variation'],
  'Asset Finance': ['Purchase','Refinance','Sale & Lease Back','Balloon/Maturity'],
  'Development': ['New Development','Mezzanine','Variation','Refinance','Residual Stock'],
}
const LEAD_SOURCES = ['1. Accountant','2. Solicitor','3. Client','4. Direct','5. Real Estate','6. Friend','7. Social Media','8. Financial Planner','9. BNI','10. Other']

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

const inp = {
  width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 9px',
  border: '0.5px solid #d1d5db', borderRadius: 6, background: '#fff',
  color: '#2A3545', outline: 'none', fontFamily: 'inherit'
}
const lbl = { fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 3, display: 'block' }

// Load clients from localStorage. Client data is saved by lib/data.js as a
// wrapped { data: [...], savedAt } object (not a raw array) — this was
// reading the wrapped object directly and handing it to clients.filter(),
// which throws "clients.filter is not a function" (minified to "r.filter is
// not a function" in production) the moment this modal opens.
function loadClients() {
  try {
    const s = localStorage.getItem('rion-radar-clients-v13')
    if (!s) return []
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed : (parsed.data || [])
  } catch { return [] }
}

// Deals loading now comes from lib/deals.js (imported above) — this used to
// be its own local copy that assumed the old plain-array storage format,
// which broke silently once saves started writing the wrapped
// {data, savedAt} format.

function saveDeals(deals) {
  libSaveDeals(deals)
}

export default function NewOpportunityModal({ onClose, onCreated, prefillClientName = '' }) {
  const [clients] = useState(() => loadClients())

  // Client selection
  const [clientMode, setClientMode] = useState(prefillClientName ? 'existing' : 'existing') // 'existing' | 'new'
  const [selectedClient, setSelectedClient] = useState(prefillClientName || '')
  const [newClientName, setNewClientName] = useState('')
  const [clientSearch, setClientSearch] = useState(prefillClientName || '')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef()

  // Deal fields
  const [dealSuffix, setDealSuffix]       = useState('') // appended to client name to make unique transaction name
  const [dealNumber, setDealNumber]       = useState('')   // e.g. "3" → auto-names "ClientName (3)"
  const [dealNameOverride, setDealNameOverride] = useState('')  // manual override of transaction name
  const [nameOverrideActive, setNameOverrideActive] = useState(false)
  const [status, setStatus] = useState('1. Lead')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [transType, setTransType] = useState('')
  const [leadSource, setLeadSource] = useState('')
  const [lender, setLender] = useState('')
  const [financeDue, setFinanceDue] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const filteredClients = clients.filter(c =>
    clientSearch.length > 0 && c.name.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 8)

  const clientDisplayName = clientMode === 'existing' ? selectedClient : newClientName

  // Build the auto transaction name
  const autoTransactionName = (() => {
    const base = clientDisplayName || ''
    if (dealNumber.trim()) return `${base} (${dealNumber.trim()})`
    if (dealSuffix.trim()) return `${base} — ${dealSuffix.trim()}`
    return base
  })()
  const transactionName = nameOverrideActive && dealNameOverride.trim()
    ? dealNameOverride.trim()
    : autoTransactionName

  // When auto-name changes, update override field to match (so user sees current value)
  // (handled via useEffect in JSX — override input is controlled)

  function handleCreate() {
    if (!clientDisplayName.trim()) { setError('Please select or enter a client name.'); return }
    if (!transactionName.trim()) { setError('Transaction name is required.'); return }

    // Check for duplicate
    const existing = loadDeals()
    if (existing.find(d => d['Transaction Name'] === transactionName)) {
      setError(`"${transactionName}" already exists. Add a description to make it unique.`)
      return
    }

    // Bug fix: this used to write '_linkedClient', but DealPage's client-
    // linking logic only ever reads 'RradarClient' — so a deal created
    // against an existing client here was never actually recognised as
    // linked by anything else in the app, only by a much looser fallback
    // that guesses from the deal name. Writing the field DealPage actually
    // checks makes the link real, not just a name-based guess.
    const linkedClient = clientMode === 'existing' ? clients.find(c => c.name === selectedClient) : null

    const newDeal = {
      'Transaction Name': transactionName,
      'Status': status,
      'Amount': amount ? Number(amount) : null,
      'Categories': category || '',
      'Transaction Type': transType || '',
      'Lead Source': leadSource || '',
      'Lender': lender || '',
      'Finance Due Date': financeDue || '',
      'Month of Settlement': financeDue ? financeDue.slice(0, 7) : '',
      'Status Notes': notes || '',
      'First Name(s)': '',
      'Last Name(s)': '',
      'RradarClient': linkedClient ? linkedClient.name : '',
      // Copies the client's contact details onto the deal itself (name,
      // email, mobile, etc.) rather than just linking to them live — so
      // they're here, editable, ready to use straight away, and stay put
      // even if the client's own record changes later.
      'Contacts': linkedClient?.contacts?.length ? linkedClient.contacts.map(mapRradarContactToDealContact) : [],
      '_createdAt': new Date().toISOString(),
    }

    saveDeals([...existing, newDeal])
    onCreated?.(newDeal)
    onClose()
  }

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div onClick={handleBackdrop} style={{
      position: 'fixed', inset: 0, background: 'rgba(42,53,69,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ background: NAVY, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>New Opportunity</div>
            <div style={{ fontSize: 11, color: PINK, marginTop: 2 }}>Add to CRM Pipeline</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: '18px 18px 0', maxHeight: 'calc(90vh - 120px)', overflowY: 'auto' }}>

          {/* Client */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 0, marginBottom: 8, border: '0.5px solid #e2e8f0', borderRadius: 7, overflow: 'hidden' }}>
              {[['existing', '🔗 Existing Rradar client'], ['new', '+ New client']].map(([mode, label]) => (
                <button key={mode} onClick={() => { setClientMode(mode); setClientSearch(''); setSelectedClient(''); setNewClientName('') }}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: clientMode === mode ? NAVY : '#f8fafc',
                    color: clientMode === mode ? '#fff' : '#64748b',
                    transition: 'all 0.15s'
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {clientMode === 'existing' ? (
              <div style={{ position: 'relative' }} ref={searchRef}>
                <label style={lbl}>Client name</label>
                <input style={{ ...inp, borderColor: selectedClient ? PINK : '#d1d5db' }}
                  value={clientSearch}
                  placeholder="Search Rradar clients…"
                  onChange={e => { setClientSearch(e.target.value); setSelectedClient(''); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
                {selectedClient && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                    ✓ Linked to {selectedClient}
                  </div>
                )}
                {showDropdown && filteredClients.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 7,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2, overflow: 'hidden'
                  }}>
                    {filteredClients.map(c => (
                      <div key={c.name}
                        onMouseDown={() => { setSelectedClient(c.name); setClientSearch(c.name); setShowDropdown(false) }}
                        style={{
                          padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                          color: '#2A3545', borderBottom: '0.5px solid #f1f5f9',
                          display: 'flex', alignItems: 'center', gap: 8
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#f0f7ff'}
                        onMouseOut={e => e.currentTarget.style.background = '#fff'}
                      >
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: NAVY, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {c.name.charAt(0).toUpperCase()}
                        </span>
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && clientSearch.length > 0 && filteredClients.length === 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No matching clients found</div>
                )}
              </div>
            ) : (
              <div>
                <label style={lbl}>New client name</label>
                <input style={inp} value={newClientName} placeholder="e.g. Smith, John & Mary Smith"
                  onChange={e => setNewClientName(e.target.value)} />
              </div>
            )}
          </div>

          {/* Deal number + description + name */}
          <div style={{ marginBottom: 14 }}>
            {/* Row: Deal # + Description */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={lbl}>Deal #</label>
                <input style={inp} value={dealNumber} placeholder="e.g. 3"
                  onChange={e => {
                    setDealNumber(e.target.value)
                    setNameOverrideActive(false) // reset override when number changes
                  }} />
              </div>
              <div>
                <label style={lbl}>Deal description <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(optional suffix)</span></label>
                <input style={inp} value={dealSuffix} placeholder="e.g. SMSF Refinance, Home Purchase…"
                  onChange={e => {
                    setDealSuffix(e.target.value)
                    setNameOverrideActive(false)
                  }} />
              </div>
            </div>

            {/* Auto-generated name preview + override */}
            {clientDisplayName && (
              <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 12px',
                border: '1px solid #DDE3EC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: nameOverrideActive ? 8 : 0 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Deal name: {' '}
                    {!nameOverrideActive && (
                      <strong style={{ color: NAVY }}>{autoTransactionName}</strong>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNameOverrideActive(v => !v)
                      if (!nameOverrideActive) setDealNameOverride(autoTransactionName)
                    }}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6,
                      border: '1px solid #DDE3EC', background: nameOverrideActive ? NAVY : '#fff',
                      color: nameOverrideActive ? '#fff' : '#64748b', cursor: 'pointer',
                      fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {nameOverrideActive ? '✕ Cancel override' : '✎ Override name'}
                  </button>
                </div>
                {nameOverrideActive && (
                  <input style={{ ...inp, marginBottom: 0, background: '#fff' }}
                    value={dealNameOverride}
                    placeholder="Enter custom deal name…"
                    onChange={e => setDealNameOverride(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            )}
          </div>

          {/* Stage + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Stage</label>
              <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Loan amount ($)</label>
              <input style={inp} type="number" value={amount} placeholder="e.g. 650000"
                onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          {/* Category + Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Category</label>
              <select style={inp} value={category} onChange={e => {
                const v = e.target.value
                const validTypes = CATEGORY_TRANSACTION_TYPES[v] || []
                setCategory(v)
                if (transType && !validTypes.includes(transType)) setTransType('')
              }}>
                <option value="">— Select —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Transaction type</label>
              <select style={inp} value={transType} onChange={e => setTransType(e.target.value)} disabled={!category}>
                <option value="">{category ? '— Select —' : 'Pick a category first'}</option>
                {(CATEGORY_TRANSACTION_TYPES[category] || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Lead source + Lender */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Lead source</label>
              <select style={inp} value={leadSource} onChange={e => setLeadSource(e.target.value)}>
                <option value="">— Select —</option>
                {LEAD_SOURCES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Lender</label>
              <input style={inp} value={lender} placeholder="e.g. CBA, Westpac…"
                onChange={e => setLender(e.target.value)} />
            </div>
          </div>

          {/* Finance due date */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Finance due date</label>
            <input style={inp} type="date" value={financeDue} onChange={e => setFinanceDue(e.target.value)} />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={notes}
              placeholder="Any initial context or next action…"
              onChange={e => setNotes(e.target.value)} />
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: 6, padding: '7px 10px', marginBottom: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 18px', borderTop: '0.5px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#fafafa' }}>
          <button onClick={onClose} style={{ fontSize: 12, padding: '7px 18px', borderRadius: 7, border: '0.5px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 500 }}>
            Cancel
          </button>
          <button onClick={handleCreate} style={{ fontSize: 12, padding: '7px 20px', borderRadius: 7, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            + Create opportunity
          </button>
        </div>
      </div>
    </div>
  )
}
