import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcOpp, fmt, totalBal } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { SaveBtn, CancelBtn } from '../components/UI'

const CRITERIA_INFO = {
  'Business owner':           { desc: 'Client operates a business or is self-employed', max: 5 },
  'Investor':                 { desc: 'Client holds investment property or assets', max: 5 },
  'Loans older than 2 years': { desc: 'Existing loans due for review or refinance consideration', max: 0 },
  'Upcoming maturity':        { desc: 'Fixed rate term expiring within 12 months', max: 5 },
  'Upcoming IO term expiry':  { desc: 'Interest only period expiring — potential P&I conversion', max: 5 },
  'Upcoming balloons':        { desc: 'Asset finance balloon payment approaching', max: 5 },
  'Equity >$200k':            { desc: 'Significant equity available for release or reinvestment', max: 5 },
  'Loans not with RION Capital': { desc: 'Client has lending held elsewhere — referral or consolidation opportunity', max: 5 },
}

export default function OpportunityScore({ clients, updateClient }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const [draft, setDraft] = useState(null)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  if (!client) return <div style={{padding:24}}>Client not found.</div>

  const { criteria } = calcOpp(client)
  const manualOpp = client.manualOpp || {}
  const workingOpp = draft || manualOpp
  const oppCriteria = criteria.map(c => ({
    ...c,
    score: workingOpp[c.label] !== undefined ? workingOpp[c.label] : (c.met ? c.score : 0),
  }))
  const total = oppCriteria.reduce((s,o) => s + o.score, 0)
  const isPriority = total >= 25
  const bal = totalBal(client)

  function handleChange(label, val) {
    setDraft(d => ({ ...(d || manualOpp), [label]: val }))
    setSaved(false)
  }

  function handleSave() {
    const savedOpp = draft || manualOpp
    const savedScore = criteria.map(c => ({
      score: savedOpp[c.label] !== undefined ? savedOpp[c.label] : (c.met ? c.score : 0)
    })).reduce((s, o) => s + o.score, 0)
    updateClient(client.name, c => ({ ...c, manualOpp: savedOpp, oppNotes: notes || c.oppNotes, score: savedScore }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const scoreColor = total >= 25 ? '#EB99C2' : total >= 15 ? '#e8a020' : '#2A3D54'

  return (
    <div style={{ padding:'16px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--text-secondary)', marginBottom:16 }}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to {client.name}
      </button>

      {/* Header */}
      <div style={{ background:'#3D5570', borderRadius:10, padding:'16px 20px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:500, color:'#fff', marginBottom:3 }}>{client.name} — Opportunity Score</div>
            <div style={{ fontSize:11, color:'var(--sbl)' }}>{client.stream} · #{client.connNo} · {fmt(bal)} total exposure</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:36, fontWeight:500, color: isPriority ? '#EB99C2' : '#fff' }}>{total}</div>
            <div style={{ fontSize:10, color:'var(--sbl)' }}>/ 40</div>
            {isPriority && <div style={{ background:'var(--pk)', color:'#fff', padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:500, marginTop:4 }}>★ Priority client</div>}
          </div>
        </div>
        {/* Score bar */}
        <div style={{ marginTop:12, height:6, background:'rgba(255,255,255,0.15)', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(total/40)*100}%`, background: isPriority ? '#EB99C2' : '#BBC6DA', borderRadius:3, transition:'width 0.3s ease' }}/>
        </div>
      </div>

      {/* Scoring criteria */}
      <div style={{ background:'var(--surface)', borderRadius:10, border:'0.5px solid var(--border)', padding:16, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Score each criterion</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {oppCriteria.map((o, i) => {
            const info = CRITERIA_INFO[o.label] || {}
            const current = workingOpp[o.label] !== undefined ? workingOpp[o.label] : (o.met ? o.score : 0)
            const isAuto = o.met && workingOpp[o.label] === undefined
            return (
              <div key={i} style={{ background: current > 0 ? '#fdf0f6' : 'var(--bg)', borderRadius:8, padding:'10px 14px', border: current > 0 ? '0.5px solid rgba(218,64,141,0.2)' : '0.5px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'var(--text-primary)' }}>{o.label}</div>
                  {isAuto && <span style={{ fontSize:9, background:'#eef1f5', color:'#2A3D54', padding:'1px 6px', borderRadius:20 }}>Auto</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:8 }}>{info.desc}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {info.max > 0 ? (
                    <>
                      <button onClick={() => handleChange(o.label, 0)}
                        style={{ padding:'4px 14px', borderRadius:6, border: current===0?'1.5px solid #2A3D54':'0.5px solid var(--border)', background: current===0?'#2A3D54':'transparent', color: current===0?'#fff':'var(--text-secondary)', cursor:'pointer', fontSize:11, fontWeight:500 }}>
                        0
                      </button>
                      <button onClick={() => handleChange(o.label, 5)}
                        style={{ padding:'4px 14px', borderRadius:6, border: current===5?'1.5px solid var(--pk)':'0.5px solid var(--border)', background: current===5?'var(--pk)':'transparent', color: current===5?'#fff':'var(--text-secondary)', cursor:'pointer', fontSize:11, fontWeight:500 }}>
                        5
                      </button>
                      <span style={{ fontSize:11, color: current>0?'var(--pk)':'var(--text-tertiary)', fontWeight:500 }}>
                        {current > 0 ? `+${current} points` : 'Not scored'}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>Informational only</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Meeting notes */}
      <div style={{ background:'var(--surface)', borderRadius:10, border:'0.5px solid var(--border)', padding:16, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Meeting notes / opportunity summary</div>
        <textarea value={notes || client.oppNotes || ''} onChange={e => { setNotes(e.target.value); setSaved(false) }}
          placeholder="Add notes about this client's opportunities — talking points, products to discuss, follow-up actions..."
          style={{ width:'100%', minHeight:100, padding:10, borderRadius:8, border:'0.5px solid var(--border)', background:'var(--bg)', color:'var(--text-primary)', fontSize:12, lineHeight:1.6, resize:'vertical' }}/>
      </div>

      {/* Summary + Save */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)', borderRadius:10, border:'0.5px solid var(--border)', padding:'14px 16px' }}>
        <div style={{ display:'flex', gap:20 }}>
          {oppCriteria.filter(o=>o.score>0).map((o,i) => (
            <div key={i} style={{ fontSize:11 }}>
              <span style={{ color:'var(--text-secondary)' }}>{o.label}: </span>
              <span style={{ color:'var(--pk)', fontWeight:500 }}>+{o.score}</span>
            </div>
          ))}
          {oppCriteria.filter(o=>o.score>0).length === 0 && <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>No criteria scored yet</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {saved && <span style={{ fontSize:11, color:'#27ae60', fontWeight:500 }}>✓ Saved</span>}
          <button onClick={handleSave}
            style={{ padding:'8px 20px', borderRadius:8, background:'var(--pk)', border:'none', color:'#fff', fontWeight:500, fontSize:13, cursor:'pointer' }}>
            Save score
          </button>
        </div>
      </div>
    </div>
  )
}
