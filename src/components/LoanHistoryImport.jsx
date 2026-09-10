import React, { useMemo, useState } from 'react'
import { fmt } from '../lib/data'
import {
  TAX_RATES, DEFAULT_ACCOUNT, taxRateFraction,
  loadDirectIncomeLocal, saveDirectIncome, syncDirectIncomeFromSupabase, invoiceTotals,
} from '../lib/directIncome'

// ─── Import History (Direct loans) ───────────────────────────────────────────
// Loans that don't come through an aggregator commission statement (a Shift
// overdraft, a direct Asset Finance deal, etc.) never get a balance or
// commission history from the statement import — so this is how that history
// gets in: paste the lender's remittance table straight from a spreadsheet
// (Payment received · Associated month · Commission · Implied average
// balance) and it becomes (a) monthly balance history on this loan and
// (b) one Direct Income entry per commission payment, filed under the
// associated month. One-off upfronts (settlement, a limit increase) can be
// added alongside.
//
// The commission deliberately goes ONLY into Direct Income and NOT into
// loan.commissionHistory — the Dashboard already adds Direct Income on top
// of statement commission per month, so writing it to both places would
// double-count it on the Commission Income chart.

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const fmtC = n => '$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function mkId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function yr4(y) { const n = Number(y); return n < 100 ? 2000 + n : n }
function iso(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

// "03-Sep-26", "3/9/2026", "2026-09-03" → "2026-09-03"
export function parsePaidDate(s) {
  const t = (s || '').trim()
  let m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ](\d{2,4})$/.exec(t)
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()); if (mo >= 0) return iso(yr4(m[3]), mo + 1, Number(m[1])) }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(t)
  if (m) return iso(yr4(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return t
  return null
}
// "Aug-26", "Aug 2026", "08/2026", "2026-08" → "2026-08"
export function parseMonthKey(s) {
  const t = (s || '').trim()
  let m = /^([A-Za-z]{3})[a-z]*[-/ ]?(\d{2,4})$/.exec(t)
  if (m) { const mo = MONTHS.indexOf(m[1].toLowerCase()); if (mo >= 0) return `${yr4(m[2])}-${String(mo + 1).padStart(2, '0')}` }
  m = /^(\d{1,2})[-/](\d{2,4})$/.exec(t)
  if (m) return `${yr4(m[2])}-${String(Number(m[1])).padStart(2, '0')}`
  m = /^(\d{4})-(\d{2})$/.exec(t)
  if (m) return t
  return null
}
export function parseMoney(s) {
  const t = (s || '').replace(/[$,\s]/g, '')
  if (t === '' || t === '-') return null
  const n = Number(t)
  return isNaN(n) ? null : n
}
function monthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return `${MO[Number(m) - 1]}-${y.slice(2)}`
}
function plus14Days(isoDate) {
  const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}
function monthEnd(key) {
  const [y, m] = key.split('-').map(Number)
  return iso(y, m, new Date(y, m, 0).getDate())
}

// Splits pasted spreadsheet text into rows. Excel copies cells tab-separated;
// falls back to 2+ spaces for text pasted from elsewhere. Commas are NOT a
// separator because the money columns contain them ($1,441,773.55).
export function parsePastedRows(text) {
  return (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    let cells = line.split('\t').map(c => c.trim())
    if (cells.length < 2) cells = line.split(/\s{2,}/).map(c => c.trim())
    const [paidRaw, monthRaw, commRaw, balRaw] = cells
    const paid = parsePaidDate(paidRaw)
    const month = parseMonthKey(monthRaw)
    const commission = parseMoney(commRaw)
    const balance = parseMoney(balRaw)
    const isHeader = !paid && !month && /[A-Za-z]/.test(line)
    return { raw: line, paid, month, commission, balance, isHeader, valid: !!month && (commission != null || balance != null) }
  }).filter(r => !r.isHeader)
}

function gstSplit(figure, taxRate, inclusive) {
  const frac = taxRateFraction(taxRate)
  const gross = Number(figure) || 0
  if (!frac) return { amount: Math.round(gross * 100) / 100, taxAmount: 0 }
  if (inclusive) {
    const amount = Math.round((gross / (1 + frac)) * 100) / 100
    return { amount, taxAmount: Math.round((gross - amount) * 100) / 100 }
  }
  return { amount: Math.round(gross * 100) / 100, taxAmount: Math.round(gross * frac * 100) / 100 }
}

export default function LoanHistoryImport({ client, loan, loanIdx, updateClient, onClose }) {
  const [text, setText] = useState('')
  const [addBalances, setAddBalances] = useState(true)
  const [overwrite, setOverwrite] = useState(false)
  const [setCurrent, setSetCurrent] = useState(true)
  const [markDirect, setMarkDirect] = useState(!loan.direct)
  const [createIncome, setCreateIncome] = useState(true)
  const [payer, setPayer] = useState(loan.bank && loan.bank !== 'Other' ? loan.bank : '')
  const [taxRate, setTaxRate] = useState('GST on Income')
  const [inclusive, setInclusive] = useState(false)
  const [upfronts, setUpfronts] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const rows = useMemo(() => parsePastedRows(text), [text])
  const validRows = rows.filter(r => r.valid)
  const existingBalMonths = new Set((loan.balanceHistory || []).map(h => h.month))
  const balanceRows = validRows.filter(r => r.balance != null && r.balance > 0)
  const balanceToWrite = balanceRows.filter(r => overwrite || !existingBalMonths.has(r.month))
  const balanceSkipped = balanceRows.length - balanceToWrite.length
  const latest = [...balanceRows].sort((a, b) => a.month.localeCompare(b.month)).slice(-1)[0]
  const commRows = validRows.filter(r => r.commission != null && r.commission > 0)
  const validUpfronts = upfronts.filter(u => parseMonthKey(u.month) && parseMoney(u.amount) > 0)
  const incomeCount = createIncome ? commRows.length + validUpfronts.length : 0
  const incomeTotal = createIncome
    ? commRows.reduce((s, r) => s + r.commission, 0) + validUpfronts.reduce((s, u) => s + parseMoney(u.amount), 0)
    : 0
  const payerMissing = createIncome && incomeCount > 0 && !payer.trim()
  const canImport = !busy && !payerMissing && ((addBalances && balanceToWrite.length > 0) || incomeCount > 0 || (setCurrent && latest))

  function setUp(i, field, val) { setUpfronts(us => us.map((u, j) => j === i ? { ...u, [field]: val } : u)) }
  function addUpfront() { setUpfronts(us => [...us, { paid: '', month: '', amount: '', description: 'Direct upfront commission' }]) }

  async function doImport() {
    setBusy(true)
    try {
      // (a) Loan: balance history, current balance, Direct flag.
      updateClient(client.name, c => {
        const loans = [...c.loans]
        const l = { ...loans[loanIdx] }
        if (addBalances && balanceToWrite.length) {
          const keep = (l.balanceHistory || []).filter(h => !balanceToWrite.some(r => r.month === h.month))
          l.balanceHistory = [...keep, ...balanceToWrite.map(r => ({ month: r.month, balance: Math.round(r.balance * 100) / 100 }))]
            .sort((a, b) => a.month.localeCompare(b.month))
        }
        if (setCurrent && latest) l.balance = Math.round(latest.balance * 100) / 100
        if (markDirect) l.direct = true
        loans[loanIdx] = l
        return { ...c, loans }
      })

      // (b) Direct Income: one closed (historic) entry per payment. Pull the
      // cloud copy first so a stale local cache can't drop entries made on
      // another device. Backfilled records get no INV-#### number — same as
      // the CSV import — so the live invoice sequence isn't disturbed.
      let added = 0, dupes = 0
      if (createIncome && incomeCount > 0) {
        await syncDirectIncomeFromSupabase()
        const existing = loadDirectIncomeLocal()
        const isDupe = (month, total) => existing.some(e =>
          e.month === month && (e.clientName === client.name || e.supplierName === payer.trim()) &&
          Math.abs(invoiceTotals(e).total - total) < 0.01)
        const loanLabel = loan.lname || loan.acc || loan.type || 'loan'
        const mkEntry = (month, paid, figure, item, description) => {
          const { amount, taxAmount } = gstSplit(figure, taxRate, inclusive)
          const issueDate = paid || monthEnd(month)
          return {
            id: mkId(), month,
            items: [{ id: mkId(), item, description, qty: 1, price: amount, account: DEFAULT_ACCOUNT, taxRate, taxAmount, amount }],
            issueDate, dueDate: plus14Days(issueDate),
            invoiceNumber: '', supplierName: payer.trim(), dealName: '', clientName: client.name,
            loanAcc: loan.acc || '', loanName: loan.lname || '', closed: true,
          }
        }
        const newEntries = []
        commRows.forEach(r => {
          const e = mkEntry(r.month, r.paid, r.commission, 'Direct Trail', `Trail commission ${monthLabel(r.month)} — ${loanLabel}`)
          if (isDupe(r.month, invoiceTotals(e).total)) { dupes++; return }
          newEntries.push(e)
        })
        validUpfronts.forEach(u => {
          const month = parseMonthKey(u.month)
          const e = mkEntry(month, parsePaidDate(u.paid), parseMoney(u.amount), 'Direct Upfront', u.description || `Upfront commission — ${loanLabel}`)
          if (isDupe(month, invoiceTotals(e).total)) { dupes++; return }
          newEntries.push(e)
        })
        added = newEntries.length
        if (added) await saveDirectIncome([...existing, ...newEntries])
      }
      setResult({
        balances: addBalances ? balanceToWrite.length : 0,
        current: setCurrent && latest ? latest.balance : null,
        added, dupes,
      })
    } finally {
      setBusy(false)
    }
  }

  const label = { fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
  const chk = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }
  const inp = { fontSize: 11, padding: '4px 6px', border: '0.5px solid var(--border)', borderRadius: 6, width: '100%' }
  const th = { padding: '5px 8px', background: '#3D5570', color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td = { padding: '4px 8px', borderBottom: '0.5px solid var(--border-light)', fontSize: 11, color: 'var(--text-primary)' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: 820, maxHeight: '88vh', overflowY: 'auto', padding: 24, margin: '0 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>Import history — {loan.lname || loan.acc || loan.type}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          For loans that don't come through a commission statement. Paste the lender's remittance table straight from your spreadsheet — one payment per line:
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)' }}> Payment received · Associated month · Commission · Implied average balance</span>.
          A header row is fine — it's skipped.
        </div>

        {result ? (
          <div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Done</div>
              <div>{result.balances} monthly {result.balances === 1 ? 'balance' : 'balances'} added to this loan's history.</div>
              {result.current != null && <div>Current balance set to {fmt(result.current)}.</div>}
              <div>{result.added} Direct Income {result.added === 1 ? 'entry' : 'entries'} created{result.dupes ? ` (${result.dupes} skipped — already recorded)` : ''}.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={7} spellCheck={false}
              placeholder={'03-Sep-26\tAug-26\t$612.26\t$1,441,773.55\n04-Aug-26\tJul-26\t$622.25\t$1,465,298.39'}
              style={{ ...inp, fontFamily: 'DM Mono, monospace', resize: 'vertical', whiteSpace: 'pre' }} />

            {rows.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Paid</th><th style={th}>Month</th><th style={{ ...th, textAlign: 'right' }}>Commission</th><th style={{ ...th, textAlign: 'right' }}>Balance</th><th style={th}></th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ opacity: r.valid ? 1 : 0.5 }}>
                        <td style={td}>{r.paid || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={td}>{r.month ? monthLabel(r.month) : <span style={{ color: '#c0392b' }}>?</span>}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{r.commission != null ? fmtC(r.commission) : '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{r.balance != null ? fmt(r.balance) : '—'}</td>
                        <td style={{ ...td, fontSize: 9, color: '#94a3b8' }}>
                          {!r.valid ? 'Couldn’t read this line' : (existingBalMonths.has(r.month) && r.balance != null ? (overwrite ? 'Will replace existing' : 'Month already has a balance — skipped') : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 16 }}>
              <div>
                <div style={label}>This loan</div>
                <label style={chk}><input type="checkbox" checked={addBalances} onChange={e => setAddBalances(e.target.checked)} /> Add monthly balances to balance history ({balanceToWrite.length}{balanceSkipped ? `, ${balanceSkipped} skipped` : ''})</label>
                {balanceSkipped > 0 && <label style={{ ...chk, marginLeft: 20, marginTop: 4 }}><input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> Replace months that already have a balance</label>}
                <label style={{ ...chk, marginTop: 6 }}><input type="checkbox" checked={setCurrent} onChange={e => setSetCurrent(e.target.checked)} /> Set current balance to latest month{latest ? ` (${monthLabel(latest.month)}: ${fmt(latest.balance)})` : ''}</label>
                {!loan.direct && <label style={{ ...chk, marginTop: 6 }}><input type="checkbox" checked={markDirect} onChange={e => setMarkDirect(e.target.checked)} /> Mark this loan as Direct (tracked in Rradar, not from a statement)</label>}
              </div>
              <div>
                <div style={label}>Direct Income</div>
                <label style={chk}><input type="checkbox" checked={createIncome} onChange={e => setCreateIncome(e.target.checked)} /> Record each commission payment in Direct Income ({commRows.length} monthly{validUpfronts.length ? ` + ${validUpfronts.length} upfront` : ''})</label>
                {createIncome && (
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={label}>Paid by</div>
                      <input style={{ ...inp, borderColor: payerMissing ? '#c0392b' : undefined }} value={payer} onChange={e => setPayer(e.target.value)} placeholder="e.g. Shift" />
                    </div>
                    <div>
                      <div style={label}>GST</div>
                      <select style={inp} value={taxRate} onChange={e => setTaxRate(e.target.value)}>{TAX_RATES.map(t => <option key={t}>{t}</option>)}</select>
                    </div>
                    {taxRateFraction(taxRate) > 0 && (
                      <label style={{ ...chk, gridColumn: '1 / -1' }}><input type="checkbox" checked={inclusive} onChange={e => setInclusive(e.target.checked)} /> Figures already include GST</label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {createIncome && (
              <div style={{ marginTop: 16 }}>
                <div style={label}>One-off upfront payments (settlement, limit increase…)</div>
                {upfronts.map((u, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input style={inp} value={u.paid} onChange={e => setUp(i, 'paid', e.target.value)} placeholder="Paid (e.g. 15-Feb-24)" />
                    <input style={{ ...inp, borderColor: u.month && !parseMonthKey(u.month) ? '#c0392b' : undefined }} value={u.month} onChange={e => setUp(i, 'month', e.target.value)} placeholder="Month (e.g. Feb-24)" />
                    <input style={inp} value={u.amount} onChange={e => setUp(i, 'amount', e.target.value)} placeholder="Amount (e.g. 20000)" />
                    <input style={inp} value={u.description} onChange={e => setUp(i, 'description', e.target.value)} placeholder="Description" />
                    <button onClick={() => setUpfronts(us => us.filter((_, j) => j !== i))} style={{ padding: '3px 8px', borderRadius: 6, border: '0.5px solid #fde8e8', background: '#fde8e8', color: '#c0392b', cursor: 'pointer', fontSize: 10 }}>✕</button>
                  </div>
                ))}
                <button onClick={addUpfront} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '0.5px solid var(--pk)', background: 'transparent', color: 'var(--pk)', cursor: 'pointer' }}>+ Add upfront payment</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, marginTop: 16, borderTop: '0.5px solid var(--border)' }}>
              <button onClick={doImport} disabled={!canImport} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: canImport ? 'pointer' : 'default', opacity: canImport ? 1 : 0.5 }}>
                {busy ? 'Importing…' : 'Import'}
              </button>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '0.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <div style={{ fontSize: 10, color: payerMissing ? '#c0392b' : '#94a3b8' }}>
                {payerMissing ? 'Enter who paid the commission.' : incomeCount > 0 ? `${incomeCount} Direct Income entries totalling ${fmtC(incomeTotal)}${taxRateFraction(taxRate) > 0 && !inclusive ? ' + GST' : ''}` : ''}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
