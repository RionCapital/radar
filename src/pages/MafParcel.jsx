import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle, FieldGroup, DateInput } from '../components/UI'
import {
  assetFinanceBalanceHistory, assetFinanceCurrentBalance, assetFinanceMonthlyRepayment,
  assetFinanceTotalMonthlyCost, progressDrawn, progressRemaining, mkProgressPayment,
} from '../lib/mafFacilities'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

export default function MafParcel({ clients, updateClient }) {
  const { name, loanIdx, parcelIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const fIdx = parseInt(loanIdx)
  const pIdx = parseInt(parcelIdx)

  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>
  const facility = client.loans[fIdx]
  if (!facility) return <div style={{ padding: 24 }}>Loan not found.</div>
  const parcel = (facility.parcels || [])[pIdx]
  if (!parcel) return <div style={{ padding: 24 }}>Parcel not found.</div>

  const backHref = `/radar/clients/${encodeURIComponent(client.name)}/loan/${fIdx}/maf`

  function updateParcel(patch) {
    updateClient(client.name, c => {
      const loans = [...c.loans]
      const fac = { ...loans[fIdx] }
      const parcels = [...fac.parcels]
      parcels[pIdx] = { ...parcels[pIdx], ...patch }
      fac.parcels = parcels
      loans[fIdx] = fac
      return { ...c, loans }
    })
  }

  function deleteParcel() {
    if (!window.confirm(`Delete this parcel? This can't be undone.`)) return
    updateClient(client.name, c => {
      const loans = [...c.loans]
      const fac = { ...loans[fIdx] }
      fac.parcels = fac.parcels.filter((_, i) => i !== pIdx)
      loans[fIdx] = fac
      return { ...c, loans }
    })
    navigate(backHref)
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #e8eaed', borderRadius: 5, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }
  const label = txt => <div style={{ fontSize: 10, color: '#7A8090', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <button onClick={() => navigate(backHref)} style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        ← Back to {facility.bank || 'MAF Facility'}
      </button>

      {parcel.kind === 'progress'
        ? <ProgressParcelView parcel={parcel} updateParcel={updateParcel} deleteParcel={deleteParcel} inputStyle={inputStyle} label={label} />
        : <AssetFinanceParcelView parcel={parcel} updateParcel={updateParcel} deleteParcel={deleteParcel} inputStyle={inputStyle} label={label} />}
    </div>
  )
}

function Header({ title, sub, onDelete }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2A3545', margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>{sub}</div>
      </div>
      <button onClick={onDelete} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete parcel</button>
    </div>
  )
}

function AssetFinanceParcelView({ parcel: p, updateParcel, deleteParcel, inputStyle, label }) {
  const balance = assetFinanceCurrentBalance(p)
  const monthly = assetFinanceMonthlyRepayment(p)
  const monthlyFee = Number(p.monthlyFee) || 0
  const totalMonthly = assetFinanceTotalMonthlyCost(p)
  const history = assetFinanceBalanceHistory(p)
  // Yearly snapshots (every 12th month) for a compact projection, rather
  // than a 300+ row monthly table.
  const yearlySnapshots = history.filter((_, i) => i % 12 === 0 || i === history.length - 1)

  return (
    <>
      <Header title={p.assetDesc || 'Asset Finance parcel'} sub="Asset Finance" onDelete={deleteParcel} />

      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <FieldGroup label="Asset description">
            <div>{label('')}<input style={inputStyle} value={p.assetDesc || ''} onChange={e => updateParcel({ assetDesc: e.target.value })} /></div>
          </FieldGroup>
          <FieldGroup label="Financed amount ($)">
            <input style={inputStyle} type="number" value={p.amount} onChange={e => updateParcel({ amount: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Interest rate (%)">
            <input style={inputStyle} type="number" step="0.01" value={p.rate} onChange={e => updateParcel({ rate: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Rate type">
            <select style={inputStyle} value={p.rateType || 'Fixed'} onChange={e => updateParcel({ rateType: e.target.value })}>
              <option>Fixed</option><option>Var</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Repayment type">
            <select style={inputStyle} value={p.rpmt || 'P&I'} onChange={e => updateParcel({ rpmt: e.target.value })}>
              <option>P&I</option><option>IO</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Term (years)">
            <input style={inputStyle} type="number" value={p.term} onChange={e => updateParcel({ term: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Balloon / residual ($, optional)">
            <input style={inputStyle} type="number" value={p.balloon} onChange={e => updateParcel({ balloon: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="One-off fees (optional)">
            <input style={inputStyle} value={p.fees || ''} onChange={e => updateParcel({ fees: e.target.value })} placeholder="e.g. $450 establishment" />
          </FieldGroup>
          <FieldGroup label="Monthly ongoing fee ($, optional)">
            <input style={inputStyle} type="number" value={p.monthlyFee} onChange={e => updateParcel({ monthlyFee: e.target.value })} placeholder="e.g. 15" />
          </FieldGroup>
          <FieldGroup label="Settlement date">
            <DateInput value={p.settled} onChange={v => updateParcel({ settled: v })} style={inputStyle} />
          </FieldGroup>
          <FieldGroup label="Status">
            <select style={inputStyle} value={p.closed ? 'closed' : 'active'} onChange={e => updateParcel({ closed: e.target.value === 'closed' })}>
              <option value="active">Active</option>
              <option value="closed">Closed / paid out</option>
            </select>
          </FieldGroup>
        </div>
        <div style={{ marginTop: 14 }}>
          <FieldGroup label="Notes">
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={p.notes || ''} onChange={e => updateParcel({ notes: e.target.value })} />
          </FieldGroup>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #e8eaed', flexWrap: 'wrap' }}>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimated balance today</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(balance)}</div>
          </div>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Est. total monthly cost</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{totalMonthly ? fmt(totalMonthly) : '—'}</div>
            {monthlyFee > 0 && monthly > 0 && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{fmt(monthly)} repayment + {fmt(monthlyFee)} fee</div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10 }}>
          Balance is estimated from the loan terms and time elapsed since settlement — there's no commission statement updating it, so it recalculates automatically every time you open this page. The monthly ongoing fee doesn't reduce the balance (it's not applied to principal) but is included in the total monthly cost above and in the projection below.
        </div>
      </Panel>

      {yearlySnapshots.length > 0 && (
        <Panel>
          <PanelTitle>Estimated balance over time</PanelTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead><tr>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'left' }}>Month</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'right' }}>Monthly cost (incl. fee)</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'left' }}></th>
              </tr></thead>
              <tbody>
                {yearlySnapshots.map((h, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)' }}>{h.date}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right' }}>{fmt(h.balance)}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right' }}>{fmt(h.repayment + monthlyFee)}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', color: h.isPast ? '#94a3b8' : '#22c55e', fontSize: 10 }}>{h.isPast ? '' : 'projected'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}

function ProgressParcelView({ parcel: p, updateParcel, deleteParcel, inputStyle, label }) {
  const drawn = progressDrawn(p)
  const remaining = progressRemaining(p)

  function addPayment() {
    updateParcel({ payments: [...(p.payments || []), mkProgressPayment()] })
  }
  function updatePayment(id, patch) {
    updateParcel({ payments: p.payments.map(pay => pay.id === id ? { ...pay, ...patch } : pay) })
  }
  function removePayment(id) {
    updateParcel({ payments: p.payments.filter(pay => pay.id !== id) })
  }

  return (
    <>
      <Header title={p.name || 'Progress facility'} sub="Progress facility" onDelete={deleteParcel} />

      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <FieldGroup label="Name">
            <input style={inputStyle} value={p.name || ''} onChange={e => updateParcel({ name: e.target.value })} placeholder="e.g. Warehouse fitout" />
          </FieldGroup>
          <FieldGroup label="Approved sub-limit ($)">
            <input style={inputStyle} type="number" value={p.approvedLimit} onChange={e => updateParcel({ approvedLimit: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Status">
            <select style={inputStyle} value={p.closed ? 'closed' : (p.status || 'Active')} onChange={e => {
              const v = e.target.value
              updateParcel({ status: v === 'closed' ? 'Active' : v, closed: v === 'closed' })
            }}>
              <option>Active</option><option>Complete</option><option value="closed">Closed</option>
            </select>
          </FieldGroup>
        </div>
        <div style={{ marginTop: 14 }}>
          <FieldGroup label="Notes">
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={p.notes || ''} onChange={e => updateParcel({ notes: e.target.value })} />
          </FieldGroup>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #e8eaed', flexWrap: 'wrap' }}>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approved sub-limit</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(Number(p.approvedLimit) || 0)}</div>
          </div>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Drawn to date</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(drawn)}</div>
          </div>
          <div style={{ background: remaining < 0 ? '#fef2f2' : '#eefaf2', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remaining on this facility</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: remaining < 0 ? '#dc2626' : '#22c55e' }}>{fmt(remaining)}</div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelTitle action={
          <button onClick={addPayment} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${PINK}`, background: 'transparent', color: PINK, cursor: 'pointer', fontWeight: 600 }}>+ Add progress payment</button>
        }>Progress payments drawn</PanelTitle>

        {!(p.payments || []).length ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '18px 0', textAlign: 'center' }}>No progress payments recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead><tr>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'left' }}>Date</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'left' }}>Description</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10 }}></th>
              </tr></thead>
              <tbody>
                {p.payments.map(pay => (
                  <tr key={pay.id}>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)' }}>
                      <DateInput value={pay.date} onChange={v => updatePayment(pay.id, { date: v })} style={{ ...inputStyle, width: 110 }} />
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)' }}>
                      <input style={inputStyle} value={pay.description || ''} onChange={e => updatePayment(pay.id, { description: e.target.value })} placeholder="e.g. Stage 2 draw" />
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)', textAlign: 'right' }}>
                      <input style={{ ...inputStyle, textAlign: 'right' }} type="number" value={pay.amount} onChange={e => updatePayment(pay.id, { amount: e.target.value })} />
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border-light)' }}>
                      <button onClick={() => removePayment(pay.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
