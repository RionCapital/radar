import React, { useState, useRef } from 'react'
import { Panel, PanelTitle, SaveBtn, CancelBtn } from '../components/UI'

function defaultStatementMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1) // default to previous month
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export default function CommissionImport({ clients, onImport, onClose }) {
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState(null)
  const [statementMonth, setStatementMonth] = useState(defaultStatementMonth)
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStatus('parsing')

    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

      // Find header row
      const headerIdx = rows.findIndex(r => r.includes('Acc_number') || r.includes('Loan_Name'))
      if (headerIdx < 0) { setStatus('error'); return }
      const headers = rows[headerIdx]
      const accIdx = headers.indexOf('Acc_number')
      const balIdx = headers.indexOf('Loan_Balance')
      const amtIdx = headers.indexOf('Loan_Amount')
      const nameIdx = headers.indexOf('Loan_Name')
      const lenderIdx = headers.indexOf('Lender')
      const typeIdx = headers.indexOf('Comm_Type')

      // Build balance map from statement (prefer TC rows)
      const stmtMap = {}
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i]
        const acc = String(r[accIdx] || '').trim()
        const bal = parseFloat(r[balIdx]) || 0
        const amt = parseFloat(r[amtIdx]) || 0
        const name = String(r[nameIdx] || '').trim()
        const lender = String(r[lenderIdx] || '').trim()
        const ctype = String(r[typeIdx] || '').trim()
        if (!acc || acc === 'undefined') continue
        if (!stmtMap[acc] || ctype === 'TC') {
          stmtMap[acc] = { acc, bal, amt, name, lender, ctype }
        }
      }

      // Build existing acc map from clients
      const existingMap = {}
      clients.forEach(c => {
        c.loans.forEach(l => {
          const acc = String(l.acc || '').trim()
          if (acc) existingMap[acc] = { client: c.name, loan: l }
        })
      })

      // Categorise
      const updates = []     // acc in both — update balance
      const newAccs = []     // in statement but not in system
      const missing = []     // in system but not in statement (possible discharge)

      // Updates
      Object.keys(stmtMap).forEach(acc => {
        if (existingMap[acc]) {
          const old = existingMap[acc].loan.balance
          const newBal = stmtMap[acc].bal
          if (Math.abs(old - newBal) > 1) {
            updates.push({ acc, client: existingMap[acc].client, name: stmtMap[acc].name, lender: stmtMap[acc].lender, oldBal: old, newBal, diff: newBal - old })
          }
        } else if (stmtMap[acc].bal > 0) {
          newAccs.push(stmtMap[acc])
        }
      })

      // Missing
      Object.keys(existingMap).forEach(acc => {
        if (!stmtMap[acc] && existingMap[acc].loan.balance > 0) {
          missing.push({ acc, client: existingMap[acc].client, name: existingMap[acc].loan.lname, bal: existingMap[acc].loan.balance })
        }
      })

      setResults({ updates, newAccs, missing, stmtMap, total: Object.keys(stmtMap).length })
      setStatus('review')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  function applyUpdates() {
    if (!results) return
    onImport(results.updates, results.stmtMap, statementMonth)
    setStatus('done')
  }

  const fmt = n => n != null ? '$' + Math.round(Math.abs(n)).toLocaleString() : '—'
  const diffColor = n => n < 0 ? '#27ae60' : n > 0 ? '#c0392b' : 'var(--text-secondary)'
  const diffLabel = n => n < 0 ? `▼ ${fmt(n)}` : n > 0 ? `▲ ${fmt(n)}` : '—'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: 740, maxHeight: '80vh', overflowY: 'auto', padding: 24, margin: '0 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>Import Commission Statement</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
        </div>

        {status === 'idle' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Upload your monthly commission export (XLS or XLSX) from Mercury/Connective. Balances will be matched by account number and flagged for review before any changes are applied.
            </p>
            <div onClick={() => fileRef.current.click()} style={{ border: '1.5px dashed var(--spk)', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: '#fdf0f6' }}
              onMouseOver={e => e.currentTarget.style.background = '#fdf0f6'}
              onMouseOut={e => e.currentTarget.style.background = '#fdf0f6'}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pk)' }}>Click to upload commission statement</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>XLS or XLSX — Mercury/Connective export format</div>
            </div>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleFile} />
          </div>
        )}

        {status === 'parsing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Reading statement and matching accounts...</div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#c0392b' }}>
            <div style={{ fontSize: 13 }}>Could not read file. Please check it's a valid Mercury commission export.</div>
          </div>
        )}

        {status === 'review' && results && (
          <div>
            {/* Statement month */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'10px 14px', background:'#f0f4f8', borderRadius:8, border:'1px solid #d1dae6' }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#3D4F6B' }}>📅 Statement month:</div>
              <input type="month" value={statementMonth} onChange={e=>setStatementMonth(e.target.value)}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid #d1dae6', background:'#fff', color:'#2A3545', fontFamily:'inherit' }}/>
              <div style={{ fontSize:11, color:'#5a6370' }}>
                Each loan's balance will be recorded under this month in the historic chart.
              </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Accounts in statement', val: results.total, color: 'var(--bl)' },
                { label: 'Balance updates found', val: results.updates.length, color: '#27ae60' },
                { label: 'Needs manual review', val: results.newAccs.length + results.missing.length, color: results.newAccs.length + results.missing.length > 0 ? '#e8a020' : 'var(--text-secondary)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Balance updates */}
            {results.updates.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27ae60' }} />
                  Balance updates ({results.updates.length}) — will be applied automatically
                </div>
                <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: 'var(--bg)' }}>
                      {['Client','Loan name','Lender','Current balance','New balance','Change'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '0.5px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {results.updates.map((u, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--pk)', borderBottom: '0.5px solid var(--border-light)' }}>{u.client}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)' }}>{u.lender}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right' }}>{fmt(u.oldBal)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', fontWeight: 500 }}>{fmt(u.newBal)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right', color: diffColor(u.diff), fontWeight: 500 }}>{diffLabel(u.diff)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New accounts — manual review needed */}
            {results.newAccs.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8a020' }} />
                  New accounts — manual review required ({results.newAccs.length})
                </div>
                <div style={{ background: '#fef9f0', border: '0.5px solid #f0d080', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 8, lineHeight: 1.5 }}>
                    ⚠️ These accounts appear in the statement but aren't in RION Radar. They may be new settlements or refinances replacing existing loans. Please review and add manually to the correct client.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr>
                      {['Acc. no.','Loan name','Lender','Balance','Action'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10, color: '#854F0B', fontWeight: 500, borderBottom: '0.5px solid #f0d080' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {results.newAccs.map((a, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', fontFamily: 'DM Mono, monospace', fontSize: 10, borderBottom: '0.5px solid #faecc8' }}>{a.acc}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #faecc8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #faecc8' }}>{a.lender}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #faecc8', fontWeight: 500 }}>{fmt(a.bal)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid #faecc8', fontSize: 10, color: '#854F0B' }}>Add via client dashboard</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Missing accounts */}
            {results.missing.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#BBC6DA' }} />
                  Missing from statement — possible discharge/payout ({results.missing.length})
                </div>
                <div style={{ background: '#f8fafc', border: '0.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                    These accounts are in RION Radar but didn't appear in this statement. They may have been paid out, discharged, or refinanced. No changes made — review and close manually if appropriate.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr>
                      {['Client','Acc. no.','Loan name','Last balance'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '0.5px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {results.missing.map((m, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--pk)', borderBottom: '0.5px solid var(--border-light)' }}>{m.client}</td>
                          <td style={{ padding: '6px 8px', fontFamily: 'DM Mono, monospace', fontSize: 10, borderBottom: '0.5px solid var(--border-light)' }}>{m.acc}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', fontWeight: 500 }}>{fmt(m.bal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
              <button onClick={applyUpdates} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
                Apply {results.updates.length} balance updates
              </button>
              <CancelBtn onClick={onClose} />
            </div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#27ae60', marginBottom: 6 }}>Balances updated successfully</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {results?.updates.length} accounts updated. Any flagged items require manual review in the client dashboard.
            </div>
            <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
