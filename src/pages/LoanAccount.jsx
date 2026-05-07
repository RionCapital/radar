import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate, dateCellStyle, expiryBadge, calcRepayment, effectiveRpmt, buildBalanceHistory } from '../lib/dateUtils'
import { fmt as fmtNum } from '../lib/data'
import { Panel, PanelTitle, EditBtn, SaveBtn, CancelBtn, FieldGroup, Pill } from '../components/UI'

export default function LoanAccount({ clients, updateClient }) {
  const { name, loanIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const idx = parseInt(loanIdx)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [propGrowthRate, setPropGrowthRate] = useState(5) // % per year for property growth line

  if (!client) return <div style={{padding:24}}>Client not found.</div>
  const loan = client.loans[idx]
  if (!loan) return <div style={{padding:24}}>Loan not found.</div>

  const eRpmt = effectiveRpmt(loan)
  const estRepayment = calcRepayment(loan)
  // Use real commission statement history if available, else calculate
  const realHistory = (loan.balanceHistory || []).map((h, i, arr) => {
    const prevBal = i > 0 ? arr[i-1].balance : loan.amount
    const estInterest = loan.rate ? Math.round(prevBal * loan.rate / 100 / 12) : 0
    return { date: h.month, balance: h.balance, interest: estInterest, repayment: 0, isPast: true }
  })
  const calcHistory = buildBalanceHistory(loan).filter(h => !h.isPast === true).map(h => ({...h, isPast: false}))
  // Merge: real history + projected from last known balance
  const history = realHistory.length > 0
    ? [...realHistory, ...buildBalanceHistory({...loan, amount: realHistory[realHistory.length-1].balance}).filter(h => !h.isPast).slice(1, 25).map(h => ({...h, isPast: false}))]
    : buildBalanceHistory(loan)
  const security = (client.securities||[]).find(s=>String(s.num)===String(loan.security))

  function startEdit() { setEditing(true); setDraft({...loan}) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() {
    updateClient(client.name, c => { const loans=[...c.loans]; loans[idx]=draft; return {...c,loans} })
    setEditing(false); setDraft(null)
  }
  const set = (field, val) => setDraft(d => ({...d, [field]: val}))
  const inp = {width:'100%'}
  const l = editing ? draft : loan

  const th = {padding:'6px 8px',background:'#2A3D54',color:'#fff',fontSize:10,fontWeight:500,textAlign:'left',whiteSpace:'nowrap'}
  const td = (extra={}) => ({padding:'6px 8px',borderBottom:'0.5px solid var(--border-light)',fontSize:11,color:'var(--text-primary)',verticalAlign:'middle',...extra})

  // Build SVG balance + property graph
  const graphData = history.filter((_,i) => i % 3 === 0) // sample every 3 months for performance
  const maxBal = loan.amount || 1
  const gW = 520, gH = 140
  const pad = { l:50, r:20, t:10, b:30 }
  const plotW = gW - pad.l - pad.r
  const plotH = gH - pad.t - pad.b

  const toX = (i) => pad.l + (i / (graphData.length-1)) * plotW
  const toY = (val) => pad.t + plotH - (val / maxBal) * plotH

  // Property value line — starting from security est value or 0
  const propStart = security?.estVal || 0
  const monthlyGrowth = propGrowthRate / 100 / 12

  const balPath = graphData.map((d,i) => `${i===0?'M':'L'}${toX(i)},${toY(d.balance)}`).join(' ')
  const propPath = propStart ? graphData.map((d,i) => {
    const months = i * 3
    const propVal = Math.min(propStart * Math.pow(1 + monthlyGrowth, months), maxBal * 1.5)
    return `${i===0?'M':'L'}${toX(i)},${toY(propVal)}`
  }).join(' ') : null

  // Find today divider
  const todayIdx = graphData.findIndex(d => !d.isPast)
  const todayX = todayIdx > 0 ? toX(todayIdx) : null

  // Year labels
  const yearLabels = []
  graphData.forEach((d,i) => { if (d.date.startsWith('01/')) yearLabels.push({x:toX(i), label:d.date.slice(3)}) })

  // Key date flags
  const keyDates = []
  if (loan.fixed) {
    const fixedDate = new Date(loan.fixed)
    const monthsFromSettlement = Math.floor((fixedDate - new Date(loan.settled)) / (30.44*86400000))
    const sampleIdx = Math.floor(monthsFromSettlement/3)
    if (sampleIdx >= 0 && sampleIdx < graphData.length) {
      keyDates.push({x: toX(sampleIdx), label:'Fixed exp.', color:'#e8a020'})
    }
  }
  if (loan.io) {
    const ioDate = new Date(loan.io)
    const monthsFromSettlement = Math.floor((ioDate - new Date(loan.settled)) / (30.44*86400000))
    const sampleIdx = Math.floor(monthsFromSettlement/3)
    if (sampleIdx >= 0 && sampleIdx < graphData.length) {
      keyDates.push({x: toX(sampleIdx), label:'IO exp.', color:'#DA408D'})
    }
  }

  return (
    <div style={{padding:'16px 24px'}}>
      <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-secondary)',marginBottom:14}}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to {client.name}
      </button>

      {/* Header */}
      <div style={{background:'#2A3D54',borderRadius:10,padding:'16px 20px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div>
            <div style={{fontSize:16,fontWeight:500,color:'#fff',marginBottom:4}}>{loan.lname||'Loan account'}</div>
            <div style={{fontSize:11,color:'var(--sbl)',display:'flex',gap:12,flexWrap:'wrap'}}>
              <span style={{color:'#EB99C2',fontWeight:500}}>{loan.lname||'Loan account'}</span>
              <span>{client.name} · #{client.connNo}</span>
              <span style={{fontFamily:'DM Mono,monospace'}}>{loan.acc||'—'}</span>
              <span>{loan.bank||'—'}</span>
              {security && <span style={{color:'#EB99C2'}}>Security #{loan.security}: {security.address}</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:6}}>
            {!editing ? <EditBtn onClick={startEdit}/> : <><SaveBtn onClick={save}/><CancelBtn onClick={cancel}/></>}
          </div>
        </div>
        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          {[
            ['Current balance', fmt(loan.balance), '#fff'],
            ['Original limit', fmt(loan.amount), '#fff'],
            ['Interest rate', loan.rate>0?loan.rate.toFixed(2)+'%':'—', '#fff'],
            ['Rate type', loan.rateType||'Var', loan.rateType==='Fix'?'#EB99C2':'var(--sbl)'],
            ['Repayment type', eRpmt, eRpmt==='P&I*'?'#EB99C2':'var(--sbl)'],
            ['Est. monthly repayment', estRepayment?'$'+estRepayment.toLocaleString()+'/mo':'—', '#27ae60'],
          ].map(([label,val,color])=>(
            <div key={label} style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 12px'}}>
              <div style={{fontSize:10,color:'var(--sbl)',marginBottom:2}}>{label}</div>
              <div style={{fontSize:13,fontWeight:500,color}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two col — particulars + key dates */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <Panel>
          <PanelTitle>Loan particulars</PanelTitle>
          {editing ? (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FieldGroup label="Account no."><input style={inp} value={l.acc||''} onChange={e=>set('acc',e.target.value)}/></FieldGroup>
              <FieldGroup label="Loan name"><input style={inp} value={l.lname||''} onChange={e=>set('lname',e.target.value)}/></FieldGroup>
              <FieldGroup label="Bank"><input style={inp} value={l.bank||''} onChange={e=>set('bank',e.target.value)}/></FieldGroup>
              <FieldGroup label="Security #"><input style={inp} value={l.security||''} onChange={e=>set('security',e.target.value)}/></FieldGroup>
              <FieldGroup label="Original limit ($)"><input style={inp} type="number" value={l.amount||''} onChange={e=>set('amount',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Current balance ($)"><input style={inp} type="number" value={l.balance||''} onChange={e=>set('balance',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Interest rate (%)"><input style={inp} type="number" step="0.01" value={l.rate||''} onChange={e=>set('rate',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Rate type">
                <select style={inp} value={l.rateType||'Var'} onChange={e=>set('rateType',e.target.value)}>
                  <option value="Var">Variable (Var)</option><option value="Fix">Fixed (Fix)</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Repayment type">
                <select style={inp} value={l.rpmt||'P&I'} onChange={e=>set('rpmt',e.target.value)}>
                  <option>P&I</option><option>IO</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Term (years)"><input style={inp} type="number" step="0.5" value={l.term||''} onChange={e=>set('term',+e.target.value)}/></FieldGroup>
              <FieldGroup label="IO period (years)"><input style={inp} type="number" step="0.5" value={l.ioTerm||''} onChange={e=>set('ioTerm',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Settlement date"><input style={inp} value={l.settled||''} onChange={e=>set('settled',e.target.value)}/></FieldGroup>
              <FieldGroup label="Fixed rate expiry"><input style={inp} value={l.fixed||''} placeholder="YYYY-MM-DD" onChange={e=>set('fixed',e.target.value)}/></FieldGroup>
              <FieldGroup label="IO expiry"><input style={inp} value={l.io||''} placeholder="YYYY-MM-DD" onChange={e=>set('io',e.target.value)}/></FieldGroup>
              <FieldGroup label="Balloon / residual"><input style={inp} value={l.balloon||''} onChange={e=>set('balloon',e.target.value)}/></FieldGroup>
              <FieldGroup label="Est. repayment override ($)"><input style={inp} type="number" value={l.estRepayment||''} placeholder="Auto-calculated" onChange={e=>set('estRepayment',e.target.value?+e.target.value:null)}/></FieldGroup>
              <FieldGroup label="Asset / security description"><input style={inp} value={l.assetDesc||''} onChange={e=>set('assetDesc',e.target.value)}/></FieldGroup>
              <FieldGroup label="Loan name"><input style={inp} value={l.lname||''} onChange={e=>set('lname',e.target.value)}/></FieldGroup>
            </div>
          ) : (
            <div>
              {[
                ['Loan name', loan.lname||'—'],
                ['Account no.', loan.acc||'—'],
                ['Loan type', loan.type||'—'],
                ['Bank', loan.bank||'—'],
                ['Security #', loan.security||'—'],
                ['Asset / property', security?.address || loan.assetDesc || '—'],
                ['Original limit', fmt(loan.amount)],
                ['Current balance', fmt(loan.balance)],
                ['Interest rate', loan.rate>0?loan.rate.toFixed(2)+'%':'—'],
                ['Rate type', loan.rateType||'Variable'],
                ['Term', loan.term?loan.term+'y':'—'],
                ['IO period', loan.ioTerm?loan.ioTerm+'y':'—'],
                ['Settlement date', fmtDate(loan.settled)],
                ['Est. monthly repayment', estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
              ].map(([label,val])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid var(--border-light)',gap:8}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
                  <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)',textAlign:'right'}}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Key dates &amp; expiry flags</PanelTitle>
          {[
            ['Fixed rate expiry', loan.fixed],
            ['Interest only expiry', loan.io],
            ['Balloon / residual', loan.balloon],
          ].map(([label, val])=>{
            const badge = val ? expiryBadge(val) : null
            return (
              <div key={label} style={{padding:'10px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                  <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{fmtDate(val)}</span>
                </div>
                {badge && (
                  <div style={{textAlign:'right'}}>
                    <span style={{padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:500,background:badge.bg,color:badge.color}}>{badge.label}</span>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{marginTop:12}}>
            <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Repayment summary</div>
            {[
              ['Repayment type', eRpmt+(eRpmt==='P&I*'?' (auto-switched from IO)':'')],
              ['Est. monthly repayment', estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
              ['Est. annual repayment', estRepayment?'$'+(estRepayment*12).toLocaleString():'—'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{val}</span>
              </div>
            ))}
          </div>
          {/* Security details */}
          {security && (
            <div style={{marginTop:12,background:'var(--bg)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Linked security</div>
              <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',marginBottom:4}}>{security.address}</div>
              <div style={{display:'flex',gap:16,fontSize:11,color:'var(--text-secondary)'}}>
                <span>Est. value: <strong style={{color:'var(--text-primary)'}}>{security.estVal?fmt(security.estVal):'—'}</strong></span>
                <span>LVR: <strong style={{color:'var(--text-primary)'}}>{security.lvr||80}%</strong></span>
                <span>Lending equity: <strong style={{color:'#27ae60'}}>{security.estVal?fmt(Math.round(security.estVal*(security.lvr||80)/100-loan.balance)):'—'}</strong></span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Balance history graph */}
      {history.length > 0 && (
        <Panel style={{marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <PanelTitle>Balance history &amp; projection</PanelTitle>
            {propStart > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--text-secondary)'}}>
                <span>Property growth rate:</span>
                <input type="number" value={propGrowthRate} onChange={e=>setPropGrowthRate(+e.target.value)}
                  style={{width:52,textAlign:'center',padding:'3px 6px',borderRadius:6,border:'0.5px solid var(--border)',background:'var(--bg)',color:'var(--text-primary)',fontSize:11}}/>
                <span>% p.a.</span>
              </div>
            )}
          </div>
          <div style={{overflowX:'auto'}}>
            <svg width="100%" viewBox={`0 0 ${gW} ${gH}`} style={{display:'block',minWidth:400}}>
              {/* Grid lines */}
              {[0,0.25,0.5,0.75,1].map(p => (
                <g key={p}>
                  <line x1={pad.l} x2={gW-pad.r} y1={pad.t+plotH*(1-p)} y2={pad.t+plotH*(1-p)} stroke="var(--border-light)" strokeWidth={0.5}/>
                  <text x={pad.l-4} y={pad.t+plotH*(1-p)+4} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">
                    {p>0?`$${Math.round(maxBal*p/1000)}k`:'$0'}
                  </text>
                </g>
              ))}
              {/* Today divider */}
              {todayX && <line x1={todayX} x2={todayX} y1={pad.t} y2={pad.t+plotH} stroke="rgba(187,198,218,0.4)" strokeWidth={1} strokeDasharray="3,3"/>}
              {todayX && <text x={todayX+3} y={pad.t+10} fontSize={8} fill="var(--text-tertiary)">Today</text>}
              {/* Key date flags */}
              {keyDates.map((kd,i) => (
                <g key={i}>
                  <line x1={kd.x} x2={kd.x} y1={pad.t} y2={pad.t+plotH} stroke={kd.color} strokeWidth={1} strokeDasharray="4,3" opacity={0.7}/>
                  <text x={kd.x+3} y={pad.t+22+i*10} fontSize={7} fill={kd.color}>{kd.label}</text>
                </g>
              ))}
              {/* Property value line */}
              {propPath && <path d={propPath} fill="none" stroke="#27ae60" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7}/>}
              {/* Historic portion of balance (solid) */}
              {todayIdx > 0 && (
                <path d={graphData.slice(0,todayIdx+1).map((d,i)=>`${i===0?'M':'L'}${toX(i)},${toY(d.balance)}`).join(' ')} fill="none" stroke="#2A3D54" strokeWidth={2}/>
              )}
              {/* Projected portion (dashed) */}
              {todayIdx > 0 && (
                <path d={graphData.slice(todayIdx).map((d,i)=>`${i===0?'M':'L'}${toX(todayIdx+i)},${toY(d.balance)}`).join(' ')} fill="none" stroke="#EB99C2" strokeWidth={1.5} strokeDasharray="5,3"/>
              )}
              {/* Full path if no today divider */}
              {!todayX && <path d={balPath} fill="none" stroke="#DA408D" strokeWidth={2}/>}
              {/* Area fill */}
              {todayIdx > 0 && (
                <path d={`${graphData.slice(0,todayIdx+1).map((d,i)=>`${i===0?'M':'L'}${toX(i)},${toY(d.balance)}`).join(' ')} L${toX(todayIdx)},${pad.t+plotH} L${pad.l},${pad.t+plotH} Z`} fill="#2A3D54" opacity={0.08}/>
              )}
              {/* Year labels */}
              {yearLabels.filter((_,i)=>i%2===0).map((yl,i)=>(
                <text key={i} x={yl.x} y={gH-4} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)">{yl.label}</text>
              ))}
            </svg>
          </div>
          {/* Legend */}
          <div style={{display:'flex',gap:16,marginTop:8,fontSize:10,color:'var(--text-secondary)'}}>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:20,height:2,background:'#2A3D54'}}/> Historic balance</div>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:20,height:2,background:'#EB99C2',borderTop:'1.5px dashed #EB99C2'}}/> Projected balance</div>
            {propStart>0 && <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:20,height:2,borderTop:'1.5px dashed #27ae60'}}/> Est. property value</div>}
          </div>
        </Panel>
      )}

      {/* Balance schedule table — condensed */}
      {history.length > 0 && (
        <Panel>
          <PanelTitle>Balance schedule</PanelTitle>
          <div style={{overflowX:'auto',maxHeight:300,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead style={{position:'sticky',top:0}}>
                <tr>
                  {['Date','Balance','Est. Interest','Repayment','Type'].map((h,i)=>(
                    <th key={h} style={{...th,textAlign:i===0||i===4?'left':'right'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.filter((_,i)=>i%1===0).map((row,i)=>(
                  <tr key={i} style={{background:!row.isPast?'rgba(235,153,194,0.03)':'transparent'}}
                    onMouseOver={e=>e.currentTarget.style.background='var(--bg)'}
                    onMouseOut={e=>e.currentTarget.style.background=!row.isPast?'rgba(235,153,194,0.03)':'transparent'}>
                    <td style={td()}>{row.date}{!row.isPast&&i===history.findIndex(r=>!r.isPast)?<span style={{fontSize:9,marginLeft:6,color:'var(--pk)'}}>← today</span>:''}</td>
                    <td style={td({textAlign:'right',fontWeight:500,color:'var(--pk)'})}>${row.balance.toLocaleString()}</td>
                    <td style={td({textAlign:'right'})}>${row.interest.toLocaleString()}</td>
                    <td style={td({textAlign:'right'})}>${row.repayment.toLocaleString()}</td>
                    <td style={td({color:row.isPast?'var(--text-tertiary)':'var(--pk)',fontSize:10})}>{row.isPast?'Historic':'Projected'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
