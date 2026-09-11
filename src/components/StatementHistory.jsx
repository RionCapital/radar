import React, { useEffect, useState } from 'react'
import {
  loadStatementHistoryLocal, syncStatementHistoryFromSupabase,
  saveStatementHistory, undoStatementImport,
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
