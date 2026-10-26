import React, { useMemo, useState } from 'react'

// ─── Business financials, entity by entity ───────────────────────────────────
// Replaces the single four-row trading grid. A commercial file routinely runs
// across a trading company, a holding trust and an SPV, and each needs its own
// financials, add-backs and ownership before anything can be consolidated.
//
// The piece that doesn't exist in most tools is the eliminations register.
// Once several entities on one deal transact with each other, the same dollar
// shows up twice at group level — rent the SPV receives and the trading
// company pays, a management fee, a distribution, a loan repayment between
// them. Each entity's standalone figures stay exactly as they are (that's what
// a lender tests an entity on); the eliminations are applied only when the
// group is consolidated, and shown line by line so the consolidation can be
// explained rather than just asserted.

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

const STRUCTURES = ['Company', 'Trust', 'Sole Trader', 'Partnership']
const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Annually']
const FREQ_ANNUAL = { Weekly: 52, Fortnightly: 26, Monthly: 12, Quarterly: 4, Annually: 1 }
export const ELIMINATION_TYPES = [
  "Director's wages / salary", 'Rent', 'Management fee', 'Trust distribution', 'Dividend', 'Inter-entity loan repayment', 'Other',
]

const ADD_BACKS = [
  ['interest', 'Interest'],
  ['depreciation', 'Depreciation'],
  ['amortisation', 'Amortisation'],
  ['lease', 'Lease'],
  ['hirePurchase', 'Hire Purchase'],
]

// What the entity actually earned for servicing purposes: profit before tax,
// stripped of one-offs and with the non-cash and financing charges added back.
export function totalNpbt(year) {
  const y = year || {}
  return n(y.npbt)
    - n(y.nonRecurringIncome)
    + n(y.nonRecurringExpense)
    + n(y.extraSuper)
    + ADD_BACKS.reduce((s, [k]) => s + n(y.addBacks?.[k]), 0)
}

export function eliminationAnnual(e) {
  return n(e.amount) * (FREQ_ANNUAL[e.frequency] ?? 1)
}

// Where two entities on the same deal transact, the money is internal to the
// group. Suggested rather than applied — the broker confirms, because an
// expense to a similarly-named party isn't always the related entity.
export function suggestEliminations(businessEntities, existing, dealEntityNames) {
  // Directors' wages most often go to a PERSON on the deal, not to another
  // company, so the match is against every entity on the file — otherwise
  // the commonest double-count of the lot never gets suggested.
  const names = [...new Set([
    ...(businessEntities || []).map(b => b.name),
    ...(dealEntityNames || []),
  ])].filter(Boolean)
  const already = new Set((existing || []).map(e => `${e.from}|${e.to}|${e.type}`))
  const out = []
  ;(businessEntities || []).forEach(b => {
    const y = b.years?.[b.recentFY] || {}
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

export default function BusinessFinancials({ contacts, structure, onChange }) {
  const st = structure || {}
  const businesses = st.businessEntities || []
  const eliminations = st.eliminations || []
  const [open, setOpen] = useState(businesses[0]?.id || null)
  const [tab, setTab] = useState('entities')

  const entityNames = (contacts || []).map(c => c.name).filter(Boolean)
  const setBusinesses = next => onChange({ businessEntities: next })
  const setEliminations = next => onChange({ eliminations: next })

  const addBusiness = () => {
    const id = `b${Date.now()}`
    const fy = String(new Date().getFullYear())
    setBusinesses([...businesses, { id, name: '', structure: 'Company', hasLoans: false, recentFY: fy, years: {}, ownership: [] }])
    setOpen(id)
  }
  const updBusiness = (id, patch) => setBusinesses(businesses.map(b => b.id === id ? { ...b, ...patch } : b))
  const rmBusiness = id => {
    if (!window.confirm('Remove this entity and its financials?')) return
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

  const fyOptions = useMemo(() => {
    const now = new Date().getFullYear()
    return [now, now - 1, now - 2, now - 3].map(String)
  }, [])

  const groupTotals = useMemo(() => {
    const gross = businesses.reduce((s, b) => s + totalNpbt(b.years?.[b.recentFY]), 0)
    const eliminated = eliminations.filter(e => !e.ignored).reduce((s, e) => s + eliminationAnnual(e), 0)
    return { gross, eliminated, net: gross - eliminated }
  }, [businesses, eliminations])

  const suggestions = useMemo(() => suggestEliminations(businesses, eliminations, entityNames), [businesses, eliminations, entityNames])

  const Field = ({ label, children, w }) => (
    <div style={{ flex: w ? `0 0 ${w}px` : '1 1 180px', minWidth: 150 }}>
      <div style={lbl}>{label}</div>
      {children}
    </div>
  )
  const MoneyIn = ({ value, onCommit }) => (
    <input type="number" value={value ?? ''} onChange={e => onCommit(e.target.value === '' ? '' : Number(e.target.value))}
      style={{ ...inp, width: '100%', textAlign: 'right' }} />
  )

  // ── Entities ───────────────────────────────────────────────────────────────
  const entitiesTab = (
    <>
      {businesses.length === 0 && (
        <div style={{ padding: '22px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12, fontStyle: 'italic', border: '0.5px dashed #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
          No business entities yet. Add one for each trading company, trust or partnership whose financials go into this deal.
        </div>
      )}

      {businesses.map(b => {
        const fy = b.recentFY
        const y = b.years?.[fy] || {}
        const prevFy = String(Number(fy) - 1)
        const prev = b.years?.[prevFy] || {}
        const isOpen = open === b.id
        const total = totalNpbt(y)
        return (
          <div key={b.id} style={{ border: '0.5px solid #e8eaed', borderRadius: 9, marginBottom: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: isOpen ? '#f4f7fb' : '#fff', cursor: 'pointer' }}
              onClick={() => setOpen(isOpen ? null : b.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2A3545' }}>{b.name || 'Unnamed entity'}</div>
                <div style={{ fontSize: 10.5, color: '#7A8090' }}>{b.structure} · most recent FY {fy}</div>
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
                  <Field label="Most recent financial year" w={150}>
                    <select value={fy} onChange={e => updBusiness(b.id, { recentFY: e.target.value })} style={{ ...inp, width: '100%' }}>
                      {fyOptions.map(x => <option key={x} value={x}>FY {x}</option>)}
                    </select>
                  </Field>
                  <Field label="Has loans with regular repayments" w={190}>
                    <label style={{ fontSize: 11.5, color: '#2A3545', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <input type="checkbox" checked={!!b.hasLoans} onChange={e => updBusiness(b.id, { hasLoans: e.target.checked })} />
                      {b.hasLoans ? 'Yes — record them under Liabilities' : 'No'}
                    </label>
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                  {[[fy, y, false], [prevFy, prev, true]].map(([label, data, isPrev]) => (
                    <div key={label} style={{ border: '0.5px solid #e8eaed', borderRadius: 8, padding: '10px 12px', background: isPrev ? '#fcfcfd' : '#fff' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: isPrev ? '#7A8090' : NAVY, marginBottom: 8 }}>
                        {isPrev ? 'Previous' : 'Recent'} FY ({label}) — {money(totalNpbt(data))}
                      </div>
                      <div style={{ ...lbl, marginTop: 4 }}>Wage details</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Directors' wages</span>
                        <div style={{ width: 130 }}><MoneyIn value={data.directorsWages} onCommit={v => updYear(b.id, label, { directorsWages: v })} /></div>
                      </div>
                      <div style={lbl}>Income, profit, expenses</div>
                      {[['npbt', 'Net profit before tax'], ['nonRecurringIncome', 'Non-recurring income'], ['nonRecurringExpense', 'Non-recurring expense'], ['extraSuper', 'Extra super contributions']].map(([k, text]) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{text}</span>
                          <div style={{ width: 130 }}><MoneyIn value={data[k]} onCommit={v => updYear(b.id, label, { [k]: v })} /></div>
                        </div>
                      ))}
                      <div style={{ ...lbl, marginTop: 8 }}>Add backs</div>
                      {ADD_BACKS.map(([k, text]) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{text}</span>
                          <div style={{ width: 130 }}><MoneyIn value={data.addBacks?.[k]} onCommit={v => updAddBack(b.id, label, k, v)} /></div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8eaed', marginTop: 8, paddingTop: 7 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2A3545' }}>Total NPBT</span>
                        <strong style={{ fontSize: 12.5, color: NAVY }}>{money(totalNpbt(data))}</strong>
                      </div>
                    </div>
                  ))}
                </div>

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
