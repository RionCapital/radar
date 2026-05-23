import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PIPELINE_DATA } from '../lib/pipelineData'
import CRMTopbar from '../components/CRMTopbar'

const STAGES = ['1. Lead','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional','7. Settled','8. Withdrawn']
const CATEGORIES = ['Residential','Asset Finance','Commercial Loans','Business Loans','SMSF','Invoice Finance','Other']
const TRANSACTION_TYPES = ['Purchase','Refinance','Top up','Pre-Approval','Business Loan','Other']
const LEAD_SOURCES = ['1. Accountant','2. Solicitor','3. Client','4. Direct','5. Real Estate','6. Friend','7. Social Media','8. Financial Planner','9. BNI','10. Other']

const STAGE_COLORS = {
  '1. Lead':          { bg: '#eef4fb', color: '#185fa5' },
  '2. Strategy':      { bg: '#eef4fb', color: '#185fa5' },
  '3. Pre-Lodged':    { bg: '#fdf0f6', color: '#9b2c6e' },
  '4. Lodged':        { bg: '#fdf0f6', color: '#9b2c6e' },
  '5. Conditional':   { bg: '#fff8e8', color: '#92600a' },
  '6. Unconditional': { bg: '#eaf6ef', color: '#1a7a45' },
  '7. Settled':       { bg: '#eaf6ef', color: '#1a7a45' },
  '8. Withdrawn':     { bg: '#f5f5f5', color: '#7A8090' },
}

const inp = { border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:500, color:'#7A8090', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
      {children}
    </div>
  )
}
function ReadRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'0.5px solid #f0f0f0' }}>
      <span style={{ fontSize:11, color:'#7A8090', flexShrink:0, width:140 }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:500, color:'#2A3545', textAlign:'right' }}>{value || '—'}</span>
    </div>
  )
}

function getDeals() {
  try { const s = localStorage.getItem('rion-crm-deals'); if (s) return JSON.parse(s) } catch {}
  return PIPELINE_DATA
}
function saveDeals(deals) {
  try { localStorage.setItem('rion-crm-deals', JSON.stringify(deals)) } catch {}
}

export default function DealPage({ onUpdateDeals }) {
  const { dealName } = useParams()
  const navigate = useNavigate()
  const decodedName = decodeURIComponent(dealName)
  const [deals, setDeals] = useState(() => getDeals())
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  const deal = deals.find(d => d['Transaction Name'] === decodedName)

  if (!deal) return (
    <div>
      <CRMTopbar />
      <div style={{ padding:24 }}>
        <button onClick={()=>navigate('/crm')} style={{ background:'none', border:'none', color:'#EB99C2', cursor:'pointer', fontSize:12 }}>← Back to pipeline</button>
        <div style={{ color:'#7A8090', marginTop:12 }}>Deal not found: "{decodedName}"</div>
      </div>
    </div>
  )

  function startEdit() { setDraft({...deal}); setEditing(true); setSaved(false) }
  function cancelEdit() { setEditing(false); setDraft(null) }
  function set(k, v) { setDraft(d => ({...d, [k]:v})) }
  function saveEdit() {
    const updated = deals.map(d => d['Transaction Name'] === decodedName ? {...draft} : d)
    setDeals(updated)
    saveDeals(updated)
    if (onUpdateDeals) onUpdateDeals(updated)
    setEditing(false); setDraft(null); setSaved(true)
    setTimeout(()=>setSaved(false), 3000)
  }

  const d = editing ? draft : deal
  const sc = STAGE_COLORS[d.Status] || STAGE_COLORS['1. Lead']
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'

  return (
    <div>
      <CRMTopbar />
      <div style={{ padding:'16px 24px', maxWidth:980, margin:'0 auto' }}>
        <button onClick={()=>navigate('/crm')} style={{ background:'none', border:'none', color:'#EB99C2', cursor:'pointer', fontSize:12, marginBottom:14, padding:0 }}>← Back to pipeline</button>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#2A3545', margin:0 }}>{d['Transaction Name']}</h1>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color, fontWeight:500 }}>{d.Status}</span>
              {d.Categories && <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#f0f0f0', color:'#7A8090' }}>{d.Categories}</span>}
              {d.Amount && <span style={{ fontSize:13, fontWeight:600, color:'#EB99C2' }}>{fmtAmt(d.Amount)}</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {saved && <span style={{ fontSize:11, color:'#22c55e', padding:'6px 12px', background:'#f0fdf4', borderRadius:7, border:'1px solid #bbf7d0' }}>✓ Saved</span>}
            {!editing
              ? <button onClick={startEdit} style={{ padding:'8px 20px', borderRadius:8, border:'1.5px solid #EB99C2', background:'#fff', color:'#EB99C2', fontSize:12, fontWeight:500, cursor:'pointer' }}>Edit deal</button>
              : <>
                  <button onClick={cancelEdit} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e8eaed', background:'#fff', color:'#7A8090', fontSize:12, cursor:'pointer' }}>Cancel</button>
                  <button onClick={saveEdit} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#22c55e', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Save changes</button>
                </>
            }
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* LEFT */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Deal details</div>
              {editing ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Field label="Status"><select style={inp} value={d.Status} onChange={e=>set('Status',e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select></Field>
                  <Field label="Amount ($)"><input style={inp} type="number" value={d.Amount||''} onChange={e=>set('Amount',e.target.value?Number(e.target.value):null)}/></Field>
                  <Field label="Category"><select style={inp} value={d.Categories||''} onChange={e=>set('Categories',e.target.value)}><option value="">— Select —</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
                  <Field label="Transaction type"><select style={inp} value={d['Transaction Type']||''} onChange={e=>set('Transaction Type',e.target.value)}><option value="">— Select —</option>{TRANSACTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></Field>
                  <Field label="Lender"><input style={inp} value={d.Lender||''} onChange={e=>set('Lender',e.target.value)}/></Field>
                  <Field label="Lead source"><select style={inp} value={d['Lead Source']||''} onChange={e=>set('Lead Source',e.target.value)}><option value="">— Select —</option>{LEAD_SOURCES.map(l=><option key={l} value={l}>{l}</option>)}</select></Field>
                  <Field label="Total security ($)"><input style={inp} type="number" value={d['Total Security']||''} onChange={e=>set('Total Security',e.target.value?Number(e.target.value):null)}/></Field>
                  <Field label="Internal reference"><input style={inp} value={d['Internal Reference']||''} onChange={e=>set('Internal Reference',e.target.value)}/></Field>
                </div>
              ) : (
                <>
                  <ReadRow label="Amount" value={<span style={{color:'#EB99C2',fontWeight:600}}>{fmtAmt(d.Amount)}</span>}/>
                  <ReadRow label="Category" value={d.Categories}/>
                  <ReadRow label="Transaction type" value={d['Transaction Type']}/>
                  <ReadRow label="Lender" value={d.Lender}/>
                  <ReadRow label="Lead source" value={d['Lead Source']}/>
                  <ReadRow label="Total security" value={fmtAmt(d['Total Security'])}/>
                  <ReadRow label="Internal reference" value={d['Internal Reference']}/>
                </>
              )}
            </div>

            <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Key dates</div>
              {editing ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Field label="Settlement date"><input style={inp} type="date" value={d['Date Settled']?.slice(0,10)||''} onChange={e=>set('Date Settled',e.target.value)}/></Field>
                  <Field label="Finance due date"><input style={inp} type="date" value={d['Finance Due Date']?.slice(0,10)||''} onChange={e=>set('Finance Due Date',e.target.value)}/></Field>
                  <Field label="Deposit due date"><input style={inp} type="date" value={d['Deposit Due Date']?.slice(0,10)||''} onChange={e=>set('Deposit Due Date',e.target.value)}/></Field>
                  <Field label="Fixed rate expiry"><input style={inp} type="date" value={d['Fixed Rate Expiry']?.slice(0,10)||''} onChange={e=>set('Fixed Rate Expiry',e.target.value)}/></Field>
                  <Field label="IO expiry"><input style={inp} type="date" value={d['Interest Only Expiry']?.slice(0,10)||''} onChange={e=>set('Interest Only Expiry',e.target.value)}/></Field>
                  <Field label="Discharge date"><input style={inp} type="date" value={d['Discharge Date']?.slice(0,10)||''} onChange={e=>set('Discharge Date',e.target.value)}/></Field>
                </div>
              ) : (
                <>
                  <ReadRow label="Settlement date" value={d['Date Settled']?.slice(0,10)}/>
                  <ReadRow label="Finance due date" value={d['Finance Due Date']?.slice(0,10)}/>
                  <ReadRow label="Deposit due date" value={d['Deposit Due Date']?.slice(0,10)}/>
                  <ReadRow label="Fixed rate expiry" value={d['Fixed Rate Expiry']?.slice(0,10)}/>
                  <ReadRow label="IO expiry" value={d['Interest Only Expiry']?.slice(0,10)}/>
                  <ReadRow label="Discharge date" value={d['Discharge Date']?.slice(0,10)}/>
                  <ReadRow label="Discharge reason" value={d['Discharge Reason']}/>
                </>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Client information</div>
              {editing ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Field label="Full name"><input style={inp} value={d['Full Name(s)']||''} onChange={e=>set('Full Name(s)',e.target.value)}/></Field>
                  <Field label="First name(s)"><input style={inp} value={d['First Name(s)']||''} onChange={e=>set('First Name(s)',e.target.value)}/></Field>
                  <Field label="Last name(s)"><input style={inp} value={d['Last Name(s)']||''} onChange={e=>set('Last Name(s)',e.target.value)}/></Field>
                  <Field label="Email"><input style={inp} type="email" value={d['Emails(s)']||''} onChange={e=>set('Emails(s)',e.target.value)}/></Field>
                  <Field label="Mobile"><input style={inp} value={d.Mobile||''} onChange={e=>set('Mobile',e.target.value)}/></Field>
                  <Field label="Company"><input style={inp} value={d.Company||''} onChange={e=>set('Company',e.target.value)}/></Field>
                  <div style={{gridColumn:'1/-1'}}><Field label="Home address"><textarea style={{...inp,resize:'vertical'}} rows={2} value={d['Home Address']||''} onChange={e=>set('Home Address',e.target.value)}/></Field></div>
                </div>
              ) : (
                <>
                  <ReadRow label="Full name" value={d['Full Name(s)']}/>
                  <ReadRow label="Email" value={d['Emails(s)'] ? <a href={`mailto:${d['Emails(s)']}`} style={{color:'#EB99C2',textDecoration:'none'}}>{d['Emails(s)']}</a> : null}/>
                  <ReadRow label="Mobile" value={d.Mobile ? <span style={{display:'flex',gap:8,alignItems:'center'}}><a href={`tel:${d.Mobile}`} style={{color:'#EB99C2',textDecoration:'none'}}>{d.Mobile}</a><a href={`sms:${d.Mobile}`} style={{background:'#f0f0f0',borderRadius:10,padding:'1px 7px',fontSize:10,color:'#7A8090',textDecoration:'none'}}>💬</a></span> : null}/>
                  <ReadRow label="Company" value={d.Company}/>
                  <ReadRow label="Address" value={d['Home Address']}/>
                </>
              )}
            </div>

            <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Team & notes</div>
              {editing ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Field label="Advisor"><input style={inp} value={d.Advisor||''} onChange={e=>set('Advisor',e.target.value)}/></Field>
                  <Field label="Settlement officer"><input style={inp} value={d['Settlement Officer']||''} onChange={e=>set('Settlement Officer',e.target.value)}/></Field>
                  <div style={{gridColumn:'1/-1'}}><Field label="Status notes"><textarea style={{...inp,resize:'vertical'}} rows={3} value={d['Status Notes']||''} onChange={e=>set('Status Notes',e.target.value)}/></Field></div>
                  <div style={{gridColumn:'1/-1'}}><Field label="Next action"><textarea style={{...inp,resize:'vertical'}} rows={2} value={d['Next Action']||''} onChange={e=>set('Next Action',e.target.value)}/></Field></div>
                </div>
              ) : (
                <>
                  <ReadRow label="Advisor" value={d.Advisor}/>
                  <ReadRow label="Settlement officer" value={d['Settlement Officer']}/>
                  <ReadRow label="Created on" value={d['Created On']?.slice(0,10)}/>
                  {d['Status Notes'] && <div style={{marginTop:10}}><div style={{fontSize:10,color:'#7A8090',marginBottom:4}}>Status notes</div><div style={{fontSize:12,color:'#2A3545',background:'#f8f9fa',borderRadius:6,padding:'8px 10px',lineHeight:1.5}}>{d['Status Notes']}</div></div>}
                  {d['Next Action'] && <div style={{marginTop:8}}><div style={{fontSize:10,color:'#7A8090',marginBottom:4}}>Next action</div><div style={{fontSize:12,color:'#2A3545',background:'#fdf0f6',borderRadius:6,padding:'8px 10px',lineHeight:1.5,borderLeft:'3px solid #EB99C2'}}>{d['Next Action']}</div></div>}
                </>
              )}
            </div>

            <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Estimated commission</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#9ca3af' }}>Est. upfront (0.66%)</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#22c55e', marginTop:2 }}>{d.Amount ? `$${Math.round(d.Amount*0.0066).toLocaleString()}` : '—'}</div>
                </div>
                <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#9ca3af' }}>Deal amount</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#EB99C2', marginTop:2 }}>{fmtAmt(d.Amount)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
