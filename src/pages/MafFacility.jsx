import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle, FieldGroup, DateInput, ActionBtn } from '../components/UI'
import {
  blankAssetFinanceParcel, blankProgressParcel, parcelLabel, parcelCurrentValue,
  parcelOriginalValue, facilityUtilized, facilityHeadroom, progressDrawn,
} from '../lib/mafFacilities'
import NewOpportunityModal from '../components/NewOpportunityModal'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'

export default function MafFacility({ clients, updateClient }) {
  const { name, facilityIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const idx = parseInt(facilityIdx)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showNewOpp, setShowNewOpp] = useState(false)

  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>
  const facility = (client.mafFacilities || [])[idx]
  if (!facility) return <div style={{ padding: 24 }}>MAF facility not found.</div>

  const f = editing ? draft : facility
  const utilized = facilityUtilized(facility)
  const headroom = facilityHeadroom(facility)

  function startEdit() { setEditing(true); setDraft({ ...facility }) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() {
    updateClient(client.name, c => {
      const mafFacilities = [...(c.mafFacilities || [])]
      mafFacilities[idx] = draft
      return { ...c, mafFacilities }
    })
    setEditing(false); setDraft(null)
  }
  function set(field, val) { setDraft(d => ({ ...d, [field]: val })) }

  function deleteFacility() {
    if (!window.confirm(`Delete the ${facility.lender || 'MAF'} facility and all ${facility.parcels.length} parcel(s) under it? This can't be undone.`)) return
    updateClient(client.name, c => ({ ...c, mafFacilities: (c.mafFacilities || []).filter((_, i) => i !== idx) }))
    navigate(`/radar/clients/${encodeURIComponent(client.name)}`)
  }

  function addParcel(kind) {
    const parcel = kind === 'progress' ? blankProgressParcel() : blankAssetFinanceParcel()
    // updateClient's setState updater runs asynchronously (React batches it),
    // so the new parcel's index can't be read back out of it reliably — it's
    // simply the current parcel count, computed here from the already-known
    // facility before the update is queued.
    const newIdx = (facility.parcels || []).length
    updateClient(client.name, c => {
      const mafFacilities = [...(c.mafFacilities || [])]
      const fac = { ...mafFacilities[idx] }
      fac.parcels = [...(fac.parcels || []), parcel]
      mafFacilities[idx] = fac
      return { ...c, mafFacilities }
    })
    navigate(`/radar/clients/${encodeURIComponent(client.name)}/maf/${idx}/parcel/${newIdx}`)
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #e8eaed', borderRadius: 5, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit' }
  const th = { padding: '6px 8px', background: '#3D5570', color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td = (extra = {}) => ({ padding: '7px 8px', borderBottom: '0.5px solid var(--border-light)', fontSize: 11.5, color: 'var(--text-primary)', verticalAlign: 'middle', ...extra })

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Montserrat, sans-serif' }}>
      <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{ background: 'none', border: 'none', color: PINK, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        ← Back to {client.name}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#2A3545', margin: 0 }}>{facility.lender || 'MAF Facility'} — Master Asset Finance</h1>
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
            {editing ? <input style={inputStyle} value={f.lender || ''} onChange={e => set('lender', e.target.value)} /> : <div>{facility.lender || '—'}</div>}
          </FieldGroup>
          <FieldGroup label="MAF Limit">
            {editing ? <input style={inputStyle} type="number" value={f.limit} onChange={e => set('limit', e.target.value)} /> : <div style={{ fontWeight: 700 }}>{fmt(Number(facility.limit) || 0)}</div>}
          </FieldGroup>
          <FieldGroup label="Start date">
            {editing ? <DateInput value={f.startDate} onChange={v => set('startDate', v)} style={inputStyle} /> : <div>{facility.startDate ? fmtDate(facility.startDate) : '—'}</div>}
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
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>{fmt(Number(facility.limit) || 0)}</div>
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

      <Panel>
        <PanelTitle action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => addParcel('assetFinance')} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${PINK}`, background: 'transparent', color: PINK, cursor: 'pointer', fontWeight: 600 }}>+ Add Asset Finance parcel</button>
            <button onClick={() => addParcel('progress')} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${PINK}`, background: 'transparent', color: PINK, cursor: 'pointer', fontWeight: 600 }}>+ Add Progress facility</button>
          </div>
        }>Parcels drawn under this MAF</PanelTitle>

        {!facility.parcels.length ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '18px 0', textAlign: 'center' }}>No parcels yet — add an Asset Finance parcel or a Progress facility above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Type</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>{'Amount / Approved limit'}</th>
                <th style={{ ...th, textAlign: 'right' }}>{'Current balance / Drawn'}</th>
                <th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {facility.parcels.map((p, i) => (
                  <tr key={p.id} onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}/maf/${idx}/parcel/${i}`)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = '#fdf0f6'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={td()}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: p.kind === 'progress' ? '#fef3e2' : '#eef1f5', color: p.kind === 'progress' ? '#b7770d' : NAVY }}>
                        {p.kind === 'progress' ? 'Progress' : 'Asset Finance'}
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
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10 }}>Click any parcel to open its full details.</div>
      </Panel>

      {showNewOpp && (
        <NewOpportunityModal
          prefillClientName={client.name}
          prefillLender={facility.lender}
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
