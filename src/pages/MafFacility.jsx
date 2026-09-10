import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle, FieldGroup, DateInput, ActionBtn } from '../components/UI'
import {
  blankAssetFinanceParcel, blankProgressParcel, blankImportLeaseParcel, parcelLabel, parcelCurrentValue,
  parcelOriginalValue, facilityUtilized, facilityHeadroom, progressDrawn,
  importLeaseSubLimitUtilized, importLeaseSubLimitHeadroom,
} from '../lib/mafFacilities'
import NewOpportunityModal from '../components/NewOpportunityModal'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

// A MAF facility is just a normal client.loans[] row (type: 'MAF') that
// also carries a `parcels` array — its lender is loan.bank, its limit is
// loan.amount, and its status is loan.closed, exactly like every other
// loan type. This page is what a MAF row's Loans-table entry links to
// instead of the standard LoanAccount page.
export default function MafFacility({ clients, updateClient }) {
  const { name, loanIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const idx = parseInt(loanIdx)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showNewOpp, setShowNewOpp] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [sort, setSort] = useState({ col: null, dir: 1 })

  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>
  const facility = client.loans[idx]
  if (!facility) return <div style={{ padding: 24 }}>Loan not found.</div>

  const f = editing ? draft : facility
  const utilized = facilityUtilized(facility)
  const headroom = facilityHeadroom(facility)
  const ilUtilized = importLeaseSubLimitUtilized(facility)
  const ilHeadroom = importLeaseSubLimitHeadroom(facility)

  function startEdit() { setEditing(true); setDraft({ ...facility }) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() {
    updateClient(client.name, c => {
      const loans = [...c.loans]
      loans[idx] = draft
      return { ...c, loans }
    })
    setEditing(false); setDraft(null)
  }
  function set(field, val) { setDraft(d => ({ ...d, [field]: val })) }

  function deleteFacility() {
    if (!window.confirm(`Delete this MAF facility (${facility.bank || 'no lender set'}) and all ${(facility.parcels || []).length} parcel(s) under it? This can't be undone.`)) return
    updateClient(client.name, c => ({ ...c, loans: c.loans.filter((_, i) => i !== idx) }))
    navigate(`/radar/clients/${encodeURIComponent(client.name)}`)
  }

  function addParcel(kind) {
    setShowAddMenu(false)
    const parcel = kind === 'progress' ? blankProgressParcel() : kind === 'importLease' ? blankImportLeaseParcel() : blankAssetFinanceParcel()
    // updateClient's setState updater runs asynchronously (React batches it),
    // so the new parcel's index can't be read back out of it reliably — it's
    // simply the current parcel count, computed here from the already-known
    // facility before the update is queued.
    const newIdx = (facility.parcels || []).length
    updateClient(client.name, c => {
      const loans = [...c.loans]
      const fac = { ...loans[idx] }
      fac.parcels = [...(fac.parcels || []), parcel]
      loans[idx] = fac
      return { ...c, loans }
    })
    navigate(`/radar/clients/${encodeURIComponent(client.name)}/loan/${idx}/maf/parcel/${newIdx}`)
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #e8eaed', borderRadius: 5, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }
  const th = { padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td = (extra = {}) => ({ padding: '7px 8px', borderBottom: '0.5px solid var(--border-light)', fontSize: 11.5, color: 'var(--text-primary)', verticalAlign: 'middle', ...extra })
  const parcels = facility.parcels || []
  const PARCEL_KIND_LABEL = { progress: 'Progress', importLease: 'Import Lease' }
  function parcelKindLabel(p) { return PARCEL_KIND_LABEL[p.kind] || 'Asset Finance' }

  // Clicking a header sorts by that column — click again to flip direction.
  // The table always displays newest-added-last by default (col: null); once
  // a column is picked, every row still carries its own original parcels[]
  // index (see `i` below) so clicking through to a parcel's full detail page
  // still opens the right one regardless of the on-screen sort order.
  function toggleSort(col) {
    setSort(s => s.col === col ? { col, dir: -s.dir } : { col, dir: 1 })
  }
  function sortArrow(col) { return sort.col === col ? (sort.dir === 1 ? ' ▲' : ' ▼') : '' }
  const SORTERS = {
    type: (p) => parcelKindLabel(p),
    description: (p) => (parcelLabel(p) || '').toLowerCase(),
    amount: (p) => parcelOriginalValue(p),
    balance: (p) => (p.kind === 'progress' ? progressDrawn(p) : parcelCurrentValue(p)),
  }
  const indexedParcels = parcels.map((p, i) => ({ p, i }))
  if (sort.col) {
    const sorter = SORTERS[sort.col]
    indexedParcels.sort((a, b) => {
      const av = sorter(a.p), bv = sorter(b.p)
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return cmp * sort.dir
    })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        ← Back to {client.name}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>{facility.bank || 'MAF Facility'} — Master Asset Finance</h1>
          <div style={{ fontSize: 12, color: '#7A8090', marginTop: 4 }}>{client.name}{facility.closed ? ' · Closed' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionBtn label="+ New opportunity" onClick={() => setShowNewOpp(true)} variant="filled" />
          {!editing
            ? <button onClick={startEdit} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 7, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
            : <>
                <button onClick={save} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 7, border: 'none', background: '#27ae60', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                <button onClick={cancel} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 7, border: '0.5px solid #e8eaed', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              </>}
          <button onClick={deleteFacility} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete facility</button>
        </div>
      </div>

      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <FieldGroup label="Lender">
            {editing ? <input style={inputStyle} value={f.bank || ''} onChange={e => set('bank', e.target.value)} /> : <div>{facility.bank || '—'}</div>}
          </FieldGroup>
          <FieldGroup label="MAF Limit">
            {editing ? <input style={inputStyle} type="number" value={f.amount} onChange={e => set('amount', e.target.value)} /> : <div style={{ fontWeight: 700 }}>{fmt(Number(facility.amount) || 0)}</div>}
          </FieldGroup>
          <FieldGroup label="Start date">
            {editing ? <DateInput value={f.settled} onChange={v => set('settled', v)} style={inputStyle} /> : <div>{facility.settled ? fmtDate(facility.settled) : '—'}</div>}
          </FieldGroup>
          <FieldGroup label="Review date">
            {editing ? <DateInput value={f.reviewDate} onChange={v => set('reviewDate', v)} style={inputStyle} /> : <div>{facility.reviewDate ? fmtDate(facility.reviewDate) : '—'}</div>}
          </FieldGroup>
          <FieldGroup label="Status">
            {editing
              ? <select style={inputStyle} value={f.closed ? 'closed' : 'active'} onChange={e => set('closed', e.target.value === 'closed')}>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              : <div>{facility.closed ? 'Closed' : 'Active'}</div>}
          </FieldGroup>
          <FieldGroup label="Direct">
            {editing
              ? <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer', marginTop: 6 }}>
                  <input type="checkbox" checked={!!f.direct} onChange={e => set('direct', e.target.checked)} />
                  Tracked directly (not from a statement)
                </label>
              : <div>{facility.direct ? 'Yes — tracked directly, not from a statement' : '—'}</div>}
          </FieldGroup>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
          Ticking Direct marks this whole MAF — and every parcel drawn under it (Asset Finance, Progress, Import Lease) — as tracked directly in Rradar rather than from a commission statement. The Portfolio Split chart on the Dashboard will then use the live utilised total shown below instead of a statement balance.
        </div>
        <div style={{ marginTop: 14 }}>
          <FieldGroup label="Notes">
            {editing
              ? <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
              : <div style={{ fontSize: 12, color: facility.notes ? 'var(--text-primary)' : '#CBD5E1', fontStyle: facility.notes ? 'normal' : 'italic' }}>{facility.notes || 'No notes'}</div>}
          </FieldGroup>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #e8eaed', flexWrap: 'wrap' }}>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>MAF Limit</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(Number(facility.amount) || 0)}</div>
          </div>
          <div style={{ background: '#F4F6FA', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Utilized (current balances)</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(utilized)}</div>
          </div>
          <div style={{ background: headroom < 0 ? '#fef2f2' : '#eefaf2', borderRadius: 8, padding: '10px 16px', flex: '1 1 160px' }}>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headroom available</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: headroom < 0 ? '#dc2626' : '#22c55e' }}>{fmt(headroom)}</div>
          </div>
        </div>
      </Panel>

      <Panel style={{ marginBottom: 16 }}>
        <PanelTitle>Sub limits</PanelTitle>
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 12 }}>
          A sub-limit tracks its own ceiling within the MAF — every Import Lease parcel drawn under this facility counts against it, on top of counting against the MAF limit above.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, alignItems: 'end' }}>
          <FieldGroup label="Import Lease limit ($)">
            {editing ? <input style={inputStyle} type="number" value={f.importLeaseLimit || ''} onChange={e => set('importLeaseLimit', e.target.value)} /> : <div style={{ fontWeight: 700 }}>{fmt(Number(facility.importLeaseLimit) || 0)}</div>}
          </FieldGroup>
          <div>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Utilized</div>
            <div style={{ fontWeight: 700 }}>{fmt(ilUtilized)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Headroom</div>
            <div style={{ fontWeight: 700, color: ilHeadroom < 0 ? '#dc2626' : '#22c55e' }}>{fmt(ilHeadroom)}</div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelTitle action={
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAddMenu(o => !o)} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${PINK}`, background: 'transparent', color: PINK, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              + Add parcel <span style={{ fontSize: 8 }}>▼</span>
            </button>
            {showAddMenu && (
              <>
                <div onClick={() => setShowAddMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '0.5px solid #e8eaed', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, minWidth: 180, overflow: 'hidden' }}>
                  {[['assetFinance', 'Asset Finance'], ['progress', 'Progress Facility'], ['importLease', 'Import Lease']].map(([kind, label]) => (
                    <div key={kind} onClick={() => addParcel(kind)}
                      style={{ padding: '10px 14px', fontSize: 12, color: '#2A3545', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        }>Parcels drawn under this MAF</PanelTitle>

        {!parcels.length ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '18px 0', textAlign: 'center' }}>No parcels yet — click "+ Add parcel" above to add an Asset Finance parcel, a Progress facility, or an Import Lease parcel.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('type')}>Type{sortArrow('type')}</th>
                <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggleSort('description')}>Description{sortArrow('description')}</th>
                <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('amount')}>{'Amount / Approved limit'}{sortArrow('amount')}</th>
                <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('balance')}>{'Current balance / Drawn'}{sortArrow('balance')}</th>
                <th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {indexedParcels.map(({ p, i }) => (
                  <tr key={p.id} onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}/loan/${idx}/maf/parcel/${i}`)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = '#fdf0f6'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={td()}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: p.kind === 'progress' ? '#fef3e2' : p.kind === 'importLease' ? '#e6f7f1' : '#eef1f5', color: p.kind === 'progress' ? '#b7770d' : p.kind === 'importLease' ? '#0f7a57' : NAVY }}>
                        {parcelKindLabel(p)}
                      </span>
                    </td>
                    <td style={td({ color: PINK, fontWeight: 600 })}>{parcelLabel(p)}</td>
                    <td style={td({ textAlign: 'right' })}>{fmt(parcelOriginalValue(p))}</td>
                    <td style={td({ textAlign: 'right' })}>{fmt(p.kind === 'progress' ? progressDrawn(p) : parcelCurrentValue(p))}</td>
                    <td style={td()}>{p.closed ? 'Closed' : (p.kind === 'progress' ? (p.status || 'Active') : 'Active')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10 }}>Click any parcel to open its full details. Click a column heading to sort — click again to reverse.</div>
      </Panel>

      {showNewOpp && (
        <NewOpportunityModal
          prefillClientName={client.name}
          prefillLender={facility.bank}
          prefillCategory="Asset Finance"
          prefillAmount={headroom > 0 ? Math.round(headroom) : ''}
          prefillDealSuffix="Asset Finance"
          onClose={() => setShowNewOpp(false)}
          onCreated={(newDeal) => navigate(`/crm/deal/${encodeURIComponent(newDeal['Transaction Name'])}`)}
        />
      )}
    </div>
  )
}
