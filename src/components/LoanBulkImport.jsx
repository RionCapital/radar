import React, { useMemo, useState } from 'react'
import { fmt } from '../lib/data'
import { getLoanTypes } from '../lib/settings'
import { suggestNextConnNo, commitConnNoUsed } from '../lib/connectionSequence'
import { parsePaidDate, parseMoney } from './LoanHistoryImport'

// ─── Import loans (bulk, from a spreadsheet) ─────────────────────────────────
// For loans that never came through a commission statement — e.g. a batch of
// Connective Asset Finance settlements — and so have no way into Rradar other
// than typing each one. Paste rows straight from a spreadsheet; the header row
// names the columns (any order, extra columns ignored):
//
//   Connection Name · Connection # · Loan type · Lender · Loan Amount ·
//   Settled Date · Loan Acc No · Rate (%) · Term (years) · Repayment ·
//   Balloon · Stream · Loan name
//
// Each row is matched to an existing connection (by Connection #, then by
// name) or creates a new one; the loan is added as Direct (tracked in Rradar,
// not from a statement) so it counts on the Dashboard's Portfolio Split. An
// Asset Finance loan's balance is then calculated from amount / rate / term /
// settlement, exactly as on the loan page — so Rate and Term are worth
// filling in, but the loan can be edited afterwards if they're not known.
// Nothing is written to Direct Income here: commission is handled separately.

const STREAMS = ['Private Wealth', 'Commercial']

const COLS = {
  name:    ['connection name', 'connection', 'client', 'client name', 'name'],
  connNo:  ['connection #', 'connection no', 'connection number', 'conn #', 'conn no', '#'],
  type:    ['loan type', 'type'],
  lender:  ['lender', 'bank', 'lender code', 'lender code (on rcti)'],
  amount:  ['loan amount', 'amount', 'amount financed', 'limit'],
  settled: ['settled date', 'settled', 'settlement date', 'settlement'],
  acc:     ['loan acc no', 'account no', 'account', 'acc', 'acc no', 'loan account'],
  rate:    ['rate (%)', 'rate', 'interest rate'],
  term:    ['term (years)', 'term', 'term years', 'term (months)'],
  rpmt:    ['repayment', 'repayment (p&i/io)', 'rpmt', 'p&i/io'],
  balloon: ['balloon', 'balloon ($)', 'residual'],
  stream:  ['stream'],
  lname:   ['loan name'],
}
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

function mapHeader(cells) {
  const map = {}
  cells.forEach((c, i) => {
    const n = norm(c)
    for (const [key, aliases] of Object.entries(COLS)) {
      if (map[key] === undefined && aliases.includes(n)) { map[key] = i; return }
    }
  })
  return map
}
const DEFAULT_ORDER = ['name', 'connNo', 'type', 'lender', 'amount', 'settled', 'acc', 'rate', 'term', 'rpmt', 'balloon', 'stream', 'lname']

function parseTermYears(s) {
  const t = norm(s); if (!t) return null
  const n = parseFloat(t.replace(/[^0-9.]/g, '')); if (isNaN(n)) return null
  return /m/.test(t) && !/y/.test(t) ? Math.round((n / 12) * 100) / 100 : n
}
function parseRate(s) { const n = parseFloat(String(s || '').replace(/[%\s]/g, '')); return isNaN(n) ? null : n }

export function parseLoanRows(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
  if (!lines.length) return []
  const split = l => { let c = l.split('\t'); if (c.length < 2) c = l.split(/\s{2,}/); return c.map(x => x.trim()) }
  let map = mapHeader(split(lines[0]))
  let body = lines
  if (map.name !== undefined || map.amount !== undefined) body = lines.slice(1)
  else DEFAULT_ORDER.forEach((k, i) => { map[k] = i })
  return body.map(line => {
    const c = split(line)
    const get = k => (map[k] !== undefined ? c[map[k]] : '') || ''
    const amount = parseMoney(get('amount'))
    const settled = parsePaidDate(get('settled'))
    const connNo = parseInt(String(get('connNo')).replace(/[^0-9]/g, ''), 10) || null
    const streamRaw = norm(get('stream'))
    return {
      raw: line,
      name: get('name').trim(), connNo, type: get('type').trim(), lender: get('lender').trim(),
      amount, settled, acc: get('acc').trim(), rate: parseRate(get('rate')), term: parseTermYears(get('term')),
      rpmt: /^io$/i.test(get('rpmt').trim()) ? 'IO' : 'P&I', balloon: parseMoney(get('balloon')) || 0,
      stream: streamRaw.startsWith('priv') || streamRaw === 'pw' ? 'Private Wealth' : streamRaw.startsWith('comm') ? 'Commercial' : '',
      lname: get('lname').trim(),
      valid: !!get('name').trim() && amount > 0,
    }
  })
}

export default function LoanBulkImport({ clients, onUpdateClients, onClose }) {
  const [text, setText] = useState('')
  const [defaultStream, setDefaultStream] = useState('Commercial')
  const [defaultType, setDefaultType] = useState('Asset Finance')
  const [defaultTerm, setDefaultTerm] = useState(5)
  const [markDirect, setMarkDirect] = useState(true)
  const [overrides, setOverrides] = useState({}) // rowIdx -> { target: clientName | 'NEW', stream }
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const loanTypes = getLoanTypes()
  const live = (clients || []).filter(c => !c._demo)

  const rows = useMemo(() => parseLoanRows(text), [text])

  // Resolve each row to an existing connection: Connection # first, then an
  // exact (case-insensitive) name match. Anything else is a new connection.
  const resolved = rows.map((r, i) => {
    const byNo = r.connNo ? live.find(c => Number(c.connNo) === r.connNo) : null
    const byName = live.find(c => norm(c.name) === norm(r.name))
    const auto = byNo || byName
    const ov = overrides[i] || {}
    const target = ov.target !== undefined ? ov.target : (auto ? auto.name : 'NEW')
    const client = target === 'NEW' ? null : live.find(c => c.name === target)
    const dupe = !!(client && r.acc && (client.loans || []).some(l => String(l.acc || '').trim() === r.acc))
    const stream = ov.stream || r.stream || defaultStream
    const nameMismatch = !!(byNo && !byName && byNo.name !== r.name)
    return { ...r, i, target, client, isNew: !client, dupe, stream, nameMismatch, how: byNo ? 'Connection #' : byName ? 'name' : '' }
  })
  const importable = resolved.filter(r => r.valid && !r.dupe)
  const newConns = new Set(importable.filter(r => r.isNew).map(r => norm(r.name)))
  const setOv = (i, patch) => setOverrides(o => ({ ...o, [i]: { ...(o[i] || {}), ...patch } }))

  function doImport() {
    setBusy(true)
    // Built from the clients as they stand right now (not via a functional
    // updater) so the counts below are known synchronously and the connection
    // sequence is committed exactly once.
    let created = 0, added = 0, lastConnNo = null
    const next = [...(clients || [])]
    const used = new Set(next.map(c => Number(c.connNo)).filter(Boolean))
    let seq = suggestNextConnNo(next)
    const nextConnNo = () => { while (used.has(seq)) seq++; used.add(seq); lastConnNo = Math.max(lastConnNo || 0, seq); return seq++ }
    importable.forEach(r => {
      let idx = r.client ? next.findIndex(c => c.name === r.client.name) : -1
      // Same new name twice in one paste → one new connection, two loans.
      if (idx < 0) idx = next.findIndex(c => !c._demo && norm(c.name) === norm(r.name))
      if (idx < 0) {
        let connNo
        if (r.connNo && !used.has(r.connNo)) { connNo = r.connNo; used.add(connNo); lastConnNo = Math.max(lastConnNo || 0, connNo) }
        else connNo = nextConnNo()
        next.push({ name: r.name, connNo, stream: r.stream, days: 0, score: 0, contacts: [], securities: [], notes: [], loans: [] })
        idx = next.length - 1; created++
      }
      const c = next[idx]
      const type = r.type || defaultType
      const loan = {
        acc: r.acc, lname: r.lname || `${r.lender ? r.lender + ' ' : ''}${type}`.trim(), type, bank: r.lender || 'Other',
        security: '', amount: r.amount, balance: r.amount, rate: r.rate || 0, rpmt: r.rpmt, term: r.term || defaultTerm,
        ioTerm: 0, fixed: '', io: '', balloon: r.balloon || '', settled: r.settled || '', closed: false,
        ...(markDirect ? { direct: true } : {}),
      }
      next[idx] = { ...c, loans: [...(c.loans || []), loan] }
      added++
    })
    onUpdateClients(next)
    if (lastConnNo) commitConnNoUsed(lastConnNo)
    setResult({ created, added, skipped: resolved.filter(r => r.dupe).length, invalid: resolved.filter(r => !r.valid).length })
    setBusy(false)
  }

  const label = { fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
  const inp = { fontSize: 11, padding: '4px 6px', border: '0.5px solid var(--border)', borderRadius: 6, width: '100%' }
  const th = { padding: '5px 6px', background: '#3D5570', color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td = { padding: '3px 6px', borderBottom: '0.5px solid var(--border-light)', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
  const chk = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 30, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: 1100, maxWidth: 'calc(100vw - 40px)', maxHeight: '90vh', overflowY: 'auto', padding: 24, margin: '0 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>Import loans</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Paste rows from a spreadsheet, header row included. Recognised columns (any order): <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)' }}>Connection Name · Connection # · Loan type · Lender · Loan Amount · Settled Date · Loan Acc No · Rate (%) · Term (years) · Repayment · Balloon · Stream · Loan name</span>. Each row is matched to an existing connection by Connection # then by name; anything unmatched becomes a new connection. Loans are added as Direct (tracked in Rradar, not from a statement). Commission is not touched.
        </div>

        {result ? (
          <div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Done</div>
              <div>{result.added} {result.added === 1 ? 'loan' : 'loans'} added, {result.created} new {result.created === 1 ? 'connection' : 'connections'} created.</div>
              {result.skipped > 0 && <div>{result.skipped} skipped — that account number already exists on the connection.</div>}
              {result.invalid > 0 && <div>{result.invalid} {result.invalid === 1 ? 'row' : 'rows'} couldn't be read (needs at least a connection name and an amount).</div>}
              <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>Open any loan to set the rate, term or balloon if they weren't in the paste — the calculated balance will update straight away.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <textarea value={text} onChange={e => { setText(e.target.value); setOverrides({}) }} rows={6} spellCheck={false}
              placeholder={'Connection Name\tConnection #\tLoan type\tLender\tLoan Amount\tSettled Date\tLoan Acc No\tRate (%)\tTerm (years)\nSmith Family Trust\t1042\tAsset Finance\tAXXA\t$54,000.00\t11-Mar-2026\tCAF175464\t7.95\t5'}
              style={{ ...inp, fontFamily: 'DM Mono, monospace', resize: 'vertical', whiteSpace: 'pre' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
              <div><div style={label}>Stream for new connections</div>
                <select style={inp} value={defaultStream} onChange={e => setDefaultStream(e.target.value)}>{STREAMS.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><div style={label}>Loan type if blank</div>
                <select style={inp} value={defaultType} onChange={e => setDefaultType(e.target.value)}>{loanTypes.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><div style={label}>Term (years) if blank</div>
                <input style={inp} type="number" step="0.5" value={defaultTerm} onChange={e => setDefaultTerm(+e.target.value || 5)} /></div>
              <div style={{ alignSelf: 'end' }}><label style={chk}><input type="checkbox" checked={markDirect} onChange={e => setMarkDirect(e.target.checked)} /> Mark loans as Direct</label></div>
            </div>

            {resolved.length > 0 && (
              <div style={{ marginTop: 14, maxHeight: 340, overflow: 'auto', border: '0.5px solid var(--border)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead><tr>{['Pasted name', 'Connection', 'Conn #', 'Stream', 'Type', 'Lender', 'Amount', 'Settled', 'Acc no', 'Rate', 'Term', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {resolved.map(r => (
                      <tr key={r.i} style={{ opacity: r.valid && !r.dupe ? 1 : 0.5 }}>
                        <td style={td}>{r.name || <span style={{ color: '#c0392b' }}>?</span>}</td>
                        <td style={td}>
                          <select value={r.target} onChange={e => setOv(r.i, { target: e.target.value })} style={{ ...inp, width: 200, color: r.isNew ? 'var(--pk)' : undefined }}>
                            <option value="NEW">+ New connection</option>
                            {live.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.name} value={c.name}>{c.name} (#{c.connNo})</option>)}
                          </select>
                        </td>
                        <td style={td}>{r.client ? `#${r.client.connNo}` : (r.connNo ? `#${r.connNo}` : <span style={{ color: '#94a3b8' }}>auto</span>)}</td>
                        <td style={td}>{r.isNew
                          ? <select value={r.stream} onChange={e => setOv(r.i, { stream: e.target.value })} style={{ ...inp, width: 120 }}>{STREAMS.map(s => <option key={s}>{s}</option>)}</select>
                          : <span style={{ color: '#94a3b8' }}>{r.client.stream}</span>}</td>
                        <td style={td}>{r.type || <span style={{ color: '#94a3b8' }}>{defaultType}</span>}</td>
                        <td style={td}>{r.lender || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{r.amount ? fmt(r.amount) : <span style={{ color: '#c0392b' }}>?</span>}</td>
                        <td style={td}>{r.settled || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={td}>{r.acc || '—'}</td>
                        <td style={td}>{r.rate != null ? `${r.rate}%` : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={td}>{r.term != null ? `${r.term}y` : <span style={{ color: '#94a3b8' }}>{defaultTerm}y</span>}</td>
                        <td style={{ ...td, fontSize: 9, color: r.dupe ? '#c0392b' : '#94a3b8' }}>
                          {!r.valid ? 'Needs a name and an amount' : r.dupe ? `Already on this connection (acc ${r.acc}) — skipped` : r.isNew ? 'New connection' : r.how ? `Matched by ${r.how}${r.nameMismatch ? ' — name differs, check' : ''}` : 'Chosen manually'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, marginTop: 14, borderTop: '0.5px solid var(--border)' }}>
              <button onClick={doImport} disabled={busy || !importable.length} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: importable.length ? 'pointer' : 'default', opacity: importable.length ? 1 : 0.5 }}>
                {busy ? 'Importing…' : `Import ${importable.length} ${importable.length === 1 ? 'loan' : 'loans'}`}
              </button>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '0.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              {importable.length > 0 && (
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  {importable.length} loans · {fmt(importable.reduce((s, r) => s + r.amount, 0))} · {newConns.size} new {newConns.size === 1 ? 'connection' : 'connections'} · {importable.length - importable.filter(r => r.isNew).length} onto existing
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
