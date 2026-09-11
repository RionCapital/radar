import React, { useEffect, useState } from 'react'
import {
  loadStatementHistoryLocal, syncStatementHistoryFromSupabase,
  saveStatementHistory, undoStatementImport,
  allUnresolvedRows, clearUnresolvedRow, applyUnmatchedRow,
} from '../lib/statementHistory'

// ─── Settings > Rradar > Commission Statements ───────────────────────────────
// Every commission statement that's been applied, newest first, with what it
// contained and a way to take it back out. Figures are ex-GST to match the
// Dashboard; GST is shown as its own column.

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const money = n => '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function monthLabel(m) {
  const [y, mo] = (m || '').split('-')
  return y && mo ? `${MO[Number(mo) - 1]} ${y}` : (m || '—')
}
function whenLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : `${String(d.getDate()).padStart(2, '0')}-${MO[d.getMonth()]}-${d.getFullYear()}`
}


// One unmatched statement row, with the same choices the import screen gives:
// attach it to an existing loan (the CRM-settled case — the loan is already in
// Rradar, it just never had the bank's account number) or add it as a new loan.
function UnmatchedRowMatcher({ row, clients, onApply, onDiscard }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [mode, setMode] = useState(null)

  const live = (clients || []).filter(c => !c._demo)
  const matches = search.trim().length > 1
    ? live.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []
  const client = live.find(c => c.name === picked)
  const inp = { fontSize: 11, padding: '5px 8px', border: '0.5px solid #e2e8f0', borderRadius: 5, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ background: '#fff', borderRadius: 7, border: `1.5px solid ${open ? '#3D4F6B' : '#faecc8'}`, marginBottom: 6, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3545' }}>{row.name || '—'}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            Acc: <span style={{ fontFamily: 'monospace' }}>{row.acc}</span>{row.lender ? ` · ${row.lender}` : ''} · {monthLabel(row.month)} · Balance: <strong>{money(row.bal)}</strong>
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            Trail: {money(row.trailComm)} · Upfront: {money(row.upfrontComm)} · GST: {money(row.gst)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!open && <button onClick={() => setOpen(true)} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: '1px solid #3D4F6B', color: '#3D4F6B', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Match</button>}
          <button onClick={() => onDiscard(row)} style={{ fontSize: 10, padding: '5px 8px', borderRadius: 6, border: '1px solid #e8eaed', color: '#7A8090', background: '#fff', cursor: 'pointer' }}>Discard</button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '0.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, color: '#64748b', margin: '10px 0 5px', fontWeight: 600 }}>Search for the connection:</div>
          <input style={inp} placeholder="Type a connection name…" value={search}
            onChange={e => { setSearch(e.target.value); setPicked(null); setMode(null) }} />

          {matches.length > 0 && !picked && (
            <div style={{ border: '0.5px solid #e2e8f0', borderRadius: 5, marginTop: 2 }}>
              {matches.map((c, i) => (
                <div key={c.name} onClick={() => { setPicked(c.name); setSearch(c.name) }}
                  style={{ padding: '7px 10px', fontSize: 11, cursor: 'pointer', borderBottom: i < matches.length - 1 ? '0.5px solid #f1f5f9' : 'none' }}>
                  {c.name} <span style={{ color: '#94a3b8', fontSize: 10 }}>· #{c.connNo} · {(c.loans || []).filter(l => !l.closed).length} active loans</span>
                </div>
              ))}
            </div>
          )}

          {client && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                How should this land on <strong style={{ color: '#3D4F6B' }}>{client.name}</strong>?
              </div>
              {(client.loans || []).map((l, i) => l.closed ? null : (
                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${mode === i ? '#166534' : '#e2e8f0'}`, background: mode === i ? '#f0fdf4' : '#fff', cursor: 'pointer', marginBottom: 4 }}>
                  <input type="radio" name={`m-${row.recordId}-${row.acc}`} checked={mode === i} onChange={() => setMode(i)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#2A3545' }}>
                      Attach to: {l.lname || l.type || `Loan ${i + 1}`}
                      <span style={{ fontSize: 10, color: '#166534', fontWeight: 400, marginLeft: 6 }}>→ same loan, gains the account number, balance and this month's commission</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {l.acc ? `Acc: ${l.acc} · ` : 'No account number yet · '}{l.bank || 'lender not set'} · Bal: {money(l.balance)}
                    </div>
                  </div>
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${mode === 'new' ? '#3D4F6B' : '#e2e8f0'}`, background: mode === 'new' ? '#f0f4f8' : '#fff', cursor: 'pointer' }}>
                <input type="radio" name={`m-${row.recordId}-${row.acc}`} checked={mode === 'new'} onChange={() => setMode('new')} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2A3545' }}>Add as a new loan</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Account {row.acc} added to {client.name} as an additional loan</div>
                </div>
              </label>

              {mode !== null && (
                <button onClick={() => { onApply(row, { clientName: client.name, mode }); setOpen(false) }}
                  style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 7, border: 'none', background: mode === 'new' ? '#3D4F6B' : '#166534', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ✓ Confirm — {mode === 'new' ? `add new loan to ${client.name}` : `attach to existing loan for ${client.name}`}
                </button>
              )}
            </div>
          )}
          <button onClick={() => setOpen(false)} style={{ marginTop: 8, fontSize: 10, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>Cancel</button>
        </div>
      )}
    </div>
  )
}

export default function StatementHistory({ clients, onUpdateClients }) {
  const [records, setRecords] = useState(() => loadStatementHistoryLocal())
  const [note, setNote] = useState('')

  useEffect(() => {
    syncStatementHistoryFromSupabase().then(cloud => { if (cloud) setRecords(cloud) })
  }, [])

  const sorted = [...records].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || ''))

  // Both of these update the screen straight away and let the cloud copy
  // catch up in the background. saveStatementHistory writes localStorage
  // synchronously before it ever touches Supabase, so nothing is lost — and
  // awaiting the network first would leave the button stuck on "Removing…"
  // whenever the connection is slow or Supabase is unreachable.
  function removeStatement(rec) {
    const created = (rec.undo?.createdLoans || []).length
    const warn = [
      `Remove the ${monthLabel(rec.month)} statement?`, '',
      `• ${monthLabel(rec.month)} commission and balance history will be stripped from every loan it touched`,
      `• ${(rec.undo?.prevBalances || []).length} loan balances will go back to what they were before this import`,
      created ? `• ${created} loan${created === 1 ? '' : 's'} this import created will be deleted` : null,
      (rec.undo?.dischargedLoans || []).length ? `• ${(rec.undo.dischargedLoans).length} loan(s) it discharged will be reopened` : null,
      '', 'You can re-import the statement afterwards. Continue?',
    ].filter(Boolean).join('\n')
    if (!window.confirm(warn)) return
    const next = records.filter(r => r.id !== rec.id)
    onUpdateClients(undoStatementImport(clients, rec))
    setRecords(next)
    setNote(`${monthLabel(rec.month)} removed. Balances restored to their pre-import figures.`)
    saveStatementHistory(next)
  }

  const unresolved = allUnresolvedRows(records)

  function applyRow(row, target) {
    onUpdateClients(applyUnmatchedRow(clients, row, target))
    const next = clearUnresolvedRow(records, row.recordId, row.acc)
    setRecords(next)
    setNote(`${row.name || row.acc} matched to ${target.clientName}. ${monthLabel(row.month)} commission is now on that loan.`)
    saveStatementHistory(next)
  }

  function discardRow(row) {
    if (!window.confirm(`Discard ${row.name || row.acc}?\n\nIt will no longer be offered for matching. The commission on it stays out of Rradar.`)) return
    const next = clearUnresolvedRow(records, row.recordId, row.acc)
    setRecords(next)
    setNote(`${row.name || row.acc} discarded.`)
    saveStatementHistory(next)
  }

  function forgetStatement(rec) {
    if (!window.confirm(`Remove the ${monthLabel(rec.month)} entry from this list only?\n\nThe imported data STAYS exactly as it is — this just clears the log entry, so it can no longer be undone from here.`)) return
    const next = records.filter(r => r.id !== rec.id)
    setRecords(next)
    setNote(`${monthLabel(rec.month)} removed from the log. No client data was changed.`)
    saveStatementHistory(next)
  }

  const th = { padding: '7px 10px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }
  const td = (extra = {}) => ({ padding: '8px 10px', fontSize: 11, borderBottom: '0.5px solid #f1f5f9', whiteSpace: 'nowrap', ...extra })
  const btn = (danger) => ({
    fontSize: 10, padding: '4px 10px', borderRadius: 5,
    border: `1px solid ${danger ? '#fecaca' : '#e8eaed'}`, background: '#fff',
    color: danger ? '#dc2626' : '#7A8090', cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div>
      <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 14, lineHeight: 1.5 }}>
        Every commission statement that's been applied, newest first. Commission figures are ex-GST, matching the Dashboard; GST is shown separately.
        <br /><br />
        <strong>Remove statement</strong> reverses an import: it strips that month's commission and balance history from every loan it touched, puts each balance back to what it was beforehand, deletes any loans the import created, and reopens any it discharged. Use it when a statement went in wrong — then re-import it cleanly.
        <br />
        <strong>Forget entry</strong> only clears the row from this list and changes no client data.
      </div>

      {note && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '9px 12px', fontSize: 11, color: '#166534', marginBottom: 12 }}>{note}</div>
      )}

      {unresolved.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2A3545', marginBottom: 4 }}>
            Unmatched accounts <span style={{ color: '#e8a020' }}>({unresolved.length})</span>
          </div>
          <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 10, lineHeight: 1.5 }}>
            Statement rows whose account number matched no loan in Rradar, so their commission never landed. Match one to the loan it belongs to — typically a deal settled through the CRM that didn't have the bank's account number yet — and that month's commission and balance go onto it.
          </div>
          {unresolved.map(row => (
            <UnmatchedRowMatcher key={`${row.recordId}-${row.acc}`} row={row} clients={clients} onApply={applyRow} onDiscard={discardRow} />
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 12, fontStyle: 'italic', border: '0.5px solid #e2e8f0', borderRadius: 8 }}>
          No statement imports logged yet. Statements imported from now on will appear here.
        </div>
      ) : (
        <div style={{ border: '0.5px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Month', 'Imported', 'File', 'Accounts', 'Trail', 'Upfront', 'GST', 'Rows', ''].map((h, i) => (
                  <th key={h + i} style={{ ...th, textAlign: i >= 4 && i <= 6 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const c = r.counts || {}
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={td({ fontWeight: 600, color: '#2A3545' })}>{monthLabel(r.month)}</td>
                    <td style={td({ color: '#64748b' })}>{whenLabel(r.appliedAt)}{r.appliedBy ? ` · ${r.appliedBy}` : ''}</td>
                    <td style={td({ color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' })} title={r.fileName}>{r.fileName || '—'}</td>
                    <td style={td({ color: '#64748b' })}>{r.accounts ?? '—'}</td>
                    <td style={td({ textAlign: 'right', color: '#22c55e' })}>{money(r.totals?.trail)}</td>
                    <td style={td({ textAlign: 'right', color: '#3D4F6B' })}>{money(r.totals?.upfront)}</td>
                    <td style={td({ textAlign: 'right', color: '#94a3b8' })}>{money(r.totals?.gst)}</td>
                    <td style={td({ fontSize: 10, color: '#94a3b8' })}>
                      {[c.matched != null ? `${c.matched} matched` : null,
                        c.allocated ? `${c.allocated} allocated` : null,
                        c.deleted ? `${c.deleted} skipped` : null].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={td({ textAlign: 'right' })}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => forgetStatement(r)} style={btn(false)}>Forget entry</button>
                        <button onClick={() => removeStatement(r)} style={btn(true)}>Remove statement</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: '#7A8090', lineHeight: 1.5 }}>
        Statements imported before this log existed aren't listed — there was no record kept of them at the time. They can still be corrected by re-importing the month, which replaces that month's figures rather than adding to them.
      </div>
    </div>
  )
}
