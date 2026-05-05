import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmt } from '../lib/data'
import { fmtDate, dateCellStyle, calcRepayment, effectiveRpmt } from '../lib/dateUtils'
import { Panel, PanelTitle, EditBtn, SaveBtn, CancelBtn, FieldGroup, Pill } from '../components/UI'

const MONTHS = 24

export default function LoanAccount({ clients, updateClient }) {
  const { name, loanIdx } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const idx = parseInt(loanIdx)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  if (!client) return <div style={{padding:24}}>Client not found.</div>
  const loan = client.loans[idx]
  if (!loan) return <div style={{padding:24}}>Loan not found.</div>

  const eRpmt = effectiveRpmt(loan)
  const estRepayment = calcRepayment(loan)

  function startEdit() { setEditing(true); setDraft({...loan}) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() {
    updateClient(client.name, c => {
      const loans = [...c.loans]
      loans[idx] = draft
      return {...c, loans}
    })
    setEditing(false); setDraft(null)
  }
  const set = (field, val) => setDraft(d => ({...d, [field]: val}))

  const l = editing ? draft : loan
  const inp = {width:'100%'}

  // Amortisation schedule
  const schedule = []
  if (loan.balance && loan.rate) {
    let bal = loan.balance
    const monthlyRate = loan.rate / 100 / 12
    const isIO = eRpmt === 'IO'
    for (let m = 0; m < MONTHS; m++) {
      const interest = bal * monthlyRate
      const repayment = isIO ? interest : (estRepayment || interest)
      const principal = isIO ? 0 : Math.max(0, repayment - interest)
      bal = Math.max(0, bal - principal)
      const date = new Date()
      date.setMonth(date.getMonth() + m + 1)
      schedule.push({ month: fmtDate(date.toISOString().slice(0,10)), balance: Math.round(bal), interest: Math.round(interest), repayment: Math.round(repayment) })
    }
  }

  const th = {padding:'6px 8px',background:'#2A3D54',color:'#fff',fontSize:10,fontWeight:500,textAlign:'left',whiteSpace:'nowrap'}
  const td = (extra={}) => ({padding:'6px 8px',borderBottom:'0.5px solid var(--border-light)',fontSize:11,color:'var(--text-primary)',verticalAlign:'middle',...extra})

  return (
    <div style={{padding:'16px 24px'}}>
      <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
        style={{display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-secondary)',marginBottom:14}}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to {client.name}
      </button>

      {/* Header */}
      <div style={{background:'#2A3D54',borderRadius:10,padding:'16px 20px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:500,color:'#fff',marginBottom:4}}>{loan.lname || 'Loan account'}</div>
            <div style={{fontSize:11,color:'var(--sbl)',display:'flex',gap:12,flexWrap:'wrap'}}>
              <span>{client.name} · #{client.connNo}</span>
              <span style={{fontFamily:'DM Mono,monospace'}}>{loan.acc||'—'}</span>
              <span>{loan.bank||'—'}</span>
              <span>Security #{loan.security||'—'}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:16'}}>
            {!editing && <EditBtn onClick={startEdit} />}
            {editing && <><SaveBtn onClick={save}/><CancelBtn onClick={cancel}/></>}
          </div>
        </div>
        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          {[
            ['Current balance', fmt(loan.balance), '#fff'],
            ['Original limit', fmt(loan.amount), '#fff'],
            ['Interest rate', loan.rate>0?loan.rate.toFixed(2)+'%':'—', '#fff'],
            ['Rate type', loan.rateType||'Var', loan.rateType==='Fix'?'#EB99C2':'var(--sbl)'],
            ['Repayment', eRpmt, eRpmt==='P&I*'?'#EB99C2':'var(--sbl)'],
            ['Est. repayment', estRepayment?'$'+estRepayment.toLocaleString()+'/mo':'—', '#27ae60'],
          ].map(([label,val,color])=>(
            <div key={label} style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 12px'}}>
              <div style={{fontSize:10,color:'var(--sbl)',marginBottom:2}}>{label}</div>
              <div style={{fontSize:13,fontWeight:500,color:color||'#fff'}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <Panel style={{marginBottom:14}}>
          <PanelTitle>Edit loan details</PanelTitle>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:10}}>
            <FieldGroup label="Account no."><input style={inp} value={l.acc||''} onChange={e=>set('acc',e.target.value)}/></FieldGroup>
            <FieldGroup label="Loan name"><input style={inp} value={l.lname||''} onChange={e=>set('lname',e.target.value)}/></FieldGroup>
            <FieldGroup label="Bank"><input style={inp} value={l.bank||''} onChange={e=>set('bank',e.target.value)}/></FieldGroup>
            <FieldGroup label="Security #"><input style={inp} value={l.security||''} onChange={e=>set('security',e.target.value)}/></FieldGroup>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:10}}>
            <FieldGroup label="Original limit ($)"><input style={inp} type="number" value={l.amount||''} onChange={e=>set('amount',+e.target.value)}/></FieldGroup>
            <FieldGroup label="Current balance ($)"><input style={inp} type="number" value={l.balance||''} onChange={e=>set('balance',+e.target.value)}/></FieldGroup>
            <FieldGroup label="Interest rate (%)"><input style={inp} type="number" step="0.01" value={l.rate||''} onChange={e=>set('rate',+e.target.value)}/></FieldGroup>
            <FieldGroup label="Rate type">
              <select style={inp} value={l.rateType||'Var'} onChange={e=>set('rateType',e.target.value)}>
                <option value="Var">Variable (Var)</option>
                <option value="Fix">Fixed (Fix)</option>
              </select>
            </FieldGroup>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:10}}>
            <FieldGroup label="Repayment type">
              <select style={inp} value={l.rpmt||'P&I'} onChange={e=>set('rpmt',e.target.value)}>
                <option>P&I</option><option>IO</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Term (years)"><input style={inp} type="number" step="0.5" value={l.term||''} onChange={e=>set('term',+e.target.value)}/></FieldGroup>
            <FieldGroup label="IO period (years)"><input style={inp} type="number" step="0.5" value={l.ioTerm||''} onChange={e=>set('ioTerm',+e.target.value)}/></FieldGroup>
            <FieldGroup label="Est. repayment override ($)"><input style={inp} type="number" value={l.estRepayment||''} placeholder="Auto-calculated" onChange={e=>set('estRepayment',e.target.value?+e.target.value:null)}/></FieldGroup>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:10}}>
            <FieldGroup label="Fixed rate expiry"><input style={inp} value={l.fixed||''} placeholder="YYYY-MM-DD" onChange={e=>set('fixed',e.target.value)}/></FieldGroup>
            <FieldGroup label="IO expiry"><input style={inp} value={l.io||''} placeholder="YYYY-MM-DD" onChange={e=>set('io',e.target.value)}/></FieldGroup>
            <FieldGroup label="Balloon"><input style={inp} value={l.balloon||''} onChange={e=>set('balloon',e.target.value)}/></FieldGroup>
            <FieldGroup label="Settlement date"><input style={inp} value={l.settled||''} onChange={e=>set('settled',e.target.value)}/></FieldGroup>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
            <FieldGroup label="Asset / security description"><input style={inp} value={l.assetDesc||''} placeholder="e.g. 22 Smith St, Parramatta NSW" onChange={e=>set('assetDesc',e.target.value)}/></FieldGroup>
            <FieldGroup label="Borrowing entity"><input style={inp} value={l.borrowingEntity||''} onChange={e=>set('borrowingEntity',e.target.value)}/></FieldGroup>
          </div>
        </Panel>
      )}

      {/* Key loan details */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <Panel>
          <PanelTitle>Loan particulars</PanelTitle>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
            {[
              ['Borrowing entity', loan.borrowingEntity||'—'],
              ['Loan type', loan.type||'—'],
              ['Loan amount', fmt(loan.amount)],
              ['Interest rate', loan.rate>0?loan.rate.toFixed(2)+'%':'—'],
              ['Rate type', loan.rateType||'Var'],
              ['Term', loan.term?loan.term+'y':'—'],
              ['IO period', loan.ioTerm?loan.ioTerm+'y':'—'],
              ['Balloon', loan.balloon||'—'],
              ['Settlement date', fmtDate(loan.settled)],
              ['Asset / security', loan.assetDesc||'—'],
            ].map(([label,val])=>(
              <div key={label} style={{padding:'5px 0',borderBottom:'0.5px solid var(--border-light)',display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{fontSize:11,color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
                <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)',textAlign:'right'}}>{val}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelTitle>Key dates &amp; flags</PanelTitle>
          {[
            ['Fixed rate expiry', loan.fixed],
            ['Interest only expiry', loan.io],
            ['Balloon / residual', loan.balloon],
          ].map(([label, val])=>{
            const s = dateCellStyle(val)
            return (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                <span style={s}>{fmtDate(val)}</span>
              </div>
            )
          })}
          <div style={{marginTop:12}}>
            <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Repayment summary</div>
            {[
              ['Current repayment type', eRpmt + (eRpmt==='P&I*'?' (auto-switched from IO)':'')],
              ['Est. monthly repayment', estRepayment?'$'+estRepayment.toLocaleString():loan.rate?'—':'Rate not set'],
              ['Est. annual repayment', estRepayment?'$'+(estRepayment*12).toLocaleString():'—'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid var(--border-light)'}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
                <span style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>{val}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Amortisation schedule */}
      {schedule.length > 0 && (
        <Panel>
          <PanelTitle>Projected balance schedule ({MONTHS} months)</PanelTitle>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr>
                {['Month','EOM Balance','Est. Interest','Repayment'].map((h,i)=>(
                  <th key={h} style={{...th,textAlign:i>0?'right':'left',width:i===0?120:undefined}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {schedule.map((row,i)=>(
                  <tr key={i} style={{background:i%2===0?'transparent':'var(--bg)'}}>
                    <td style={td()}>{row.month}</td>
                    <td style={td({textAlign:'right',fontWeight:500,color:'var(--pk)'})}>${row.balance.toLocaleString()}</td>
                    <td style={td({textAlign:'right'})}>${row.interest.toLocaleString()}</td>
                    <td style={td({textAlign:'right'})}>${row.repayment.toLocaleString()}</td>
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
