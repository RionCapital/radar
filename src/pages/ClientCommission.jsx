import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDirectIncomeLocal, syncDirectIncomeFromSupabase, directIncomeForClient, entryMatchesLoan, entryCommissionSplit } from '../lib/directIncome'

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

  // Direct Income entries linked to this client (Direct Income page → Client /
  // Loan fields, or created by a loan's Import History). Read straight from
  // the Direct Income records and merged into the tables below — never
  // copied into loan.commissionHistory — so each dollar exists once.
  const [directEntries, setDirectEntries] = useState(() => loadDirectIncomeLocal())
  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => { if (cloud) setDirectEntries(cloud.entries) })
  }, [])
  const clientDirect = directIncomeForClient(directEntries, client.name)

  // Build monthly commission data from all loans (statement-fed) …
  const monthMap = {}
  const ensureMonth = m => { if (!monthMap[m]) monthMap[m] = { month: m, trail: 0, upfront: 0, totalPaid: 0, gst: 0, direct: 0 }; return monthMap[m] }
  loans.forEach(loan => {
    ;(loan.commissionHistory || []).forEach(h => {
      const row = ensureMonth(h.month)
      row.trail     += h.trailComm   || 0
      row.upfront   += h.upfrontComm || 0
      row.totalPaid += h.totalPaid   || 0
      row.gst       += h.gst         || 0
    })
  })
  // … plus the linked Direct Income for each month.
  clientDirect.forEach(e => {
    if (!e.month) return
    const sp = entryCommissionSplit(e)
    const row = ensureMonth(e.month)
    row.trail += sp.trail; row.upfront += sp.upfront; row.gst += sp.gst; row.totalPaid += sp.total; row.direct += sp.trail + sp.upfront
  })
  const months = Object.values(monthMap).sort((a,b) => b.month.localeCompare(a.month))
  const hasDirect = clientDirect.length > 0

  const totalTrail   = months.reduce((s,m) => s + m.trail,    0)
  const totalUpfront = months.reduce((s,m) => s + m.upfront,  0)
  const totalPaid    = months.reduce((s,m) => s + m.totalPaid, 0)
  const totalGst     = months.reduce((s,m) => s + m.gst,       0)
  const totalDirect  = months.reduce((s,m) => s + m.direct,    0)

  const loanTotals = loans.map(l => {
    const hist = l.commissionHistory || []
    const linked = clientDirect.filter(e => entryMatchesLoan(e, l))
    const dsum = linked.reduce((a, e) => { const sp = entryCommissionSplit(e); a.trail += sp.trail; a.upfront += sp.upfront; a.paid += sp.total; return a }, { trail: 0, upfront: 0, paid: 0 })
    const trail   = hist.reduce((s,h) => s + (h.trailComm   || 0), 0) + dsum.trail
    const upfront = hist.reduce((s,h) => s + (h.upfrontComm || 0), 0) + dsum.upfront
    const paid    = hist.reduce((s,h) => s + (h.totalPaid   || 0), 0) + dsum.paid
    const monthsSeen = new Set([...hist.map(h => h.month), ...linked.map(e => e.month)])
    return { name: l.lname || l.acc || 'Loan', acc: l.acc, bank: l.bank, trail, upfront, paid, months: monthsSeen.size, direct: dsum.paid > 0, statement: hist.length > 0 }
  }).filter(l => l.paid > 0).sort((a,b) => b.paid - a.paid)
  // Direct Income linked to this client but not to any specific loan.
  const unallocated = clientDirect.filter(e => !loans.some(l => entryMatchesLoan(e, l)))
  if (unallocated.length) {
    const a = unallocated.reduce((acc, e) => { const sp = entryCommissionSplit(e); acc.trail += sp.trail; acc.upfront += sp.upfront; acc.paid += sp.total; return acc }, { trail: 0, upfront: 0, paid: 0 })
    loanTotals.push({ name: 'Direct — not allocated to a loan', acc: '', bank: [...new Set(unallocated.map(e => e.supplierName).filter(Boolean))].join(', '), trail: a.trail, upfront: a.upfront, paid: a.paid, months: new Set(unallocated.map(e => e.month)).size, direct: true, statement: false })
  }
  const directTag = <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, color: '#7C8CA0', background: '#eef1f5', padding: '1px 6px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle' }}>Direct</span>

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
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>All time · {months.length} months{s.label === 'Total paid' && totalDirect > 0 ? ` · incl. ${fmtc(totalDirect)} direct (excl. GST)` : ''}</div>
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
              No commission data yet — import your commission statements, or link Direct Income entries to this client, to populate this section.
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead style={{ background:'#f8fafc' }}>
                <tr>
                  {['Month','Trail (excl. GST)','Upfront (excl. GST)',...(hasDirect?['of which Direct']:[]),'GST','Total Paid'].map((h,i) => (
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
                    {hasDirect && <td style={td({ textAlign:'right', color:'#7C8CA0' })}>{m.direct>0?fmtc(m.direct):'—'}</td>}
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
                  {hasDirect && <td style={{ ...td(), color:'rgba(255,255,255,0.75)', textAlign:'right' }}>{fmtc(totalDirect)}</td>}
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
                    <td style={td({ fontWeight:500, color:NAVY })}>{l.name}{l.direct && directTag}</td>
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
