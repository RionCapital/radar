import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { totalBal } from '../lib/data'
import { Panel, ClientRow } from '../components/UI'
import AddClient from './AddClient'

export default function ClientList({ clients, onAddClient }) {
  const navigate = useNavigate()
  const [stream, setStream] = useState('all')
  const [sort, setSort] = useState('days')
  const [showAdd, setShowAdd] = useState(false)

  let list = [...clients]
  if (stream !== 'all') list = list.filter(c => c.stream === stream)
  if (sort === 'days') list.sort((a,b) => b.days - a.days)
  else if (sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name))
  else if (sort === 'bal') list.sort((a,b) => totalBal(b) - totalBal(a))
  else list.sort((a,b) => b.score - a.score)

  const sel = { fontSize:11, padding:'5px 9px', borderRadius:6, border:'0.5px solid var(--border)', background:'var(--bg)', color:'var(--text-primary)', cursor:'pointer' }

  return (
    <div style={{ padding:'18px 24px' }}>
      <Panel>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:10, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            All connections <span style={{ fontWeight:400 }}>({list.length})</span>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <select style={sel} value={stream} onChange={e => setStream(e.target.value)}>
              <option value="all">All streams</option>
              <option value="Private Wealth">Private Wealth</option>
              <option value="Commercial">Commercial</option>
            </select>
            <select style={sel} value={sort} onChange={e => setSort(e.target.value)}>
              <option value="days">Sort: Days overdue</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="bal">Sort: Portfolio size</option>
              <option value="score">Sort: Opp. score</option>
            </select>
            <button onClick={() => setShowAdd(true)} style={{ ...sel, background:'var(--pk)', color:'#fff', border:'none', fontWeight:500 }}>+ Add client</button>
          </div>
        </div>
        {list.map(c => (
          <ClientRow key={c.name} client={c} onClick={() => navigate(`/clients/${encodeURIComponent(c.name)}`)} />
        ))}
      </Panel>
      {showAdd && <AddClient clients={clients} onSave={c => { onAddClient&&onAddClient(c); setShowAdd(false) }} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
