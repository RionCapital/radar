import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals, syncDealsFromSupabase } from '../lib/deals'
import CRMTopbar from '../components/CRMTopbar'
import ReferrerPicker from '../components/ReferrerPicker'

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

function getDeals() { return loadDeals() }

function findLinkedClient(deal, clients) {
  if (!clients?.length) return null
  if (deal['RradarClient']) {
    const linked = clients.find(c => c.name === deal['RradarClient'])
    if (linked) return linked
  }
  const dealName = (deal['Transaction Name'] || '').split(/[\s(]/)[0].toLowerCase()
  return clients.find(c => c.name.toLowerCase().startsWith(dealName) || dealName.startsWith(c.name.toLowerCase().split(' ')[0])) || null
}

const BLANK_CONTACT = { name:'', type:'Individual', email:'', mobile:'' }
const CONTACT_TYPES = ['Individual','Company','Trust','SMSF','Partnership']

function RradarContactsPanel({ deal, clients, editing, draft, set, inp }) {
  const [linkMode, setLinkMode] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [newContact, setNewContact] = useState({ ...BLANK_CONTACT })
  const [editingIdx, setEditingIdx] = useState(null)
  const [editBuf, setEditBuf] = useState(null)

  const linkedClient = findLinkedClient(deal, clients)
  const currentLinked = (editing && draft?.['RradarClient'] !== undefined)
    ? clients.find(c => c.name === draft['RradarClient']) || null
    : linkedClient

  // Deal-level contacts stored as deal.Contacts array
  const dealContacts = (editing ? (draft?.Contacts || []) : (deal.Contacts || []))

  function setContacts(arr) { set('Contacts', arr) }

  const searchResults = searchTerm.length > 1
    ? clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 6)
    : []

  function selectClient(c) { set('RradarClient', c.name); setLinkMode(null); setSearchTerm('') }
  function unlinkClient() { set('RradarClient', ''); setLinkMode(null) }

  // Contacts to display: Rradar-linked contacts take priority, fallback to deal contacts
  const rradarContacts = currentLinked?.contacts || []
  const displayContacts = rradarContacts.length > 0
    ? rradarContacts.map(c => ({
        name: [c.first, c.middle, c.last].filter(Boolean).join(' ') || c.first || '—',
        type: c.type || 'Individual',
        email: c.email || '',
        mobile: c.mobile || '',
        fromRradar: true
      }))
    : dealContacts

  function saveNewContact() {
    if (!newContact.name.trim()) return
    setContacts([...dealContacts, { ...newContact }])
    setNewContact({ ...BLANK_CONTACT })
    setAddingContact(false)
  }
  function saveEditContact() {
    const updated = dealContacts.map((c, i) => i === editingIdx ? { ...editBuf } : c)
    setContacts(updated)
    setEditingIdx(null); setEditBuf(null)
  }
  function removeContact(i) {
    setContacts(dealContacts.filter((_, idx) => idx !== i))
  }

  const thStyle = { padding:'7px 10px', textAlign:'left', color:'#fff', fontSize:10, fontWeight:600 }
  const inpStyle = { ...inp, fontSize:11, padding:'4px 8px' }

  return (
    <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em' }}>Clients &amp; Contacts</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {currentLinked && <span style={{ fontSize:9, padding:'2px 8px', borderRadius:20, background:'#dcfce7', color:'#15803d', fontWeight:600 }}>● Rradar linked</span>}
          {editing && !addingContact && !rradarContacts.length && (
            <button onClick={() => { setAddingContact(true); setEditingIdx(null) }}
              style={{ fontSize:10, padding:'3px 10px', borderRadius:6, border:'1px solid #EB99C2', background:'#fdf0f6', color:'#9b2c6e', cursor:'pointer', fontWeight:500 }}>
              + Add contact
            </button>
          )}
          {editing && (
            <button onClick={() => setLinkMode(l => l === 'search' ? null : 'search')}
              style={{ fontSize:10, padding:'3px 10px', borderRadius:6, border:'1px solid #e8eaed', background:'#f8f9fa', color:'#2A3545', cursor:'pointer' }}>
              {currentLinked ? '⇄ Change Rradar link' : '+ Link to Rradar'}
            </button>
          )}
          {editing && currentLinked && (
            <button onClick={unlinkClient}
              style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }}>
              Unlink
            </button>
          )}
        </div>
      </div>

      {/* Rradar search */}
      {editing && linkMode === 'search' && (
        <div style={{ marginBottom:12, background:'#f8f9fa', borderRadius:8, padding:'10px 12px', border:'1px solid #e8eaed' }}>
          <div style={{ fontSize:10, color:'#7A8090', marginBottom:6 }}>Search Rradar clients</div>
          <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Type client name…" style={{ ...inp, marginBottom:6 }} />
          {searchResults.length > 0 && (
            <div style={{ border:'1px solid #e8eaed', borderRadius:6, overflow:'hidden' }}>
              {searchResults.map((c, i) => (
                <div key={i} onClick={() => selectClient(c)}
                  style={{ padding:'7px 10px', fontSize:11, cursor:'pointer', borderBottom:i<searchResults.length-1?'0.5px solid #f0f0f0':'none', display:'flex', justifyContent:'space-between', background:'#fff' }}
                  onMouseOver={e => e.currentTarget.style.background = '#fdf0f6'}
                  onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                  <span style={{ fontWeight:500, color:'#2A3545' }}>{c.name}</span>
                  <span style={{ fontSize:9, color:'#7A8090' }}>{c.loans?.length || 0} loans</span>
                </div>
              ))}
            </div>
          )}
          {searchTerm.length > 1 && searchResults.length === 0 && (
            <div style={{ fontSize:10, color:'#9ca3af', padding:'4px 0' }}>No matching clients found</div>
          )}
        </div>
      )}

      {/* Contacts table */}
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
        <thead>
          <tr style={{ background:'#3D4F6B' }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Mobile</th>
            {editing && !rradarContacts.length && <th style={{ ...thStyle, width:60 }}></th>}
          </tr>
        </thead>
        <tbody>
          {displayContacts.length > 0 ? displayContacts.map((c, i) => (
            editingIdx === i && !c.fromRradar ? (
              <tr key={i} style={{ background:'#fdf9ff', borderBottom:'0.5px solid #e8eaed' }}>
                <td style={{ padding:'5px 6px' }}><input style={inpStyle} value={editBuf.name} onChange={e=>setEditBuf(b=>({...b,name:e.target.value}))}/></td>
                <td style={{ padding:'5px 6px' }}>
                  <select style={{...inpStyle, width:'100%'}} value={editBuf.type} onChange={e=>setEditBuf(b=>({...b,type:e.target.value}))}>
                    {CONTACT_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </td>
                <td style={{ padding:'5px 6px' }}><input style={inpStyle} value={editBuf.email} onChange={e=>setEditBuf(b=>({...b,email:e.target.value}))}/></td>
                <td style={{ padding:'5px 6px' }}><input style={inpStyle} value={editBuf.mobile} onChange={e=>setEditBuf(b=>({...b,mobile:e.target.value}))}/></td>
                <td style={{ padding:'5px 6px' }}>
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={saveEditContact} style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'none',background:'#22c55e',color:'#fff',cursor:'pointer'}}>✓</button>
                    <button onClick={()=>{setEditingIdx(null);setEditBuf(null)}} style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'1px solid #e8eaed',background:'#fff',color:'#5a6370',cursor:'pointer'}}>✕</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={i} style={{ borderBottom:'0.5px solid #f0f0f0', background:i%2===0?'#fff':'#fafafa' }}>
                <td style={{ padding:'7px 10px', color:'#2A3545', fontWeight:500 }}>{c.name||'—'}</td>
                <td style={{ padding:'7px 10px' }}>
                  <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, background:'#fdf0f6', color:'#9b2c6e' }}>{c.type||'Individual'}</span>
                </td>
                <td style={{ padding:'7px 10px' }}>
                  {c.email ? <a href={`mailto:${c.email}`} style={{color:'#EB99C2',textDecoration:'none'}}>{c.email}</a> : '—'}
                </td>
                <td style={{ padding:'7px 10px' }}>
                  {c.mobile ? <span style={{display:'flex',gap:6,alignItems:'center'}}>
                    <a href={`tel:${c.mobile}`} style={{color:'#EB99C2',textDecoration:'none'}}>{c.mobile}</a>
                    <a href={`sms:${c.mobile}`} style={{background:'#f0f0f0',borderRadius:10,padding:'1px 6px',fontSize:9,color:'#7A8090',textDecoration:'none'}}>💬</a>
                  </span> : '—'}
                </td>
                {editing && !c.fromRradar && (
                  <td style={{ padding:'5px 8px' }}>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>{setEditingIdx(i);setEditBuf({...c});setAddingContact(false)}}
                        style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'1px solid #e8eaed',background:'#f8f9fa',color:'#2A3545',cursor:'pointer'}}>Edit</button>
                      <button onClick={()=>removeContact(i)}
                        style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'1px solid #fecaca',background:'#fef2f2',color:'#b91c1c',cursor:'pointer'}}>✕</button>
                    </div>
                  </td>
                )}
                {editing && c.fromRradar && <td></td>}
              </tr>
            )
          )) : (
            <tr>
              <td colSpan={editing ? 5 : 4} style={{ padding:'12px 10px', fontSize:10, color:'#9ca3af', textAlign:'center' }}>
                No contacts on file
              </td>
            </tr>
          )}

          {/* Add new contact row */}
          {addingContact && editing && (
            <tr style={{ background:'#f0fdf4', borderBottom:'0.5px solid #e8eaed' }}>
              <td style={{ padding:'5px 6px' }}>
                <input autoFocus style={inpStyle} placeholder="Full name" value={newContact.name} onChange={e=>setNewContact(c=>({...c,name:e.target.value}))}/>
              </td>
              <td style={{ padding:'5px 6px' }}>
                <select style={{...inpStyle, width:'100%'}} value={newContact.type} onChange={e=>setNewContact(c=>({...c,type:e.target.value}))}>
                  {CONTACT_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </td>
              <td style={{ padding:'5px 6px' }}>
                <input style={inpStyle} placeholder="Email" value={newContact.email} onChange={e=>setNewContact(c=>({...c,email:e.target.value}))}/>
              </td>
              <td style={{ padding:'5px 6px' }}>
                <input style={inpStyle} placeholder="Mobile" value={newContact.mobile} onChange={e=>setNewContact(c=>({...c,mobile:e.target.value}))}/>
              </td>
              <td style={{ padding:'5px 6px' }}>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={saveNewContact} style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'none',background:'#22c55e',color:'#fff',cursor:'pointer',fontWeight:600}}>Save</button>
                  <button onClick={()=>{setAddingContact(false);setNewContact({...BLANK_CONTACT})}} style={{fontSize:9,padding:'3px 6px',borderRadius:4,border:'1px solid #e8eaed',background:'#fff',color:'#5a6370',cursor:'pointer'}}>✕</button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Add another contact button (below table) */}
      {editing && !addingContact && !rradarContacts.length && displayContacts.length > 0 && (
        <button onClick={() => { setAddingContact(true); setEditingIdx(null) }}
          style={{ marginTop:8, fontSize:10, padding:'4px 12px', borderRadius:6, border:'1px dashed #EB99C2', background:'transparent', color:'#EB99C2', cursor:'pointer', width:'100%' }}>
          + Add another contact
        </button>
      )}

      {/* Rradar footer */}
      {currentLinked && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
          <span style={{ fontSize:10, color:'#7A8090' }}>
            Rradar: <strong style={{color:'#2A3545'}}>{currentLinked.name}</strong> · {currentLinked.loans?.filter(l=>!l.closed).length||0} active loans
          </span>
          <a href={`/radar/clients/${encodeURIComponent(currentLinked.name)}`}
            style={{ fontSize:10, color:'#EB99C2', textDecoration:'none', padding:'3px 10px', border:'1px solid #EB99C2', borderRadius:6 }}>
            View in Rradar →
          </a>
        </div>
      )}

      {!currentLinked && !editing && displayContacts.length === 0 && (
        <div style={{ marginTop:8, padding:'8px 10px', background:'#fef9ec', border:'1px solid #fde68a', borderRadius:6, fontSize:10, color:'#92600a' }}>
          ⚡ Not linked to Rradar — edit this deal to link a client or add contacts manually
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Phase 2 additions ─────────────────────────
   Full-screen Deal record: stage tracker + Loan Details / Strategy /
   Structure / Attachments / Notes tabs. New data lives under underscore
   keys on the deal object (_strategy, _structure, _attachments,
   _fileNotes, _bid) — same convention as the existing _referrers field —
   so it rides along with the existing saveDeals()/Supabase sync with no
   schema change required.
------------------------------------------------------------------------ */

const TRACKER_STAGES = ['1. Lead','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional','7. Settled']

const SECURITY_TYPES = ['1MTG','2MTG','GSA','PMSI','Gtee']
const SEC_BANDS = [
  { code:'WS', label:'Well Secured' },
  { code:'FS', label:'Fully Secured' },
  { code:'PS', label:'Partially Secured' },
  { code:'UN', label:'Unsecured' },
]
const FACILITY_TYPES = ['Home Loan','Term Loan','Line of Credit','Overdraft','Bank Guarantee','Credit Card','Invoice Finance','Asset Finance','Trade Finance','SBLC','LC']
const ENTITY_TYPES = ['Company','Sole Trader','Partnership','Trust','Individual']
const ENTITY_POSITIONS = ['Borrower','Co-Borrower','Guarantor','Cash Flow']

const ATTACHMENT_TEMPLATES = {
  'Purchase': ['Contract of Sale','ID — Driver\'s Licence / Passport','3 months bank statements','Payslips (2 recent)','Evidence of deposit / savings','Rates notice (if applicable)'],
  'Refinance': ['Current loan statement','ID — Driver\'s Licence / Passport','3 months bank statements','Rates notice','Discharge authority'],
  'Top up': ['Current loan statement','Purpose of funds evidence','3 months bank statements','Updated valuation (if required)'],
  'Pre-Approval': ['ID — Driver\'s Licence / Passport','Payslips (2 recent)','3 months bank statements'],
  'Business Loan': ['2 years financials (P&L + BS)','ATO Portal / ITRs','Business bank statements (6 mths)','Security/GSA details','ASIC extract','Trust deed (if applicable)'],
  'Other': ['ID — Driver\'s Licence / Passport','Supporting documents as advised'],
}

function Pill({ children, tone='slate' }) {
  const tones = {
    slate: { bg:'#EEF0F3', fg:'#7A8090' },
    pink:  { bg:'#fdf0f6', fg:'#9b2c6e' },
    navy:  { bg:'#E8ECF1', fg:'#3D4F6B' },
    green: { bg:'#f0fdf4', fg:'#22c55e' },
  }
  const t = tones[tone] || tones.slate
  return <span style={{ background:t.bg, color:t.fg, fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.03em' }}>{children}</span>
}

function TabCard({ title, right, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'16px 18px', marginBottom:14 }}>
      {title && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em' }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

function MiniTable({ columns, rows, empty='No rows yet' }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} style={{ textAlign:'left', padding:'6px 8px', color:'#fff', background:'#3D4F6B', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.03em', whiteSpace:'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding:'12px 8px', fontSize:11, color:'#9ca3af', textAlign:'center' }}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} style={{ background:i%2 ? '#fafafa' : '#fff' }}>
              {r.map((cell, j) => <td key={j} style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0f0', color:'#2A3545', whiteSpace:'nowrap' }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StageTracker({ status, editing, onChange }) {
  const isWithdrawn = status === '8. Withdrawn'
  const idx = TRACKER_STAGES.indexOf(isWithdrawn ? '1. Lead' : status)
  return (
    <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'20px 24px 8px', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center' }}>
        {TRACKER_STAGES.map((s, i) => (
          <div key={s} style={{ display:'flex', alignItems:'center', flex: i === TRACKER_STAGES.length-1 ? '0 0 auto' : 1 }}>
            <div
              onClick={() => editing && onChange(s)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', cursor: editing ? 'pointer' : 'default' }}
            >
              <div style={{
                width:14, height:14, borderRadius:'50%',
                background: i <= idx && !isWithdrawn ? '#EB99C2' : '#3D4F6B',
                boxShadow: i === idx && !isWithdrawn ? '0 0 0 4px rgba(235,153,194,0.25)' : 'none',
                marginBottom:8,
              }}/>
              <span style={{ fontSize:11, fontWeight: i===idx?700:500, color: i===idx?'#3D4F6B':'#7A8090', whiteSpace:'nowrap' }}>{s.replace(/^\d+\.\s*/,'')}</span>
            </div>
            {i < TRACKER_STAGES.length-1 && <div style={{ flex:1, height:2, background: i<idx && !isWithdrawn ? '#EB99C2' : '#e8eaed', margin:'0 4px 20px' }}/>}
          </div>
        ))}
        {isWithdrawn && <span style={{ marginLeft:16, marginBottom:20 }}><Pill tone="slate">Withdrawn</Pill></span>}
      </div>
      {editing && <div style={{ fontSize:10, color:'#9ca3af', paddingBottom:10 }}>Click a stage to move this deal — or set "8. Withdrawn" from Status in Loan Details.</div>}
    </div>
  )
}

function LoanDetailsTab({ d, editing, draft, set, deal, deals, setDeals, clients }) {
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <TabCard title="Deal details">
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
              {(d['_referrers']||[]).length > 0 && <ReadRow label="Referral partner" value={(d['_referrers']||[]).map(r=>r.name).join(', ')}/>}
              <ReadRow label="Total security" value={fmtAmt(d['Total Security'])}/>
              <ReadRow label="Internal reference" value={d['Internal Reference']}/>
            </>
          )}
        </TabCard>

        <TabCard title="Key dates">
          {editing ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Settlement date"><input style={inp} type="date" value={d['Date Settled']?.slice(0,10)||''} onChange={e=>set('Date Settled',e.target.value)}/></Field>
              <Field label="Finance due date"><input style={inp} type="date" value={d['Finance Due Date']?.slice(0,10)||''} onChange={e=>{
                const val = e.target.value
                set('Finance Due Date', val)
                set('Month of Settlement', val ? val.slice(0,7) : draft?.['Month of Settlement'])
              }}/></Field>
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
        </TabCard>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <RradarContactsPanel deal={d} clients={clients} editing={editing} draft={draft} set={set} inp={inp} />

        <TabCard title="Referral Partner">
          <ReferrerPicker
            compact
            label=""
            attached={deal['_referrers'] || (deal['_referrer'] ? [{ name:deal['_referrer'], tier:'contenders' }] : [])}
            onAttach={r => {
              const curr = deal['_referrers'] || []
              if (curr.find(x => x.name === r.name)) return
              const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, '_referrers': [...curr, r] } : x)
              setDeals(updated); saveDeals(updated)
              if (editing) set('_referrers', [...curr, r])
            }}
            onDetach={name => {
              const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, '_referrers': (x['_referrers']||[]).filter(r => r.name !== name) } : x)
              setDeals(updated); saveDeals(updated)
              if (editing) set('_referrers', (draft?.['_referrers']||[]).filter(r => r.name !== name))
            }}
          />
        </TabCard>

        <TabCard title="Estimated commission">
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
        </TabCard>
      </div>
    </div>
  )
}

function StrategyTab({ d, editing, set }) {
  const strat = d._strategy || {}
  const s = (k, v) => set('_strategy', { ...strat, [k]: v })
  const equityRows = strat.equityRows || []
  const compRows = strat.comparisonRows || []

  const addEquityRow = () => s('equityRows', [...equityRows, { property:'', lender:'', lvr:'', valuation:'', debt:'', equity:'' }])
  const updEquityRow = (i, k, v) => s('equityRows', equityRows.map((r,idx)=> idx===i ? {...r,[k]:v} : r))
  const rmEquityRow = (i) => s('equityRows', equityRows.filter((_,idx)=>idx!==i))

  const addCompRow = () => s('comparisonRows', [...compRows, { lender:'', purpose:'', type:'P&I', term:'', baseLoan:'', lmi:'', totalLoan:'', repayment:'', rate:'' }])
  const updCompRow = (i, k, v) => s('comparisonRows', compRows.map((r,idx)=> idx===i ? {...r,[k]:v} : r))
  const rmCompRow = (i) => s('comparisonRows', compRows.filter((_,idx)=>idx!==i))

  const fmtM = v => v==='' || v==null || isNaN(v) ? '—' : `$${Number(v).toLocaleString()}`

  return (
    <div>
      {editing && (
        <TabCard>
          <label style={{ fontSize:12, color:'#7A8090', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
            <input type="checkbox" checked={!!strat.isConstruction} onChange={e=>s('isConstruction', e.target.checked)} />
            Construction / land + build deal
          </label>
        </TabCard>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <TabCard title={strat.isConstruction ? 'Land & Construction Funding' : 'Property Purchase Funding'}>
          {editing ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label={strat.isConstruction ? 'Land purchase ($)' : 'Purchase price ($)'}><input style={inp} type="number" value={strat.purchasePrice||''} onChange={e=>s('purchasePrice', e.target.value?Number(e.target.value):'')}/></Field>
              {strat.isConstruction && <Field label="Construction contract ($)"><input style={inp} type="number" value={strat.constructionCost||''} onChange={e=>s('constructionCost', e.target.value?Number(e.target.value):'')}/></Field>}
              <Field label="Legals ($)"><input style={inp} type="number" value={strat.legals||''} onChange={e=>s('legals', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Stamp duty est. ($)"><input style={inp} type="number" value={strat.stampDuty||''} onChange={e=>s('stampDuty', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Settlement adjustments ($)"><input style={inp} type="number" value={strat.settlementAdj||''} onChange={e=>s('settlementAdj', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="LMI est. ($)"><input style={inp} type="number" value={strat.lmi||''} onChange={e=>s('lmi', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Loan from lender ($)"><input style={inp} type="number" value={strat.loanFromLender||''} onChange={e=>s('loanFromLender', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Base LVR (%)"><input style={inp} type="number" value={strat.baseLvr||''} onChange={e=>s('baseLvr', e.target.value?Number(e.target.value):'')}/></Field>
            </div>
          ) : (
            <MiniTable columns={['Item','Amount']} rows={[
              [strat.isConstruction ? 'Land Purchase' : 'Purchase Price', fmtM(strat.purchasePrice)],
              ...(strat.isConstruction ? [['Construction Contract', fmtM(strat.constructionCost)]] : []),
              ['Legals', fmtM(strat.legals)],
              ['Stamp Duty (OSR est.)', fmtM(strat.stampDuty)],
              ['Settlement Adjustments', fmtM(strat.settlementAdj)],
              ['LMI Est.', fmtM(strat.lmi)],
              ['Loan From Lender', fmtM(strat.loanFromLender)],
              ['Base LVR', strat.baseLvr ? `${strat.baseLvr}%` : '—'],
            ]}/>
          )}
        </TabCard>

        <TabCard title="Repayment Calculator">
          {editing ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <Field label="Amount ($)"><input style={inp} type="number" value={strat.repayAmount||''} onChange={e=>s('repayAmount', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Term (yrs)"><input style={inp} type="number" value={strat.repayTerm||''} onChange={e=>s('repayTerm', e.target.value?Number(e.target.value):'')}/></Field>
              <Field label="Rate (%)"><input style={inp} type="number" step="0.01" value={strat.repayRate||''} onChange={e=>s('repayRate', e.target.value?Number(e.target.value):'')}/></Field>
            </div>
          ) : null}
          {(() => {
            const amt = Number(strat.repayAmount)||0, yrs = Number(strat.repayTerm)||0, rate = (Number(strat.repayRate)||0)/100
            const n = yrs*12, r = rate/12
            const pi = amt && n && r ? (amt*r)/(1-Math.pow(1+r,-n)) : 0
            const io = amt && rate ? (amt*rate)/12 : 0
            return (
              <MiniTable columns={['Repayment Type','Monthly']} rows={[
                ['Principal & Interest', pi ? `$${Math.round(pi).toLocaleString()}` : '—'],
                ['Interest Only', io ? `$${Math.round(io).toLocaleString()}` : '—'],
              ]}/>
            )
          })()}
        </TabCard>
      </div>

      <TabCard title="Equity Table — Existing Security" right={editing && <button onClick={addEquityRow} style={addBtnStyle}>+ Add property</button>}>
        <MiniTable columns={['Property','Lender','LVR','Valuation','Debt','Equity', editing?'':undefined].filter(Boolean)} rows={equityRows.map((r,i) => editing ? [
          <input style={rowInp} value={r.property} onChange={e=>updEquityRow(i,'property',e.target.value)}/>,
          <input style={rowInp} value={r.lender} onChange={e=>updEquityRow(i,'lender',e.target.value)}/>,
          <input style={rowInp} value={r.lvr} onChange={e=>updEquityRow(i,'lvr',e.target.value)}/>,
          <input style={rowInp} value={r.valuation} onChange={e=>updEquityRow(i,'valuation',e.target.value)}/>,
          <input style={rowInp} value={r.debt} onChange={e=>updEquityRow(i,'debt',e.target.value)}/>,
          <div style={{display:'flex',gap:6,alignItems:'center'}}><input style={rowInp} value={r.equity} onChange={e=>updEquityRow(i,'equity',e.target.value)}/><button onClick={()=>rmEquityRow(i)} style={rmBtnStyle}>✕</button></div>,
        ] : [r.property,r.lender,r.lvr,fmtM(r.valuation),fmtM(r.debt),fmtM(r.equity)])}/>
      </TabCard>

      <TabCard title="Comparison Table — Lender Options" right={editing && <button onClick={addCompRow} style={addBtnStyle}>+ Add option</button>}>
        <MiniTable columns={['Lender','Purpose','Type','Term','Base Loan','LMI','Repayment','Rate']} rows={compRows.map((r,i) => editing ? [
          <input style={rowInp} value={r.lender} onChange={e=>updCompRow(i,'lender',e.target.value)}/>,
          <input style={rowInp} value={r.purpose} onChange={e=>updCompRow(i,'purpose',e.target.value)}/>,
          <select style={rowInp} value={r.type} onChange={e=>updCompRow(i,'type',e.target.value)}><option>P&I</option><option>IO</option></select>,
          <input style={rowInp} value={r.term} onChange={e=>updCompRow(i,'term',e.target.value)}/>,
          <input style={rowInp} value={r.baseLoan} onChange={e=>updCompRow(i,'baseLoan',e.target.value)}/>,
          <input style={rowInp} value={r.lmi} onChange={e=>updCompRow(i,'lmi',e.target.value)}/>,
          <input style={rowInp} value={r.repayment} onChange={e=>updCompRow(i,'repayment',e.target.value)}/>,
          <div style={{display:'flex',gap:6,alignItems:'center'}}><input style={rowInp} value={r.rate} onChange={e=>updCompRow(i,'rate',e.target.value)}/><button onClick={()=>rmCompRow(i)} style={rmBtnStyle}>✕</button></div>,
        ] : [r.lender,r.purpose,r.type,r.term,fmtM(r.baseLoan),fmtM(r.lmi),fmtM(r.repayment),r.rate?`${r.rate}%`:'—'])}/>
      </TabCard>

      {strat.isConstruction && (
        <TabCard title="Drawdown & Sale Proceeds">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Estimated sales price ($)"><input style={inp} type="number" disabled={!editing} value={strat.salesPrice||''} onChange={e=>s('salesPrice', e.target.value?Number(e.target.value):'')}/></Field>
            <Field label="Existing loan payout ($)"><input style={inp} type="number" disabled={!editing} value={strat.loanPayout||''} onChange={e=>s('loanPayout', e.target.value?Number(e.target.value):'')}/></Field>
            <Field label="Construction loan portion ($)"><input style={inp} type="number" disabled={!editing} value={strat.constructionLoanPortion||''} onChange={e=>s('constructionLoanPortion', e.target.value?Number(e.target.value):'')}/></Field>
            <Field label="Savings / offset contribution ($)"><input style={inp} type="number" disabled={!editing} value={strat.savingsContribution||''} onChange={e=>s('savingsContribution', e.target.value?Number(e.target.value):'')}/></Field>
          </div>
        </TabCard>
      )}
      <div style={{ fontSize:11, color:'#9ca3af' }}>Stamp duty is a manual estimate for now — flagged for a proper state-based OSR calculator in a later pass.</div>
    </div>
  )
}

function StructureTab({ d, editing, set }) {
  const [sub, setSub] = useState('client')
  const struct = d._structure || {}
  const s = (k, v) => set('_structure', { ...struct, [k]: v })
  const entities = struct.entities || []
  const securities = struct.securities || []
  const facilities = struct.facilities || []
  const fin = struct.financials || {}
  const setFin = (year, k, v) => s('financials', { ...fin, [year]: { ...(fin[year]||{}), [k]: v } })
  const servicing = struct.servicing || {}
  const setServicing = (k, v) => s('servicing', { ...servicing, [k]: v })

  const subs = [ {id:'client',label:'Client Details'}, {id:'security',label:'Security'}, {id:'financials',label:'Financials'}, {id:'servicing',label:'Servicing'} ]

  const addEntity = () => s('entities', [...entities, { name:'', type:'Company', position:'Borrower', shortName:'' }])
  const updEntity = (i,k,v) => s('entities', entities.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmEntity = (i) => s('entities', entities.filter((_,idx)=>idx!==i))

  const addSecurity = () => s('securities', [...securities, { type:'1MTG', description:'', value:'', lendingValue:'', owner:'', band:'FS' }])
  const updSecurity = (i,k,v) => s('securities', securities.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmSecurity = (i) => s('securities', securities.filter((_,idx)=>idx!==i))

  const addFacility = () => s('facilities', [...facilities, { entity:'', type:'Term Loan', lender:'', amount:'', rate:'', llvr:'' }])
  const updFacility = (i,k,v) => s('facilities', facilities.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmFacility = (i) => s('facilities', facilities.filter((_,idx)=>idx!==i))

  const years = ['Y1','Y2','Y3','YTD','Fcst']
  const dscr = servicing.ebitda && servicing.repayments ? (Number(servicing.ebitda)/Number(servicing.repayments)).toFixed(2) : '—'
  const icr = servicing.ebit && servicing.interestForCover ? (Number(servicing.ebit)/Number(servicing.interestForCover)).toFixed(2) : '—'

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {subs.map(x => (
          <button key={x.id} onClick={()=>setSub(x.id)} style={{
            padding:'6px 14px', fontSize:12, fontWeight:600, borderRadius:6, cursor:'pointer',
            border:`1px solid ${sub===x.id?'#3D4F6B':'#e8eaed'}`,
            background: sub===x.id ? '#3D4F6B' : '#fff',
            color: sub===x.id ? '#fff' : '#2A3545',
          }}>{x.label}</button>
        ))}
      </div>

      {sub === 'client' && (
        <TabCard title="Entity & Individual Register" right={editing && <button onClick={addEntity} style={addBtnStyle}>+ Add entity</button>}>
          <MiniTable columns={['Entity / Individual','Entity Type','Position','Short Name', editing?'':undefined].filter(Boolean)} rows={entities.map((r,i) => editing ? [
            <input style={rowInp} value={r.name} onChange={e=>updEntity(i,'name',e.target.value)}/>,
            <select style={rowInp} value={r.type} onChange={e=>updEntity(i,'type',e.target.value)}>{ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}</select>,
            <select style={rowInp} value={r.position} onChange={e=>updEntity(i,'position',e.target.value)}>{ENTITY_POSITIONS.map(t=><option key={t}>{t}</option>)}</select>,
            <div style={{display:'flex',gap:6,alignItems:'center'}}><input style={rowInp} value={r.shortName} onChange={e=>updEntity(i,'shortName',e.target.value)}/><button onClick={()=>rmEntity(i)} style={rmBtnStyle}>✕</button></div>,
          ] : [r.name,r.type,r.position,r.shortName])}/>
        </TabCard>
      )}

      {sub === 'security' && (
        <>
          <TabCard title="Facilities" right={editing && <button onClick={addFacility} style={addBtnStyle}>+ Add facility</button>}>
            <MiniTable columns={['Borrowing Entity','Facility Type','Lender','Loan Amount','Rate','LLVR']} rows={facilities.map((r,i) => editing ? [
              <input style={rowInp} value={r.entity} onChange={e=>updFacility(i,'entity',e.target.value)}/>,
              <select style={rowInp} value={r.type} onChange={e=>updFacility(i,'type',e.target.value)}>{FACILITY_TYPES.map(t=><option key={t}>{t}</option>)}</select>,
              <input style={rowInp} value={r.lender} onChange={e=>updFacility(i,'lender',e.target.value)}/>,
              <input style={rowInp} value={r.amount} onChange={e=>updFacility(i,'amount',e.target.value)}/>,
              <input style={rowInp} value={r.rate} onChange={e=>updFacility(i,'rate',e.target.value)}/>,
              <div style={{display:'flex',gap:6,alignItems:'center'}}><input style={rowInp} value={r.llvr} onChange={e=>updFacility(i,'llvr',e.target.value)}/><button onClick={()=>rmFacility(i)} style={rmBtnStyle}>✕</button></div>,
            ] : [r.entity,r.type,r.lender, r.amount?`$${Number(r.amount).toLocaleString()}`:'—', r.rate?`${r.rate}%`:'—', r.llvr?`${r.llvr}%`:'—'])}/>
          </TabCard>

          <TabCard title="Securities Held" right={editing && <button onClick={addSecurity} style={addBtnStyle}>+ Add security</button>}>
            <MiniTable columns={['Type','Description','Value','Lending Value','Owner','Band']} rows={securities.map((r,i) => editing ? [
              <select style={rowInp} value={r.type} onChange={e=>updSecurity(i,'type',e.target.value)}>{SECURITY_TYPES.map(t=><option key={t}>{t}</option>)}</select>,
              <input style={rowInp} value={r.description} onChange={e=>updSecurity(i,'description',e.target.value)}/>,
              <input style={rowInp} value={r.value} onChange={e=>updSecurity(i,'value',e.target.value)}/>,
              <input style={rowInp} value={r.lendingValue} onChange={e=>updSecurity(i,'lendingValue',e.target.value)}/>,
              <input style={rowInp} value={r.owner} onChange={e=>updSecurity(i,'owner',e.target.value)}/>,
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <select style={rowInp} value={r.band} onChange={e=>updSecurity(i,'band',e.target.value)}>{SEC_BANDS.map(b=><option key={b.code} value={b.code}>{b.code}</option>)}</select>
                <button onClick={()=>rmSecurity(i)} style={rmBtnStyle}>✕</button>
              </div>,
            ] : [<Pill tone="navy">{r.type}</Pill>, r.description, r.value?`$${Number(r.value).toLocaleString()}`:'—', r.lendingValue?`$${Number(r.lendingValue).toLocaleString()}`:'—', r.owner, <Pill tone={r.band==='WS'?'green':r.band==='UN'?'slate':'pink'}>{r.band}</Pill>])}/>
          </TabCard>
        </>
      )}

      {sub === 'financials' && (
        <TabCard title="Trading Analysis">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'6px 8px',background:'#3D4F6B',color:'#fff',fontSize:10}}>Metric</th>
                {years.map(y=><th key={y} style={{textAlign:'left',padding:'6px 8px',background:'#3D4F6B',color:'#fff',fontSize:10}}>{y}</th>)}
              </tr></thead>
              <tbody>
                {[['sales','Sales / Revenue'],['grossMargin','Gross Margin (%)'],['ebitda','EBITDA'],['npbt','NPBT']].map(([k,label]) => (
                  <tr key={k}>
                    <td style={{padding:'6px 8px',borderBottom:'0.5px solid #f0f0f0',color:'#7A8090'}}>{label}</td>
                    {years.map(y => (
                      <td key={y} style={{padding:'4px 6px',borderBottom:'0.5px solid #f0f0f0'}}>
                        {editing
                          ? <input style={rowInp} value={fin[y]?.[k]||''} onChange={e=>setFin(y,k,e.target.value)}/>
                          : <span style={{color:'#2A3545'}}>{fin[y]?.[k] ? (k==='grossMargin' ? `${fin[y][k]}%` : `$${Number(fin[y][k]).toLocaleString()}`) : '—'}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabCard>
      )}

      {sub === 'servicing' && (
        <>
          <TabCard title="Debt Servicing (Proposed)">
            {editing ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="Repayments for debt servicing ($ p.a.)"><input style={inp} type="number" value={servicing.repayments||''} onChange={e=>setServicing('repayments', e.target.value)}/></Field>
                <Field label="Interest for interest cover ($ p.a.)"><input style={inp} type="number" value={servicing.interestForCover||''} onChange={e=>setServicing('interestForCover', e.target.value)}/></Field>
                <Field label="EBITDA ($)"><input style={inp} type="number" value={servicing.ebitda||''} onChange={e=>setServicing('ebitda', e.target.value)}/></Field>
                <Field label="EBIT ($)"><input style={inp} type="number" value={servicing.ebit||''} onChange={e=>setServicing('ebit', e.target.value)}/></Field>
              </div>
            ) : (
              <MiniTable columns={['Metric','Value']} rows={[
                ['Repayments for Debt Servicing', servicing.repayments?`$${Number(servicing.repayments).toLocaleString()} p.a.`:'—'],
                ['Interest for Interest Cover', servicing.interestForCover?`$${Number(servicing.interestForCover).toLocaleString()} p.a.`:'—'],
                ['EBITDA', servicing.ebitda?`$${Number(servicing.ebitda).toLocaleString()}`:'—'],
                ['EBIT', servicing.ebit?`$${Number(servicing.ebit).toLocaleString()}`:'—'],
              ]}/>
            )}
            <div style={{ display:'flex', gap:24, marginTop:12 }}>
              <div><div style={{fontSize:10,color:'#9ca3af'}}>Debt Service Cover Ratio</div><div style={{fontSize:18,fontWeight:700,color:'#3D4F6B'}}>{dscr}{dscr!=='—'?'x':''}</div></div>
              <div><div style={{fontSize:10,color:'#9ca3af'}}>Interest Cover Ratio</div><div style={{fontSize:18,fontWeight:700,color:'#3D4F6B'}}>{icr}{icr!=='—'?'x':''}</div></div>
            </div>
          </TabCard>
          <TabCard title="Home Loan Servicing">
            <div style={{ fontSize:12, color:'#7A8090', marginBottom:10 }}>For residential/PAYG servicing, link straight to a Quickli assessment rather than duplicating buffer logic here.</div>
            <Field label="Quickli link"><input style={inp} placeholder="https://quickli.com.au/…" value={servicing.quickliLink||''} onChange={e=>setServicing('quickliLink', e.target.value)} disabled={!editing}/></Field>
            {servicing.quickliLink && <a href={servicing.quickliLink} target="_blank" rel="noreferrer" style={{ display:'inline-block', marginTop:8, fontSize:12, fontWeight:600, color:'#fff', background:'#3D4F6B', borderRadius:6, padding:'8px 16px', textDecoration:'none' }}>Open in Quickli ↗</a>}
          </TabCard>
        </>
      )}
    </div>
  )
}

function AttachmentsTab({ deal, deals, setDeals, editing, d, set }) {
  const att = d._attachments || {}
  const txnType = att.type || d['Transaction Type'] || 'Purchase'
  const items = ATTACHMENT_TEMPLATES[txnType] || ATTACHMENT_TEMPLATES['Other']
  const checked = att.checked || {}

  // Checklist toggling saves straight away, same pattern as Contacts/Referrer — no need to enter edit mode just to tick a box.
  function toggle(item) {
    const updatedAtt = { ...att, type: txnType, checked: { ...checked, [item]: !checked[item] } }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _attachments: updatedAtt } : x)
    setDeals(updated); saveDeals(updated)
    if (editing) set('_attachments', updatedAtt)
  }
  function changeType(newType) {
    const updatedAtt = { ...att, type: newType }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _attachments: updatedAtt } : x)
    setDeals(updated); saveDeals(updated)
    if (editing) set('_attachments', updatedAtt)
  }

  return (
    <div>
      <TabCard title="Transaction Type">
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {Object.keys(ATTACHMENT_TEMPLATES).map(t => (
            <button key={t} onClick={()=>changeType(t)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
              border:`1.5px solid ${txnType===t?'#EB99C2':'#e8eaed'}`,
              background: txnType===t ? '#fdf0f6' : '#fff',
              color: txnType===t ? '#9b2c6e' : '#2A3545',
            }}>{t}</button>
          ))}
        </div>
      </TabCard>

      <TabCard title={`Required Documents — ${txnType}`} right={<Pill tone="slate">Auto-read: coming soon</Pill>}>
        {items.map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 4px', borderBottom: i<items.length-1 ? '0.5px solid #f0f0f0' : 'none' }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', flex:1 }}>
              <input type="checkbox" checked={!!checked[item]} onChange={()=>toggle(item)} />
              <span style={{ fontSize:12.5, color: checked[item] ? '#B0B5BD' : '#2A3545', textDecoration: checked[item] ? 'line-through' : 'none' }}>{item}</span>
            </label>
          </div>
        ))}
      </TabCard>
      <div style={{ fontSize:11, color:'#9ca3af' }}>Next pass: reading uploaded ID/bank statements/financials to auto-populate Loan Details, Structure and Servicing fields.</div>
    </div>
  )
}

function NotesTab({ d, editing, set, deal, deals, setDeals }) {
  const fileNotes = d._fileNotes || []
  const [selected, setSelected] = useState(0)
  const [draftNote, setDraftNote] = useState({ type:'General Note', title:'', body:'' })

  function addNote() {
    if (!draftNote.title.trim()) return
    const entry = { ...draftNote, date: new Date().toISOString().slice(0,10), user: d.Advisor || 'Cameron Finlayson' }
    const updatedNotes = [entry, ...fileNotes]
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _fileNotes: updatedNotes } : x)
    setDeals(updated); saveDeals(updated)
    if (editing) set('_fileNotes', updatedNotes)
    setDraftNote({ type:'General Note', title:'', body:'' })
    setSelected(0)
  }

  const bid = d._bid || {}
  const setBid = (k,v) => set('_bid', { ...bid, [k]: v })
  const disclosures = bid.disclosures || {}
  const toggleDisclosure = (k) => {
    const updated = { ...bid, disclosures: { ...disclosures, [k]: !disclosures[k] } }
    const updatedDeals = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _bid: updated } : x)
    setDeals(updatedDeals); saveDeals(updatedDeals)
    if (editing) set('_bid', updated)
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <TabCard title="Team & notes">
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
          </TabCard>

          <TabCard title="General Notes">
            {fileNotes.map((n,i) => (
              <div key={i} onClick={()=>setSelected(i)} style={{ padding:'10px 8px', borderRadius:6, cursor:'pointer', background: selected===i?'#EEF2F6':'transparent', borderBottom:'0.5px solid #f0f0f0' }}>
                <div style={{ fontSize:10, color:'#9ca3af' }}>{n.date} · {n.type} · {n.user}</div>
                <div style={{ fontSize:12, fontWeight:600, color:'#2A3545' }}>{n.title}</div>
              </div>
            ))}
            {fileNotes.length === 0 && <div style={{ fontSize:11, color:'#9ca3af', padding:'8px 0' }}>No file notes yet</div>}

            <div style={{ marginTop:12, borderTop:'0.5px solid #e8eaed', paddingTop:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <select style={inp} value={draftNote.type} onChange={e=>setDraftNote(n=>({...n,type:e.target.value}))}>
                  <option>General Note</option><option>Appointment</option><option>Email Out</option><option>Call</option>
                </select>
                <input style={inp} placeholder="Title" value={draftNote.title} onChange={e=>setDraftNote(n=>({...n,title:e.target.value}))}/>
              </div>
              <textarea style={{...inp,resize:'vertical',marginBottom:8}} rows={2} placeholder="Note detail…" value={draftNote.body} onChange={e=>setDraftNote(n=>({...n,body:e.target.value}))}/>
              <button onClick={addNote} style={addBtnStyle}>+ Add file note</button>
            </div>
          </TabCard>
        </div>

        <TabCard title="File Note Detail">
          {fileNotes[selected] ? (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'#3D4F6B', marginBottom:8 }}>{fileNotes[selected].title}</div>
              <p style={{ fontSize:12, color:'#2A3545', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{fileNotes[selected].body}</p>
            </>
          ) : <div style={{ fontSize:11, color:'#9ca3af' }}>Select or add a file note to see detail here.</div>}
        </TabCard>
      </div>

      <TabCard title="BID & NCCP — Requirements and Objectives">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {[
            ['objectives','Your objectives are'],
            ['requirements','Your requirements are'],
            ['reasonForLender','Reason for choice of lender / product'],
            ['exitStrategy','Exit strategy'],
          ].map(([k,label]) => (
            <div key={k}>
              <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.03em' }}>{label}</div>
              {editing
                ? <textarea style={{...inp,resize:'vertical'}} rows={2} value={bid[k]||''} onChange={e=>setBid(k,e.target.value)}/>
                : <div style={{ fontSize:12.5, color:'#2A3545' }}>{bid[k] || '—'}</div>}
            </div>
          ))}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.03em' }}>Disclosure documents</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['Credit Guide','Quote','Privacy Consent'].map(doc => (
                <span key={doc} onClick={()=>toggleDisclosure(doc)} style={{ cursor:'pointer' }}>
                  <Pill tone={disclosures[doc] ? 'green' : 'slate'}>{doc} {disclosures[doc] ? '— Provided' : '— Pending'}</Pill>
                </span>
              ))}
            </div>
          </div>
        </div>
      </TabCard>
    </div>
  )
}

const addBtnStyle = { fontSize:11, fontWeight:600, color:'#3D4F6B', background:'#fff', border:'1px solid #e8eaed', borderRadius:6, padding:'5px 12px', cursor:'pointer' }
const rmBtnStyle = { fontSize:10, padding:'3px 7px', borderRadius:4, border:'1px solid #fecaca', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }
const rowInp = { border:'1px solid #e8eaed', borderRadius:5, padding:'4px 7px', fontSize:11.5, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }

export default function DealPage({ onUpdateDeals, clients = [] }) {
  const { dealName } = useParams()
  const navigate = useNavigate()
  const decodedName = decodeURIComponent(dealName)
  const [deals, setDeals] = useState(() => getDeals())
  const [tab, setTab] = useState('details')

  // If the local cache was empty on load (e.g. cache just cleared), pull the
  // real deals down from Supabase rather than working from nothing.
  useEffect(() => {
    syncDealsFromSupabase().then(cloud => {
      if (cloud) setDeals(cloud)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
    const finalDraft = {...draft}
    // Always sync Month of Settlement from Finance Due Date on save
    if (finalDraft['Finance Due Date']) {
      finalDraft['Month of Settlement'] = finalDraft['Finance Due Date']
    }
    const updated = deals.map(d => d['Transaction Name'] === decodedName ? finalDraft : d)
    setDeals(updated)
    saveDeals(updated)
    if (onUpdateDeals) onUpdateDeals(updated)
    setEditing(false); setDraft(null); setSaved(true)
    setTimeout(()=>setSaved(false), 3000)
  }

  const d = editing ? draft : deal
  const sc = STAGE_COLORS[d.Status] || STAGE_COLORS['1. Lead']
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'

  const TABS = [
    { id:'details', label:'Loan Details' },
    { id:'strategy', label:'Strategy' },
    { id:'structure', label:'Structure' },
    { id:'attachments', label:'Attachments' },
    { id:'notes', label:'Notes' },
  ]

  return (
    <div>
      <CRMTopbar />
      <div style={{ padding:'16px 32px 40px', width:'100%', boxSizing:'border-box' }}>
        <button onClick={()=>navigate('/crm')} style={{ background:'none', border:'none', color:'#EB99C2', cursor:'pointer', fontSize:12, marginBottom:14, padding:0 }}>← Back to pipeline</button>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
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

        {/* Stage tracker */}
        <StageTracker status={d.Status} editing={editing} onChange={(s)=>set('Status', s)} />

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'2px solid #e8eaed', marginBottom:18 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:'10px 18px', fontSize:12.5, fontWeight:700, cursor:'pointer', border:'none', borderRadius:'8px 8px 0 0', marginRight:3,
              color: tab===t.id ? '#fff' : '#2A3545',
              background: tab===t.id ? '#2A3545' : '#e4e7eb',
            }}>{t.label}</button>
          ))}
        </div>

        {tab === 'details' && <LoanDetailsTab d={d} editing={editing} draft={draft} set={set} deal={deal} deals={deals} setDeals={setDeals} clients={clients} />}
        {tab === 'strategy' && <StrategyTab d={d} editing={editing} set={set} />}
        {tab === 'structure' && <StructureTab d={d} editing={editing} set={set} />}
        {tab === 'attachments' && <AttachmentsTab deal={deal} deals={deals} setDeals={setDeals} editing={editing} d={d} set={set} />}
        {tab === 'notes' && <NotesTab d={d} editing={editing} set={set} deal={deal} deals={deals} setDeals={setDeals} />}
      </div>
    </div>
  )
}
