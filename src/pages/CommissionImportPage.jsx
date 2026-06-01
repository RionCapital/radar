import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'rion-pending-import'
const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

const fmt  = n => n != null ? '$' + Math.round(Math.abs(n)).toLocaleString() : '—'
const fmtD = n => n != null ? '$' + Math.abs(n).toFixed(2) : '—'
const diffColor = n => n < 0 ? '#22c55e' : n > 0 ? '#c0392b' : '#94a3b8'
const diffLabel = n => n < 0 ? `▼ ${fmt(n)}` : n > 0 ? `▲ ${fmt(n)}` : '—'

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadPending() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function savePending(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}
function clearPending() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

// ── Unmatched row component ───────────────────────────────────────────────────
function UnmatchedRow({ a, idx, clients, onAllocate, onDelete, navigate, onClose }) {
  const [expanded, setExpanded] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [pickedClient, setPickedClient] = useState(null)
  const [replaceMode, setReplaceMode] = useState(null)

  const inp = { fontSize: 11, padding: '5px 8px', border: '0.5px solid #e2e8f0', borderRadius: 5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }

  const filtered = searchText.length > 1
    ? clients.filter(c => c.name.toLowerCase().includes(searchText.toLowerCase())).slice(0, 8)
    : []

  const client = clients.find(c => c.name === pickedClient)

  function handleGo() {
    onAllocate(idx)  // mark as in-progress / pending allocation
    onClose()
    navigate(`/radar/clients/${encodeURIComponent(pickedClient)}`)
  }

  if (a.status === 'deleted') {
    return (
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, border: '0.5px solid #e2e8f0', marginBottom: 6, opacity: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{a.name} — {a.acc}</span>
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>Removed</span>
        </div>
        <button onClick={() => onDelete(idx, false)} style={{ fontSize: 10, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>Undo</button>
      </div>
    )
  }

  if (a.status === 'allocated') {
    return (
      <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 7, border: '0.5px solid #bbf7d0', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#166534' }}>✓ {a.name}</span>
          <span style={{ fontSize: 10, color: '#166534', marginLeft: 8 }}>Acc: {a.acc} · {a.lender} · {fmt(a.bal)} — allocated</span>
        </div>
        <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Ready</span>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', borderRadius: 7, border: `1.5px solid ${expanded ? '#3D4F6B' : '#faecc8'}`, marginBottom: 6, overflow: 'hidden' }}>
      {/* Summary row */}
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3545' }}>{a.name || '—'}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            Acc: <span style={{ fontFamily: 'monospace' }}>{a.acc}</span> · {a.lender} · Balance: <strong>{fmt(a.bal)}</strong>
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            Trail: {fmtD(a.trailComm)} · Upfront: {fmtD(a.upfrontComm)} · Total paid: {fmtD(a.totalPaid)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 10 }}>
          {!expanded && (
            <button onClick={() => setExpanded(true)}
              style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Allocate
            </button>
          )}
          <button onClick={() => onDelete(idx, true)}
            style={{ fontSize: 10, padding: '5px 8px', borderRadius: 6, border: '1px solid #fecaca', color: '#dc2626', background: '#fff', cursor: 'pointer' }}>
            ✕ Remove
          </button>
        </div>
      </div>

      {/* Allocation flow */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '0.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, color: '#64748b', margin: '10px 0 5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Add to existing client:
          </div>
          <input style={inp} placeholder="Type client name to search..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPickedClient(null); setReplaceMode(null) }} />

          {filtered.length > 0 && !pickedClient && (
            <div style={{ border: '0.5px solid #e2e8f0', borderRadius: 5, marginTop: 2, background: '#fff' }}>
              {filtered.map((c, ci) => (
                <div key={ci}
                  onClick={() => { setPickedClient(c.name); setSearchText(c.name) }}
                  style={{ padding: '7px 10px', fontSize: 11, cursor: 'pointer', borderBottom: ci < filtered.length-1 ? '0.5px solid #f1f5f9' : 'none' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  {c.name}
                  <span style={{ color: '#94a3b8', fontSize: 10 }}> · {c.loans?.filter(l=>!l.closed).length || 0} active loans</span>
                </div>
              ))}
            </div>
          )}

          {pickedClient && client && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                How to add to <strong style={{ color: NAVY }}>{pickedClient}</strong>?
              </div>
              {/* Add as new loan */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${replaceMode === 'new' ? NAVY : '#e2e8f0'}`, background: replaceMode === 'new' ? '#f0f4f8' : '#fff', cursor: 'pointer', marginBottom: 6 }}>
                <input type="radio" name={`mode-${idx}`} style={{ marginTop: 2 }} checked={replaceMode === 'new'} onChange={() => setReplaceMode('new')} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2A3545' }}>Add as new loan</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Account {a.acc} will be added as an additional loan in this client's portfolio</div>
                </div>
              </label>

              {/* Replace existing loan options */}
              {client.loans?.filter(l => !l.closed).length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#94a3b8', margin: '8px 0 5px', fontStyle: 'italic' }}>
                    — or replace an existing loan (marks it as discharged) —
                  </div>
                  {client.loans.filter(l => !l.closed).map((l, li) => (
                    <label key={li} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${replaceMode === li ? '#e8a020' : '#e2e8f0'}`, background: replaceMode === li ? '#fffbeb' : '#fff', cursor: 'pointer', marginBottom: 6 }}>
                      <input type="radio" name={`mode-${idx}`} style={{ marginTop: 2 }} checked={replaceMode === li} onChange={() => setReplaceMode(li)} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#2A3545' }}>
                          Replace: {l.lname || l.acc || `Loan ${li+1}`}
                          <span style={{ fontSize: 10, color: '#e8a020', fontWeight: 400, marginLeft: 6 }}>→ marked discharged</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {l.bank} · {l.rpmt} · Balance {fmt(l.balance)} · Acc: {l.acc}
                        </div>
                      </div>
                    </label>
                  ))}
                </>
              )}

              {replaceMode !== null && (
                <button onClick={handleGo}
                  style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 7, border: 'none', background: replaceMode === 'new' ? NAVY : '#e8a020', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {replaceMode === 'new'
                    ? `→ Go to ${pickedClient} — add new loan`
                    : `→ Go to ${pickedClient} — replace & discharge loan`}
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button onClick={() => { onClose(); navigate('/radar/clients/add') }}
              style={{ flex: 1, padding: '8px', borderRadius: 7, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
              + Create new client
            </button>
            <button onClick={() => setExpanded(false)}
              style={{ padding: '8px 14px', borderRadius: 7, border: '0.5px solid #e2e8f0', color: '#64748b', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CommissionImportPage({ clients, onImport }) {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [pending, setPending] = useState(() => loadPending())
  const [status, setStatus] = useState(pending ? 'review' : 'idle')
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [matchedOpen, setMatchedOpen] = useState(false)
  const [missingOpen, setMissingOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // On load / when clients change — auto-detect newly allocated accounts
  useEffect(() => {
    if (!pending) return
    const updated = { ...pending }
    let changed = false
    updated.unmatched = (pending.unmatched || []).map(a => {
      if (a.status === 'deleted') return a
      // Check if this acc now exists in any client's loans
      const found = clients.some(c => c.loans?.some(l => String(l.acc||'').trim() === String(a.acc).trim()))
      if (found && a.status !== 'allocated') {
        changed = true
        return { ...a, status: 'allocated' }
      }
      return a
    })
    if (changed) {
      setPending(updated)
      savePending(updated)
    }
  }, [clients])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStatus('parsing')
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

      const headerIdx = rows.findIndex(r => r.includes('Acc_number') || r.includes('Loan_Name'))
      if (headerIdx < 0) throw new Error('Could not find header row')
      const headers = rows[headerIdx].map(h => String(h||'').trim())

      const accIdx       = headers.indexOf('Acc_number')
      const balIdx       = headers.indexOf('Loan_Balance')
      const amtIdx       = headers.indexOf('Loan_Amount')
      const nameIdx      = headers.indexOf('Loan_Name')
      const lenderIdx    = headers.indexOf('Lender')
      const commIdx      = headers.indexOf('Total_Commission')
      const gstIdx       = headers.indexOf('GST')
      const totalPaidIdx = headers.indexOf('Total_Paid')
      const ctypeIdx     = headers.indexOf('Comm_Type')

      const stmtMap = {}
      for (const r of rows.slice(headerIdx + 1)) {
        const acc   = String(r[accIdx]  || '').trim()
        const bal   = parseFloat(r[balIdx])   || 0
        const amt   = parseFloat(r[amtIdx])   || 0
        const name  = String(r[nameIdx]  || '').trim()
        const lender = String(r[lenderIdx] || '').trim()
        const ctype = String(r[ctypeIdx] || '').trim()
        const comm  = parseFloat(r[commIdx])  || 0
        const gst   = parseFloat(r[gstIdx])   || 0
        const paid  = parseFloat(r[totalPaidIdx]) || 0
        if (!acc || acc === 'undefined') continue

        if (!stmtMap[acc]) {
          stmtMap[acc] = { acc, bal, amt, name, lender, ctype, trailComm: 0, upfrontComm: 0, gst: 0, totalPaid: 0 }
        }
        if (ctype === 'TC') {
          stmtMap[acc].bal    = bal
          stmtMap[acc].lender = lender || stmtMap[acc].lender
          stmtMap[acc].name   = name   || stmtMap[acc].name
          stmtMap[acc].trailComm += comm
        } else {
          stmtMap[acc].upfrontComm += comm
        }
        stmtMap[acc].gst      += gst
        stmtMap[acc].totalPaid += paid
      }

      // Build existing acc map
      const existingMap = {}
      clients.forEach(c => {
        c.loans.forEach(l => {
          const a = String(l.acc || '').trim()
          if (a) existingMap[a] = { client: c.name, loan: l }
        })
      })

      const matched   = []
      const unmatched = []
      const missing   = []

      Object.keys(stmtMap).forEach(acc => {
        if (existingMap[acc]) {
          const old = existingMap[acc].loan.balance
          matched.push({ acc, client: existingMap[acc].client, name: stmtMap[acc].name, lender: stmtMap[acc].lender, oldBal: old, newBal: stmtMap[acc].bal, diff: stmtMap[acc].bal - old })
        } else if (stmtMap[acc].bal > 0) {
          unmatched.push({ ...stmtMap[acc], status: 'pending' })
        }
      })

      Object.keys(existingMap).forEach(acc => {
        if (!stmtMap[acc] && existingMap[acc].loan.balance > 0) {
          missing.push({ acc, client: existingMap[acc].client, name: existingMap[acc].loan.lname, bal: existingMap[acc].loan.balance })
        }
      })

      const totals = {
        trail:   Object.values(stmtMap).reduce((s,a) => s + a.trailComm,   0),
        upfront: Object.values(stmtMap).reduce((s,a) => s + a.upfrontComm, 0),
        gst:     Object.values(stmtMap).reduce((s,a) => s + a.gst,         0),
        total:   Object.values(stmtMap).reduce((s,a) => s + a.totalPaid,   0),
      }

      const data = { fileName: file.name, uploadedAt: new Date().toISOString(), statementMonth, stmtMap, matched, unmatched, missing, totals }
      savePending(data)
      setPending(data)
      setStatus('review')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  function markAllocated(idx) {
    const updated = { ...pending, unmatched: pending.unmatched.map((a, i) => i === idx ? { ...a, status: 'in-progress' } : a) }
    setPending(updated)
    savePending(updated)
  }

  function deleteAccount(idx, del) {
    const updated = { ...pending, unmatched: pending.unmatched.map((a, i) => i === idx ? { ...a, status: del ? 'deleted' : 'pending' } : a) }
    setPending(updated)
    savePending(updated)
  }

  function applyImport() {
    if (!pending) return
    setApplying(true)
    onImport(pending.matched, pending.stmtMap, pending.statementMonth || statementMonth)
    clearPending()
    setPending(null)
    setStatus('done')
    setApplying(false)
  }

  const allResolved = pending && pending.unmatched.every(a => a.status === 'allocated' || a.status === 'deleted')
  const pendingCount = pending ? pending.unmatched.filter(a => a.status === 'pending' || a.status === 'in-progress').length : 0
  const allocatedCount = pending ? pending.unmatched.filter(a => a.status === 'allocated').length : 0
  const deletedCount = pending ? pending.unmatched.filter(a => a.status === 'deleted').length : 0

  const th = { padding: '6px 8px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }
  const td = (r) => ({ padding: '7px 8px', fontSize: 11, borderBottom: '0.5px solid #f1f5f9', ...r })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <button onClick={() => navigate('/radar/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, padding: 0 }}>
            ← Back to dashboard
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Commission Statement Import</h1>
          {pending && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>📄 {pending.fileName} · Uploaded {new Date(pending.uploadedAt).toLocaleDateString('en-AU')}</div>}
        </div>
        {status === 'review' && pending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!allResolved && (
              <div style={{ fontSize: 11, color: '#e8a020', fontWeight: 500 }}>
                {pendingCount} account{pendingCount !== 1 ? 's' : ''} still to resolve
              </div>
            )}
            <button onClick={applyImport} disabled={!allResolved || applying}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: allResolved ? PINK : '#e2e8f0', color: allResolved ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13, cursor: allResolved ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
              {applying ? 'Applying…' : `✓ Apply ${pending.matched.length + allocatedCount} updates`}
            </button>
          </div>
        )}
      </div>

      {status === 'idle' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', padding: 32 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Upload commission statement</div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px', lineHeight: 1.6 }}>
              Upload your monthly commission export (XLS or XLSX) from Mercury/Connective. Balances and commission will be matched by account number for your review before anything is applied.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: NAVY }}>Statement month:</div>
              <input type="month" value={statementMonth} onChange={e => setStatementMonth(e.target.value)}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#2A3545', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div onClick={() => fileRef.current.click()}
            style={{ border: '2px dashed #EB99C2', borderRadius: 10, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', background: '#fdf0f6' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PINK }}>Click to upload commission statement</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>XLS or XLSX — Mercury/Connective export</div>
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      )}

      {status === 'parsing' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Reading statement and matching accounts…</div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #fecaca', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#dc2626' }}>Could not read file. Please check it's a valid Mercury/Connective commission export.</div>
          <button onClick={() => setStatus('idle')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: 'none', background: PINK, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Try again</button>
        </div>
      )}

      {status === 'done' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>Import applied successfully</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>All balances and commission records have been updated.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => { setStatus('idle'); setPending(null) }}
              style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Import another
            </button>
            <button onClick={() => navigate('/radar/dashboard')}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}

      {status === 'review' && pending && (
        <div>
          {/* Statement month + totals */}
          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Statement month:</div>
              <input type="month" value={pending.statementMonth || statementMonth}
                onChange={e => { const u = { ...pending, statementMonth: e.target.value }; setPending(u); savePending(u); setStatementMonth(e.target.value) }}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#2A3545', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'Trail (excl. GST)', val: `$${pending.totals?.trail?.toFixed(2)}`, color: '#22c55e' },
                { label: 'Upfront (excl. GST)', val: `$${pending.totals?.upfront?.toFixed(2)}`, color: NAVY },
                { label: 'GST', val: `$${pending.totals?.gst?.toFixed(2)}`, color: '#64748b' },
                { label: 'Total Paid', val: `$${pending.totals?.total?.toFixed(2)}`, color: PINK },
              ].map(s => (
                <div key={s.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Matched', val: pending.matched.length, color: '#22c55e', bg: '#f0fdf4' },
              { label: 'Unresolved', val: pendingCount, color: '#e8a020', bg: '#fffbeb' },
              { label: 'Allocated', val: allocatedCount, color: '#22c55e', bg: '#f0fdf4' },
              { label: 'Removed', val: deletedCount, color: '#94a3b8', bg: '#f8fafc' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Unmatched accounts — always visible */}
          {pending.unmatched.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>
                Unallocated Accounts
                <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
                  — allocate each one below before applying the import
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                No automatic allocation has been attempted. Link each account to an existing client, create a new one, or remove it from this import.
              </div>
              {pending.unmatched.map((a, i) => (
                <UnmatchedRow key={i} a={a} idx={i} clients={clients}
                  onAllocate={markAllocated}
                  onDelete={deleteAccount}
                  navigate={navigate}
                  onClose={() => {}} />
              ))}
            </div>
          )}

          {/* Matched accounts — collapsible */}
          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', marginBottom: 14, overflow: 'hidden' }}>
            <button onClick={() => setMatchedOpen(o => !o)}
              style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                Matched Accounts ({pending.matched.length}) — will be updated on apply
              </div>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{matchedOpen ? '▲' : '▼'}</span>
            </button>
            {matchedOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Client','Loan name','Lender','Current','New balance','Change'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pending.matched.map((u, i) => (
                      <tr key={i}>
                        <td style={td({ color: PINK, fontWeight: 500 })}>{u.client}</td>
                        <td style={td({ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{u.name}</td>
                        <td style={td()}>{u.lender}</td>
                        <td style={td({ textAlign: 'right' })}>{fmt(u.oldBal)}</td>
                        <td style={td({ textAlign: 'right', fontWeight: 500 })}>{fmt(u.newBal)}</td>
                        <td style={td({ textAlign: 'right', color: diffColor(u.diff), fontWeight: 500 })}>{diffLabel(u.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Missing accounts — collapsible */}
          {pending.missing.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e2e8f0', overflow: 'hidden' }}>
              <button onClick={() => setMissingOpen(o => !o)}
                style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                  Missing from statement ({pending.missing.length}) — possible discharge/payout
                </div>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{missingOpen ? '▲' : '▼'}</span>
              </button>
              {missingOpen && (
                <div style={{ padding: '0 16px 16px', fontSize: 11, color: '#64748b' }}>
                  <p style={{ marginBottom: 10 }}>These accounts are in Rradar but didn't appear in this statement. No changes will be made — review and close manually if appropriate.</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Client</th><th style={th}>Acc. no.</th><th style={th}>Loan name</th><th style={th}>Last balance</th></tr></thead>
                    <tbody>
                      {pending.missing.map((m, i) => (
                        <tr key={i}>
                          <td style={td({ color: PINK, fontWeight: 500 })}>{m.client}</td>
                          <td style={td({ fontFamily: 'monospace', fontSize: 10 })}>{m.acc}</td>
                          <td style={td()}>{m.name || '—'}</td>
                          <td style={td()}>{fmt(m.bal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Start fresh */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={() => { if (window.confirm('Discard this import and start fresh?')) { clearPending(); setPending(null); setStatus('idle') } }}
              style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Discard this import and start fresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
