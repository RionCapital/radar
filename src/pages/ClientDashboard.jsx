import React, { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { totalBal, totalAmt, pwBal, commBal, fmt, calcOpp, ini, LOAN_TYPES, BANKS } from '../lib/data'
import { fmtDate, dateCellStyle, loanFlag, effectiveRpmt, calcRepayment } from '../lib/dateUtils'
import { Panel, PanelTitle, EditBtn, SaveBtn, CancelBtn, ActionBtn, FieldGroup, Pill, DateInput } from '../components/UI'

const CONTACT_TYPES = ['Individual','Company','Trust','Partnership','Sole Trader']
const CONTACT_TYPE_CODES = { Individual:'Ind', Company:'Co', Trust:'Tru', Partnership:'Par', 'Sole Trader':'Sol' }
const thStyle = (extra={}) => ({ textAlign:'left', padding:'6px 8px', background:'#3D5570', color:'#fff', fontWeight:500, fontSize:10, letterSpacing:'0.03em', whiteSpace:'nowrap', ...extra })
const tdStyle = (extra={}) => ({ padding:'6px 8px', borderBottom:'0.5px solid var(--border-light)', color:'var(--text-primary)', verticalAlign:'middle', fontSize:11, ...extra })

// ── Proper external components so re-renders don't kill focus ──

function ContactsEdit({ draft, setDraft }) {
  return (
    <div>
      {(draft||[]).map((ct,i) => (
        <div key={i} style={{background:'var(--bg)',borderRadius:8,padding:10,marginBottom:8,border:'0.5px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 120px auto',gap:6,alignItems:'end'}}>
            <FieldGroup label="Name">
              <input style={{width:'100%'}} value={ct.name||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, name:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Email">
              <input style={{width:'100%'}} value={ct.email||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, email:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Phone">
              <input style={{width:'100%'}} value={ct.phone||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, phone:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Type">
              <select style={{width:'100%'}} value={ct.contactType||'Individual'} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, contactType:e.target.value} : x)
                setDraft(d)
              }}>
                {CONTACT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </FieldGroup>
            <button onClick={() => setDraft(draft.filter((_,j)=>j!==i))}
              style={{padding:'4px 8px',borderRadius:6,border:'0.5px solid #fde8e8',background:'#fde8e8',color:'#c0392b',cursor:'pointer',alignSelf:'flex-end',marginBottom:2}}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={() => setDraft([...(draft||[]), {name:'',email:'',phone:'',contactType:'Individual'}])}
        style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer',marginBottom:10}}>
        + Add contact
      </button>
    </div>
  )
}

const TYPE_LABELS = { Ind: 'Individual', Co: 'Company', Tru: 'Trust', SMSF: 'SMSF', Part: 'Partnership' }

function ContactsView({ contacts, clientName, navigate }) {
  const indContacts = (contacts||[]).filter(c => c.type === 'Ind')
  const otherContacts = (contacts||[]).filter(c => c.type !== 'Ind')
  const allContacts = [...indContacts, ...otherContacts]
  if (!allContacts.length) return (
    <div style={{textAlign:'center',color:'var(--text-tertiary)',padding:16,fontSize:11}}>No contacts on file — <span style={{color:'var(--pk)',cursor:'pointer'}} onClick={()=>navigate('/radar/clients/'+encodeURIComponent(clientName)+'/contacts')}>Add contacts</span></div>
  )
  return (
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
      <thead><tr>
        <th style={thStyle()}>Name</th>
        <th style={thStyle()}>Type</th>
        <th style={thStyle()}>Email</th>
        <th style={thStyle()}>Mobile</th>
      </tr></thead>
      <tbody>
        {allContacts.map((ct,i) => {
          const fullName = ct.type === 'Ind' ? [ct.first, ct.last].filter(Boolean).join(' ') : ct.first || '—'
          return (
            <tr key={i}>
              <td style={tdStyle({fontWeight:500})}>{fullName||'—'}</td>
              <td style={tdStyle()}>
                <span style={{background:ct.type==='Ind'?'#fdf0f6':'#eef1f5',color:ct.type==='Ind'?'var(--pk)':'#2A3D54',padding:'1px 6px',borderRadius:20,fontSize:9,fontWeight:500}}>
                  {TYPE_LABELS[ct.type]||ct.type}
                </span>
              </td>
              <td style={tdStyle()}>
                {ct.email
                  ? <a href={'mailto:'+ct.email} style={{color:'var(--pk)',textDecoration:'none',fontSize:11}} title="Open in Outlook">{ct.email}</a>
                  : '—'}
              </td>
              <td style={tdStyle()}>
                {ct.mobile
                  ? <span style={{display:'flex',alignItems:'center',gap:6}}>
                      <a href={'tel:'+ct.mobile.replace(/\s/g,'')} style={{color:'var(--pk)',textDecoration:'none'}} title="Call via Phone Link">{ct.mobile}</a>
                      <a href={'sms:'+ct.mobile.replace(/\s/g,'')} style={{background:'#eef1f5',borderRadius:12,padding:'1px 7px',fontSize:9,color:'#2A3D54',textDecoration:'none'}} title="Send SMS via Phone Link">💬</a>
                    </span>
                  : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function SecuritiesEdit({ draft, setDraft }) {
  return (
    <div>
      {(draft||[]).map((s,i) => (
        <div key={i} style={{background:'var(--bg)',borderRadius:8,padding:10,marginBottom:8,border:'0.5px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'40px 2fr 1fr 1fr 1fr 60px 120px auto',gap:6,alignItems:'end'}}>
            <FieldGroup label="#">
              <input style={{width:'100%'}} value={s.num||i+1} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, num:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Address">
              <input style={{width:'100%'}} value={s.address||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, address:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Last val. ($)">
              <input style={{width:'100%'}} type="number" value={s.lastVal||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, lastVal:+e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Est. value ($)">
              <input style={{width:'100%'}} type="number" value={s.estVal||''} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, estVal:+e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Val. date">
              <input style={{width:'100%'}} value={s.valDate||''} type="date" onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, valDate:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="LVR %">
              <input style={{width:'100%'}} type="number" step="1" min="0" max="100" value={s.lvr!==undefined?s.lvr:80} onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, lvr:+e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <FieldGroup label="Crossed with securities (comma-sep, e.g. 1,2,3)">
              <input style={{width:'100%'}} value={s.crossed||''} placeholder="e.g. 1,2" onChange={e => {
                const d = draft.map((x,j) => j===i ? {...x, crossed:e.target.value} : x)
                setDraft(d)
              }}/>
            </FieldGroup>
            <button onClick={() => setDraft(draft.filter((_,j)=>j!==i))}
              style={{padding:'4px 8px',borderRadius:6,border:'0.5px solid #fde8e8',background:'#fde8e8',color:'#c0392b',cursor:'pointer',alignSelf:'flex-end',marginBottom:2}}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={() => setDraft([...(draft||[]), {num:(draft||[]).length+1,address:'',lastVal:0,estVal:0,valDate:''}])}
        style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer',marginBottom:10}}>
        + Add security
      </button>
    </div>
  )
}

function SecuritiesView({ securities, loans, bal }) {
  if (!(securities||[]).length) return (
    <div style={{textAlign:'center',color:'var(--text-tertiary)',padding:16,fontSize:11}}>No securities yet — click Edit to add</div>
  )
  const crossLoans = loans.filter(l => l.crossed && l.crossed.trim() && !l.closed)
  const crossDebt = crossLoans.reduce((s,l) => s + (l.balance||0), 0)
  const totalEstVal = (securities||[]).reduce((s,x) => s + (x.estVal||0), 0)
  const totalLendingEquity = (securities||[]).reduce((s,x) => {
    const secNum = String(x.num||'').trim()
    const directDebt = loans.filter(l => !l.closed && String(l.security||'').trim()===secNum && !(l.crossed&&l.crossed.trim())).reduce((t,l)=>t+l.balance,0)
    return s + Math.round((x.estVal||0) * ((x.lvr!==undefined?x.lvr:80)/100) - directDebt)
  }, 0) - crossDebt
  const totalActualLVR = totalEstVal > 0 ? Math.round(bal / totalEstVal * 100) : 0

  return (
    <div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,tableLayout:'fixed'}}>
        <colgroup>
          <col style={{width:'4%'}}/>
          <col style={{width:'32%'}}/>
          <col style={{width:'13%'}}/>
          <col style={{width:'13%'}}/>
          <col style={{width:'14%'}}/>
          <col style={{width:'8%'}}/>
          <col style={{width:'16%'}}/>
        </colgroup>
        <thead>
          <tr>
            {['#','Address','Est. value','Debt balance','Lending equity','LVR',crossLoans.length?'Actual LVR *':'Actual LVR'].map((h,i)=>(
              <th key={i} style={thStyle({textAlign:i>1?'right':'left'})}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(securities||[]).map((s,i) => {
            const secNum = String(s.num||i+1)
            const isCrossed = crossLoans.some(l => l.crossed && l.crossed.split(',').map(x=>x.trim()).includes(secNum))
            const directDebt = loans.filter(l => !l.closed && String(l.security||'').trim()===secNum && !(l.crossed&&l.crossed.trim())).reduce((t,l)=>t+l.balance,0)
            const lvr = s.lvr !== undefined ? s.lvr : 80
            const lendingEquity = s.estVal ? Math.round(s.estVal * lvr/100 - directDebt) : null
            const actualLVR = s.estVal && directDebt > 0 ? Math.round(directDebt/s.estVal*100) : 0
            return (
              <tr key={i} onMouseOver={e=>e.currentTarget.style.background='var(--bg)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                <td style={tdStyle({color:'var(--pk)',fontWeight:500})}>{secNum}</td>
                <td style={tdStyle()}>{s.address||'—'}</td>
                <td style={tdStyle({textAlign:'right',fontWeight:500})}>{s.estVal?fmt(s.estVal):'—'}</td>
                <td style={tdStyle({textAlign:'right'})}>
                  {fmt(directDebt)}{isCrossed && <span style={{color:'#e8a020',fontSize:10,marginLeft:3,fontWeight:700}}>*</span>}
                </td>
                <td style={tdStyle({textAlign:'right',color:lendingEquity>0?'#27ae60':'#c0392b'})}>{lendingEquity!==null?fmt(lendingEquity):'—'}</td>
                <td style={tdStyle({textAlign:'right'})}>{lvr}%</td>
                <td style={tdStyle({textAlign:'right'})}>
                  {actualLVR>0?actualLVR+'%':'—'}{isCrossed && <span style={{color:'#e8a020',fontSize:10,marginLeft:3,fontWeight:700}}>*</span>}
                </td>
              </tr>
            )
          })}
          {crossLoans.length > 0 && (
            <tr style={{background:'#fef9c3'}}>
              <td style={{...tdStyle(),color:'#854F0B',fontWeight:700,fontSize:12}}>*</td>
              <td style={{...tdStyle(),color:'#854F0B',fontSize:11}}>
                <strong>Shared</strong> — Crossed security loan (securities {crossLoans[0].crossed})
              </td>
              <td style={tdStyle({textAlign:'right',color:'#854F0B'})}>—</td>
              <td style={tdStyle({textAlign:'right',color:'#854F0B'})}>—</td>
              <td style={{...tdStyle(),textAlign:'right',color:'#854F0B',fontWeight:500}}>{fmt(crossDebt)}</td>
              <td style={{...tdStyle(),textAlign:'right',color:'#854F0B'}}>—</td>
              <td style={tdStyle({color:'#854F0B',textAlign:'right'})}>—</td>
            </tr>
          )}
          <tr style={{background:'#3D5570'}}>
            <td colSpan={2} style={{...tdStyle(),color:'#fff',fontWeight:500}}>Total</td>
            <td style={{...tdStyle(),color:'#fff',fontWeight:500,textAlign:'right'}}>{fmt(totalEstVal)}</td>
            <td style={{...tdStyle(),color:'#fff',fontWeight:500,textAlign:'right'}}>{fmt(bal)}</td>
            <td style={{...tdStyle(),color:'#EB99C2',fontWeight:500,textAlign:'right'}}>{fmt(totalLendingEquity)}</td>
            <td style={{...tdStyle(),color:'var(--sbl)',fontSize:10,textAlign:'right'}}>—</td>
            <td style={{...tdStyle(),color:'#EB99C2',fontWeight:500,textAlign:'right'}}>{totalActualLVR}%</td>
          </tr>
        </tbody>
      </table>
      {crossLoans.length > 0 && (
        <div style={{fontSize:10,color:'#854F0B',marginTop:6,padding:'6px 10px',background:'#FAEEDA',borderRadius:6,borderLeft:'3px solid #e8a020',lineHeight:1.5}}>
          * Debt balance and actual LVR for crossed securities exclude the shared facility ({fmt(crossDebt)} — acc. {crossLoans.map(l=>l.acc||l.lname).join(', ')}). Shared debt is included in the total. Actual LVR is indicative only.
        </div>
      )}
    </div>
  )
}

// ── Main component ──

export default function ClientDashboard({ clients, updateClient }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const [editSection, setEditSection] = useState(null)
  const [draft, setDraft] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [editReview, setEditReview] = useState(false)
  const [reviewDate, setReviewDate] = useState('')
  const [loanTab, setLoanTab] = useState('current')
  const [loanSort, setLoanSort] = useState({col: null, dir: 'asc'})
  const [editingLoanIdx, setEditingLoanIdx] = useState(null)
  const [loanDraft, setLoanDraft] = useState(null)
  const [secPicker, setSecPicker] = useState(null) // loanIdx for picker open
  const [pickerPos, setPickerPos] = useState({top:0,left:0})

  // Stable setDraft callback so child edit components don't remount
  const stableSetDraft = useCallback(val => setDraft(val), [])

  if (!client) return <div style={{padding:24}}>Client not found.</div>

  const bal = totalBal(client), amt = totalAmt(client)
  const pw = pwBal(client), comm = commBal(client)
  const { criteria } = calcOpp(client)
  const manualOpp = client.manualOpp || {}
  const oppCriteria = criteria.map(c => ({...c,
    score: manualOpp[c.label]!==undefined ? manualOpp[c.label] : (c.met?c.score:0),
    met:   manualOpp[c.label]!==undefined ? manualOpp[c.label]>0 : c.met,
  }))
  const oppTotal = oppCriteria.reduce((s,o)=>s+o.score,0)
  const isPriority = oppTotal >= 25

  const worstFlag = client.loans.reduce((worst,l) => {
    const f = loanFlag(l)
    if (f==='overdue') return 'overdue'
    if (f==='warn' && worst!=='overdue') return 'warn'
    return worst
  }, client.days >= 365 ? 'overdue' : null)
  const flagStyle = worstFlag==='overdue' ? {background:'#fde8e8',color:'#a32d2d'} : worstFlag==='warn' ? {background:'#fef9c3',color:'#854F0B'} : null

  function startEdit(section) { setEditSection(section); setDraft(JSON.parse(JSON.stringify(client[section]||[]))) }
  function cancelEdit() { setEditSection(null); setDraft(null) }
  function saveEdit(section) { updateClient(client.name, c=>({...c,[section]:draft})); setEditSection(null); setDraft(null) }

  function addNote() {
    if (!noteText.trim()) return
    const entry = { id:Date.now(), date:new Date().toISOString().slice(0,10), text:noteText.trim() }
    updateClient(client.name, c=>({...c, notes:[entry,...(c.notes||[])]}))
    setNoteText('')
  }
  function deleteNote(id) { updateClient(client.name, c=>({...c, notes:(c.notes||[]).filter(n=>n.id!==id)})) }
  function saveReviewDate() {
    if (!reviewDate) return
    updateClient(client.name, c=>({...c, lastReviewDate:reviewDate, days:0}))
    setEditReview(false); setReviewDate('')
  }

  const editBtns = (section) => (
    <div style={{display:'flex',gap:4}}>
      {editSection===section
        ? <><SaveBtn onClick={()=>saveEdit(section)}/><CancelBtn onClick={cancelEdit}/></>
        : <EditBtn onClick={()=>startEdit(section)}/>}
    </div>
  )

  return (
    <div style={{padding:'16px 24px'}}>
      <button onClick={()=>navigate('/radar/clients')}
        style={{display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-secondary)',marginBottom:14}}
        onMouseOver={e=>e.currentTarget.style.color='var(--pk)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
        ← Back to all clients
      </button>

      {/* Header */}
      <div style={{background:'#3D5570',borderRadius:10,padding:'16px 20px',marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
          {/* Name + review */}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{width:42,height:42,borderRadius:'50%',background:'var(--pk)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:500,color:'#fff',flexShrink:0}}>{ini(client.name)}</div>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{fontSize:16,fontWeight:500,color:'#fff'}}>{client.name}</div>
                  {isPriority && <span style={{background:'var(--pk)',color:'#fff',padding:'1px 7px',borderRadius:20,fontSize:9,fontWeight:500}}>★ Priority</span>}
                  {flagStyle && <span style={{padding:'1px 7px',borderRadius:20,fontSize:9,fontWeight:500,...flagStyle}}>⚠ Flag</span>}
                </div>
                <div style={{fontSize:11,color:'var(--sbl)',marginTop:2}}>{client.stream} · #{client.connNo}</div>
              </div>
            </div>
            <div style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'8px 12px'}}>
              <div style={{fontSize:10,color:'var(--sbl)',marginBottom:4}}>Last review date</div>
              {editReview ? (
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)}
                    style={{fontSize:11,padding:'3px 6px',borderRadius:6,border:'0.5px solid var(--border)',background:'rgba(255,255,255,0.1)',color:'#fff',width:130}}/>
                  <button onClick={saveReviewDate} style={{fontSize:10,padding:'3px 8px',borderRadius:6,background:'#27ae60',border:'none',color:'#fff',cursor:'pointer'}}>Save</button>
                  <button onClick={()=>setEditReview(false)} style={{fontSize:10,padding:'3px 8px',borderRadius:6,background:'transparent',border:'0.5px solid rgba(255,255,255,0.3)',color:'#fff',cursor:'pointer'}}>Cancel</button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:500,color:'#fff'}}>{client.lastReviewDate?fmtDate(client.lastReviewDate):'Not set'}</span>
                  <button onClick={()=>{setEditReview(true);setReviewDate(client.lastReviewDate||new Date().toISOString().slice(0,10))}}
                    style={{fontSize:10,padding:'2px 8px',borderRadius:6,border:'0.5px solid rgba(218,64,141,0.5)',background:'transparent',color:'var(--spk)',cursor:'pointer'}}>Update</button>
                </div>
              )}
            </div>
          </div>
          {/* Balances */}
          <div style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'var(--sbl)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Balances</div>
            {[['Private Wealth',fmt(pw)],['Commercial',fmt(comm)],['Total exposure',fmt(bal)]].map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                <span style={{color:'var(--sbl)'}}>{l}</span>
                <span style={{color:'#fff',fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
          {/* Portfolio */}
          <div style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'var(--sbl)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Portfolio</div>
            {[['Opp. score ↗',oppTotal,isPriority?'#EB99C2':'var(--pk)'],['No. of accounts',client.loans.length,'#fff'],['Days since review',client.days>0?client.days+'d':'Today',client.days>365?'#e74c3c':client.days>180?'#e8a020':'#27ae60']].map(([l,v,c])=>(
              <div key={l} onClick={l.includes('↗')?()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/opportunity`):undefined}
                style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3,cursor:l.includes('↗')?'pointer':'default',borderRadius:4,padding:'1px 3px',transition:'background 0.15s'}}
                onMouseOver={e=>l.includes('↗')&&(e.currentTarget.style.background='rgba(218,64,141,0.2)')}
                onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                <span style={{color:'var(--sbl)'}}>{l}</span>
                <span style={{color:c||'#fff',fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
          {/* Flags */}
          <div style={{background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'var(--sbl)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Flags</div>
            {(() => {
              const flagItems = []
              // Annual review overdue (days >= 365)
              if (client.days >= 365) {
                flagItems.push(
                  <div key="review" style={{fontSize:11,padding:'3px 0',display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:'#e74c3c',display:'inline-block',flexShrink:0}}/>
                    <span style={{color:'#fca5a5',fontSize:10}}>Annual review overdue ({client.days}d)</span>
                  </div>
                )
              }
              // Loan-level flags (IO, fixed, balloon) — skip if actioned
              client.loans.forEach((l,i) => {
                const f = loanFlag(l)
                if (!f) return
                const isActioned = l.actionNotes && l.actionNotes.length > 0
                if (isActioned) return
                flagItems.push(
                  <div key={i} style={{fontSize:11,padding:'3px 0',display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:f==='overdue'?'#e74c3c':'#e8a020',display:'inline-block',flexShrink:0}}/>
                    <span style={{color:f==='overdue'?'#fca5a5':'#fde68a',fontSize:10}}>{l.lname||`Loan ${i+1}`}</span>
                  </div>
                )
              })
              return flagItems.length > 0
                ? flagItems
                : <div style={{fontSize:11,color:'rgba(187,198,218,0.4)'}}>No active flags</div>
            })()}
          </div>
        </div>
        {/* Action buttons row */}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/commission`)}
            style={{fontSize:11,padding:'5px 14px',borderRadius:7,border:'1px solid rgba(235,153,194,0.5)',background:'rgba(235,153,194,0.1)',color:'#EB99C2',cursor:'pointer',fontWeight:500}}>
            💰 Commission
          </button>
          <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/email`)}
            style={{fontSize:11,padding:'5px 14px',borderRadius:7,border:'1px solid rgba(235,153,194,0.5)',background:'rgba(235,153,194,0.1)',color:'#EB99C2',cursor:'pointer',fontWeight:500}}>
            ✉ Email clients
          </button>
        </div>
      </div>

      {/* Contacts & Securities */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <Panel>
          <PanelTitle action={
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/email`)}
                style={{fontSize:10,padding:'3px 10px',borderRadius:6,border:'1px solid var(--pk)',color:'var(--pk)',background:'transparent',cursor:'pointer'}}>
                ✉ Email clients
              </button>
              {editBtns('contacts')}
            </div>
          }>Clients & contacts</PanelTitle>
          {editSection==='contacts'
            ? <ContactsEdit draft={draft} setDraft={stableSetDraft}/>
            : <ContactsView contacts={client.contacts} clientName={client.name} navigate={navigate}/>}
        </Panel>
        <Panel>
          <PanelTitle action={editBtns('securities')}>Securities & property values</PanelTitle>
          {editSection==='securities'
            ? <SecuritiesEdit draft={draft} setDraft={stableSetDraft}/>
            : <SecuritiesView securities={client.securities} loans={client.loans} bal={bal}/>}
        </Panel>
      </div>

      {/* Loan facilities */}
      <Panel style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,paddingBottom:8,borderBottom:'0.5px solid var(--border-light)'}}>
          <div style={{display:'flex',gap:2}}>
            {[['current','Current'],['historic','Historic / Discharged']].map(([key,label])=>(
              <button key={key} onClick={()=>setLoanTab(key)} style={{padding:'5px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:11,fontWeight:500,background:loanTab===key?'#2A3D54':'transparent',color:loanTab===key?'#fff':'var(--text-secondary)',transition:'all 0.15s'}}>
                {label}
              </button>
            ))}
          </div>
          <div style={{display:'flex',gap:6}}>
            {editingLoanIdx!==null && <>
              <button onClick={()=>{updateClient(client.name,c=>{const ls=[...c.loans];ls[editingLoanIdx]=loanDraft;return{...c,loans:ls}});setEditingLoanIdx(null);setLoanDraft(null);setSecPicker(null)}} style={{fontSize:10,padding:'3px 10px',borderRadius:6,background:'#27ae60',border:'none',color:'#fff',cursor:'pointer'}}>Save</button>
              <button onClick={()=>{setEditingLoanIdx(null);setLoanDraft(null);setSecPicker(null)}} style={{fontSize:10,padding:'3px 10px',borderRadius:6,background:'transparent',border:'0.5px solid var(--border)',color:'var(--text-secondary)',cursor:'pointer'}}>Cancel</button>
              <button onClick={()=>{if(window.confirm(`Delete loan "${loanDraft?.lname||loanDraft?.acc||'this loan'}"? This cannot be undone.`)){updateClient(client.name,c=>({...c,loans:c.loans.filter((_,j)=>j!==editingLoanIdx)}));setEditingLoanIdx(null);setLoanDraft(null)}}} style={{fontSize:10,padding:'3px 10px',borderRadius:6,background:'#fde8e8',border:'0.5px solid #fde8e8',color:'#c0392b',cursor:'pointer'}}>Delete loan</button>
            </>}
            <button onClick={()=>{const newLoan={acc:'',lname:'',type:'Home Loan (OO)',bank:'',security:'',amount:0,balance:0,rate:0,rateType:'Var',rpmt:'P&I',term:30,ioTerm:0,fixed:'',io:'',balloon:'',settled:new Date().toISOString().slice(0,10),closed:false};updateClient(client.name,c=>({...c,loans:[...c.loans,newLoan]}))}} style={{fontSize:10,padding:'3px 10px',borderRadius:6,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer'}}>+ Add loan</button>
          </div>
        </div>
        <div style={{overflowX:'auto',overflowY:'visible'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,tableLayout:'auto',overflow:'visible'}}>
            <thead><tr>
              {[['#',24,'_origIdx'],['Acc. no.',90,'acc'],['Loan name',140,'lname'],['Type',110,'type'],['Bank',55,'bank'],['Asset / Security',130,null],['Sec.',55,'security'],['Orig. limit',90,'amount'],['Balance',90,'balance'],['Rate',55,'rate'],['Rate type',60,'rateType'],['Rpmt',55,'rpmt'],['Est. repay/mo',90,'_repay'],['Settled',85,'settled'],['Flag / Edit',80,null]].map(([h,w,sortKey])=>{
                const isNumeric = ['Orig. limit','Balance','Rate','Est. repay/mo'].includes(h)
                const isActive = loanSort.col === sortKey
                return <th key={h} style={thStyle({width:w,textAlign:isNumeric?'right':'left',cursor:sortKey?'pointer':'default',userSelect:'none',whiteSpace:'nowrap'})}
                  onClick={()=>{ if(!sortKey) return; setLoanSort(prev => prev.col===sortKey ? {...prev,dir:prev.dir==='asc'?'desc':'asc'} : {col:sortKey,dir:'asc'}) }}>
                  {h}{sortKey ? <span style={{marginLeft:3,opacity:isActive?1:0.25,fontSize:9}}>{isActive?(loanSort.dir==='asc'?'\u2191':'\u2193'):'\u2195'}</span> : null}
                </th>
              })}
            </tr></thead>
            <tbody>
              {(() => {
                const filteredLoans = (() => {
                  let rows = client.loans.map((l,i)=>({...l,_origIdx:i,_repay:calcRepayment(l)||0})).filter(l=> loanTab==='historic' ? l.closed : !l.closed)
                  if (loanSort.col) {
                    const {col, dir} = loanSort
                    rows = [...rows].sort((a,b)=>{
                      let av = a[col], bv = b[col]
                      if (typeof av === 'string') av = av.toLowerCase()
                      if (typeof bv === 'string') bv = bv.toLowerCase()
                      if (av < bv) return dir==='asc'?-1:1
                      if (av > bv) return dir==='asc'?1:-1
                      return 0
                    })
                  }
                  return rows
                })()
                if (!filteredLoans.length) return <tr><td colSpan={15} style={tdStyle({textAlign:'center',color:'var(--text-tertiary)',padding:20})}>{loanTab==='historic'?'No discharged loans':'No active loans'}</td></tr>
                return filteredLoans.map((l)=>{
                const i = l._origIdx
                const isEditing = editingLoanIdx === i
                if (isEditing && loanDraft) {
                  const ld = loanDraft
                  return <tr key={i} style={{background:'#fdf0f6'}}>
                    <td style={tdStyle({color:'var(--pk)',fontWeight:500})}>{i+1}</td>
                    <td style={tdStyle()}><input value={ld.acc||''} onChange={e=>{const d={...loanDraft,acc:e.target.value};setLoanDraft(d)}} style={{width:85,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}/></td>
                    <td style={tdStyle()}>
                      <div style={{display:'flex',gap:3,alignItems:'center'}}>
                        <input value={ld.lname||''} onChange={e=>setLoanDraft({...loanDraft,lname:e.target.value})} style={{width:100,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}/>
                        {(client.contacts||[]).length>0&&(
                          <select onChange={e=>{
                            if(!e.target.value) return
                            const curr = loanDraft.lname||''
                            setLoanDraft({...loanDraft, lname: curr ? `${curr} & ${e.target.value}` : e.target.value})
                            e.target.value=''
                          }}
                            style={{fontSize:9,padding:'2px 2px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)',color:'var(--pk)',cursor:'pointer',maxWidth:24}}
                            title="Add contact to loan name (select multiple)">
                            <option value="">👤</option>
                            {(client.contacts||[]).map((c,ci)=>{
                              const n = c.first ? `${c.first||''} ${c.last||''}`.trim() : (c.name||c.company||'')
                              return n?<option key={ci} value={n}>{n}</option>:null
                            })}
                            {client.name&&<option value={client.name}>{client.name}</option>}
                          </select>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle()}><select value={ld.type||''} onChange={e=>setLoanDraft({...loanDraft,type:e.target.value})} style={{width:110,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}>
                      {['Home Loan (OO)','Home Loan (Inv)','SMSF','Commercial Property','Lease Doc','Term','Asset Finance','Trade Finance','Business Loan','Other'].map(t=><option key={t}>{t}</option>)}
                    </select></td>
                    <td style={tdStyle()}><input value={ld.bank||''} onChange={e=>setLoanDraft({...loanDraft,bank:e.target.value})} style={{width:50,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}/></td>
                    <td style={tdStyle()}><input value={ld.assetDesc||''} onChange={e=>setLoanDraft({...loanDraft,assetDesc:e.target.value})} style={{width:120,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}/></td>
                    <td style={{...tdStyle(),position:'relative',overflow:'visible'}}>
                      <button onClick={e=>{
                          e.stopPropagation()
                          if(secPicker===i){setSecPicker(null);return}
                          const rect=e.currentTarget.getBoundingClientRect()
                          setPickerPos({top:rect.bottom+6,left:Math.max(8,rect.left-60)})
                          setSecPicker(i)
                        }}
                        style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'0.5px solid var(--pk)',background:'transparent',color:'var(--pk)',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {ld.crossed&&ld.crossed.trim()?<span style={{color:'#854F0B'}}>{ld.crossed}</span>:ld.security?`#${ld.security}`:'Select ▾'}
                      </button>
                      {secPicker===i&&(
                        <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:pickerPos.top,left:pickerPos.left,zIndex:99999,background:'var(--surface)',border:'1px solid var(--pk)',borderRadius:8,padding:'10px 12px',minWidth:280,maxHeight:280,overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.25)'}}>
                          <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Select securities for this loan</div>
                          {(client.securities||[]).length===0&&<div style={{fontSize:11,color:'var(--text-tertiary)',padding:'8px 0'}}>No securities added yet — add them in the Securities section first</div>}
                          {(client.securities||[]).map(s=>{
                            const sNum = String(s.num)
                            const currentSecs = ld.crossed&&ld.crossed.trim()
                              ? ld.crossed.split(',').map(x=>x.trim())
                              : ld.security ? [String(ld.security).trim()] : []
                            const checked = currentSecs.includes(sNum)
                            return (
                              <label key={sNum} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'7px 0',borderBottom:'0.5px solid var(--border-light)',cursor:'pointer'}}>
                                <input type="checkbox" checked={checked} style={{accentColor:'var(--pk)',width:14,height:14,cursor:'pointer',marginTop:2,flexShrink:0}}
                                  onChange={e=>{
                                    let current = ld.crossed&&ld.crossed.trim()
                                      ? ld.crossed.split(',').map(x=>x.trim()).filter(Boolean)
                                      : ld.security ? [String(ld.security).trim()] : []
                                    if(e.target.checked){if(!current.includes(sNum))current.push(sNum)}
                                    else{current=current.filter(x=>x!==sNum)}
                                    current.sort()
                                    if(current.length===0)setLoanDraft({...loanDraft,security:'',crossed:''})
                                    else if(current.length===1)setLoanDraft({...loanDraft,security:current[0],crossed:''})
                                    else setLoanDraft({...loanDraft,security:current[0],crossed:current.join(',')})
                                  }}/>
                                <div>
                                  <div style={{fontSize:11,fontWeight:500,color:'var(--text-primary)'}}>Security #{sNum}</div>
                                  <div style={{fontSize:10,color:'var(--text-secondary)'}}>{s.address||'No address entered'}</div>
                                </div>
                              </label>
                            )
                          })}
                          <button onClick={()=>setSecPicker(null)} style={{marginTop:10,width:'100%',padding:'6px',borderRadius:6,border:'none',background:'var(--pk)',color:'#fff',fontSize:11,cursor:'pointer',fontWeight:500}}>Done</button>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle({textAlign:'right'})}><input type="number" value={ld.amount||''} onChange={e=>setLoanDraft({...loanDraft,amount:+e.target.value})} style={{width:80,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)',textAlign:'right'}}/></td>
                    <td style={tdStyle({textAlign:'right'})}><input type="number" value={ld.balance||''} onChange={e=>setLoanDraft({...loanDraft,balance:+e.target.value})} style={{width:80,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)',textAlign:'right'}}/></td>
                    <td style={tdStyle({textAlign:'right'})}><input type="number" step="0.01" value={ld.rate||''} onChange={e=>setLoanDraft({...loanDraft,rate:+e.target.value})} style={{width:50,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)',textAlign:'right'}}/></td>
                    <td style={tdStyle()}><select value={ld.rateType||'Var'} onChange={e=>setLoanDraft({...loanDraft,rateType:e.target.value})} style={{width:55,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}><option value="Var">Var</option><option value="Fix">Fix</option></select></td>
                    <td style={tdStyle()}><select value={ld.rpmt||'P&I'} onChange={e=>setLoanDraft({...loanDraft,rpmt:e.target.value})} style={{width:50,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}><option>P&I</option><option>IO</option></select></td>
                    <td style={tdStyle({textAlign:'right',color:'var(--text-tertiary)',fontSize:10})}>—</td>
                    <td style={tdStyle()}><DateInput value={ld.settled||''} onChange={v=>setLoanDraft({...loanDraft,settled:v})} style={{width:82,fontSize:10,padding:'2px 4px',borderRadius:4,border:'0.5px solid var(--border)',background:'var(--bg)'}}/></td>
                    <td style={tdStyle({textAlign:'center'})}>
                      <label style={{fontSize:10,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                        <input type="checkbox" checked={!!ld.closed} onChange={e=>setLoanDraft({...loanDraft,closed:e.target.checked})} style={{accentColor:'var(--pk)'}}/>Discharged
                      </label>
                    </td>
                  </tr>
                }
                const flag = loanFlag(l)
                const eRpmt = effectiveRpmt(l)
                const repay = calcRepayment(l)
                return (
                  <tr key={i} style={{cursor:'pointer',opacity:l.closed?0.6:1}}
                    onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}
                    onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/loan/${i}`)}>
                    <td style={tdStyle({color:'var(--pk)',fontWeight:500})}>{i+1}</td>
                    <td style={tdStyle()}><span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'var(--text-secondary)'}}>{l.acc&&l.acc!=='nan'?l.acc:'—'}</span></td>
                    <td style={{...tdStyle(),maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.lname||'—'}</td>
                    <td style={tdStyle()}><Pill label={l.type||'—'} variant={['Commercial Property','Lease Doc','Term'].includes(l.type)?'comm':'pw'}/></td>
                    <td style={tdStyle()}>{l.bank||'—'}</td>
                    <td style={{...tdStyle(),fontSize:10,maxWidth:160}}>
                      {(() => {
                        // Cross-col: show all stacked addresses
                        if (l.crossed && l.crossed.trim()) {
                          const crossedNums = l.crossed.split(',').map(x=>x.trim())
                          const addrs = crossedNums.map(n => {
                            const sec = (client.securities||[]).find(s=>String(s.num)===String(n).trim())
                            return sec?.address || ('Security #' + n)
                          })
                          return (
                            <div>
                              {addrs.map((addr,ai) => (
                                <div key={ai} style={{color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:155,marginBottom:1}}>{addr}</div>
                              ))}
                            </div>
                          )
                        }
                        // Single security — look up by number
                        const secNum = String(l.security||'').trim()
                        const sec = (client.securities||[]).find(s=>String(s.num).trim()===secNum)
                        const addr = sec?.address || l.assetDesc || (secNum?'Security #'+secNum:'—')
                        return <span style={{color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',maxWidth:155}}>{addr}</span>
                      })()}
                    </td>
                    <td style={tdStyle({textAlign:'center'})}>
                      {l.crossed && l.crossed.trim()
                        ? <span style={{background:'#fef9c3',color:'#854F0B',padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:500}}>{l.crossed}</span>
                        : <span>{l.security||'—'}</span>}
                    </td>
                    <td style={tdStyle({textAlign:'right'})}>{fmt(l.amount)}</td>
                    <td style={tdStyle({textAlign:'right',color:'var(--pk)',fontWeight:500})}>{fmt(l.balance)}</td>
                    <td style={tdStyle({textAlign:'right'})}>{l.rate>0?l.rate.toFixed(2)+'%':'—'}</td>
                    <td style={tdStyle()}><span style={{padding:'2px 5px',borderRadius:4,background:l.rateType==='Fix'?'#fdf0f6':'#eef1f5',color:l.rateType==='Fix'?'var(--pk)':'#2A3D54',fontSize:9,fontWeight:500}}>{l.rateType||'Var'}</span></td>
                    <td style={tdStyle()}><Pill label={eRpmt} variant={eRpmt==='P&I*'?'flag':eRpmt==='IO'?'io':'pi'}/></td>
                    <td style={tdStyle({textAlign:'right',color:'var(--text-secondary)'})}>{repay?'$'+repay.toLocaleString():'—'}</td>
                    <td style={tdStyle()}>{fmtDate(l.settled)}</td>
                    <td style={tdStyle({textAlign:'center'})}>
                      <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}>
                        {(() => {
                          const isActioned = l.actionNotes && l.actionNotes.length > 0
                          if (isActioned) return null
                          if (flag) return <span style={{padding:'2px 6px',borderRadius:20,fontSize:9,fontWeight:500,background:flag==='overdue'?'#fde8e8':'#fef9c3',color:flag==='overdue'?'#a32d2d':'#854F0B'}}>
                            {flag==='overdue'?'Overdue':'< 120d'}
                          </span>
                          return null
                        })()}
                        <span onClick={e=>{e.stopPropagation();setEditingLoanIdx(i);setLoanDraft({...l})}} style={{fontSize:9,color:'var(--pk)',padding:'1px 5px',borderRadius:4,border:'0.5px solid var(--pk)',cursor:'pointer'}}>✎</span>
                        <span onClick={e=>{e.stopPropagation();if(window.confirm(`Delete loan "${l.lname||l.acc||'this loan'}"? This cannot be undone.`)){updateClient(client.name,c=>({...c,loans:c.loans.filter((_,j)=>j!==i)}));if(editingLoanIdx===i){setEditingLoanIdx(null);setLoanDraft(null)}}}} style={{fontSize:9,color:'#c0392b',padding:'1px 5px',borderRadius:4,border:'0.5px solid #fde8e8',cursor:'pointer',background:'#fde8e8'}}>✕</span>
                      </div>
                    </td>
                  </tr>
                )
                })
              })()}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:8,paddingTop:8,borderTop:'0.5px solid var(--border-light)'}}>
          Click any row to open the full loan account details
        </div>
      </Panel>

      {/* Opp score & Notes */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>


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
                  <button onClick={()=>deleteNote(n.id||i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:14,lineHeight:1,flexShrink:0}}
                    onMouseOver={e=>e.target.style.color='#c0392b'} onMouseOut={e=>e.target.style.color='var(--text-tertiary)'}>×</button>
                </div>))
              : <div style={{color:'var(--text-tertiary)',fontSize:11,padding:'8px 0'}}>No notes yet.</div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder="Add a note — review outcome, call summary, next steps..."
              style={{width:'100%',fontSize:12,minHeight:60,padding:8,borderRadius:6,border:'0.5px solid var(--border)',background:'var(--bg)',color:'var(--text-primary)',lineHeight:1.6,resize:'vertical'}}/>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={addNote} style={{fontSize:10,padding:'4px 12px',borderRadius:6,background:'#27ae60',border:'0.5px solid #27ae60',color:'#fff',cursor:'pointer'}}>Log note</button>
              <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{fmtDate(new Date().toISOString().slice(0,10))}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <ActionBtn variant="filled" label="Draft review email" onClick={()=>navigate(`/radar/clients/${encodeURIComponent(client.name)}/email`)}/>
            <ActionBtn variant="blue" label="Identify opportunities" onClick={()=>{}}/>
          </div>
        </Panel>
      </div>
    </div>
  )
}
