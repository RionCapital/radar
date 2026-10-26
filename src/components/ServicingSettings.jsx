import React, { useMemo, useState } from 'react'
import { DEFAULT_SERVICING_POLICY, HEM_COMPOSITIONS, incomeTax, totalPersonalTax } from '../lib/servicing'

// ─── Settings → Rradar → Servicing ───────────────────────────────────────────
// The house assumptions every commercial servicing assessment starts from.
// A deal can override any of these for itself (Financials → Servicing →
// Assumptions), and an override only ever affects that deal — so changing a
// number here still flows through to every deal that hasn't overridden it.
//
// Nothing here is hard-coded in the calculator: buffers, shading, ratios, the
// tax scale and the HEM table are all read from this screen, so a new
// financial year or a lender policy change is a data edit, not a release.

const NAVY = '#3D4F6B'
const inp = { border: '1px solid #e8eaed', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl = { fontSize: 10, color: '#7A8090', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const th = { padding: '6px 8px', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '4px 6px', borderBottom: '0.5px solid #f1f5f9' }
const money = v => '$' + Math.round(Number(v) || 0).toLocaleString()

function Num({ value, onChange, suffix, width = 90, step = '0.01', disabled }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input type="number" step={step} value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ ...inp, width, background: disabled ? '#f8f9fa' : '#fff' }} />
      {suffix && <span style={{ fontSize: 11, color: '#7A8090' }}>{suffix}</span>}
    </span>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '7px 0', borderBottom: '0.5px solid #f4f5f7' }}>
      <div style={{ width: 300, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#2A3545', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ paddingTop: 1 }}>{children}</div>
    </div>
  )
}

export default function ServicingSettings({ policy, onChange, isAdmin }) {
  const p = { ...DEFAULT_SERVICING_POLICY, ...(policy || {}) }
  const shading = { ...DEFAULT_SERVICING_POLICY.shading, ...(policy?.shading || {}) }
  const brackets = p.taxBrackets?.length ? p.taxBrackets : DEFAULT_SERVICING_POLICY.taxBrackets
  const hem = p.hem || []
  const [hemPaste, setHemPaste] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteNote, setPasteNote] = useState('')

  const set = (k, v) => onChange({ ...p, [k]: v })
  const setShade = (k, v) => onChange({ ...p, shading: { ...shading, [k]: v } })
  const setBracket = (i, k, v) => onChange({ ...p, taxBrackets: brackets.map((b, idx) => idx === i ? { ...b, [k]: v } : b) })
  const setHem = rows => onChange({ ...p, hem: rows })

  // A worked example, recalculated live — the fastest way to tell whether the
  // tax scale has been keyed in correctly is to see what it does to a real
  // number rather than re-reading the thresholds.
  const taxCheck = useMemo(() => [60000, 120000, 200000].map(inc => ({
    inc, tax: incomeTax(inc, p), total: totalPersonalTax(inc, p),
  })), [p])

  function addHemRow() {
    setHem([...hem, { composition: 'Couple', dependants: 0, incomeFrom: 0, incomeTo: '', annual: '' }])
  }
  function updHemRow(i, k, v) { setHem(hem.map((r, idx) => idx === i ? { ...r, [k]: v } : r)) }
  function rmHemRow(i) { setHem(hem.filter((_, idx) => idx !== i)) }

  // Paste a whole table in one go. Accepts tab- or comma-separated rows in the
  // column order shown, with or without a header line.
  function importHemPaste() {
    const lines = hemPaste.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const rows = []
    let skipped = 0
    lines.forEach(line => {
      const parts = line.split(/\t|,(?![^(]*\))/).map(c => c.trim().replace(/^["']|["']$/g, '').replace(/[$,]/g, ''))
      if (parts.length < 5) { skipped++; return }
      const [composition, dependants, incomeFrom, incomeTo, annual] = parts
      if (!/^(single|couple)$/i.test(composition)) { skipped++; return }  // skips a header line too
      rows.push({
        composition: /couple/i.test(composition) ? 'Couple' : 'Single',
        dependants: Number(dependants) || 0,
        incomeFrom: Number(incomeFrom) || 0,
        incomeTo: incomeTo === '' || /^(\+|inf|none)$/i.test(incomeTo) ? '' : Number(incomeTo) || '',
        annual: Number(annual) || 0,
      })
    })
    if (!rows.length) { setPasteNote('Nothing usable in that paste — each row needs composition, dependants, income from, income to, annual.'); return }
    setHem([...hem, ...rows])
    setHemPaste('')
    setPasteNote(`${rows.length} row${rows.length === 1 ? '' : 's'} added${skipped ? `, ${skipped} line${skipped === 1 ? '' : 's'} skipped` : ''}.`)
  }

  const disabled = !isAdmin

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!isAdmin && (
        <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '9px 12px', fontSize: 11.5, color: '#92600A' }}>
          These assumptions drive every servicing assessment, so only an admin can change them. You can still override them on an individual deal.
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Rate treatment</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 8, lineHeight: 1.5 }}>
          Every loan — existing and proposed — is assessed at the higher of its own rate plus the buffer, and the floor.
        </div>
        <Row label="Assessment buffer" hint="Added to the actual rate on the loan being assessed.">
          <Num value={p.buffer} onChange={v => set('buffer', v)} suffix="%" disabled={disabled} />
        </Row>
        <Row label="Assessment floor rate" hint="The assessment never drops below this, however cheap the money is.">
          <Num value={p.floorRate} onChange={v => set('floorRate', v)} suffix="%" disabled={disabled} />
        </Row>
        <Row label="Buffer existing debts too" hint="Off means existing debts are taken at their actual rate — generous, and not how a lender reads it.">
          <input type="checkbox" checked={!!p.applyBufferToExisting} disabled={disabled} onChange={e => set('applyBufferToExisting', e.target.checked)} />
        </Row>
        <Row label="Assess interest-only as P&I" hint="An IO loan taken at its real repayment is the usual way capacity gets overstated.">
          <input type="checkbox" checked={!!p.assessIoAsPi} disabled={disabled} onChange={e => set('assessIoAsPi', e.target.checked)} />
        </Row>
        <Row label="Credit card / overdraft assessment" hint="Percentage of the LIMIT charged monthly, whatever the balance is.">
          <Num value={p.creditCardAssessPct} onChange={v => set('creditCardAssessPct', v)} suffix="% of limit per month" width={80} disabled={disabled} />
        </Row>
        <Row label="Amortisation term — residential">
          <Num value={p.residentialAmortYears} onChange={v => set('residentialAmortYears', v)} suffix="years" width={70} step="1" disabled={disabled} />
        </Row>
        <Row label="Amortisation term — commercial" hint="Commercial amortises faster than resi, which drives the assessment harder than the rate does.">
          <Num value={p.commercialAmortYears} onChange={v => set('commercialAmortYears', v)} suffix="years" width={70} step="1" disabled={disabled} />
        </Row>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Income shading</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 8, lineHeight: 1.5 }}>
          The percentage of each income type that counts towards servicing. Tax is still calculated on the full amount — the ATO doesn't shade.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px 16px' }}>
          {Object.keys(DEFAULT_SERVICING_POLICY.shading).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: '#2A3545' }}>{k}</span>
              <Num value={shading[k]} onChange={v => setShade(k, v)} suffix="%" width={64} step="1" disabled={disabled} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Commercial property test</div>
        <Row label="Vacancy allowance" hint="Taken off the rent before the ratios. Overridable per property.">
          <Num value={p.vacancyAllowancePct} onChange={v => set('vacancyAllowancePct', v)} suffix="% of rent" width={70} disabled={disabled} />
        </Row>
        <Row label="Minimum interest cover ratio (ICR)" hint="Net property income ÷ assessed interest. The binding test on an IO facility.">
          <Num value={p.minICR} onChange={v => set('minICR', v)} suffix="x" width={70} disabled={disabled} />
        </Row>
        <Row label="Minimum debt service cover ratio (DSCR)" hint="Net property income ÷ assessed P&I. The binding test once it amortises.">
          <Num value={p.minDSCR} onChange={v => set('minDSCR', v)} suffix="x" width={70} disabled={disabled} />
        </Row>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tax</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 8, lineHeight: 1.5 }}>
          Marginal rates for individuals and a flat rate for companies. Tax is taken on real income less deductible interest, so negative gearing flows through.
          Offsets, HECS repayments and the Medicare levy surcharge aren't modelled — a lender's own calculator doesn't either.
        </div>
        <Row label="Financial year label" hint="Shown on each assessment so you know which scale it was run under.">
          <input value={p.taxYearLabel || ''} disabled={disabled} onChange={e => set('taxYearLabel', e.target.value)} style={{ ...inp, width: 120 }} />
        </Row>
        <Row label="Medicare levy"><Num value={p.medicareLevyPct} onChange={v => set('medicareLevyPct', v)} suffix="%" width={70} disabled={disabled} /></Row>
        <Row label="Company tax rate" hint="25% for a base rate entity, 30% otherwise.">
          <Num value={p.companyTaxRate} onChange={v => set('companyTaxRate', v)} suffix="%" width={70} disabled={disabled} />
        </Row>

        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr><th style={th}>Up to ($)</th><th style={th}>Rate</th><th style={th}>Base tax ($)</th><th style={th} /></tr></thead>
            <tbody>
              {brackets.map((b, i) => (
                <tr key={i}>
                  <td style={td}>
                    <input value={b.upTo ?? ''} placeholder="no cap" disabled={disabled}
                      onChange={e => setBracket(i, 'upTo', e.target.value === '' ? null : Number(e.target.value))}
                      style={{ ...inp, width: 110 }} />
                  </td>
                  <td style={td}><Num value={(Number(b.rate) * 100).toFixed(2)} onChange={v => setBracket(i, 'rate', Number(v) / 100)} suffix="%" width={72} disabled={disabled} /></td>
                  <td style={td}><Num value={b.base} onChange={v => setBracket(i, 'base', v)} width={110} step="1" disabled={disabled} /></td>
                  <td style={td}>
                    {!disabled && <button onClick={() => onChange({ ...p, taxBrackets: brackets.filter((_, idx) => idx !== i) })}
                      style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 5, cursor: 'pointer' }}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && (
            <button onClick={() => onChange({ ...p, taxBrackets: [...brackets, { upTo: null, rate: 0, base: 0 }] })}
              style={{ marginTop: 8, fontSize: 11, padding: '5px 12px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add bracket</button>
          )}
          <div style={{ marginTop: 10, background: '#f8fafc', border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '9px 12px', fontSize: 11.5, color: '#64748b' }}>
            <strong style={{ color: '#2A3545' }}>Check:</strong>{' '}
            {taxCheck.map(c => `${money(c.inc)} → ${money(c.tax)} tax, ${money(c.total)} with Medicare`).join('  ·  ')}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Living expenses — HEM benchmark</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 10, lineHeight: 1.55 }}>
          The HEM benchmark is produced by the Melbourne Institute and licensed to lenders — it isn't published, so it can't ship with Rradar and nothing here is invented.
          Key in the figures from your aggregator's calculator and every deal is assessed at the <strong style={{ color: '#2A3545' }}>greater of declared and benchmark</strong>, the way a lender does.
          Until then, assessments fall back to declared expenses and say so.
          <br />
          HEM is a <strong style={{ color: '#2A3545' }}>household</strong> figure, so a couple is assessed once between them, not twice.
        </div>
        <Row label="Use the HEM benchmark" hint="Off assesses on declared expenses alone.">
          <input type="checkbox" checked={!!p.useHem} disabled={disabled} onChange={e => set('useHem', e.target.checked)} />
        </Row>
        <Row label="Effective from" hint="HEM is re-indexed quarterly — date each version so you know what a deal was assessed under.">
          <input type="month" value={p.hemEffectiveFrom || ''} disabled={disabled} onChange={e => set('hemEffectiveFrom', e.target.value)} style={{ ...inp, width: 150 }} />
        </Row>
        <Row label="Fallback floor" hint="Used when no HEM row matches. Leave blank to assess on declared alone.">
          <Num value={p.manualExpenseFloor} onChange={v => set('manualExpenseFloor', v)} suffix="$ p.a." width={110} step="100" disabled={disabled} />
        </Row>

        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
            <thead><tr>
              <th style={th}>Household</th><th style={th}>Dependants</th><th style={th}>Income from</th><th style={th}>Income to</th><th style={th}>Benchmark ($ p.a.)</th><th style={th} />
            </tr></thead>
            <tbody>
              {hem.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 18, textAlign: 'center', color: '#9ca3af', fontSize: 11.5, fontStyle: 'italic' }}>
                  No benchmark loaded — assessments are using declared expenses.
                </td></tr>
              )}
              {hem.map((r, i) => (
                <tr key={i}>
                  <td style={td}>
                    <select value={r.composition} disabled={disabled} onChange={e => updHemRow(i, 'composition', e.target.value)} style={{ ...inp, width: 100 }}>
                      {HEM_COMPOSITIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={td}><Num value={r.dependants} onChange={v => updHemRow(i, 'dependants', v)} width={66} step="1" disabled={disabled} /></td>
                  <td style={td}><Num value={r.incomeFrom} onChange={v => updHemRow(i, 'incomeFrom', v)} width={104} step="1000" disabled={disabled} /></td>
                  <td style={td}>
                    <input value={r.incomeTo ?? ''} placeholder="no cap" disabled={disabled}
                      onChange={e => updHemRow(i, 'incomeTo', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...inp, width: 104 }} />
                  </td>
                  <td style={td}><Num value={r.annual} onChange={v => updHemRow(i, 'annual', v)} width={110} step="100" disabled={disabled} /></td>
                  <td style={td}>
                    {!disabled && <button onClick={() => rmHemRow(i)} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 5, cursor: 'pointer' }}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!disabled && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={addHemRow} style={{ fontSize: 11, padding: '5px 12px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add row</button>
            <button onClick={() => setPasteOpen(o => !o)} style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #e8eaed', background: '#fff', color: '#64748b', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {pasteOpen ? 'Close paste' : '⬆ Paste a whole table'}
            </button>
            {hem.length > 0 && (
              <button onClick={() => { if (window.confirm(`Clear all ${hem.length} benchmark rows?`)) setHem([]) }}
                style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}>Clear table</button>
            )}
            {pasteNote && <span style={{ fontSize: 11, color: '#166534' }}>{pasteNote}</span>}
          </div>
        )}

        {pasteOpen && !disabled && (
          <div style={{ marginTop: 10, background: '#f8fafc', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, lineHeight: 1.5 }}>
              One row per line, tab- or comma-separated, in this order — a header line is ignored:
              <br /><code style={{ fontSize: 10.5, color: '#2A3545' }}>Single|Couple, dependants, income from, income to (blank = no cap), annual benchmark</code>
            </div>
            <textarea value={hemPaste} onChange={e => setHemPaste(e.target.value)} rows={6}
              placeholder={'Couple, 0, 0, 100000, 38000\nCouple, 2, 150000, 250000, 62400\nSingle, 0, 0, 80000, 24000'}
              style={{ ...inp, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 11 }} />
            <button onClick={importHemPaste} style={{ marginTop: 8, fontSize: 11, padding: '6px 14px', border: 'none', background: NAVY, color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Add rows</button>
          </div>
        )}
      </div>
    </div>
  )
}
