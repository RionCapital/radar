import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { totalBal, fmt } from '../lib/data'
import { Panel, ClientRow } from '../components/UI'
import AddClient from './AddClient'

export default function ClientList({ clients, onAddClient }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [stream, setStream] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  // Default A-Z, filtered by search and stream
  let list = [...clients].sort((a,b) => a.name.localeCompare(b.name))
  if (stream !== 'all') list = list.filter(c => c.stream === stream)
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      String(c.connNo).includes(q)
    )
  }

  const sel = { fontSize:11, padding:'5px 9px', borderRadius:6, border:'0.5px solid var(--border)', background:'var(--bg)', color:'var(--text-primary)', cursor:'pointer' }

  return (
    <div style={{ padding:'18px 24px' }}>
      <Panel>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {/* Search */}
            <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ position:'absolute', left:8, color:'var(--text-tertiary)', pointerEvents:'none' }}>
                <circle cx="5" cy="5" r="3.5" stroke="#9aa3ad" strokeWidth="1.2"/>
                <path d="M8 8l2 2" stroke="#9aa3ad" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input
                value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search name or #..."
                style={{...sel, paddingLeft:24, width:160}}
              />
              {search && <button onClick={()=>setSearch('')} style={{position:'absolute',right:8,background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:14,lineHeight:1}}>×</button>}
            </div>
            <select style={sel} value={stream} onChange={e=>setStream(e.target.value)}>
              <option value="all">All streams</option>
              <option value="Private Wealth">Private Wealth</option>
              <option value="Commercial">Commercial</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ fontSize:10, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              All connections <span style={{ fontWeight:400 }}>({list.length})</span>
            </div>
            <button onClick={()=>setShowAdd(true)} style={{...sel, background:'var(--pk)', color:'#fff', border:'none', fontWeight:500}}>+ Add client</button>
          </div>
        </div>

        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 100px 80px 80px 60px', gap:8, padding:'5px 6px', borderBottom:'0.5px solid var(--border)', marginBottom:2 }}>
          {['Conn #','Name','Stream','Accounts','Portfolio','Days'].map(h=>(
            <div key={h} style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</div>
          ))}
        </div>

        {list.length > 0 ? list.map(c => {
          const bal = c.loans.filter(l=>!l.closed).reduce((s,l)=>s+(l.balance||0),0)
          const isComm = c.stream==='Commercial'
          return (
            <div key={c.name} onClick={()=>navigate(`/radar/clients/${encodeURIComponent(c.name)}`)}
              style={{display:'grid',gridTemplateColumns:'80px 1fr 100px 80px 80px 60px',gap:8,padding:'8px 6px',borderBottom:'0.5px solid var(--border-light)',cursor:'pointer',borderRadius:6,alignItems:'center'}}
              onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
              <div style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'DM Mono,monospace'}}>#{c.connNo}</div>
              <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:isComm?'#eef1f5':'#fdf0f6',color:isComm?'#2A3D54':'var(--pk)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:500,flexShrink:0}}>
                  {c.name.split(/[\s-]+/).map(w=>w[0]||'').join('').toUpperCase().slice(0,2)}
                </div>
                <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {c.name}
                  {c._demo && <span style={{marginLeft:6,fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#854F0B',color:'#fff',letterSpacing:'0.05em'}}>DEMO</span>}
                </div>
              </div>
              <div><span style={{padding:'2px 7px',borderRadius:20,fontSize:9,fontWeight:500,background:isComm?'#eef1f5':'#fdf0f6',color:isComm?'#2A3D54':'#EB99C2'}}>{c.stream==='Private Wealth'?'PW':'Comm'}</span></div>
              <div style={{fontSize:11,color:'var(--text-secondary)'}}>{c.loans.length} loan{c.loans.length!==1?'s':''}</div>
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{bal>0?fmt(bal):'—'}</div>
              <div>{c.days>365?<span style={{padding:'2px 7px',borderRadius:20,fontSize:10,background:'#fde8e8',color:'#c0392b',fontWeight:500}}>{c.days}d</span>:c.days>180?<span style={{padding:'2px 7px',borderRadius:20,fontSize:10,background:'#fef3e2',color:'#b7770d',fontWeight:500}}>{c.days}d</span>:<span style={{padding:'2px 7px',borderRadius:20,fontSize:10,background:'#e8f5e9',color:'#2e7d32',fontWeight:500}}>{c.days>0?c.days+'d':'new'}</span>}</div>
            </div>
          )
        }) : (
          <div style={{textAlign:'center',padding:'24px',color:'var(--text-tertiary)',fontSize:12}}>
            {search ? `No clients matching "${search}"` : 'No clients found'}
          </div>
        )}
      </Panel>
      {showAdd && <AddClient clients={clients} onSave={c=>{onAddClient&&onAddClient(c);setShowAdd(false)}} onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
