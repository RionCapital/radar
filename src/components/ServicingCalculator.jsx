import React, { useMemo, useState } from 'react'
import {
  assessServicing, sensitivity, resolvePolicy, maxLoanAtDscr,
  DEFAULT_SERVICING_POLICY, isIndividual,
} from '../lib/servicing'

// ─── Commercial servicing calculator ─────────────────────────────────────────
// Sits on a deal's Financials → Servicing tab. Reads the position registers
// already captured elsewhere on the deal (Employment, Other Income, Living
// Expenses, Liabilities) rather than asking for any of it twice, adds the
// property being bought, and runs the assessment in lib/servicing.js.
//
// The layout follows how the deal is actually assessed: the property on its
// own first, then each entity, then the consolidated group. An SPV purchase
// lives or dies on that order — the property rarely services itself at an
// assessed rate, and the question is whether the guarantors can carry it.

const NAVY = '#3D4F6B'
const GREEN = '#166534'
const RED = '#b91c1c'
const AMBER = '#92600A'

const inp = { border: '1px solid #e8eaed', borderRadius: 6, padding: '6px 9px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl = { fontSize: 10, color: '#7A8090', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const card = { background: '#fff', borderRadius: 10, border: '0.5px solid #e8eaed', padding: '14px 16px', marginBottom: 14 }
const th = { padding: '6px 8px', fontSize: 9.5, color: '#fff', background: NAVY, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', fontSize: 11.5, borderBottom: '0.5px solid #f1f5f9', color: '#2A3545' }

const money = v => (v === null || v === undefined || isNaN(v)) ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(Math.round(Number(v))).toLocaleString()}`
const pct = v => (v === null || v === undefined || isNaN(v)) ? '—' : `${Number(v).toFixed(2)}%`
const ratio = v => (v === null || v === undefined || isNaN(v)) ? '—' : `${Number(v).toFixed(2)}x`

function Tile({ label, value, sub, tone }) {
  const col = tone === 'good' ? GREEN : tone === 'bad' ? RED : tone === 'warn' ? AMBER : NAVY
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, padding: '11px 13px', borderRadius: 9, background: col + '0f', border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: col, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#7A8090', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function F({ label, hint, children, w }) {
  return (
    <div style={{ flex: w ? `0 0 ${w}px` : '1 1 170px', minWidth: 140 }}>
      <div style={lbl}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 9.5, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

const GST_TREATMENTS = ['Going concern (no GST)', 'GST applies — claimable', 'GST applies — not claimable', 'Margin scheme', 'Not applicable']
const RENT_BASIS = ['Net', 'Gross']
const REVIEW_BASIS = ['CPI', 'Fixed %', 'Market', 'None']

export default function ServicingCalculator({ contacts, structure, settingsPolicy, onChange }) {
  const st = structure || {}
  const property = st.commercialProperty || {}
  const entityDetail = st.entityDetail || {}
  const override = st.servicingOverride || {}

  const policy = useMemo(() => resolvePolicy(settingsPolicy, override), [settingsPolicy, override])
  const result = useMemo(
    () => assessServicing({ contacts, structure: st, policy }),
    [contacts, st, policy]
  )
  const { entities, perEntity, group } = result

  const [tab, setTab] = useState('property')
  const tabs = [
    { id: 'property', label: 'Property' },
    ...entities.map(e => ({ id: `e:${e.name}`, label: e.name, type: e.type })),
    { id: 'group', label: 'Group' },
    { id: 'assumptions', label: 'Assumptions' },
  ]
  const activeTab = tabs.some(t => t.id === tab) ? tab : 'property'

  const setProperty = (k, v) => onChange({ commercialProperty: { ...property, [k]: v } })
  const setDetail = (name, k, v) => onChange({ entityDetail: { ...entityDetail, [name]: { ...(entityDetail[name] || {}), [k]: v } } })
  const setOverride = (k, v) => {
    const next = { ...override }
    if (v === '' || v === null || v === undefined) delete next[k]; else next[k] = v
    onChange({ servicingOverride: next })
  }

  const sens = useMemo(() => sensitivity({ contacts, structure: st, policy }, [
    { label: 'Base case' },
    { label: 'Rate +1%', rateDelta: 1 },
    { label: 'Rate +2%', rateDelta: 2 },
    { label: 'Vacancy 15%', vacancyPct: 15 },
  ]), [contacts, st, policy])

  const prop = group.property

  // ── Property ───────────────────────────────────────────────────────────────
  const propertyTab = (
    <>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>The property being bought</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 12, lineHeight: 1.5 }}>
          Who buys it decides how it's tested. In an individual's name the net rent joins their income; through a company or trust the property is
          tested on its own ratios first, then the guarantors are tested on whether they can carry any shortfall.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <F label="Address" w={260}><input value={property.address || ''} onChange={e => setProperty('address', e.target.value)} placeholder="e.g. 12 Example St, Oran Park" style={{ ...inp, width: '100%' }} /></F>
          <F label="Purchasing entity" hint="From Loan Details → Clients & Contacts.">
            <select value={property.ownerEntity || ''} onChange={e => setProperty('ownerEntity', e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">— Select —</option>
              {entities.map(e => <option key={e.name} value={e.name}>{e.name} ({e.type})</option>)}
            </select>
          </F>
          <F label="Purchase price"><input type="number" value={property.purchasePrice || ''} onChange={e => setProperty('purchasePrice', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="GST treatment" hint="A going-concern sale carries no GST; otherwise it may need short-term funding.">
            <select value={property.gstTreatment || ''} onChange={e => setProperty('gstTreatment', e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">— Select —</option>
              {GST_TREATMENTS.map(g => <option key={g}>{g}</option>)}
            </select>
          </F>
          <F label="Stamp duty"><input type="number" value={property.stampDuty || ''} onChange={e => setProperty('stampDuty', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Other acquisition costs" hint="Legals, due diligence, broker fee."><input type="number" value={property.acquisitionCosts || ''} onChange={e => setProperty('acquisitionCosts', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Proposed loan</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <F label="Loan amount"><input type="number" value={property.loanAmount || ''} onChange={e => setProperty('loanAmount', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Rate" hint={`Assessed at ${pct(prop ? prop.assessedRate : null)} after the buffer.`}><input type="number" step="0.01" value={property.rate || ''} onChange={e => setProperty('rate', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Term (years)" hint={`Default ${policy.commercialAmortYears} for commercial.`}><input type="number" value={property.termYears || ''} onChange={e => setProperty('termYears', e.target.value)} placeholder={policy.commercialAmortYears} style={{ ...inp, width: '100%' }} /></F>
          <F label="Interest-only period (years)" hint="Doesn't change the assessment — it's still tested P&I."><input type="number" value={property.ioYears || ''} onChange={e => setProperty('ioYears', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="LVR">
            <div style={{ ...inp, background: '#f8fafc', color: '#2A3545', fontWeight: 600 }}>
              {Number(property.purchasePrice) > 0 ? pct(Number(property.loanAmount || 0) / Number(property.purchasePrice) * 100) : '—'}
            </div>
          </F>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Lease</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 12, lineHeight: 1.5 }}>
          A <strong style={{ color: '#2A3545' }}>net</strong> lease has the tenant paying outgoings, so only the landlord's non-recoverable costs come off the rent.
          On a <strong style={{ color: '#2A3545' }}>gross</strong> lease the landlord wears the lot, and both outgoings lines are deducted.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <F label="Tenant"><input value={property.tenant || ''} onChange={e => setProperty('tenant', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Rent basis">
            <select value={property.rentBasis || 'Net'} onChange={e => setProperty('rentBasis', e.target.value)} style={{ ...inp, width: '100%' }}>
              {RENT_BASIS.map(r => <option key={r}>{r}</option>)}
            </select>
          </F>
          <F label="Annual rent"><input type="number" value={property.annualRent || ''} onChange={e => setProperty('annualRent', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Outgoings — non-recoverable" hint="Land tax, management, landlord insurance."><input type="number" value={property.outgoingsNonRecoverable || ''} onChange={e => setProperty('outgoingsNonRecoverable', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Outgoings — recoverable" hint="Only deducted on a gross lease."><input type="number" value={property.outgoingsRecoverable || ''} onChange={e => setProperty('outgoingsRecoverable', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Vacancy allowance" hint={`Blank uses the house default of ${policy.vacancyAllowancePct}%.`}><input type="number" value={property.vacancyPct ?? ''} onChange={e => setProperty('vacancyPct', e.target.value)} placeholder={policy.vacancyAllowancePct} style={{ ...inp, width: '100%' }} /></F>
          <F label="Lease term remaining (years)" hint="A short WALE is what makes a lender shade harder."><input type="number" step="0.5" value={property.leaseTermRemaining || ''} onChange={e => setProperty('leaseTermRemaining', e.target.value)} style={{ ...inp, width: '100%' }} /></F>
          <F label="Options remaining"><input value={property.options || ''} onChange={e => setProperty('options', e.target.value)} placeholder="e.g. 2 × 5 years" style={{ ...inp, width: '100%' }} /></F>
          <F label="Review basis">
            <select value={property.reviewBasis || ''} onChange={e => setProperty('reviewBasis', e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">— Select —</option>
              {REVIEW_BASIS.map(r => <option key={r}>{r}</option>)}
            </select>
          </F>
        </div>
      </div>

      {prop ? (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Property test — standalone</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <Tile label="Net property income" value={money(prop.netRent)} sub={`${money(prop.grossRent)} less ${prop.vacancyPct}% vacancy and ${money(prop.outgoings)} outgoings`} />
            <Tile label="Interest cover (ICR)" value={ratio(prop.icr)} tone={prop.icrPass ? 'good' : 'bad'} sub={`Needs ${ratio(policy.minICR)} · interest ${money(prop.interestOnly)}`} />
            <Tile label="Debt service cover (DSCR)" value={ratio(prop.dscr)} tone={prop.dscrPass ? 'good' : 'bad'} sub={`Needs ${ratio(policy.minDSCR)} · P&I ${money(prop.principalAndInterest)}`} />
            <Tile label="Shortfall to cover" value={money(prop.shortfall)} tone={prop.shortfall > 0 ? 'warn' : 'good'} sub={prop.shortfall > 0 ? 'Carried by the guarantors' : 'Property carries itself'} />
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.6 }}>
            Assessed at <strong style={{ color: '#2A3545' }}>{pct(prop.assessedRate)}</strong> ({pct(Number(property.rate) || 0)} + {policy.buffer}% buffer, floor {policy.floorRate}%)
            over <strong style={{ color: '#2A3545' }}>{prop.term} years</strong> P&I.
            <br />
            At the minimum DSCR of {ratio(policy.minDSCR)} this income supports a loan of <strong style={{ color: NAVY }}>{money(maxLoanAtDscr(property, policy, policy.minDSCR))}</strong>
            {Number(property.purchasePrice) > 0 && <> — {pct(maxLoanAtDscr(property, policy, policy.minDSCR) / Number(property.purchasePrice) * 100)} of the purchase price.</>}
          </div>
        </div>
      ) : (
        <div style={{ ...card, color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>Enter a loan amount and rent to see the property test.</div>
      )}
    </>
  )

  // ── One entity ─────────────────────────────────────────────────────────────
  function entityTab(name) {
    const r = perEntity.find(x => x.entity.name === name)
    if (!r) return null
    const e = r.entity
    const detail = entityDetail[name] || {}
    const ind = isIndividual(e)
    const owners = detail.owners || []
    const others = entities.filter(x => x.name !== name)

    return (
      <>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2A3545' }}>{e.name}</div>
              <div style={{ fontSize: 11, color: '#7A8090' }}>{e.type}{e.abn ? ` · ABN ${e.abn}` : ''} · from Loan Details → Clients &amp; Contacts</div>
            </div>
            <label style={{ fontSize: 11, color: '#7A8090', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!detail.excluded} onChange={ev => setDetail(name, 'excluded', ev.target.checked)} />
              Exclude from the group
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {ind ? (
              <>
                <F label="Dependants" hint="Drives the HEM band." w={110}>
                  <input type="number" value={detail.dependants ?? ''} onChange={ev => setDetail(name, 'dependants', ev.target.value === '' ? '' : Number(ev.target.value))} style={{ ...inp, width: '100%' }} />
                </F>
                <F label="Marital status" hint="A couple is assessed against one household benchmark." w={150}>
                  <select value={e.maritalStatus || detail.maritalStatus || ''} onChange={ev => setDetail(name, 'maritalStatus', ev.target.value)} style={{ ...inp, width: '100%' }}>
                    <option value="">— Select —</option>
                    {['Single', 'Married', 'De Facto', 'Separated', 'Divorced', 'Widowed'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </F>
              </>
            ) : (
              <>
                <F label="ACN" w={150}><input value={detail.acn || ''} onChange={ev => setDetail(name, 'acn', ev.target.value)} style={{ ...inp, width: '100%' }} /></F>
                <F label="Trustee" hint="For a trust — who acts as trustee." w={200}><input value={detail.trustee || ''} onChange={ev => setDetail(name, 'trustee', ev.target.value)} style={{ ...inp, width: '100%' }} /></F>
              </>
            )}
          </div>

          {!ind && (
            <div style={{ marginTop: 12 }}>
              <div style={lbl}>Shareholders / unitholders</div>
              {owners.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'center' }}>
                  <select value={o.name || ''} onChange={ev => setDetail(name, 'owners', owners.map((x, ix) => ix === i ? { ...x, name: ev.target.value } : x))} style={{ ...inp, width: 220 }}>
                    <option value="">— Select —</option>
                    {entities.filter(x => x.name !== name).map(x => <option key={x.name}>{x.name}</option>)}
                  </select>
                  <input type="number" value={o.pct ?? ''} onChange={ev => setDetail(name, 'owners', owners.map((x, ix) => ix === i ? { ...x, pct: ev.target.value } : x))} style={{ ...inp, width: 80 }} placeholder="%" />
                  <span style={{ fontSize: 11, color: '#7A8090' }}>%</span>
                  <button onClick={() => setDetail(name, 'owners', owners.filter((_, ix) => ix !== i))} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #fecaca', background: '#fff', color: RED, borderRadius: 5, cursor: 'pointer' }}>✕</button>
                </div>
              ))}
              <button onClick={() => setDetail(name, 'owners', [...owners, { name: '', pct: '' }])} style={{ fontSize: 11, padding: '4px 11px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add owner</button>
            </div>
          )}

          {ind && others.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={lbl}>Guarantees given</div>
              <div style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 6, lineHeight: 1.45 }}>
                A director guarantee means the lender can come after this person for the whole of that entity's debt. It doesn't change their own
                position below — it's shown separately so the exposure isn't invisible.
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {others.map(o => (
                  <label key={o.name} style={{ fontSize: 11.5, color: '#2A3545', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="checkbox" checked={(detail.guarantees || []).includes(o.name)}
                      onChange={ev => setDetail(name, 'guarantees', ev.target.checked
                        ? [...(detail.guarantees || []), o.name]
                        : (detail.guarantees || []).filter(g => g !== o.name))} />
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Tile label="Surplus" value={`${money(r.surplusMonthly)}/mo`} tone={r.pass ? 'good' : 'bad'} sub={`${money(r.surplus)} a year`} />
            <Tile label="Net service ratio" value={ratio(r.nsr)} tone={r.nsr >= 1 ? 'good' : 'bad'} sub="Income after tax ÷ outgoings" />
            <Tile label="Assessed income" value={money(r.shadedIncome)} sub={`${money(r.grossIncome)} gross, shaded`} />
            <Tile label="Tax" value={money(r.tax)} sub={`on ${money(r.taxableIncome)} taxable${r.deductibleInterest ? `, after ${money(r.deductibleInterest)} deductible interest` : ''}`} />
            {r.guarantee?.total > 0 && <Tile label="Guarantee exposure" value={money(r.guarantee.total)} tone="warn" sub={r.guarantee.items.map(i => i.entity).join(', ')} />}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <thead><tr><th style={th}>Income</th><th style={{ ...th, textAlign: 'right' }}>Gross p.a.</th><th style={{ ...th, textAlign: 'right' }}>Shading</th><th style={{ ...th, textAlign: 'right' }}>Counted</th></tr></thead>
            <tbody>
              {r.lines.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', padding: 14 }}>No income recorded for this entity.</td></tr>}
              {r.lines.map((l, i) => (
                <tr key={i}>
                  <td style={td}>{l.label}{l.isNewProperty && <span style={{ color: NAVY, fontWeight: 600 }}> · new</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(l.amount)}</td>
                  <td style={{ ...td, textAlign: 'right', color: l.shadePct < 100 ? AMBER : '#9ca3af' }}>{l.shadePct}%</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(l.shaded)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ ...td, fontWeight: 700 }}>Total income</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.grossIncome)}</td>
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.shadedIncome)}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Outgoing</th><th style={th}>Basis</th><th style={{ ...th, textAlign: 'right' }}>Assessed p.a.</th></tr></thead>
            <tbody>
              <tr><td style={td}>Tax</td><td style={{ ...td, color: '#7A8090' }}>{ind ? `Marginal scale ${policy.taxYearLabel} + ${policy.medicareLevyPct}% Medicare` : `Company rate ${policy.companyTaxRate}%`}</td><td style={{ ...td, textAlign: 'right' }}>{money(r.tax)}</td></tr>
              {ind && (
                <tr>
                  <td style={td}>Living expenses</td>
                  <td style={{ ...td, color: '#7A8090' }}>
                    {r.expenses.basis}
                    {r.expenses.householdMembers?.length > 1 && <> · {r.expenses.household} household share of {money(r.expenses.householdAmount)}</>}
                    {!r.expenses.hemAvailable && <span style={{ color: AMBER }}> · no HEM table loaded</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(r.expenses.amount)}</td>
                </tr>
              )}
              {r.commitments.map((c, i) => (
                <tr key={i}>
                  <td style={td}>{c.label}{c.isNewLoan && <span style={{ color: NAVY, fontWeight: 600 }}> · new</span>}{c.share < 1 && <span style={{ color: '#9ca3af' }}> · {Math.round(c.share * 100)}% share</span>}</td>
                  <td style={{ ...td, color: '#7A8090' }}>{c.basis}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(c.annual)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total outgoings</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.tax + r.expenses.amount + r.assessedCommitments)}</td>
              </tr>
              <tr style={{ background: r.pass ? '#f0fdf4' : '#fef2f2' }}>
                <td style={{ ...td, fontWeight: 700, color: r.pass ? GREEN : RED }} colSpan={2}>Surplus</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.pass ? GREEN : RED }}>{money(r.surplus)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    )
  }

  // ── Group ──────────────────────────────────────────────────────────────────
  const groupTab = (
    <>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Consolidated position</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 12, lineHeight: 1.5 }}>
          Every entity's income, tax, expenses and commitments counted once. A guaranteed shortfall is already inside this consolidation,
          so it isn't added again on the guarantor — doing that would charge the deal twice for the same debt.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Tile label="Group surplus" value={`${money(group.surplusMonthly)}/mo`} tone={group.pass ? 'good' : 'bad'} sub={`${money(group.surplus)} a year across ${group.entityCount} entities`} />
          <Tile label="Group NSR" value={ratio(group.nsr)} tone={group.nsr >= 1 ? 'good' : 'bad'} sub="Income after tax ÷ outgoings" />
          {prop && <Tile label="Property ICR" value={ratio(prop.icr)} tone={prop.icrPass ? 'good' : 'bad'} sub={`Needs ${ratio(policy.minICR)}`} />}
          {prop && <Tile label="Property DSCR" value={ratio(prop.dscr)} tone={prop.dscrPass ? 'good' : 'bad'} sub={`Needs ${ratio(policy.minDSCR)}`} />}
        </div>
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Entity</th><th style={{ ...th, textAlign: 'right' }}>Assessed income</th><th style={{ ...th, textAlign: 'right' }}>Tax</th>
            <th style={{ ...th, textAlign: 'right' }}>Living exp.</th><th style={{ ...th, textAlign: 'right' }}>Commitments</th>
            <th style={{ ...th, textAlign: 'right' }}>Surplus</th><th style={{ ...th, textAlign: 'right' }}>NSR</th>
          </tr></thead>
          <tbody>
            {perEntity.map(r => (
              <tr key={r.entity.name} style={{ opacity: r.entity.excluded ? 0.45 : 1 }}>
                <td style={td}>{r.entity.name} <span style={{ color: '#9ca3af', fontSize: 10 }}>{r.entity.type}</span>{r.entity.excluded && <span style={{ color: AMBER, fontSize: 10 }}> · excluded</span>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(r.shadedIncome)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(r.tax)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(r.expenses.amount)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(r.assessedCommitments)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.pass ? GREEN : RED }}>{money(r.surplus)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{ratio(r.nsr)}</td>
              </tr>
            ))}
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ ...td, fontWeight: 700 }}>Group</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(group.shadedIncome)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(group.tax)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(group.expenses)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(group.assessedCommitments)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: group.pass ? GREEN : RED }}>{money(group.surplus)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{ratio(group.nsr)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Sensitivity</div>
        <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 10 }}>What breaks it: a rate move on top of the buffer already applied, or the tenant leaving.</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Scenario</th><th style={{ ...th, textAlign: 'right' }}>Group surplus</th><th style={{ ...th, textAlign: 'right' }}>Group NSR</th>
            <th style={{ ...th, textAlign: 'right' }}>ICR</th><th style={{ ...th, textAlign: 'right' }}>DSCR</th><th style={{ ...th, textAlign: 'right' }}>Outcome</th>
          </tr></thead>
          <tbody>
            {sens.map(s2 => (
              <tr key={s2.label}>
                <td style={td}>{s2.label}</td>
                <td style={{ ...td, textAlign: 'right', color: s2.groupSurplus >= 0 ? GREEN : RED }}>{money(s2.groupSurplus)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{ratio(s2.groupNsr)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{ratio(s2.icr)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{ratio(s2.dscr)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: s2.pass ? GREEN : RED }}>{s2.pass ? 'Passes' : 'Fails'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )

  // ── Assumptions ────────────────────────────────────────────────────────────
  const OVERRIDABLE = [
    ['buffer', 'Assessment buffer', '%'],
    ['floorRate', 'Floor rate', '%'],
    ['creditCardAssessPct', 'Credit card assessment', '% of limit/mo'],
    ['commercialAmortYears', 'Commercial amortisation', 'years'],
    ['residentialAmortYears', 'Residential amortisation', 'years'],
    ['vacancyAllowancePct', 'Vacancy allowance', '%'],
    ['minICR', 'Minimum ICR', 'x'],
    ['minDSCR', 'Minimum DSCR', 'x'],
    ['manualExpenseFloor', 'Living expense floor', '$ p.a.'],
  ]
  const base = { ...DEFAULT_SERVICING_POLICY, ...(settingsPolicy || {}) }
  const overrideCount = Object.keys(override).length

  const assumptionsTab = (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Assumptions for this deal</div>
      <div style={{ fontSize: 11, color: '#7A8090', marginBottom: 12, lineHeight: 1.5 }}>
        These start from Settings → Rradar → Servicing. Anything you change here applies to <strong style={{ color: '#2A3545' }}>this deal only</strong>,
        and anything left blank keeps following the house default — so changing the house number later still flows through.
        {!!overrideCount && <> <strong style={{ color: AMBER }}>{overrideCount} overridden.</strong></>}
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Assumption</th><th style={{ ...th, textAlign: 'right' }}>House default</th><th style={th}>This deal</th><th style={th} /></tr></thead>
        <tbody>
          {OVERRIDABLE.map(([k, label, suffix]) => (
            <tr key={k}>
              <td style={td}>{label}</td>
              <td style={{ ...td, textAlign: 'right', color: '#7A8090' }}>{base[k] === '' || base[k] === undefined ? '—' : `${base[k]} ${suffix}`}</td>
              <td style={td}>
                <input type="number" step="0.01" value={override[k] ?? ''} placeholder={base[k]}
                  onChange={e => setOverride(k, e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ ...inp, width: 110, borderColor: override[k] !== undefined ? AMBER : '#e8eaed', background: override[k] !== undefined ? '#FEF9E7' : '#fff' }} />
                <span style={{ fontSize: 10.5, color: '#9ca3af', marginLeft: 5 }}>{suffix}</span>
              </td>
              <td style={td}>
                {override[k] !== undefined && (
                  <button onClick={() => setOverride(k, '')} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', borderRadius: 5, cursor: 'pointer' }}>Reset</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!overrideCount && (
        <button onClick={() => onChange({ servicingOverride: {} })}
          style={{ marginTop: 12, fontSize: 11, padding: '5px 12px', border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          Reset all to house defaults
        </button>
      )}
      <div style={{ marginTop: 14, fontSize: 11, color: '#7A8090', lineHeight: 1.6, borderTop: '0.5px solid #f0f0f0', paddingTop: 12 }}>
        Tax scale <strong style={{ color: '#2A3545' }}>{policy.taxYearLabel}</strong> · company rate {policy.companyTaxRate}% ·{' '}
        {(policy.hem || []).length
          ? <>HEM benchmark loaded ({(policy.hem || []).length} rows{policy.hemEffectiveFrom ? `, effective ${policy.hemEffectiveFrom}` : ''})</>
          : <span style={{ color: AMBER }}>no HEM benchmark loaded — living expenses assessed on declared figures</span>}
      </div>
    </div>
  )

  return (
    <div>
      {entities.length === 0 && (
        <div style={{ background: '#FEF9E7', border: '1px solid #f5e6a8', borderRadius: 8, padding: '10px 13px', fontSize: 11.5, color: AMBER, marginBottom: 14 }}>
          No people or entities on this deal yet. Add them under <strong>Loan Details → Clients &amp; Contacts</strong> — companies and trusts included — and they'll appear here as tabs.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabs.map(t => {
          const on = activeTab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '6px 13px', borderRadius: 7, border: `1px solid ${on ? NAVY : '#e8eaed'}`, background: on ? NAVY : '#fff', color: on ? '#fff' : '#7A8090', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t.label}{t.type && t.type !== 'Individual' && <span style={{ opacity: 0.7, fontWeight: 400 }}> · {t.type}</span>}
            </button>
          )
        })}
      </div>

      {activeTab === 'property' && propertyTab}
      {activeTab.startsWith('e:') && entityTab(activeTab.slice(2))}
      {activeTab === 'group' && groupTab}
      {activeTab === 'assumptions' && assumptionsTab}
    </div>
  )
}
