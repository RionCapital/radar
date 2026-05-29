import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const fmtc = v => v != null ? '$' + Number(v).toFixed(2) : '—'
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(m) {
  if (!m) return '—'
  const [y, mo] = m.split('-')
  return `${MO[parseInt(mo)-1]}-${y.slice(2)}`
}

export default function ClientCommission({ clients }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients?.find(c => c.name === decodeURIComponent(name)) || {}
  const loans = client.loans || []
  const [view, setView] = useState('summary')

  // Build monthly commission data from all loans
  const monthMap = {}
  loans.forEach(loan => {
    ;(loan.commissionHistory || []).forEach(h => {
      if (!monthMap[h.month]) monthMap[h.month] = { month: h.month, trail: 0, upfront: 0, totalPaid: 0, gst: 0 }
      monthMap[h.month].trail     += h.trailComm   || 0
      monthMap[h.month].upfront   += h.upfrontComm || 0
      monthMap[h.month].totalPaid += h.totalPaid   || 0
      monthMap[h.month].gst       += h.gst         || 0
    })
  })
  const months = Object.values(monthMap).sort((a,b) => b.month.localeCompare(a.month))

  const totalTrail   = months.reduce((s,m) => s + m.trail,    0)
  const totalUpfront = months.reduce((s,m) => s + m.upfront,  0)
  const totalPaid    = months.reduce((s,m) => s + m.totalPaid, 0)
  const totalGst     = months.reduce((s,m) => s + m.gst,       0)

  const loanTotals = loans.map(l => {
    const hist = l.commissionHistory || []
    const trail   = hist.reduce((s,h) => s + (h.trailComm   || 0), 0)
    const upfront = hist.reduce((s,h) => s + (h.upfrontComm || 0), 0)
    const paid    = hist.reduce((s,h) => s + (h.totalPaid   || 0), 0)
    return { name: l.lname || l.acc || 'Loan', acc: l.acc, bank: l.bank, trail, upfront, paid, months: hist.length }
  }).filter(l => l.paid > 0).sort((a,b) => b.paid - a.paid)

  const th = { padding:'7px 10px', fontSize:10, color:'#64748b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #e2e8f0' }
  const td = (extra={}) => ({ padding:'8px 10px', fontSize:11, borderBottom:'0.5px solid #f1f5f9', ...extra })

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc' }}>
      <div style={{ height:48, background:NAVY, display:'flex', alignItems:'center', padding:'0 20px', gap:16 }}>
        <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
          style={{ fontSize:11, color:'rgba(255,255,255,0.7)', background:'none', border:'none', cursor:'pointer' }}>
          ← {client.name}
        </button>
        <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Commission History</div>
        <div style={{ fontSize:11, color:PINK }}>$</div>
      </div>

      <div style={{ padding:'20px 24px', maxWidth:1000, margin:'0 auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total trail',   val:fmtc(totalTrail),   color:'#22c55e', bg:'#f0fdf4' },
            { label:'Total upfront', val:fmtc(totalUpfront), color:NAVY,      bg:'#eff6ff' },
            { label:'Total GST',     val:fmtc(totalGst),     color:'#64748b', bg:'#f8fafc' },
            { label:'Total paid',    val:fmtc(totalPaid),    color:PINK,      bg:'#fdf0f7' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:8, padding:'12px 16px', border:'0.5px solid #e2e8f0' }}>
              <div style={{ fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>All time · {months.length} months</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['summary','Monthly Summary'],['byLoan','By Loan']].map(([id,label]) => (
            <button key={id} onClick={() => setView(id)}
              style={{ fontSize:11, padding:'5px 14px', borderRadius:6, border:`1px solid ${view===id?NAVY:'#e2e8f0'}`,
                background:view===id?NAVY:'#fff', color:view===id?'#fff':'#64748b', cursor:'pointer', fontWeight:view===id?600:400 }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e2e8f0', overflow:'hidden' }}>
          {view === 'summary' && (months.length === 0 ? (
            <div style={{ padding:'40px 20px', textAlign:'center', color:'#94a3b8', fontSize:12, fontStyle:'italic' }}>
              No commission data yet — import your commission statements to populate this section.
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead style={{ background:'#f8fafc' }}>
                <tr>
                  {['Month','Trail (excl. GST)','Upfront (excl. GST)','GST','Total Paid'].map((h,i) => (
                    <th key={h} style={{ ...th, textAlign:i>0?'right':'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m,i) => (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={td({ fontWeight:500, color:NAVY })}>{fmtMonth(m.month)}</td>
                    <td style={td({ textAlign:'right', color:'#22c55e' })}>{fmtc(m.trail)}</td>
                    <td style={td({ textAlign:'right', color:NAVY })}>{m.upfront>0?fmtc(m.upfront):'—'}</td>
                    <td style={td({ textAlign:'right', color:'#64748b' })}>{fmtc(m.gst)}</td>
                    <td style={td({ textAlign:'right', fontWeight:600, color:PINK })}>{fmtc(m.totalPaid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background:NAVY }}>
                <tr>
                  <td style={{ ...td(), color:'#fff', fontWeight:700 }}>Total</td>
                  <td style={{ ...td(), color:'#86efac', fontWeight:600, textAlign:'right' }}>{fmtc(totalTrail)}</td>
                  <td style={{ ...td(), color:'#bfdbfe', fontWeight:600, textAlign:'right' }}>{fmtc(totalUpfront)}</td>
                  <td style={{ ...td(), color:'rgba(255,255,255,0.6)', textAlign:'right' }}>{fmtc(totalGst)}</td>
                  <td style={{ ...td(), color:PINK, fontWeight:700, textAlign:'right' }}>{fmtc(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          ))}

          {view === 'byLoan' && (loanTotals.length === 0 ? (
            <div style={{ padding:'40px 20px', textAlign:'center', color:'#94a3b8', fontSize:12, fontStyle:'italic' }}>No commission data yet.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead style={{ background:'#f8fafc' }}>
                <tr>
                  {['Loan','Lender','Months','Trail','Upfront','Total Paid'].map((h,i) => (
                    <th key={h} style={{ ...th, textAlign:i>1?'right':'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loanTotals.map((l,i) => (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={td({ fontWeight:500, color:NAVY })}>{l.name}</td>
                    <td style={td({ color:'#64748b' })}>{l.bank||'—'}</td>
                    <td style={td({ textAlign:'right', color:'#64748b' })}>{l.months}</td>
                    <td style={td({ textAlign:'right', color:'#22c55e' })}>{fmtc(l.trail)}</td>
                    <td style={td({ textAlign:'right', color:NAVY })}>{l.upfront>0?fmtc(l.upfront):'—'}</td>
                    <td style={td({ textAlign:'right', fontWeight:600, color:PINK })}>{fmtc(l.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  )
}
