import React, { useMemo, useState } from 'react'
import {
  BUSINESS_ADD_BACKS, BUSINESS_DEBT_TYPES, BUSINESS_REPAYMENT_TYPES, REVOLVING_DEBT_TYPES,
  businessEbitda, businessYears, businessProfitTo, businessDebtService, businessDebtTotals,
  assessmentYear, DEFAULT_SERVICING_POLICY,
} from '../lib/servicing'

// ─── Business financials, entity by entity ───────────────────────────────────
// A commercial file routinely runs across a trading company, a holding trust
// and an SPV, and each needs its own financials, add-backs, debt and ownership
// before anything can be consolidated.
//
// Three things this has to get right that most tools don't:
//
//   · YEARS. Two actuals to open with, any number addable, and forecasts added
//     deliberately — never by default, and never counted in the assessment
//     unless they're ticked in. A projection is not something a lender has
//     seen audited.
//   · DEBT. A schedule per entity, because "can this company service the new
//     facility" is unanswerable without knowing what it already pays. Term and
//     amortisation are separate fields: a 5-year term amortising over 15 is
//     ordinary commercially, and collapsing the two either overstates the
//     repayment or hides the residual.
//   · ELIMINATIONS. Once several entities on one deal transact with each
//     other, the same dollar shows up twice at group level. Each entity's
//     standalone figures stay exactly as they are — that's what a lender tests
//     an entity on — and the eliminations apply only on consolidation.

const NAVY = '#3D4F6B'
const GREEN = '#166534'
const RED = '#b91c1c'
const AMBER = '#92600A'

const inp = { border: '1px solid #e8eaed', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl = { fontSize: 10, color: '#7A8090', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }
const th = { padding: '6px 8px', fontSize: 9.5, color: '#fff', background: NAVY, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '5px 8px', fontSize: 11.5, borderBottom: '0.5px solid #f1f5f9', color: '#2A3545' }

const n = v => Number(v) || 0
const money = v => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(n(v))).toLocaleString()}`
const ratio = v => (v === null || v === undefined || !isFinite(v)) ? '—' : `${v.toFixed(2)}x`

const STRUCTURES = ['Company', 'Trust', 'Sole Trader', 'Partnership']
const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Annually']
const FREQ_ANNUAL = { Weekly: 52, Fortnightly: 26, Monthly: 12, Quarterly: 4, Annually: 1 }
export const ELIMINATION_TYPES = [
  "Director's wages / salary", 'Rent', 'Management fee', 'Trust distribution', 'Dividend', 'Inter-entity loan repayment', 'Other',
]

const ADD_BACKS = BUSINESS_ADD_BACKS

// Kept exported under the old name: "Total NPBT" is what the tab has always
// called it, though what it computes is normalised EBITDA.
export const totalNpbt = businessEbitda

export function eliminationAnnual(e) {
  return n(e.amount) * (FREQ_ANNUAL[e.frequency] ?? 1)
}

// Where two entities on the same deal transact, the money is internal to the
// group. Suggested rather than applied — the broker confirms, because an
// expense to a similarly-named party isn't always the related entity.
export function suggestEliminations(businessEntities, existing, dealEntityNames) {
  const names = [...new Set([
    ...(businessEntities || []).map(b => b.name),
    ...(dealEntityNames || []),
  ])].filter(Boolean)
  const already = new Set((existing || []).map(e => `${e.from}|${e.to}|${e.type}`))
  const out = []
  ;(businessEntities || []).forEach(b => {
    const y = b.years?.[assessmentYear(b)] || {}
    if (n(y.directorsWages) > 0) {
      ;(b.ownership || []).forEach(o => {
        if (!o.name || !names.includes(o.name)) return
        const key = `${b.name}|${o.name}|Director's wages / salary`
        if (already.has(key)) return
        out.push({ from: b.name, to: o.name, type: "Director's wages / salary", amount: n(y.directorsWages), frequency: 'Annually', suggested: true })
      })
    }
  })
  return out
}

// ─── Declared at module scope ────────────────────────────────────────────────
// Not inside the component: a component defined in a render body is a new
// function every render, so React throws the <input> away and mounts a fresh
// one on each keystroke, taking the caret with it.
const Field = ({ label, children, w }) => (
  <div style={{ flex: w ? `0 0 ${w}px` : '1 1 180px', minWidth: 150 }}>
    <div style={lbl}>{label}</div>
    {children}
  </div>
)

const MoneyIn = ({ value, onCommit, align = 'right' }) => (
  <input type="number" value={value ?? ''}
    onChange={e => onCommit(e.target.value === '' ? '' : Number(e.target.value))}
    style={{ ...inp, width: '100%', textAlign: align }} />
)

const Pill = ({ tone, children }) => (
  <span style={{
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '2px 7px', borderRadius: 9, whiteSpace: 'nowrap',
    background: tone === 'forecast' ? '#EEF2FF' : tone === 'in' ? '#F0FDF4' : '#F8FAFC',
    color: tone === 'forecast' ? '#4338CA' : tone === 'in' ? GREEN : '#7A8090',
    border: `1px solid ${tone === 'forecast' ? '#C7D2FE' : tone === 'in' ? '#BBF7D0' : '#e8eaed'}`,
  }}>{children}</span>
)

// ─── One financial year column ───────────────────────────────────────────────
const YearColumn = ({ fy, meta, data, isAssessed, onYear, onAddBack, onMeta, onRemove, onAssess, canRemove }) => {
  const forecast = !!meta.forecast
  const counted = !forecast || !!meta.include
  return (
    <div style={{
      border: `0.5px solid ${isAssessed ? NAVY + '55' : '#e8eaed'}`, borderRadius: 8, padding: '10px 12px',
      background: forecast ? '#FBFBFF' : '#fff', minWidth: 260, flex: '1 1 280px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: forecast ? '#4338CA' : NAVY }}>
          FY {fy} — {money(businessEbitda(data))}
        </div>
        {forecast && <Pill tone="forecast">Forecast</Pill>}
        {isAssessed && <Pill tone="in">Assessed</Pill>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!isAssessed && counted && (
            <button onClick={onAssess} title="Assess servicing on this year"
              style={{ fontSize: 9.5, padding: '2px 7px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 5, cursor: 'pointer' }}>Use</button>
          )}
          {canRemove && (
            <button onClick={onRemove} title="Remove this year"
              style={{ fontSize: 9.5, padding: '2px 7px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 5, cursor: 'pointer' }}>✕</button>
          )}
        </div>
      </div>

      {forecast && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#4338CA', marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!meta.include} onChange={e => onMeta({ include: e.target.checked })} />
          Count this forecast in the servicing result
        </label>
      )}

      <div style={{ ...lbl, marginTop: 4 }}>Wage details</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Directors' wages</span>
        <div style={{ width: 130 }}><MoneyIn value={data.directorsWages} onCommit={v => onYear({ directorsWages: v })} /></div>
      </div>

      <div style={lbl}>Income, profit, expenses</div>
      {[['npbt', 'Net profit before tax'], ['nonRecurringIncome', 'Non-recurring income'], ['nonRecurringExpense', 'Non-recurring expense'], ['extraSuper', 'Extra super contributions']].map(([k, text]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{text}</span>
          <div style={{ width: 130 }}><MoneyIn value={data[k]} onCommit={v => onYear({ [k]: v })} /></div>
        </div>
      ))}

      <div style={{ ...lbl, marginTop: 8 }}>Add backs</div>
      {ADD_BACKS.map(([k, text]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{text}</span>
          <div style={{ width: 130 }}><MoneyIn value={data.addBacks?.[k]} onCommit={v => onAddBack(k, v)} /></div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8eaed', marginTop: 8, paddingTop: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2A3545' }}>Total NPBT</span>
        <strong style={{ fontSize: 12.5, color: NAVY }}>{money(businessEbitda(data))}</strong>
      </div>
    </div>
  )
}

export default function BusinessFinancials({ contacts, structure, onChange, policy }) {
  const st = structure || {}
  const businesses = st.businessEntities || []
  const eliminations = st.eliminations || []
  const pol = policy || DEFAULT_SERVICING_POLICY
  const [open, setOpen] = useState(businesses[0]?.id || null)
  const [tab, setTab] = useState('entities')

  const entityNames = (contacts || []).map(c => c.name).filter(Boolean)
  const setBusinesses = next => onChange({ businessEntities: next })
  const setEliminations = next => onChange({ eliminations: next })

  const thisFY = String(new Date().getFullYear())

  const addBusiness = () => {
    const id = `b${Date.now()}`
    setBusinesses([...businesses, {
      id, name: '', structure: 'Company', hasLoans: false,
      recentFY: thisFY, assessFY: thisFY,
      yearOrder: [thisFY, String(Number(thisFY) - 1)],
      yearMeta: { [thisFY]: { forecast: false }, [String(Number(thisFY) - 1)]: { forecast: false } },
      years: {}, ownership: [], debts: [],
    }])
    setOpen(id)
  }
  const updBusiness = (id, patch) => setBusinesses(businesses.map(b => b.id === id ? { ...b, ...patch } : b))
  const rmBusiness = id => {
    if (!window.confirm('Remove this entity, its financials and its debt schedule?')) return
    setBusinesses(businesses.filter(b => b.id !== id))
  }
  const updYear = (id, fy, patch) => {
    const b = businesses.find(x => x.id === id)
    updBusiness(id, { years: { ...(b.years || {}), [fy]: { ...(b.years?.[fy] || {}), ...patch } } })
  }
  const updAddBack = (id, fy, k, v) => {
    const b = businesses.find(x => x.id === id)
    const y = b.years?.[fy] || {}
    updYear(id, fy, { addBacks: { ...(y.addBacks || {}), [k]: v } })
  }
  const updMeta = (id, fy, patch) => {
    const b = businesses.find(x => x.id === id)
    updBusiness(id, { yearMeta: { ...(b.yearMeta || {}), [fy]: { ...(b.yearMeta?.[fy] || {}), ...patch } } })
  }

  // Years are an explicit, ordered list so one can be dropped down to a single
  // year, and extras and forecasts added on top.
  const yearsOf = b => businessYears(b)
  const addYear = (b, forecast) => {
    const list = yearsOf(b).map(y => y.fy)
    const nums = list.map(Number).filter(Number.isFinite)
    // An actual goes one year further back; a forecast one year forward.
    const next = forecast
      ? String((nums.length ? Math.max(...nums) : Number(thisFY)) + 1)
      : String((nums.length ? Math.min(...nums) : Number(thisFY)) - 1)
    if (list.includes(next)) return
    const order = forecast ? [next, ...list] : [...list, next]
    // Newest first, so a forecast sits at the left where it reads as "next".
    updBusiness(b.id, {
      yearOrder: order,
      yearMeta: { ...(b.yearMeta || {}), [next]: { forecast: !!forecast, include: false } },
    })
  }
  const rmYear = (b, fy) => {
    const list = yearsOf(b).map(y => y.fy).filter(f => f !== fy)
    if (!list.length) return
    const { [fy]: _drop, ...meta } = b.yearMeta || {}
    const { [fy]: _dropY, ...years } = b.years || {}
    const patch = { yearOrder: list, yearMeta: meta, years }
    if (String(b.assessFY) === fy) patch.assessFY = list[0]
    updBusiness(b.id, patch)
  }

  // ── Debt schedule ──────────────────────────────────────────────────────────
  const updDebt = (b, i, patch) =>
    updBusiness(b.id, { debts: (b.debts || []).map((d, ix) => ix === i ? { ...d, ...patch } : d) })
  const addDebt = b => updBusiness(b.id, {
    debts: [...(b.debts || []), {
      id: `d${Date.now()}`, type: 'Commercial Loan', lender: '', balance: '', limit: '',
      rate: '', termYears: '', amortYears: '', repaymentType: 'P&I',
    }],
  })
  const rmDebt = (b, i) => updBusiness(b.id, { debts: (b.debts || []).filter((_, ix) => ix !== i) })

  const groupTotals = useMemo(() => {
    const gross = businesses.reduce((s, b) => s + businessEbitda(b.years?.[assessmentYear(b)]), 0)
    const eliminated = eliminations.filter(e => !e.ignored).reduce((s, e) => s + eliminationAnnual(e), 0)
    return { gross, eliminated, net: gross - eliminated }
  }, [businesses, eliminations])

  const suggestions = useMemo(() => suggestEliminations(businesses, eliminations, entityNames), [businesses, eliminations, entityNames])

  // ── Entities ───────────────────────────────────────────────────────────────
  const entitiesTab = (
    <>
      {businesses.length === 0 && (
        <div style={{ padding: '22px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12, fontStyle: 'italic', border: '0.5px dashed #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
          No business entities yet. Add one for each trading company, trust or partnership whose financials go into this deal.
        </div>
      )}

      {businesses.map(b => {
        const years = yearsOf(b)
        const assessFY = assessmentYear(b)
        const isOpen = open === b.id
        const total = businessEbitda(b.years?.[assessFY])
        const debt = businessDebtTotals(b, pol)
        const flow = businessProfitTo(b)
        return (
          <div key={b.id} style={{ border: '0.5px solid #e8eaed', borderRadius: 9, marginBottom: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: isOpen ? '#f4f7fb' : '#fff', cursor: 'pointer' }}
              onClick={() => setOpen(isOpen ? null : b.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2A3545' }}>{b.name || 'Unnamed entity'}</div>
                <div style={{ fontSize: 10.5, color: '#7A8090' }}>
                  {b.structure} · assessed on FY {assessFY} · {years.length} year{years.length === 1 ? '' : 's'} held
                  {debt.annual > 0 && ` · ${money(debt.annual)} p.a. debt service`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, color: '#7A8090' }}>Total NPBT <strong style={{ color: NAVY }}>{money(total)}</strong></span>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ padding: '12px 14px', borderTop: '0.5px solid #e8eaed' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                  <Field label="Entity">
                    <input value={b.name || ''} onChange={e => updBusiness(b.id, { name: e.target.value })} list="deal-entity-names" placeholder="Entity name" style={{ ...inp, width: '100%' }} />
                  </Field>
                  <Field label="Operating structure" w={150}>
                    <select value={b.structure} onChange={e => updBusiness(b.id, { structure: e.target.value })} style={{ ...inp, width: '100%' }}>
                      {STRUCTURES.map(x => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="Profit assessed in" w={170}>
                    <select value={flow} onChange={e => updBusiness(b.id, { profitTo: e.target.value })} style={{ ...inp, width: '100%' }}>
                      <option value="entity">This entity</option>
                      <option value="owners">The owners, per share</option>
                    </select>
                  </Field>
                  <Field label="Assessed on" w={130}>
                    <select value={assessFY} onChange={e => updBusiness(b.id, { assessFY: e.target.value, recentFY: e.target.value })} style={{ ...inp, width: '100%' }}>
                      {years.filter(y => !y.forecast || y.include).map(y => <option key={y.fy} value={y.fy}>FY {y.fy}</option>)}
                    </select>
                  </Field>
                </div>

                <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: -6, marginBottom: 12, lineHeight: 1.55 }}>
                  {flow === 'entity'
                    ? 'The profit stays with this entity and services its own debt — which is the case when the entity is the borrower. It is not also counted in the owners’ hands.'
                    : 'The profit is counted in the owners’ hands per their share, not in this entity. A trust must distribute, and a sole trader or partnership isn’t a separate taxpayer.'}
                </div>

                {/* ── Years ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ ...lbl, marginBottom: 0 }}>Financial years</div>
                  <button onClick={() => addYear(b, false)} style={{ fontSize: 10.5, padding: '3px 10px', border: '1px solid #e8eaed', background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Earlier year</button>
                  <button onClick={() => addYear(b, true)} style={{ fontSize: 10.5, padding: '3px 10px', border: '1px solid #C7D2FE', background: '#fff', color: '#4338CA', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Forecast year</button>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Forecasts are shown and rated, but only count in the result when ticked in.</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                  {years.map(y => (
                    <YearColumn key={y.fy}
                      fy={y.fy} meta={y} data={b.years?.[y.fy] || {}}
                      isAssessed={y.fy === assessFY}
                      canRemove={years.length > 1}
                      onYear={patch => updYear(b.id, y.fy, patch)}
                      onAddBack={(k, v) => updAddBack(b.id, y.fy, k, v)}
                      onMeta={patch => updMeta(b.id, y.fy, patch)}
                      onRemove={() => rmYear(b, y.fy)}
                      onAssess={() => updBusiness(b.id, { assessFY: y.fy, recentFY: y.fy })}
                    />
                  ))}
                </div>

                {/* ── Debt schedule ── */}
                <div style={{ ...lbl, marginTop: 4 }}>Debt schedule — {b.name || 'this entity'}</div>
                <div style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 6, lineHeight: 1.55 }}>
                  What this entity already owes. Term and amortisation are separate: a 5-year term amortising over 15 is
                  repaid on the 15 and leaves a residual at year 5, and both are shown.
                  Put business facilities here and personal debt on the Liabilities tab — a facility in both places is counted twice.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, minWidth: 880 }}>
                    <thead><tr>
                      <th style={th}>Type</th><th style={th}>Lender</th>
                      <th style={{ ...th, textAlign: 'right' }}>Balance / Limit</th>
                      <th style={{ ...th, textAlign: 'right' }}>Rate %</th>
                      <th style={{ ...th, textAlign: 'right' }}>Term yrs</th>
                      <th style={{ ...th, textAlign: 'right' }}>Amort yrs</th>
                      <th style={th}>Repayment</th>
                      <th style={{ ...th, textAlign: 'right' }}>Annual</th>
                      <th style={{ ...th, textAlign: 'right' }}>Residual</th>
                      <th style={th} />
                    </tr></thead>
                    <tbody>
                      {(b.debts || []).length === 0 && (
                        <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', padding: 14 }}>
                          No debt recorded — the cover ratios below will read as if this entity is unencumbered.
                        </td></tr>
                      )}
                      {(b.debts || []).map((d, i) => {
                        const svc = businessDebtService(d, pol)
                        const revolving = REVOLVING_DEBT_TYPES.includes(d.type)
                        return (
                          <tr key={d.id || i}>
                            <td style={td}>
                              <select value={d.type || ''} onChange={e => updDebt(b, i, { type: e.target.value })} style={{ ...inp, width: 140 }}>
                                {BUSINESS_DEBT_TYPES.map(x => <option key={x}>{x}</option>)}
                              </select>
                            </td>
                            <td style={td}><input value={d.lender || ''} onChange={e => updDebt(b, i, { lender: e.target.value })} placeholder="Lender" style={{ ...inp, width: 110 }} /></td>
                            <td style={td}><div style={{ width: 110, marginLeft: 'auto' }}>
                              <MoneyIn value={revolving ? d.limit : d.balance} onCommit={v => updDebt(b, i, revolving ? { limit: v } : { balance: v })} />
                            </div></td>
                            <td style={td}><div style={{ width: 70, marginLeft: 'auto' }}><MoneyIn value={d.rate} onCommit={v => updDebt(b, i, { rate: v })} /></div></td>
                            <td style={td}><div style={{ width: 62, marginLeft: 'auto' }}>
                              {revolving ? <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                                : <MoneyIn value={d.termYears} onCommit={v => updDebt(b, i, { termYears: v })} />}
                            </div></td>
                            <td style={td}><div style={{ width: 62, marginLeft: 'auto' }}>
                              {revolving ? <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                                : <MoneyIn value={d.amortYears} onCommit={v => updDebt(b, i, { amortYears: v })} />}
                            </div></td>
                            <td style={td}>
                              {revolving ? <span style={{ fontSize: 11, color: '#7A8090' }}>Interest only</span> : (
                                <select value={d.repaymentType || 'P&I'} onChange={e => updDebt(b, i, { repaymentType: e.target.value })} style={{ ...inp, width: 150 }}>
                                  {BUSINESS_REPAYMENT_TYPES.map(x => <option key={x}>{x}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} title={svc.basis}>{money(svc.annual)}</td>
                            <td style={{ ...td, textAlign: 'right', color: svc.residual ? AMBER : '#cbd5e1' }}
                              title={svc.residual ? 'Owing when the term ends but the amortisation hasn’t — to be refinanced or repaid' : ''}>
                              {svc.residual ? money(svc.residual) : '—'}
                            </td>
                            <td style={td}><button onClick={() => rmDebt(b, i)} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 5, cursor: 'pointer' }}>✕</button></td>
                          </tr>
                        )
                      })}
                      {(b.debts || []).length > 0 && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td style={{ ...td, fontWeight: 700 }} colSpan={7}>Total</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(debt.annual)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: debt.residual ? AMBER : '#cbd5e1' }}>{debt.residual ? money(debt.residual) : '—'}</td>
                          <td style={td} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => addDebt(b)} style={{ fontSize: 11, padding: '4px 11px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginBottom: 14 }}>+ Add debt</button>

                {/* ── Cover, year by year ── */}
                <div style={{ ...lbl, marginTop: 4 }}>Cover, year by year</div>
                <div style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 6 }}>
                  EBITDA against this entity's existing debt. The Servicing tab shows the same years with the proposed facility added.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                  <thead><tr>
                    <th style={th}>Year</th>
                    <th style={{ ...th, textAlign: 'right' }}>EBITDA</th>
                    <th style={{ ...th, textAlign: 'right' }}>Interest</th>
                    <th style={{ ...th, textAlign: 'right' }}>Debt service</th>
                    <th style={{ ...th, textAlign: 'right' }}>ICR</th>
                    <th style={{ ...th, textAlign: 'right' }}>DSCR</th>
                  </tr></thead>
                  <tbody>
                    {years.map(y => {
                      const e = businessEbitda(b.years?.[y.fy])
                      const icr = debt.interest > 0 ? e / debt.interest : null
                      const dscr = debt.annual > 0 ? e / debt.annual : null
                      return (
                        <tr key={y.fy} style={{ opacity: (y.forecast && !y.include) ? 0.6 : 1 }}>
                          <td style={td}>
                            FY {y.fy}{' '}
                            {y.forecast && <Pill tone="forecast">{y.include ? 'Forecast · counted' : 'Forecast'}</Pill>}
                            {y.fy === assessFY && <Pill tone="in">Assessed</Pill>}
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>{money(e)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{debt.interest ? money(debt.interest) : '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{debt.annual ? money(debt.annual) : '—'}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: icr === null ? '#cbd5e1' : icr >= n(pol.minICR) ? GREEN : RED }}>{ratio(icr)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: dscr === null ? '#cbd5e1' : dscr >= n(pol.minDSCR) ? GREEN : RED }}>{ratio(dscr)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* ── Ownership ── */}
                <div style={{ marginTop: 14 }}>
                  <div style={lbl}>Ownership</div>
                  <div style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 6 }}>Who owns this entity, and in what share — this is how its profit flows back to the people behind it.</div>
                  {(b.ownership || []).map((o, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                      <select value={o.name || ''} onChange={e => updBusiness(b.id, { ownership: b.ownership.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x) })} style={{ ...inp, width: 230 }}>
                        <option value="">— Select —</option>
                        {entityNames.filter(nm => nm !== b.name).map(nm => <option key={nm}>{nm}</option>)}
                        <option value="Non-applicant">Non-applicant</option>
                      </select>
                      <input type="number" value={o.pct ?? ''} onChange={e => updBusiness(b.id, { ownership: b.ownership.map((x, ix) => ix === i ? { ...x, pct: e.target.value } : x) })} style={{ ...inp, width: 70, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: '#7A8090' }}>%</span>
                      <button onClick={() => updBusiness(b.id, { ownership: b.ownership.filter((_, ix) => ix !== i) })} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 5, cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => updBusiness(b.id, { ownership: [...(b.ownership || []), { name: '', pct: '' }] })} style={{ fontSize: 11, padding: '4px 11px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add owner</button>
                    <button onClick={() => rmBusiness(b.id)} style={{ fontSize: 11, padding: '4px 11px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 6, cursor: 'pointer', marginLeft: 'auto' }}>Remove entity</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <datalist id="deal-entity-names">{entityNames.map(nm => <option key={nm} value={nm} />)}</datalist>
      <button onClick={addBusiness} style={{ fontSize: 11.5, fontWeight: 600, color: NAVY, background: '#fff', border: '1px solid #e8eaed', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>+ Add business entity</button>
    </>
  )

  // ── Eliminations ───────────────────────────────────────────────────────────
  const updElim = (i, k, v) => setEliminations(eliminations.map((e, ix) => ix === i ? { ...e, [k]: v } : e))
  const eliminationsTab = (
    <>
      <div style={{ fontSize: 11.5, color: '#7A8090', marginBottom: 12, lineHeight: 1.6 }}>
        Where two entities on this deal transact with each other, the money is internal to the group — rent one pays and another receives,
        a management fee, a distribution, a loan repayment between them. Each entity's own figures above stay untouched, because that's what
        a lender tests an entity on. These lines come off <strong style={{ color: '#2A3545' }}>only at group level</strong>, so the consolidated
        number can be explained line by line instead of just asserted.
      </div>

      {suggestions.length > 0 && (
        <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: AMBER, marginBottom: 6 }}>Possible eliminations found</div>
          {suggestions.map((sg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#2A3545', marginBottom: 5 }}>
              <span style={{ flex: 1 }}>{sg.from} → {sg.to} · {sg.type} · {money(sg.amount)} p.a.</span>
              <button onClick={() => setEliminations([...eliminations, { ...sg, suggested: false }])}
                style={{ fontSize: 10.5, padding: '3px 10px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Add</button>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: '#92600A', marginTop: 4 }}>Suggestions only — a wage to a name that matches an entity isn't always an internal transaction.</div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead><tr>
          <th style={th}>From</th><th style={th}>To</th><th style={th}>Type</th>
          <th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Frequency</th>
          <th style={{ ...th, textAlign: 'right' }}>Annual</th><th style={th}>Note</th><th style={th} />
        </tr></thead>
        <tbody>
          {eliminations.length === 0 && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', padding: 16 }}>Nothing eliminated — the group total is the simple sum of the entities.</td></tr>
          )}
          {eliminations.map((e, i) => (
            <tr key={i} style={{ opacity: e.ignored ? 0.45 : 1 }}>
              <td style={td}>
                <select value={e.from || ''} onChange={ev => updElim(i, 'from', ev.target.value)} style={{ ...inp, width: 150 }}>
                  <option value="">—</option>{entityNames.map(nm => <option key={nm}>{nm}</option>)}
                </select>
              </td>
              <td style={td}>
                <select value={e.to || ''} onChange={ev => updElim(i, 'to', ev.target.value)} style={{ ...inp, width: 150 }}>
                  <option value="">—</option>{entityNames.map(nm => <option key={nm}>{nm}</option>)}
                </select>
              </td>
              <td style={td}>
                <select value={e.type || ''} onChange={ev => updElim(i, 'type', ev.target.value)} style={{ ...inp, width: 170 }}>
                  <option value="">—</option>{ELIMINATION_TYPES.map(x => <option key={x}>{x}</option>)}
                </select>
              </td>
              <td style={td}><input type="number" value={e.amount ?? ''} onChange={ev => updElim(i, 'amount', ev.target.value === '' ? '' : Number(ev.target.value))} style={{ ...inp, width: 110, textAlign: 'right' }} /></td>
              <td style={td}>
                <select value={e.frequency || 'Annually'} onChange={ev => updElim(i, 'frequency', ev.target.value)} style={{ ...inp, width: 110 }}>
                  {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                </select>
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(eliminationAnnual(e))}</td>
              <td style={td}><input value={e.note || ''} onChange={ev => updElim(i, 'note', ev.target.value)} placeholder="Why" style={{ ...inp, width: 150 }} /></td>
              <td style={td}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => updElim(i, 'ignored', !e.ignored)} title={e.ignored ? 'Apply this elimination' : 'Leave this one in the group total'}
                    style={{ fontSize: 10, padding: '3px 7px', border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', borderRadius: 5, cursor: 'pointer' }}>{e.ignored ? 'Apply' : 'Skip'}</button>
                  <button onClick={() => setEliminations(eliminations.filter((_, ix) => ix !== i))} style={{ fontSize: 10, padding: '3px 7px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 5, cursor: 'pointer' }}>✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setEliminations([...eliminations, { from: '', to: '', type: '', amount: '', frequency: 'Annually', note: '' }])}
        style={{ fontSize: 11.5, fontWeight: 600, color: NAVY, background: '#fff', border: '1px solid #e8eaed', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>+ Add elimination</button>

      <div style={{ marginTop: 16, border: '0.5px solid #e8eaed', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#5a6370', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group reconciliation</div>
        <div style={{ padding: '10px 12px' }}>
          {[['Sum of entity Total NPBT', groupTotals.gross, '#2A3545'],
            ['Less internal transactions', -groupTotals.eliminated, groupTotals.eliminated ? AMBER : '#9ca3af'],
            ['External group earnings', groupTotals.net, groupTotals.net >= 0 ? GREEN : RED]].map(([label, val, col], i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i === 2 ? '1px solid #e8eaed' : 'none', marginTop: i === 2 ? 4 : 0 }}>
              <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: i === 2 ? 700 : 400 }}>{label}</span>
              <strong style={{ fontSize: i === 2 ? 13 : 12, color: col }}>{money(val)}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['entities', `Entities${businesses.length ? ` (${businesses.length})` : ''}`], ['eliminations', `Eliminations${eliminations.length ? ` (${eliminations.length})` : ''}`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${tab === id ? NAVY : '#e8eaed'}`, background: tab === id ? NAVY : '#fff', color: tab === id ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'entities' ? entitiesTab : eliminationsTab}
    </div>
  )
}
