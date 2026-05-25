import React, { useState, useMemo } from 'react'
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

  const th = {padding:'6px 8px',background:'#3D5570',color:'#fff',fontSize:10,fontWeight:500,textAlign:'left',whiteSpace:'nowrap'}
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

  // ── Loan Predictor ─────────────────────────────────────────────────────────
  const [extraAmount, setExtraAmount] = useState(0)
  const [extraFreq, setExtraFreq] = useState('monthly')
  const [tableView, setTableView] = useState('quarterly') // 'quarterly' | 'monthly'

  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function fmtMY(d) { return `${MO[d.getMonth()]}-${String(d.getFullYear()).slice(2)}` }

  const todayP = new Date(); todayP.setHours(0,0,0,0)
  const matDateP = loan.maturity ? new Date(loan.maturity) : null
  const remainMonths = matDateP
    ? Math.max(1, Math.round((matDateP - todayP) / (1000*60*60*24*30.44)))
    : (loan.term ? Math.max(1, loan.term*12 - Math.round((todayP - (loan.settled?new Date(loan.settled):todayP))/(1000*60*60*24*30.44))) : 360)
  const ioDateP = loan.io ? new Date(loan.io) : null
  const ioMonthsLeft = (ioDateP && ioDateP > todayP) ? Math.max(0, Math.round((ioDateP - todayP)/(1000*60*60*24*30.44))) : 0
  const extraMonthly = extraFreq==='weekly' ? Math.round((extraAmount||0)*52/12) : extraFreq==='annually' ? Math.round((extraAmount||0)/12) : (extraAmount||0)
  const piTotal = remainMonths - ioMonthsLeft

  function buildProjection(startBal, rate, remMonths, ioLeft, extra) {
    if (!startBal || remMonths <= 0) return []
    const r = (rate||0) / 100 / 12
    const rows = []; let bal = startBal
    const base = new Date(todayP.getFullYear(), todayP.getMonth(), 1)
    const piTot = remMonths - ioLeft
    for (let m = 0; m < remMonths && bal > 0.5; m++) {
      const isIO = m < ioLeft
      const interest = r > 0 ? bal * r : 0
      let principal
      if (isIO) {
        principal = extra
      } else {
        const piElapsed = m - ioLeft; const piRem = Math.max(1, piTot - piElapsed)
        if (r > 0) { const pmt = bal*r*Math.pow(1+r,piRem)/(Math.pow(1+r,piRem)-1); principal = Math.max(0,pmt-interest)+extra }
        else { principal = bal/piRem + extra }
      }
      principal = Math.min(principal, bal)
      const newBal = Math.max(0, bal - principal)
      const dt = new Date(base.getFullYear(), base.getMonth()+m, 1)
      rows.push({ date:dt, dateStr:fmtMY(dt), openingBal:Math.round(bal), interest:Math.round(interest), principal:Math.round(principal), closingBal:Math.round(newBal), isIO })
      if (newBal <= 0) { rows[rows.length-1].closingBal=0; break }
      bal = newBal
    }
    return rows
  }

  const projection = useMemo(() => buildProjection(loan.balance, loan.rate, remainMonths, ioMonthsLeft, 0),
    [loan.balance, loan.rate, remainMonths, ioMonthsLeft])
  const projExtra = useMemo(() => extraMonthly>0 ? buildProjection(loan.balance, loan.rate, remainMonths, ioMonthsLeft, extraMonthly) : [],
    [loan.balance, loan.rate, remainMonths, ioMonthsLeft, extraMonthly])

  const histInterest = history.reduce((s,r)=>s+r.interest,0)
  const stdFutureInt = projection.reduce((s,r)=>s+r.interest,0)
  const extraFutureInt = projExtra.length>0 ? projExtra.reduce((s,r)=>s+r.interest,0) : stdFutureInt
  const totalIntStd = histInterest + stdFutureInt
  const totalIntExtra = histInterest + extraFutureInt
  const intSaved = stdFutureInt - extraFutureInt
  const monthsSaved = projection.length - (projExtra.length>0?projExtra.length:projection.length)

  // Chart data: combine historic + projection for continuous line
  const histPts = (loan.balanceHistory||[]).map(h=>({bal:h.balance,isHist:true}))
  const projPts = projection.map(p=>({bal:p.openingBal,isHist:false}))
  if (projection.length>0) projPts.push({bal:projection[projection.length-1].closingBal,isHist:false})
  const extraPts = projExtra.map(p=>({bal:p.openingBal}))
  if (projExtra.length>0) extraPts.push({bal:projExtra[projExtra.length-1].closingBal})
  const allPts = [...histPts,...projPts]
  const todayChartIdx = histPts.length
  const maxChartBal = Math.max(...allPts.map(p=>p.bal), loan.amount||0)*1.06||1
  const gW=560,gH=175,gP={l:52,r:10,t:12,b:28}
  const gPW=gW-gP.l-gP.r, gPH=gH-gP.t-gP.b
  const toX=i=>gP.l+(i/Math.max(1,allPts.length-1))*gPW
  const toY=v=>gP.t+gPH-(Math.max(0,v)/maxChartBal)*gPH
  const todayX = todayChartIdx>0 ? toX(todayChartIdx) : gP.l+gPW*0.4
  const balPath2 = allPts.map((p,i)=>`${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(p.bal).toFixed(1)}`).join(' ')
  const extraPath2 = extraPts.length>1 ? extraPts.map((p,i)=>{
    const xFrac = todayChartIdx>0?(allPts.length-1-todayChartIdx):1
    const x = todayX + (i/Math.max(1,extraPts.length-1))*(gP.l+gPW-todayX)
    return `${i===0?'M':'L'}${x.toFixed(1)},${toY(p.bal).toFixed(1)}`
  }).join(' ') : null
  const histEndX = histPts.length>0 ? toX(histPts.length-1) : gP.l

  // Y-axis grid labels
  const yGridVals = [0,0.25,0.5,0.75,1].map(p=>Math.round(maxChartBal*p))
  // X-axis: year labels at every ~24 projPoints
  const xLabels = []
  allPts.forEach((p,i)=>{
    if (i===0) { xLabels.push({x:toX(i),label:loan.settled?new Date(loan.settled).getFullYear():''}); return }
    if (i===todayChartIdx) { xLabels.push({x:toX(i),label:'Today'}); return }
    if ((i-todayChartIdx)>0 && (i-todayChartIdx)%24===0) {
      const projI = i - todayChartIdx
      if (projI < projection.length) xLabels.push({x:toX(i), label:projection[projI].date.getFullYear()})
    }
  })

  // Amortisation table rows: show historic + future
  const tableHistRows = history.map(h=>({...h,type:'Historic',rowColor:'#f9f9f9'}))
  const tableProjRows = (tableView==='monthly' ? projection : projection.filter((_,i)=>i%3===0||i===projection.length-1))
    .map(r=>({date:r.dateStr,balance:r.openingBal,movement:r.principal,interest:r.interest,type:r.isIO?'IO':'P&I',rowColor:'#fff'}))

  return (
    <div style={{padding:'16px 24px'}}>
      <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-secondary)',marginBottom:14}}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to {client.name}
      </button>

      {/* Header */}
      <div style={{background:'#3D5570',borderRadius:10,padding:'16px 20px',marginBottom:14}}>
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
            ['Original limit',fmt(loan.amount),'#fff'],
            ['Current balance',fmt(loan.balance),'#fff'],
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

      {/* Action log — shows when actioned from dashboard */}
      {loan.actionNotes && loan.actionNotes.length > 0 && (
        <div style={{marginBottom:14,background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:10,padding:'12px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <div style={{width:20,height:20,borderRadius:'50%',background:'#22c55e',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'#fff',fontSize:12,fontWeight:700}}>✓</span>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:'#15803d',textTransform:'uppercase',letterSpacing:'0.06em'}}>
              Dashboard Action Log
            </div>
          </div>
          <div style={{fontSize:11,color:'#166534',marginBottom:8,lineHeight:1.5}}>
            This loan has been actioned from the Opportunity Radar dashboard. All dates and details remain unchanged below for your records.
          </div>
          {loan.actionNotes.map((note, ni) => (
            <div key={ni} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
              padding:'6px 10px',
              background:'#dcfce7',borderRadius:6,
              marginBottom: ni < loan.actionNotes.length - 1 ? 4 : 0,
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#166534',fontWeight:500}}>
                <span>✓</span>
                <span>{note}</span>
              </div>
              <button
                onClick={() => {
                  // Remove this note from the loan
                  updateClient(client.name, c => ({
                    ...c,
                    loans: c.loans.map((l, li) => li !== idx ? l : {
                      ...l,
                      actionNotes: l.actionNotes.filter((_, i) => i !== ni)
                    })
                  }))
                  // Remove from dashboard ticked set so it reappears
                  try {
                    const stored = JSON.parse(localStorage.getItem('rion-radar-ticked') || '[]')
                    // Remove any key matching this connection
                    // Keys are stored as 'PanelKey-ConnName-AccNo' — remove all entries for this connection
                    const filtered = stored.filter(k => {
                      const parts = k.split('-')
                      // parts[1] onward form the connection name (may contain hyphens)
                      return !k.includes(client.name)
                    })
                    localStorage.setItem('rion-radar-ticked', JSON.stringify(filtered))
                  } catch(e) {}
                }}
                style={{
                  padding:'3px 10px',borderRadius:5,border:'1px solid #86efac',
                  background:'#fff',color:'#166534',fontSize:10,fontWeight:500,
                  cursor:'pointer',whiteSpace:'nowrap',flexShrink:0
                }}
                onMouseOver={e=>{e.currentTarget.style.background='#fee2e2';e.currentTarget.style.borderColor='#fca5a5';e.currentTarget.style.color='#991b1b'}}
                onMouseOut={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#86efac';e.currentTarget.style.color='#166534'}}
              >
                ↩ Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main body — 2 col */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>

        {/* LEFT COL — Loan details */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
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
                <FieldGroup label="Rate change note"><input style={inp} value={l.rateChangeNote||''} placeholder="e.g. RBA rate cut" onChange={e=>set('rateChangeNote',e.target.value)}/></FieldGroup>
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
                  ['Security #', allSecurities.length>1 ? allSecurities.map(s=>s.num).join(', ') : (loan.security||'—')],
                  ['Asset / property', allSecurities.length>1 ? allSecurities.map(s=>`#${s.num} — ${s.address}`).join('|||') : (security?.address||loan.assetDesc||'—')],
                  ['Borrowing entity',loan.borrowingEntity||'—'],
                  ['Original limit',fmt(loan.amount)],
                  ['Current balance',fmt(loan.balance)],
                  ['Interest rate',loan.rate>0?loan.rate.toFixed(2)+'%':'—'],
                  ['Rate type',loan.rateType||'Variable'],
                  ['Term',loan.term?loan.term+'y':'—'],
                  ['IO period', (() => {
                    if (loan.ioTerm) return loan.ioTerm+'y'
                    if (loan.io&&loan.settled) { const mo=Math.round((new Date(loan.io)-new Date(loan.settled))/(30.44*86400000)); if(mo>0) return mo>=12?(mo/12).toFixed(1).replace('.0','')+'y':mo+'mo' }
                    return '—'
                  })()],
                  ['Settlement date',fmtDate(loan.settled)],
                  ['Maturity date',fmtDate(loan.maturity)],
                  ['Est. monthly repayment',estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
                  ...(loan.balloon>0?[['Balloon / residual','$'+Number(loan.balloon).toLocaleString()]]:[]),
                ].map(([label,val])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid var(--border-light)',gap:8}}>
                    <span style={{fontSize:11,color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
                    <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)',textAlign:'right'}}>
                      {String(val||'').includes('|||') ? String(val).split('|||').map((line,i)=><div key={i}>{line}</div>) : val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle>Key dates &amp; expiry flags</PanelTitle>
            {[
              ['Settlement date',loan.settled,false,null],
              ['Maturity date',loan.maturity,true,'Maturity'],
              ['Fixed rate expiry',loan.fixed,true,'Fixed Term'],
              ['Interest only expiry',loan.io,true,'IO Term'],
              ['Balloon / residual',loan.balloon>0?String(loan.balloon):null,false,null],
            ].map(([label,val,showBadge,noteKeyword])=>{
              const badge=showBadge&&val?expiryBadge(val):null
              const matchingNote = noteKeyword && loan.actionNotes?.find(n=>n.includes(noteKeyword))
              const isActioned = !!matchingNote
              const actionedDate = isActioned ? (matchingNote.split(' \u2014 ')[1]||'') : ''
              return (
                <div key={label} style={{padding:'9px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:(badge||isActioned)?4:0}}>
                    <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                    <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{label==='Balloon / residual'?fmt(loan.balloon):fmtDate(val)}</span>
                  </div>
                  {isActioned
                    ? <div style={{textAlign:'right'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:500,background:'#dcfce7',color:'#166534'}}>✓ Actioned{actionedDate?' — '+actionedDate:''}</span></div>
                    : badge ? <div style={{textAlign:'right'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:500,background:badge.bg,color:badge.color}}>{badge.label}</span></div>
                    : null}
                </div>
              )
            })}
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
            {allSecurities.length>0&&(
              <div style={{marginTop:10,background:'var(--bg)',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>
                  {crossedSecurities.length>0 ? <span>Cross-collateralised <span style={{color:'#e8a020'}}>✕ {loan.crossed}</span></span> : 'Linked security'}
                </div>
                {allSecurities.map((sec,si)=>(
                  <div key={si} style={{marginBottom:si<allSecurities.length-1?10:0,paddingBottom:si<allSecurities.length-1?10:0,borderBottom:si<allSecurities.length-1?'0.5px solid var(--border)':'none'}}>
                    <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',marginBottom:4}}>#{sec.num} — {sec.address}</div>
                    <div style={{display:'flex',gap:16,fontSize:11,color:'var(--text-secondary)'}}>
                      <span>Est. value: <strong style={{color:'var(--text-primary)'}}>{sec.estVal?fmt(sec.estVal):'—'}</strong></span>
                      <span>LVR: <strong style={{color:'var(--text-primary)'}}>{sec.lvr||80}%</strong></span>
                      <span>Equity: <strong style={{color:'#27ae60'}}>{sec.estVal?fmt(Math.round(sec.estVal-(loan.balance||0))):'—'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {rateHistory.length>0&&(
            <Panel>
              <PanelTitle>Interest rate history</PanelTitle>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr>{['Date','From','To','Change','Note'].map(h=><th key={h} style={{...th,textAlign:h==='Change'?'right':'left'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {rateHistory.map((r,i)=>(
                    <tr key={i}>
                      <td style={td()}>{fmtDate(r.date)}</td>
                      <td style={td()}>{r.fromRate?r.fromRate.toFixed(2)+'%':'—'}</td>
                      <td style={td({fontWeight:500,color:'var(--pk)'})}>{r.toRate?r.toRate.toFixed(2)+'%':'—'}</td>
                      <td style={td({textAlign:'right',color:r.toRate<r.fromRate?'#27ae60':'#c0392b',fontWeight:500})}>{r.toRate<r.fromRate?'▼':'▲'} {Math.abs(r.toRate-r.fromRate).toFixed(2)}%</td>
                      <td style={td({color:'var(--text-secondary)'})}>{r.note||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>

        {/* RIGHT COL — Loan predictor */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>

          {/* Extra repayment calculator */}
          <Panel>
            <PanelTitle>Extra repayment calculator</PanelTitle>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,alignItems:'end',marginBottom:12}}>
              <FieldGroup label="Additional repayment amount ($)">
                <input type="number" min="0" value={extraAmount||''} onChange={e=>setExtraAmount(+e.target.value||0)}
                  placeholder="e.g. 500" style={{...inp,fontSize:13,padding:'7px 10px'}}/>
              </FieldGroup>
              <FieldGroup label="Frequency">
                <select value={extraFreq} onChange={e=>setExtraFreq(e.target.value)} style={{...inp,fontSize:12,padding:'7px 10px'}}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                </select>
              </FieldGroup>
              {extraMonthly>0&&<div style={{paddingBottom:2,fontSize:10,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>≈ ${extraMonthly.toLocaleString()}/mo</div>}
            </div>
            {/* Summary stats */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                {label:'Remaining term',val:`${Math.floor(remainMonths/12)}y ${remainMonths%12}m`,sub:'Standard'},
                {label:extraMonthly>0?'New payoff':'Loan payoff',
                 val:extraMonthly>0&&projExtra.length>0?`${Math.floor(projExtra.length/12)}y ${projExtra.length%12}m`:`${Math.floor(projection.length/12)}y ${projection.length%12}m`,
                 sub:extraMonthly>0?'With extra repayments':'Standard',color:extraMonthly>0?'#22c55e':undefined},
                {label:'Est. total interest (standard)',val:'$'+stdFutureInt.toLocaleString(),sub:'Future interest only',color:'#c0392b'},
                {label:'Est. total interest (with extra)',val:extraMonthly>0?'$'+extraFutureInt.toLocaleString():'—',sub:extraMonthly>0?`Save $${intSaved.toLocaleString()}`:' ',color:extraMonthly>0?'#22c55e':undefined},
              ].map((s,i)=>(
                <div key={i} style={{background:'var(--bg)',borderRadius:7,padding:'9px 12px',border:'0.5px solid var(--border-light)'}}>
                  <div style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{s.label}</div>
                  <div style={{fontSize:14,fontWeight:600,color:s.color||'var(--text-primary)'}}>{s.val}</div>
                  <div style={{fontSize:9,color:'var(--text-secondary)',marginTop:2}}>{s.sub}</div>
                </div>
              ))}
            </div>
            {extraMonthly>0&&monthsSaved>0&&(
              <div style={{marginTop:10,padding:'8px 12px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:7,fontSize:11,color:'#166534'}}>
                🎉 With an extra <strong>${extraMonthly.toLocaleString()}/mo</strong> you save <strong>${intSaved.toLocaleString()}</strong> in interest and pay off <strong>{Math.floor(monthsSaved/12)}y {monthsSaved%12}m</strong> sooner.
              </div>
            )}
          </Panel>

          {/* Chart */}
          <Panel>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Balance — Historic &amp; Predicted</div>
              <div style={{display:'flex',gap:12,fontSize:10,color:'var(--text-secondary)',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:14,height:2,background:'#3D5570'}}/> Standard</div>
                {extraMonthly>0&&<div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:14,height:0,borderTop:'2px dashed #EB99C2'}}/> With extra</div>}
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:10,height:10,background:'rgba(235,153,194,0.15)',border:'0.5px solid rgba(235,153,194,0.3)',borderRadius:2}}/> Historic</div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <svg width="100%" viewBox={`0 0 ${gW} ${gH}`} style={{display:'block',minWidth:320}}>
                {/* Pink historic area */}
                <rect x={gP.l} y={gP.t} width={Math.max(0,histEndX-gP.l)} height={gPH} fill="rgba(235,153,194,0.13)" rx={3}/>
                <text x={(gP.l+histEndX)/2} y={gP.t+14} textAnchor="middle" fontSize={9} fill="rgba(235,153,194,0.7)" fontStyle="italic">Historic</text>
                <text x={(histEndX+gP.l+gPW)/2} y={gP.t+14} textAnchor="middle" fontSize={9} fill="rgba(61,85,112,0.5)" fontStyle="italic">Predicted</text>
                {/* Grid lines */}
                {yGridVals.map((v,i)=>(
                  <g key={i}>
                    <line x1={gP.l} x2={gP.l+gPW} y1={toY(v)} y2={toY(v)} stroke="var(--border-light)" strokeWidth={0.5}/>
                    <text x={gP.l-4} y={toY(v)+3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">{v>0?`$${Math.round(v/1000)}k`:'$0'}</text>
                  </g>
                ))}
                {/* Today vertical */}
                <line x1={todayX} x2={todayX} y1={gP.t} y2={gP.t+gPH} stroke="#EB99C2" strokeWidth={1} strokeDasharray="3,3" opacity={0.6}/>
                {/* Balance path */}
                {allPts.length>1&&<path d={balPath2} fill="none" stroke="#3D5570" strokeWidth={2}/>}
                {/* With-extra path */}
                {extraPath2&&<path d={extraPath2} fill="none" stroke="#EB99C2" strokeWidth={1.5} strokeDasharray="5,3"/>}
                {/* X labels */}
                {xLabels.map((xl,i)=>(
                  <text key={i} x={xl.x} y={gH-4} textAnchor="middle" fontSize={8} fill={xl.label==='Today'?'#EB99C2':'var(--text-tertiary)'} fontWeight={xl.label==='Today'?600:400}>{xl.label}</text>
                ))}
              </svg>
            </div>
          </Panel>

          {/* Amortisation table */}
          <Panel>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <PanelTitle style={{margin:0}}>Amortisation schedule</PanelTitle>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>setTableView('quarterly')} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${tableView==='quarterly'?'#3D5570':'var(--border)'}`,background:tableView==='quarterly'?'#3D5570':'#fff',color:tableView==='quarterly'?'#fff':'var(--text-secondary)',cursor:'pointer'}}>Quarterly</button>
                <button onClick={()=>setTableView('monthly')} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${tableView==='monthly'?'#3D5570':'var(--border)'}`,background:tableView==='monthly'?'#3D5570':'#fff',color:tableView==='monthly'?'#fff':'var(--text-secondary)',cursor:'pointer'}}>Monthly</button>
              </div>
            </div>
            <div style={{overflowX:'auto',maxHeight:380,overflowY:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead style={{position:'sticky',top:0}}>
                  <tr>
                    {['Date','Balance','Movement','Est. Interest','Type'].map((h,i)=>(
                      <th key={h} style={{...th,textAlign:i===0||i===4?'left':'right',padding:'6px 8px'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableHistRows.map((row,i)=>(
                    <tr key={`h${i}`} style={{background:'rgba(235,153,194,0.05)'}}>
                      <td style={td({color:'var(--text-secondary)',fontSize:10})}>{row.date}</td>
                      <td style={td({textAlign:'right',fontWeight:500,color:'var(--pk)'})}>${row.balance.toLocaleString()}</td>
                      <td style={td({textAlign:'right',color:'var(--text-secondary)'})}>{row.interest?'$'+row.interest.toLocaleString():'—'}</td>
                      <td style={td({textAlign:'right'})}>{row.interest?'$'+row.interest.toLocaleString():'—'}</td>
                      <td style={td({fontSize:9,color:'var(--text-secondary)'})}><span style={{background:'rgba(235,153,194,0.2)',color:'#9b2c6e',padding:'1px 6px',borderRadius:10,fontSize:9}}>Historic</span></td>
                    </tr>
                  ))}
                  {tableHistRows.length>0&&tableProjRows.length>0&&(
                    <tr><td colSpan={5} style={{padding:'4px 8px',background:'#f0f4f8',fontSize:10,fontWeight:600,color:'#3D5570',textAlign:'center',letterSpacing:'0.05em'}}>▼ TODAY — PROJECTED BELOW ▼</td></tr>
                  )}
                  {tableProjRows.map((row,i)=>(
                    <tr key={`p${i}`} style={{background:i%2===0?'#fff':'#f9fbff'}}>
                      <td style={td({color:'var(--text-secondary)',fontSize:10})}>{row.date}</td>
                      <td style={td({textAlign:'right',fontWeight:500,color:'var(--text-primary)'})}>${row.balance.toLocaleString()}</td>
                      <td style={td({textAlign:'right',color:'#166534'})}>${row.movement.toLocaleString()}</td>
                      <td style={td({textAlign:'right',color:'#c0392b'})}>${row.interest.toLocaleString()}</td>
                      <td style={td({fontSize:9})}><span style={{background:row.type==='IO'?'#fef9c3':'#f0fdf4',color:row.type==='IO'?'#92600a':'#166534',padding:'1px 6px',borderRadius:10,fontSize:9}}>{row.type}</span></td>
                    </tr>
                  ))}
                  {tableProjRows.length>0&&(
                    <tr style={{background:'#f0f4f8'}}>
                      <td colSpan={3} style={{padding:'6px 8px',fontSize:10,fontWeight:600,color:'var(--text-secondary)'}}>Total future interest</td>
                      <td style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:'#c0392b',fontSize:11}}>${stdFutureInt.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>
      </div>
    </div>
  )
}
