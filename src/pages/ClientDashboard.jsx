import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { totalBal, totalAmt, pwBal, commBal, fmt, calcOpp, ini, LOAN_TYPES, BANKS } from '../lib/data'
import { fmtDate, dateCellStyle } from '../lib/dateUtils'
import { Panel, PanelTitle, StatCard, EditBtn, SaveBtn, CancelBtn, ActionBtn, FieldGroup, Pill } from '../components/UI'

const CONTACT_TYPES = ['Individual','Company','Trust','Partnership','Sole Trader']
const CONTACT_TYPE_CODES = { Individual:'Ind', Company:'Co', Trust:'Tru', Partnership:'Par', 'Sole Trader':'Sol' }

const th = (extra={}) => ({ textAlign:'left', padding:'6px 8px', background:'#2A3D54', color:'#fff', fontWeight:500, fontSize:10, letterSpacing:'0.03em', whiteSpace:'nowrap', ...extra })
const td = (extra={}) => ({ padding:'6px 8px', borderBottom:'0.5px solid var(--border-light)', color:'var(--text-primary)', verticalAlign:'middle', fontSize:11, ...extra })

export default function ClientDashboard({ clients, updateClient }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const [editSection, setEditSection] = useState(null)
  const [draft, setDraft] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [editOpp, setEditOpp] = useState(false)
  const [oppDraft, setOppDraft] = useState(null)

  if (!client) return <div style={{padding:24}}>Client not found.</div>

  const bal = totalBal(client), amt = totalAmt(client)
  const pw = pwBal(client), comm = commBal(client)
  const { criteria, total: oppAutoTotal } = calcOpp(client)

  // Manual opp override support
  const manualOpp = client.manualOpp || {}
  const oppCriteria = criteria.map(c => ({
    ...c,
    score: manualOpp[c.label] !== undefined ? manualOpp[c.label] : (c.met ? c.score : 0),
    met: manualOpp[c.label] !== undefined ? manualOpp[c.label] > 0 : c.met,
  }))
  const oppTotal = oppCriteria.reduce((s,o) => s + o.score, 0)
  const isPriority = oppTotal >= 25

  const initials = ini(client.name)

  function startEdit(section) {
    setEditSection(section)
    setDraft(JSON.parse(JSON.stringify(client[section] || [])))
  }
  function cancelEdit() { setEditSection(null); setDraft(null) }
  function saveEdit(section) {
    updateClient(client.name, c => ({ ...c, [section]: draft }))
    setEditSection(null); setDraft(null)
  }
  function addNote() {
    if (!noteText.trim()) return
    const entry = { id: Date.now(), date: new Date().toISOString().slice(0,10), text: noteText.trim() }
    updateClient(client.name, c => ({ ...c, notes: [entry, ...(c.notes||[])] }))
    setNoteText('')
  }
  function deleteNote(id) {
    updateClient(client.name, c => ({ ...c, notes: (c.notes||[]).filter(n => n.id !== id) }))
  }
  function saveOpp() {
    updateClient(client.name, c => ({ ...c, manualOpp: oppDraft }))
    setEditOpp(false); setOppDraft(null)
  }

  const editBtns = (section) => (
    <div style={{display:'flex',gap:4}}>
      {editSection === section
        ? <><SaveBtn onClick={() => saveEdit(section)} /><CancelBtn onClick={cancelEdit} /></>
        : <EditBtn onClick={() => startEdit(section)} />}
    </div>
  )

  // Date cell with conditional formatting
  const DateCell = ({ val }) => {
    if (!val) return <td style={td()}>—</td>
    const s = dateCellStyle(val)
    return <td style={td()}><span style={s}>{fmtDate(val)}</span></td>
  }

  const Contacts = () => editSection === 'contacts' ? (
    <div>
      {(draft||[]).map((ct,i) => (
        <div key={i} style={{background:'var(--bg)',borderRadius:8,padding:10,marginBottom:8,border:'0.5px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 120px auto',gap:6,alignItems:'end'}}>
            <FieldGroup label="Name"><input style={{width:'100%'}} value={ct.name||''} onChange={e=>{const d=[...draft];d[i]={...d[i],name:e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Email"><input style={{width:'100%'}} value={ct.email||''} onChange={e=>{const d=[...draft];d[i]={...d[i],email:e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Phone"><input style={{width:'100%'}} value={ct.phone||''} onChange={e=>{const d=[...draft];d[i]={...d[i],phone:e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Type">
              <select style={{width:'100%'}} value={ct.contactType||'Individual'} onChange={e=>{const d=[...draft];d[i]={...d[i],contactType:e.target.value};setDraft(d)}}>
                {CONTACT_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </FieldGroup>
            <button onClick={()=>{const d=[...draft];d.splice(i,1);setDraft(d)}} style={{padding:'4px 8px',borderRadius:6,border:'0.5px solid #fde8e8',background:'#fde8e8',color:'#c0392b',cursor:'pointer',alignSelf:'flex-end',marginBottom:2}}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={()=>setDraft([...(draft||[]),{name:'',email:'',phone:'',contactType:'Individual'}])} style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer',marginBottom:10}}>+ Add contact</button>
    </div>
  ) : (
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
      <thead><tr>
        <th style={th()}>Name</th>
        <th style={th()}>Type</th>
        <th style={th()}>Email</th>
        <th style={th()}>Phone</th>
      </tr></thead>
      <tbody>
        {(client.contacts||[]).length > 0
          ? (client.contacts||[]).map((ct,i) => (
            <tr key={i}>
              <td style={td({fontWeight:500})}>{ct.name||'—'}</td>
              <td style={td()}>{ct.contactType ? <span style={{background:'#eef1f5',color:'#2A3D54',padding:'1px 6px',borderRadius:20,fontSize:9,fontWeight:500}}>{CONTACT_TYPE_CODES[ct.contactType]||ct.contactType}</span> : '—'}</td>
              <td style={td({color:'var(--pk)'})}>{ct.email||'—'}</td>
              <td style={td()}>{ct.phone||'—'}</td>
            </tr>))
          : <tr><td colSpan={4} style={td({textAlign:'center',color:'var(--text-tertiary)',padding:16})}>No contacts yet — click Edit to add</td></tr>}
      </tbody>
    </table>
  )

  const Securities = () => editSection === 'securities' ? (
    <div>
      {(draft||[]).map((s,i) => (
        <div key={i} style={{background:'var(--bg)',borderRadius:8,padding:10,marginBottom:8,border:'0.5px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'40px 2fr 1fr 1fr 1fr auto',gap:6,alignItems:'end'}}>
            <FieldGroup label="#"><input style={{width:'100%'}} value={s.num||i+1} onChange={e=>{const d=[...draft];d[i]={...d[i],num:e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Address"><input style={{width:'100%'}} value={s.address||''} onChange={e=>{const d=[...draft];d[i]={...d[i],address:e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Last val. ($)"><input style={{width:'100%'}} type="number" value={s.lastVal||''} onChange={e=>{const d=[...draft];d[i]={...d[i],lastVal:+e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Est. value ($)"><input style={{width:'100%'}} type="number" value={s.estVal||''} onChange={e=>{const d=[...draft];d[i]={...d[i],estVal:+e.target.value};setDraft(d)}} /></FieldGroup>
            <FieldGroup label="Val. date"><input style={{width:'100%'}} value={s.valDate||''} placeholder="YYYY-MM-DD" onChange={e=>{const d=[...draft];d[i]={...d[i],valDate:e.target.value};setDraft(d)}} /></FieldGroup>
            <button onClick={()=>{const d=[...draft];d.splice(i,1);setDraft(d)}} style={{padding:'4px 8px',borderRadius:6,border:'0.5px solid #fde8e8',background:'#fde8e8',color:'#c0392b',cursor:'pointer',alignSelf:'flex-end',marginBottom:2}}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={()=>setDraft([...(draft||[]),{num:(draft||[]).length+1,address:'',lastVal:0,estVal:0,valDate:''}])} style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer',marginBottom:10}}>+ Add security</button>
    </div>
  ) : (
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
      <thead><tr>
        {['#','Address','Last val.','Est. value','Debt','Equity'].map((h,i)=>(
          <th key={h} style={th({textAlign:i>1?'right':'left'})}>{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {(client.securities||[]).length > 0
          ? [...(client.securities||[]).map((s,i)=>{
              const debt = client.loans.filter(l=>String(l.security)===String(s.num||i+1)).reduce((x,l)=>x+l.balance,0)
              const eq = (s.estVal||0) - debt
              return <tr key={i}>
                <td style={td({color:'var(--pk)',fontWeight:500})}>{s.num||i+1}</td>
                <td style={td()}>{s.address||'—'}</td>
                <td style={td({textAlign:'right'})}>{s.lastVal?fmt(s.lastVal):'—'}</td>
                <td style={td({textAlign:'right',fontWeight:500})}>{s.estVal?fmt(s.estVal):'—'}</td>
                <td style={td({textAlign:'right'})}>{fmt(debt)}</td>
                <td style={td({textAlign:'right',color:eq>0?'#27ae60':'#c0392b'})}>{s.estVal?fmt(eq):'—'}</td>
              </tr>
            }),
            <tr key="total" style={{background:'#2A3D54'}}>
              <td colSpan={3} style={{...td(),color:'#fff',fontWeight:500}}>Total</td>
              <td style={{...td(),color:'#fff',fontWeight:500,textAlign:'right'}}>{fmt((client.securities||[]).reduce((s,x)=>s+(x.estVal||0),0))}</td>
              <td style={{...td(),color:'#fff',fontWeight:500,textAlign:'right'}}>{fmt(bal)}</td>
              <td style={{...td(),color:'#EB99C2',fontWeight:500,textAlign:'right'}}>{fmt((client.securities||[]).reduce((s,x)=>s+(x.estVal||0),0)-bal)}</td>
            </tr>]
          : <tr><td colSpan={6} style={td({textAlign:'center',color:'var(--text-tertiary)',padding:16})}>No securities yet — click Edit to add</td></tr>}
      </tbody>
    </table>
  )

  const loanRows = editSection === 'loans'
    ? (draft||[]).map((l,i) => (
      <tr key={i}>
        <td style={td({color:'var(--pk)',fontWeight:500,width:24})}>{i+1}</td>
        <td><input value={l.acc||''} onChange={e=>{const d=[...draft];d[i]={...d[i],acc:e.target.value};setDraft(d)}} style={{width:90,fontSize:10}} /></td>
        <td><input value={l.lname||''} onChange={e=>{const d=[...draft];d[i]={...d[i],lname:e.target.value};setDraft(d)}} style={{width:120,fontSize:10}} /></td>
        <td><select value={l.type||''} onChange={e=>{const d=[...draft];d[i]={...d[i],type:e.target.value};setDraft(d)}} style={{width:120,fontSize:10}}>
          {LOAN_TYPES.map(t=><option key={t}>{t}</option>)}
        </select></td>
        <td><select value={l.bank||''} onChange={e=>{const d=[...draft];d[i]={...d[i],bank:e.target.value};setDraft(d)}} style={{width:70,fontSize:10}}>
          {BANKS.map(b=><option key={b}>{b}</option>)}
        </select></td>
        <td><input value={l.security||''} onChange={e=>{const d=[...draft];d[i]={...d[i],security:e.target.value};setDraft(d)}} style={{width:30,fontSize:10,textAlign:'center'}} /></td>
        <td><input type="number" value={l.amount||''} onChange={e=>{const d=[...draft];d[i]={...d[i],amount:+e.target.value};setDraft(d)}} style={{width:80,fontSize:10}} /></td>
        <td><input type="number" value={l.balance||''} onChange={e=>{const d=[...draft];d[i]={...d[i],balance:+e.target.value};setDraft(d)}} style={{width:80,fontSize:10}} /></td>
        <td><input type="number" step="0.01" value={l.rate||''} onChange={e=>{const d=[...draft];d[i]={...d[i],rate:+e.target.value};setDraft(d)}} style={{width:50,fontSize:10}} /></td>
        <td><select value={l.rpmt||'P&I'} onChange={e=>{const d=[...draft];d[i]={...d[i],rpmt:e.target.value};setDraft(d)}} style={{width:50,fontSize:10}}>
          <option>P&I</option><option>IO</option>
        </select></td>
        <td><input type="number" step="0.5" value={l.term||''} onChange={e=>{const d=[...draft];d[i]={...d[i],term:+e.target.value};setDraft(d)}} style={{width:40,fontSize:10}} /></td>
        <td><input value={l.fixed||''} placeholder="YYYY-MM-DD" onChange={e=>{const d=[...draft];d[i]={...d[i],fixed:e.target.value};setDraft(d)}} style={{width:90,fontSize:10}} /></td>
        <td><input value={l.io||''} placeholder="YYYY-MM-DD" onChange={e=>{const d=[...draft];d[i]={...d[i],io:e.target.value};setDraft(d)}} style={{width:90,fontSize:10}} /></td>
        <td><input value={l.balloon||''} onChange={e=>{const d=[...draft];d[i]={...d[i],balloon:e.target.value};setDraft(d)}} style={{width:60,fontSize:10}} /></td>
        <td><input value={l.settled||''} onChange={e=>{const d=[...draft];d[i]={...d[i],settled:e.target.value};setDraft(d)}} style={{width:90,fontSize:10}} /></td>
        <td><button onClick={()=>{const d=[...draft];d.splice(i,1);setDraft(d)}} style={{padding:'2px 6px',borderRadius:4,border:'0.5px solid #fde8e8',background:'#fde8e8',color:'#c0392b',cursor:'pointer',fontSize:10}}>✕</button></td>
      </tr>))
    : client.loans.map((l,i) => (
      <tr key={i} onMouseOver={e=>e.currentTarget.style.background='var(--bg)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
        <td style={td({color:'var(--pk)',fontWeight:500,width:24})}>{i+1}</td>
        <td style={td()}><span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'var(--text-secondary)'}}>{l.acc&&l.acc!=='nan'?l.acc:'—'}</span></td>
        <td style={{...td(),maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.lname||'—'}</td>
        <td style={td()}><Pill label={l.type||'—'} variant={['Commercial Property','Lease Doc','Term'].includes(l.type)?'comm':'pw'} /></td>
        <td style={td()}>{l.bank||'—'}</td>
        <td style={td({textAlign:'center'})}>{l.security||'—'}</td>
        <td style={td({textAlign:'right'})}>{fmt(l.amount)}</td>
        <td style={td({textAlign:'right',color:'var(--pk)',fontWeight:500})}>{fmt(l.balance)}</td>
        <td style={td({textAlign:'right'})}>{l.rate>0?l.rate.toFixed(2)+'%':'—'}</td>
        <td style={td()}><Pill label={l.rpmt||'—'} variant={l.rpmt==='IO'?'io':'pi'} /></td>
        <td style={td({textAlign:'right'})}>{l.term||'—'}</td>
        <td style={td()}>{l.fixed ? <span style={dateCellStyle(l.fixed)}>{fmtDate(l.fixed)}</span> : '—'}</td>
        <td style={td()}>{l.io ? <span style={dateCellStyle(l.io)}>{fmtDate(l.io)}</span> : '—'}</td>
        <td style={td()}>{l.balloon ? <span style={dateCellStyle(l.balloon)}>{fmtDate(l.balloon)}</span> : '—'}</td>
        <td style={td()}>{fmtDate(l.settled)}</td>
      </tr>))

  return (
    <div style={{padding:'16px 24px'}}>
      <button onClick={()=>navigate('/radar/clients')} style={{display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-secondary)',marginBottom:14}}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to all clients
      </button>

      {/* Header */}
      <div style={{background:'#2A3D54',borderRadius:10,padding:'16px 20px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:46,height:46,borderRadius:'50%',background:'var(--pk)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:500,color:'#fff'}}>{initials}</div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{fontSize:17,fontWeight:500,color:'#fff'}}>{client.name}</div>
                {isPriority && <span style={{background:'var(--pk)',color:'#fff',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:500}}>★ Priority</span>}
              </div>
              <div style={{fontSize:11,color:'var(--sbl)',marginTop:3,display:'flex',gap:10}}>
                <span>Connection #{client.connNo}</span>
                <span>{client.stream}</span>
                <span>Last review: {client.days>0?`${client.days} days ago`:'Today'}</span>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:16}}>
            {[['Private Wealth',fmt(pw)],['Commercial',fmt(comm)],['Total exposure',fmt(bal)]].map(([label,val])=>(
              <div key={label} style={{textAlign:'right'}}>
                <div style={{fontSize:17,fontWeight:500,color:'#fff'}}>{val}</div>
                <div style={{fontSize:10,color:'var(--sbl)'}}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
          {[['Current balance',fmt(bal)],['Original limit',fmt(amt)],['Est. equity',fmt(Math.max(0,amt-bal))],['Accounts',client.loans.length],['Opp. score',oppTotal]].map(([label,val],i)=>(
            <div key={label} style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 12px'}}>
              <div style={{fontSize:14,fontWeight:500,color:i===4?(isPriority?'#EB99C2':'var(--pk)'):'#fff'}}>{val}</div>
              <div style={{fontSize:10,color:'var(--sbl)',marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contacts & Securities */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <Panel><PanelTitle action={editBtns('contacts')}>Clients & contacts</PanelTitle><Contacts /></Panel>
        <Panel><PanelTitle action={editBtns('securities')}>Securities & property values</PanelTitle><Securities /></Panel>
      </div>

      {/* Loans */}
      <Panel style={{marginBottom:14}}>
        <PanelTitle action={
          <div style={{display:'flex',gap:4}}>
            {editSection==='loans'
              ? <><button onClick={()=>{const newL={acc:'',lname:'',type:'Home Loan (OO)',bank:'CBA',security:'',amount:0,balance:0,rate:0,rpmt:'P&I',term:30,ioTerm:0,fixed:'',io:'',balloon:'',settled:new Date().toISOString().slice(0,10)};setDraft([...(draft||[]),newL])}} style={{fontSize:10,padding:'3px 9px',borderRadius:6,border:'0.5px solid #27ae60',background:'transparent',color:'#27ae60',cursor:'pointer'}}>+ Add loan</button>
                <SaveBtn onClick={()=>saveEdit('loans')} /><CancelBtn onClick={cancelEdit} /></>
              : <EditBtn onClick={()=>{setEditSection('loans');setDraft(JSON.parse(JSON.stringify(client.loans)))}} />}
          </div>}>
          Loan facilities ({client.loans.length})
        </PanelTitle>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,tableLayout:'fixed'}}>
            <thead><tr>
              {[['#',24],['Acc. no.',90],['Loan name',130],['Type',110],['Bank',50],['Sec.',30],['Original limit',90],['Balance',90],['Rate',55],['Rpmt',45],['Term',40],['Fixed exp.',90],['IO exp.',90],['Balloon',65],['Settled',85],...(editSection==='loans'?[['',30]]:[])].map(([h,w])=>(
                <th key={h} style={th({width:w,textAlign:['Original limit','Balance','Rate','Term'].includes(h)?'right':'left'})}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {client.loans.length>0||editSection==='loans'
                ? loanRows
                : <tr><td colSpan={15} style={td({textAlign:'center',color:'var(--text-tertiary)',padding:20})}>No loan accounts — click Edit to add</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Opp score & Notes */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {/* Opportunity score */}
        <Panel>
          <PanelTitle action={
            editOpp
              ? <div style={{display:'flex',gap:4}}><SaveBtn onClick={saveOpp} /><CancelBtn onClick={()=>{setEditOpp(false);setOppDraft(null)}} /></div>
              : <EditBtn onClick={()=>{setEditOpp(true);setOppDraft({...manualOpp})}} />
          }>
            Opportunity score breakdown
          </PanelTitle>
          {(editOpp ? criteria : oppCriteria).map((o,i) => {
            const currentScore = editOpp ? (oppDraft[o.label]!==undefined?oppDraft[o.label]:(o.met?o.score:0)) : o.score
            return (
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 8px',background:'var(--bg)',borderRadius:6,marginBottom:4,fontSize:11}}>
                <span>{o.label}</span>
                {editOpp
                  ? <select value={currentScore} onChange={e=>{setOppDraft(d=>({...d,[o.label]:+e.target.value}))}}
                      style={{fontSize:11,padding:'2px 6px',borderRadius:6,border:'0.5px solid var(--border)',background:'var(--surface)',color:'var(--text-primary)',width:60}}>
                      <option value={0}>0</option>
                      <option value={5}>5</option>
                    </select>
                  : <span style={{fontWeight:500,padding:'1px 7px',borderRadius:10,fontSize:10,background:o.score>0?'#fce8f3':'var(--bg)',color:o.score>0?'var(--pk)':'var(--text-secondary)',border:o.score>0?'none':'0.5px solid var(--border)'}}>{o.score}</span>}
              </div>
            )
          })}
          <div style={{background:'#2A3D54',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:10}}>
            <span style={{fontSize:12,color:'var(--sbl)'}}>Total opportunity score</span>
            <div style={{textAlign:'right'}}>
              <span style={{fontSize:20,fontWeight:500,color:isPriority?'#EB99C2':'var(--pk)'}}>{editOpp?Object.values(oppDraft).reduce((s,v)=>s+v,0):oppTotal}</span>
              {isPriority && !editOpp && <div style={{fontSize:9,color:'#EB99C2'}}>Priority client ★</div>}
            </div>
          </div>
        </Panel>

        {/* Notes */}
        <Panel>
          <PanelTitle>Contact notes & history</PanelTitle>
          <div style={{minHeight:80,marginBottom:10,maxHeight:220,overflowY:'auto'}}>
            {(client.notes||[]).length>0
              ? (client.notes||[]).map((n,i)=>(
                <div key={n.id||i} style={{paddingBottom:8,marginBottom:8,borderBottom:'0.5px solid var(--border-light)',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:'var(--pk)',fontWeight:500,marginBottom:2}}>{fmtDate(n.date)}</div>
                    <div style={{fontSize:11,color:'var(--text-primary)',lineHeight:1.5}}>{n.text}</div>
                  </div>
                  <button onClick={()=>deleteNote(n.id||i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:14,lineHeight:1,flexShrink:0,marginTop:1}}
                    onMouseOver={e=>e.target.style.color='#c0392b'} onMouseOut={e=>e.target.style.color='var(--text-tertiary)'}>×</button>
                </div>))
              : <div style={{color:'var(--text-tertiary)',fontSize:11,padding:'8px 0'}}>No notes yet. Log your first contact below.</div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder="Add a note — review outcome, call summary, next steps..."
              style={{width:'100%',fontSize:12,minHeight:60,padding:8,borderRadius:6,border:'0.5px solid var(--border)',background:'var(--bg)',color:'var(--text-primary)',lineHeight:1.6}} />
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={addNote} style={{fontSize:10,padding:'4px 12px',borderRadius:6,background:'#27ae60',border:'0.5px solid #27ae60',color:'#fff',cursor:'pointer'}}>Log note</button>
              <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{fmtDate(new Date().toISOString().slice(0,10))}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <ActionBtn variant="filled" label="Draft review email" onClick={()=>{}} />
            <ActionBtn variant="blue" label="Identify opportunities" onClick={()=>{}} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
