import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate, dateCellStyle, expiryBadge, calcRepayment, effectiveRpmt, buildBalanceHistory } from '../lib/dateUtils'
import { Panel, PanelTitle, EditBtn, SaveBtn, CancelBtn, FieldGroup, Pill } from '../components/UI'

export default function LoanAccount({ clients, updateClient }) {
  const { name, loanIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const idx = parseInt(loanIdx)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [propGrowthRate, setPropGrowthRate] = useState(5)

  if (!client) return <div style={{padding:24}}>Client not found.</div>
  const loan = client.loans[idx]
  if (!loan) return <div style={{padding:24}}>Loan not found.</div>

  const eRpmt = effectiveRpmt(loan)
  const estRepayment = calcRepayment(loan)
  // Historic only — no projections
  const history = (loan.balanceHistory||[]).map((h,i,arr) => {
    const prevBal = i>0?arr[i-1].balance:loan.amount
    const estInterest = loan.rate?Math.round(prevBal*loan.rate/100/12):0
    return {date:h.month,balance:h.balance,interest:estInterest,isPast:true}
  })
  // Find primary security + all crossed securities
  const security = (client.securities||[]).find(s=>String(s.num)===String(loan.security))
  const crossedNums = loan.crossed&&loan.crossed.trim() ? loan.crossed.split(',').map(x=>x.trim()) : []
  const crossedSecurities = crossedNums.map(n=>(client.securities||[]).find(s=>String(s.num)===n)).filter(Boolean)
  const allSecurities = crossedSecurities.length > 0 ? crossedSecurities : (security ? [security] : [])
  const rateHistory = loan.rateHistory||[]

  function startEdit() { setEditing(true); setDraft({...loan}) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() {
    const now = new Date().toISOString().slice(0,10)
    let newDraft = {...draft}
    // If rate changed, log it
    if (draft.rate !== loan.rate) {
      const prevHistory = loan.rateHistory||[]
      newDraft.rateHistory = [...prevHistory, {
        date: now,
        fromRate: loan.rate,
        toRate: draft.rate,
        note: draft.rateChangeNote||''
      }]
    }
    delete newDraft.rateChangeNote
    updateClient(client.name, c => {
      const loans=[...c.loans]; loans[idx]=newDraft; return {...c,loans}
    })
    setEditing(false); setDraft(null)
  }
  const set = (field, val) => setDraft(d => ({...d,[field]:val}))
  const l = editing?draft:loan
  const inp = {width:'100%'}

  const th = {padding:'6px 8px',background:'#2A3D54',color:'#fff',fontSize:10,fontWeight:500,textAlign:'left',whiteSpace:'nowrap'}
  const td = (extra={}) => ({padding:'6px 8px',borderBottom:'0.5px solid var(--border-light)',fontSize:11,color:'var(--text-primary)',verticalAlign:'middle',...extra})

  // Graph
  const graphData = history.filter((_,i)=>i%2===0)
  const maxBal = Math.max(loan.amount||0, ...graphData.map(d=>d.balance)) * 1.1 || 1
  const gW=520,gH=140,pad={l:50,r:20,t:10,b:30}
  const plotW=gW-pad.l-pad.r, plotH=gH-pad.t-pad.b
  const toX=i=>pad.l+(i/(graphData.length-1||1))*plotW
  const toY=val=>pad.t+plotH-(val/maxBal)*plotH
  const propStart=security?.estVal||0
  const monthlyGrowth=propGrowthRate/100/12
  const todayIdx=graphData.findIndex(d=>!d.isPast)
  const todayX=todayIdx>0?toX(todayIdx):null
  const balPath=graphData.map((d,i)=>`${i===0?'M':'L'}${toX(i)},${toY(d.balance)}`).join(' ')
  const propPath=propStart?graphData.map((d,i)=>{
    const months=i*2
    const pv=Math.min(propStart*Math.pow(1+monthlyGrowth,months),maxBal*1.5)
    return `${i===0?'M':'L'}${toX(i)},${toY(pv)}`
  }).join(' '):null
  const yearLabels=[]
  graphData.forEach((d,i)=>{if(d.date&&(d.date.startsWith('01/')||d.date.startsWith('Jan')))yearLabels.push({x:toX(i),label:d.date.slice(-4)||d.date})})

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
              <span style={{color:'#EB99C2',fontWeight:500}}>{loan.lname}</span>
              <span>{client.name} · #{client.connNo}</span>
              <span style={{fontFamily:'DM Mono,monospace'}}>{loan.acc||'—'}</span>
              <span>{loan.bank||'—'}</span>
              {allSecurities.length>0&&(
                crossedSecurities.length>0
                  ? <span style={{color:'#EB99C2'}}>Cross-col: {crossedNums.join(', ')} — {crossedSecurities.map(s=>s.address).join(' | ')}</span>
                  : <span style={{color:'#EB99C2'}}>Security #{loan.security}: {security.address}</span>
              )}
            </div>
          </div>
          <div style={{display:'flex',gap:6}}>
            {!editing?<EditBtn onClick={startEdit}/>:<><SaveBtn onClick={save}/><CancelBtn onClick={cancel}/></>}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          {[
            ['Current balance',fmt(loan.balance),'#fff'],
            ['Original limit',fmt(loan.amount),'#fff'],
            ['Interest rate',loan.rate>0?loan.rate.toFixed(2)+'%':'—','#fff'],
            ['Rate type',loan.rateType||'Var',loan.rateType==='Fix'?'#EB99C2':'var(--sbl)'],
            ['Repayment',eRpmt,eRpmt==='P&I*'?'#EB99C2':'var(--sbl)'],
            ['Est. monthly',estRepayment?'$'+estRepayment.toLocaleString()+'/mo':'—','#27ae60'],
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
          {editing?(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FieldGroup label="Account no."><input style={inp} value={l.acc||''} onChange={e=>set('acc',e.target.value)}/></FieldGroup>
              <FieldGroup label="Loan name"><input style={inp} value={l.lname||''} onChange={e=>set('lname',e.target.value)}/></FieldGroup>
              <FieldGroup label="Bank"><input style={inp} value={l.bank||''} onChange={e=>set('bank',e.target.value)}/></FieldGroup>
              <FieldGroup label="Security #"><input style={inp} value={l.security||''} onChange={e=>set('security',e.target.value)}/></FieldGroup>
              <FieldGroup label="Original limit ($)"><input style={inp} type="number" value={l.amount||''} onChange={e=>set('amount',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Current balance ($)"><input style={inp} type="number" value={l.balance||''} onChange={e=>set('balance',+e.target.value)}/></FieldGroup>
              <FieldGroup label="Interest rate (%)">
                <input style={inp} type="number" step="0.01" value={l.rate||''} onChange={e=>set('rate',+e.target.value)}/>
                {l.rate!==loan.rate&&<div style={{fontSize:10,color:'#e8a020',marginTop:3}}>⚠ Rate changed — will be logged</div>}
              </FieldGroup>
              <FieldGroup label="Rate change note (optional)"><input style={inp} value={l.rateChangeNote||''} placeholder="e.g. RBA rate cut" onChange={e=>set('rateChangeNote',e.target.value)}/></FieldGroup>
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
              <FieldGroup label="Maturity date"><input style={inp} value={l.maturity||''} placeholder="YYYY-MM-DD" onChange={e=>set('maturity',e.target.value)}/></FieldGroup>
              <FieldGroup label="Fixed rate expiry"><input style={inp} value={l.fixed||''} placeholder="YYYY-MM-DD" onChange={e=>set('fixed',e.target.value)}/></FieldGroup>
              <FieldGroup label="IO expiry"><input style={inp} value={l.io||''} placeholder="YYYY-MM-DD" onChange={e=>set('io',e.target.value)}/></FieldGroup>
              <FieldGroup label="Balloon / residual ($)">
                <input style={inp} type="number" value={l.balloon||''} placeholder="0" onChange={e=>set('balloon',e.target.value?+e.target.value:'')}/>
                {l.balloon>0&&<div style={{fontSize:10,color:'var(--text-secondary)',marginTop:3}}>Est. repayment adjusts for balloon</div>}
              </FieldGroup>
              <FieldGroup label="Est. repayment override ($)"><input style={inp} type="number" value={l.estRepayment||''} placeholder="Auto-calculated" onChange={e=>set('estRepayment',e.target.value?+e.target.value:null)}/></FieldGroup>
              <FieldGroup label="Asset description"><input style={inp} value={l.assetDesc||''} onChange={e=>set('assetDesc',e.target.value)}/></FieldGroup>
              <FieldGroup label="Borrowing entity"><input style={inp} value={l.borrowingEntity||''} onChange={e=>set('borrowingEntity',e.target.value)}/></FieldGroup>
            </div>
          ):(
            <div>
              {[
                ['Loan name',loan.lname||'—'],
                ['Account no.',loan.acc||'—'],
                ['Loan type',loan.type||'—'],
                ['Bank',loan.bank||'—'],
                ['Security #',loan.security||'—'],
                ['Asset / property', allSecurities.length>1
                  ? allSecurities.map(s=>`#${s.num} — ${s.address}`).join(' | ')
                  : (security?.address||loan.assetDesc||'—')],
                ['Borrowing entity',loan.borrowingEntity||'—'],
                ['Original limit',fmt(loan.amount)],
                ['Current balance',fmt(loan.balance)],
                ['Interest rate',loan.rate>0?loan.rate.toFixed(2)+'%':'—'],
                ['Rate type',loan.rateType||'Variable'],
                ['Term',loan.term?loan.term+'y':'—'],
                ['IO period',loan.ioTerm?loan.ioTerm+'y':'—'],
                ['Settlement date',fmtDate(loan.settled)],
                ['Maturity date',fmtDate(loan.maturity)],
                ['Est. monthly repayment',estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
                ...(loan.balloon>0?[['Balloon / residual','$'+Number(loan.balloon).toLocaleString()]]:[]),
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
            ['Settlement date',loan.settled,false],
            ['Maturity date',loan.maturity,true],
            ['Fixed rate expiry',loan.fixed,true],
            ['Interest only expiry',loan.io,true],
            ['Balloon / residual',loan.balloon>0?String(loan.balloon):null,false],
          ].map(([label,val,showBadge])=>{
            const badge=showBadge&&val?expiryBadge(val):null
            return (
              <div key={label} style={{padding:'9px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:badge?4:0}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                  <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{label==='Balloon / residual'?fmt(loan.balloon):fmtDate(val)}</span>
                </div>
                {badge&&<div style={{textAlign:'right'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:500,background:badge.bg,color:badge.color}}>{badge.label}</span></div>}
              </div>
            )
          })}

          {/* Repayment summary */}
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Repayment summary</div>
            {[
              ['Repayment type',eRpmt+(eRpmt==='P&I*'?' (auto-switched from IO)':'')],
              ['Est. monthly repayment',estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
              ['Est. annual repayment',estRepayment?'$'+(estRepayment*12).toLocaleString():'—'],
              ...(loan.balloon>0?[['Balloon adjusted','Yes — P&I reduced for residual']]:[]),
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Securities */}
          {allSecurities.length>0&&(
            <div style={{marginTop:10,background:'var(--bg)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>
                {crossedSecurities.length>0
                  ? <span>Cross-collateralised securities <span style={{color:'#e8a020'}}>✕ {loan.crossed}</span></span>
                  : 'Linked security'}
              </div>
              {allSecurities.map((sec,si)=>(
                <div key={si} style={{marginBottom:si<allSecurities.length-1?10:0,paddingBottom:si<allSecurities.length-1?10:0,borderBottom:si<allSecurities.length-1?'0.5px solid var(--border)':'none'}}>
                  <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',marginBottom:4}}>#{sec.num} — {sec.address}</div>
                  <div style={{display:'flex',gap:16,fontSize:11,color:'var(--text-secondary)'}}>
                    <span>Est. value: <strong style={{color:'var(--text-primary)'}}>{sec.estVal?fmt(sec.estVal):'—'}</strong></span>
                    <span>LVR: <strong style={{color:'var(--text-primary)'}}>{sec.lvr||80}%</strong></span>
                    <span>Equity: <strong style={{color:'#27ae60'}}>{sec.estVal?fmt(Math.round(sec.estVal*(sec.lvr||80)/100-loan.balance)):'—'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Rate history */}
      {rateHistory.length>0&&(
        <Panel style={{marginBottom:14}}>
          <PanelTitle>Interest rate history</PanelTitle>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr>
              {['Date','From','To','Change','Note'].map(h=><th key={h} style={{...th,textAlign:h==='Change'?'right':'left'}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rateHistory.map((r,i)=>(
                <tr key={i}>
                  <td style={td()}>{fmtDate(r.date)}</td>
                  <td style={td()}>{r.fromRate?r.fromRate.toFixed(2)+'%':'—'}</td>
                  <td style={td({fontWeight:500,color:'var(--pk)'})}>{r.toRate?r.toRate.toFixed(2)+'%':'—'}</td>
                  <td style={td({textAlign:'right',color:r.toRate<r.fromRate?'#27ae60':'#c0392b',fontWeight:500})}>
                    {r.toRate<r.fromRate?'▼':'▲'} {Math.abs(r.toRate-r.fromRate).toFixed(2)}%
                  </td>
                  <td style={td({color:'var(--text-secondary)'})}>{r.note||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Balance graph */}
      {history.length>0&&(
        <Panel style={{marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Balance history &amp; projection</div>
            {propStart>0&&(
              <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--text-secondary)'}}>
                <span>Property growth:</span>
                <input type="number" value={propGrowthRate} onChange={e=>setPropGrowthRate(+e.target.value)} style={{width:44,textAlign:'center',padding:'2px 4px',borderRadius:5,border:'0.5px solid var(--border)',background:'var(--bg)',color:'var(--text-primary)',fontSize:11}}/>
                <span>% p.a.</span>
              </div>
            )}
          </div>
          <div style={{overflowX:'auto'}}>
            <svg width="100%" viewBox={`0 0 ${gW} ${gH}`} style={{display:'block',minWidth:400}}>
              {[0,0.25,0.5,0.75,1].map(p=>(
                <g key={p}>
                  <line x1={pad.l} x2={gW-pad.r} y1={pad.t+plotH*(1-p)} y2={pad.t+plotH*(1-p)} stroke="var(--border-light)" strokeWidth={0.5}/>
                  <text x={pad.l-4} y={pad.t+plotH*(1-p)+4} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">{p>0?`$${Math.round(maxBal*p/1000)}k`:'$0'}</text>
                </g>
              ))}
              {propPath&&<path d={propPath} fill="none" stroke="#27ae60" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7}/>}
              <path d={balPath} fill="none" stroke="#2A3D54" strokeWidth={2}/>
              <path d={`${balPath} L${toX(graphData.length-1)},${pad.t+plotH} L${pad.l},${pad.t+plotH} Z`} fill="#2A3D54" opacity={0.08}/>
              {yearLabels.filter((_,i)=>i%2===0).map((yl,i)=><text key={i} x={yl.x} y={gH-4} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)">{yl.label}</text>)}
            </svg>
          </div>
          <div style={{display:'flex',gap:16,marginTop:8,fontSize:10,color:'var(--text-secondary)'}}>
            <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:20,height:2,background:'#2A3D54'}}/> Balance</div>
            {propStart>0&&<div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:20,height:0,borderTop:'1.5px dashed #27ae60'}}/> Est. property value</div>}
          </div>
        </Panel>
      )}

      {/* Schedule table */}
      {history.length>0&&(
        <Panel>
          <PanelTitle>Balance schedule</PanelTitle>
          <div style={{overflowX:'auto',maxHeight:300,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead style={{position:'sticky',top:0}}>
                <tr>{['Date','Balance','Est. Interest','Type'].map((h,i)=><th key={h} style={{...th,textAlign:i===0||i===3?'left':'right'}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {history.map((row,i)=>(
                  <tr key={i} style={{background:!row.isPast?'rgba(235,153,194,0.03)':'transparent'}}
                    onMouseOver={e=>e.currentTarget.style.background='var(--bg)'}
                    onMouseOut={e=>e.currentTarget.style.background=!row.isPast?'rgba(235,153,194,0.03)':'transparent'}>
                    <td style={td()}>{row.date}{!row.isPast&&i===history.findIndex(r=>!r.isPast)?<span style={{fontSize:9,marginLeft:6,color:'var(--pk)'}}>← today</span>:''}</td>
                    <td style={td({textAlign:'right',fontWeight:500,color:'var(--pk)'})}>${row.balance.toLocaleString()}</td>
                    <td style={td({textAlign:'right'})}>{row.interest?'$'+row.interest.toLocaleString():'—'}</td>
                    <td style={td({color:'var(--text-tertiary)',fontSize:10})}>Historic</td>
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
