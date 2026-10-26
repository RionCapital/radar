import React, { useState } from 'react'

// ─── Who owns this row ───────────────────────────────────────────────────────
// Every register that holds an asset, a debt or an expense needs the same
// answer: which entities own it, and in what proportion. A single
// "Shared Equally / 100% Name" dropdown couldn't say "70% John, 30% the
// trust", which is most of what a commercial file actually looks like.
//
// Stored as `owners: [{ name, pct }]`. A row saved before this existed still
// reads correctly — see ownersOf() — so nothing needs re-keying.

const inp = { border: '1px solid #e8eaed', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box' }
const NAVY = '#3D4F6B'
const AMBER = '#92600A'

// Reads a row's owners whatever shape it was saved in.
export function ownersOf(row, entityNames, individualNames) {
  if (Array.isArray(row?.owners) && row.owners.length) return row.owners
  const legacy = row?.ownership
  if (legacy && legacy !== 'Shared Equally') {
    const match = (entityNames || []).find(e => legacy === e || legacy === `100% ${e}`)
    if (match) return [{ name: match, pct: 100 }]
  }
  // "Shared Equally" and anything unrecognised fall back to an even split
  // between the people — which is what it has always meant.
  const split = (individualNames && individualNames.length) ? individualNames : (entityNames || [])
  if (!split.length) return []
  const pct = Math.round((100 / split.length) * 100) / 100
  return split.map(nm => ({ name: nm, pct }))
}

export function ownersSummary(row, entityNames, individualNames) {
  const owners = ownersOf(row, entityNames, individualNames)
  if (!owners.length) return '—'
  if (owners.length === 1) return owners[0].name
  return owners.map(o => `${o.name.split(' ')[0]} ${Math.round(Number(o.pct) || 0)}%`).join(' · ')
}

export function ownersTotal(owners) {
  return (owners || []).reduce((s, o) => s + (Number(o.pct) || 0), 0)
}

export default function OwnerSplit({ row, entities, individualNames, onChange, compact }) {
  const entityNames = (entities || []).map(e => e.name)
  const owners = ownersOf(row, entityNames, individualNames)
  const [open, setOpen] = useState(false)
  const total = ownersTotal(owners)
  const off = Math.abs(total - 100) > 0.5 && owners.length > 0

  const commit = next => onChange({ owners: next, ownership: undefined })
  const upd = (i, k, v) => commit(owners.map((o, idx) => idx === i ? { ...o, [k]: v } : o))
  const add = () => {
    const unused = entityNames.find(nm => !owners.some(o => o.name === nm)) || entityNames[0] || ''
    const next = [...owners, { name: unused, pct: '' }]
    commit(rebalance(next))
  }
  const rm = i => commit(owners.filter((_, idx) => idx !== i))

  // Splitting evenly is the common case, so it's one click rather than
  // typing 33.33 three times.
  function rebalance(list) {
    const n = list.length
    if (!n) return list
    const each = Math.floor((100 / n) * 100) / 100
    return list.map((o, i) => ({ ...o, pct: i === n - 1 ? Math.round((100 - each * (n - 1)) * 100) / 100 : each }))
  }

  if (!entityNames.length) {
    return <span style={{ fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic' }}>Add contacts first</span>
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Set who owns this and in what share"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: 11, color: off ? AMBER : NAVY, fontWeight: 500, textDecoration: 'underline dotted', maxWidth: compact ? 150 : 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ownersSummary(row, entityNames, individualNames)}{off ? ` (${Math.round(total)}%)` : ''}
      </button>
    )
  }

  return (
    <div style={{ minWidth: 220, border: `1px solid ${NAVY}33`, borderRadius: 6, padding: 6, background: '#fbfcfe' }}>
      {owners.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <select value={o.name || ''} onChange={e => upd(i, 'name', e.target.value)} style={{ ...inp, flex: 1, minWidth: 0 }}>
            <option value="">— Select —</option>
            {entityNames.map(nm => <option key={nm} value={nm}>{nm}</option>)}
          </select>
          <input type="number" value={o.pct ?? ''} onChange={e => upd(i, 'pct', e.target.value === '' ? '' : Number(e.target.value))}
            style={{ ...inp, width: 52, textAlign: 'right' }} />
          <span style={{ fontSize: 10, color: '#7A8090' }}>%</span>
          <button onClick={() => rm(i)} style={{ fontSize: 10, border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 2px' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
        <button onClick={add} style={{ fontSize: 10, padding: '2px 7px', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, borderRadius: 4, cursor: 'pointer' }}>+ Owner</button>
        {owners.length > 1 && <button onClick={() => commit(rebalance(owners))} style={{ fontSize: 10, padding: '2px 7px', border: '1px solid #e8eaed', background: '#fff', color: '#7A8090', borderRadius: 4, cursor: 'pointer' }}>Split evenly</button>}
        <span style={{ fontSize: 10, color: off ? AMBER : '#7A8090', fontWeight: off ? 700 : 400 }}>{Math.round(total * 100) / 100}%</span>
        <button onClick={() => setOpen(false)} style={{ fontSize: 10, padding: '2px 7px', border: 'none', background: NAVY, color: '#fff', borderRadius: 4, cursor: 'pointer', marginLeft: 'auto' }}>Done</button>
      </div>
    </div>
  )
}
