import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals, syncDealsFromSupabase } from '../lib/deals'
import CRMTopbar from '../components/CRMTopbar'
import ReferrerPicker from '../components/ReferrerPicker'

const STAGES = ['1. Lead','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional','7. Settled','8. Withdrawn']
// Category list and per-category Transaction Type options, per Cameron's
// working spreadsheet (Category drives which Transaction Types are valid).
// NOTE: this replaces the older, shorter category list. Two places still use
// the old list and haven't been updated (flagged so nothing silently drifts):
//  - src/components/NewOpportunityModal.jsx (new-deal creation form)
//  - src/lib/settings.js DEFAULT_SETTINGS.commissionRates (keyed by the old
//    category names — a deal saved with a new category name will fall back
//    to the 0.50% default commission rate until those keys are updated too)
const CATEGORIES = ['Residential','Commercial','Full Commercial (BANK RM)','SMSF','Business Loan','Trade & Invoice Finance','Asset Finance','Development']
const CATEGORY_TRANSACTION_TYPES = {
  'Residential': ['Purchase','Refinance','Pre-approval','Equity Release','Variation','Construction','FHO','Business Loan'],
  'Commercial': ['Purchase','Refinance','Pre-approval','Equity Release','Variation','Construction','FHO','Business Loan'],
  'Full Commercial (BANK RM)': ['New','Refinance','Variation','Equity Release','Business Loan','Maturity','Asset Finance','Trade & Working Capital'],
  'SMSF': ['Purchase','Refinance','Pre-approval','Construction'],
  'Business Loan': ['New','Refinance','Variation','Equity Release','Business Loan','Maturity','Asset Finance','Trade & Working Capital'],
  'Trade & Invoice Finance': ['New','Refinance','Variation'],
  'Asset Finance': ['Purchase','Refinance','Sale & Lease Back','Balloon/Maturity'],
  'Development': ['New Development','Mezzanine','Variation','Refinance','Residual Stock'],
}
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

// Keyed by Category (not Transaction Type) — Cameron confirmed Category is
// the right driver here. 'Other' is the fallback for a deal with no Category
// set yet.
const ATTACHMENT_TEMPLATES = {
  'Residential': ['ID — Driver\'s Licence / Passport','Payslips (2 recent)','3 months bank statements','Contract of Sale (if purchasing)','Current loan statement (if refinancing)','Evidence of deposit / savings','Rates notice'],
  'Commercial': ['ID — Driver\'s Licence / Passport','2 years financials (P&L + BS)','Contract of Sale / current facility statement','Business bank statements (6 mths)','ASIC extract','Lease agreement / tenancy schedule (if applicable)'],
  'Full Commercial (BANK RM)': ['Group structure chart','2–3 years financials (all entities)','Security register / GSA details','ASIC extracts (all entities)','Trust deed(s) (if applicable)','Existing facility statements across the relationship'],
  'SMSF': ['SMSF trust deed','Fund financials','Member statements','ID — Trustees','Contract of Sale (if purchasing)','Current loan statement (if refinancing)'],
  'Business Loan': ['2 years financials (P&L + BS)','ATO Portal / ITRs','Business bank statements (6 mths)','ASIC extract','Security / GSA details'],
  'Trade & Invoice Finance': ['Debtor ledger / aged receivables','2 years financials','Business bank statements (6 mths)','ASIC extract','Trade references'],
  'Asset Finance': ['Asset invoice / quote','ID — Driver\'s Licence / Passport','ABN / entity details','Recent BAS','Insurance details'],
  'Development': ['Feasibility study','Development approval (DA)','Fixed price building contract','QS report','Land title / Contract of Sale','2–3 years financials','Presales evidence (if applicable)'],
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

const LENDER_SUGGESTIONS = ['Pepper Money','Bankwest','Resimac','Redzed','Think Tank','Liberty Financial','Bluestone','La Trobe Financial','Firstmac','Prospa','MyState','Suncorp','ING','Macquarie Bank','HSBC','CBA','Westpac','NAB','ANZ','Latitude Financial','ORDE Financial','Better Choice','Granite Home Loans']
const CONTRIBUTION_TYPES = ['Additional Savings','Gift','Proceeds of Sale','Liquidated Assets (Shares)','Other']

// Always-editable inputs that commit on blur (text/number) or immediately
// (select/date) rather than requiring the page's Edit-deal/Save flow. Local
// state buffers keystrokes so we're not writing to Supabase on every
// character typed — only once the field is done being edited.
function LiveText({ value, onCommit, placeholder, list, small }) {
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  return (
    <input
      style={small ? rowInp : inp}
      value={val}
      placeholder={placeholder}
      list={list}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>{ if ((val||'') !== (value||'')) onCommit(val) }}
    />
  )
}
function LiveNumber({ value, onCommit, placeholder, step, small }) {
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  return (
    <input
      style={small ? rowInp : inp}
      type="number"
      step={step}
      value={val}
      placeholder={placeholder}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>{
        const num = val === '' ? '' : Number(val)
        if (num !== (value ?? '')) onCommit(num)
      }}
    />
  )
}
function LiveSelect({ value, onCommit, options, placeholder='— Select —', allowBlank=true, small }) {
  return (
    <select style={small ? rowInp : inp} value={value||''} onChange={e=>onCommit(e.target.value)}>
      {allowBlank && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
function LiveDate({ value, onCommit }) {
  return <input style={inp} type="date" value={value?.slice(0,10)||''} onChange={e=>onCommit(e.target.value)} />
}

function StageTracker({ status, onChange }) {
  const isWithdrawn = status === '8. Withdrawn'
  const idx = TRACKER_STAGES.indexOf(isWithdrawn ? '1. Lead' : status)
  return (
    <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'20px 24px 8px', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center' }}>
        {TRACKER_STAGES.map((s, i) => (
          <div key={s} style={{ display:'flex', alignItems:'center', flex: i === TRACKER_STAGES.length-1 ? '0 0 auto' : 1 }}>
            <div
              onClick={() => onChange(s)}
              title={`Move to ${s.replace(/^\d+\.\s*/,'')}`}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer' }}
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
      <div style={{ fontSize:10, color:'#9ca3af', paddingBottom:10 }}>Click any stage to move this deal straight there — set "8. Withdrawn" from Status in Loan Details.</div>
    </div>
  )
}

// ReadRow-styled but directly editable — label left, value right-aligned,
// no visible input box until focused. This is the layout Cameron wants back
// (label/value stacked rows) while keeping the no-edit-button editing model.
const rowWrap = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'0.5px solid #f0f0f0', gap:10 }
const rowLabel = { fontSize:11, color:'#7A8090', flexShrink:0 }
function rowValueStyle(focused, pink) {
  return {
    border:'none', borderBottom: focused ? '1px solid #EB99C2' : '1px solid transparent',
    background:'transparent', textAlign:'right', fontSize:11, fontWeight: pink?700:500,
    color: pink ? '#EB99C2' : '#2A3545', outline:'none', width:'60%', padding:'2px 0',
    fontFamily:'inherit', cursor:'text',
  }
}

function LiveRow({ label, value, onCommit, placeholder='—', pink, list }) {
  const [val, setVal] = useState(value ?? '')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setVal(value ?? '') }, [value, focused])
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <input
        value={val}
        placeholder={placeholder}
        list={list}
        onFocus={()=>setFocused(true)}
        onChange={e=>setVal(e.target.value)}
        onBlur={()=>{ setFocused(false); if ((val||'') !== (value||'')) onCommit(val) }}
        style={rowValueStyle(focused, pink)}
      />
    </div>
  )
}

function LiveRowCurrency({ label, value, onCommit, pink }) {
  const [editVal, setEditVal] = useState('')
  const [focused, setFocused] = useState(false)
  const display = focused ? editVal : (value ? `$${Number(value).toLocaleString()}` : '')
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <input
        value={display}
        placeholder="—"
        onFocus={()=>{ setFocused(true); setEditVal(value ?? '') }}
        onChange={e=>setEditVal(e.target.value.replace(/[^0-9.]/g,''))}
        onBlur={()=>{
          setFocused(false)
          const num = editVal === '' ? '' : Number(editVal)
          if (num !== (value ?? '')) onCommit(num===''?null:num)
        }}
        style={rowValueStyle(focused, pink)}
      />
    </div>
  )
}

function LiveRowSelect({ label, value, onCommit, options, placeholder='—', disabled }) {
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={e=>onCommit(e.target.value)}
        style={{ ...rowValueStyle(false, false), appearance:'none', WebkitAppearance:'none', cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#c7cad1' : '#2A3545' }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function LiveRowDate({ label, value, onCommit }) {
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <input type="date" value={value?.slice(0,10)||''} onChange={e=>onCommit(e.target.value)} style={rowValueStyle(false,false)} />
    </div>
  )
}

function LoanDetailsTab({ d, editing, draft, set, deal, deals, setDeals, clients, updateDeal }) {
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'
  const validTxnTypes = CATEGORY_TRANSACTION_TYPES[deal.Categories] || []
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <TabCard title="Deal details">
          <datalist id="lender-suggestions">{LENDER_SUGGESTIONS.map(l=><option key={l} value={l}/>)}</datalist>
          <LiveRowCurrency label="Amount" value={deal.Amount} onCommit={v=>updateDeal({Amount:v})} pink />
          <LiveRowSelect label="Category" value={deal.Categories} onCommit={v=>{
            const validTypes = CATEGORY_TRANSACTION_TYPES[v] || []
            const patch = { Categories: v }
            if (deal['Transaction Type'] && !validTypes.includes(deal['Transaction Type'])) patch['Transaction Type'] = ''
            updateDeal(patch)
          }} options={CATEGORIES} />
          <LiveRowSelect label="Transaction type" value={deal['Transaction Type']} onCommit={v=>updateDeal({'Transaction Type':v})} options={validTxnTypes} disabled={!deal.Categories} placeholder={deal.Categories ? '—' : 'Pick a category first'} />
          <LiveRow label="Lender" value={deal.Lender} onCommit={v=>updateDeal({Lender:v})} list="lender-suggestions" />
          <LiveRowSelect label="Lead source" value={deal['Lead Source']} onCommit={v=>updateDeal({'Lead Source':v})} options={LEAD_SOURCES} />
          <LiveRowCurrency label="Total security" value={deal['Total Security']} onCommit={v=>updateDeal({'Total Security':v})} />
          <LiveRow label="Internal reference" value={deal['Internal Reference']} onCommit={v=>updateDeal({'Internal Reference':v})} />
          {(deal['_referrers']||[]).length > 0 && (
            <div style={{ marginTop:10, fontSize:11, color:'#7A8090' }}>Referral partner: <strong style={{color:'#2A3545'}}>{(deal['_referrers']||[]).map(r=>r.name).join(', ')}</strong></div>
          )}
        </TabCard>

        <TabCard title="Key dates">
          <LiveRowDate label="Settlement date" value={deal['Date Settled']} onCommit={v=>updateDeal({'Date Settled':v})} />
          <LiveRowDate label="Finance due date" value={deal['Finance Due Date']} onCommit={v=>updateDeal({ 'Finance Due Date': v, 'Month of Settlement': v ? v.slice(0,7) : deal['Month of Settlement'] })} />
          <LiveRowDate label="Deposit due date" value={deal['Deposit Due Date']} onCommit={v=>updateDeal({'Deposit Due Date':v})} />
          <LiveRowDate label="Fixed rate expiry" value={deal['Fixed Rate Expiry']} onCommit={v=>updateDeal({'Fixed Rate Expiry':v})} />
          <LiveRowDate label="IO expiry" value={deal['Interest Only Expiry']} onCommit={v=>updateDeal({'Interest Only Expiry':v})} />
          <LiveRowDate label="Discharge date" value={deal['Discharge Date']} onCommit={v=>updateDeal({'Discharge Date':v})} />
          <LiveRow label="Discharge reason" value={deal['Discharge Reason']} onCommit={v=>updateDeal({'Discharge Reason':v})} />
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

// Strategy no longer has its own independent Transaction Type selector —
// Cameron wants it driven entirely by Category + Transaction Type set on the
// Loan Details tab. This maps each Transaction Type value to which of the
// three funding-table shapes applies. Not every value maps perfectly (e.g.
// "Business Loan" as a transaction type isn't really property-shaped) — it
// falls back to the Purchase shape, which is the least assumption-heavy
// default.
const TRANSACTION_TYPE_TO_DEALTYPE = {
  'Purchase':'Purchase', 'FHO':'Purchase', 'Pre-approval':'Purchase', 'New':'Purchase', 'New Development':'Construction',
  'Refinance':'Refinance', 'Equity Release':'Refinance', 'Variation':'Refinance', 'Maturity':'Refinance', 'Residual Stock':'Refinance', 'Balloon/Maturity':'Refinance',
  'Construction':'Construction', 'Mezzanine':'Construction',
  'Business Loan':'Purchase', 'Asset Finance':'Purchase', 'Trade & Working Capital':'Purchase', 'Sale & Lease Back':'Purchase',
}
function deriveDealType(transactionType) { return TRANSACTION_TYPE_TO_DEALTYPE[transactionType] || 'Purchase' }

// General/standard transfer duty rates by state — estimates only. These do
// NOT apply first-home-buyer, pensioner, off-the-plan, or foreign-purchaser
// surcharge concessions, since those depend on client-specific eligibility.
// Treat as a starting estimate and verify against the relevant state revenue
// office for the final figure. NT uses its official quadratic formula rather
// than a bracket table; every other state is a standard marginal-rate scale.
const STAMP_DUTY_STATES = ['NSW','VIC','QLD','SA','WA','TAS','ACT','NT']
function calcStampDuty(state, price) {
  const p = Number(price) || 0
  if (!p) return 0
  const r = v => Math.round(v)
  switch (state) {
    case 'NSW':
      if (p<=16000) return r(p*0.0125)
      if (p<=35000) return r(200+(p-16000)*0.015)
      if (p<=93000) return r(485+(p-35000)*0.0175)
      if (p<=351000) return r(1500+(p-93000)*0.035)
      if (p<=1168000) return r(10530+(p-351000)*0.045)
      if (p<=3504000) return r(47295+(p-1168000)*0.055)
      return r(175745+(p-3504000)*0.07)
    case 'VIC':
      if (p<=25000) return r(p*0.014)
      if (p<=130000) return r(350+(p-25000)*0.024)
      if (p<=960000) return r(2870+(p-130000)*0.06)
      if (p<=2000000) return r(p*0.055)
      return r(110000+(p-2000000)*0.065)
    case 'QLD':
      if (p<=5000) return 0
      if (p<=75000) return r((p-5000)*0.015)
      if (p<=540000) return r(1050+(p-75000)*0.035)
      if (p<=1000000) return r(17325+(p-540000)*0.045)
      return r(38025+(p-1000000)*0.0575)
    case 'SA':
      if (p<=12000) return r(p*0.01)
      if (p<=30000) return r(120+(p-12000)*0.02)
      if (p<=50000) return r(480+(p-30000)*0.03)
      if (p<=100000) return r(1080+(p-50000)*0.035)
      if (p<=200000) return r(2830+(p-100000)*0.04)
      if (p<=250000) return r(6830+(p-200000)*0.0425)
      if (p<=300000) return r(8955+(p-250000)*0.0475)
      if (p<=500000) return r(11330+(p-300000)*0.05)
      return r(21330+(p-500000)*0.055)
    case 'WA':
      if (p<=120000) return r(p*0.019)
      if (p<=150000) return r(2280+(p-120000)*0.0285)
      if (p<=360000) return r(3135+(p-150000)*0.038)
      if (p<=725000) return r(11115+(p-360000)*0.0475)
      return r(28453.75+(p-725000)*0.0515)
    case 'TAS':
      if (p<=3000) return 50
      if (p<=25000) return Math.max(50, r(p*0.0175))
      if (p<=75000) return r(385+(p-25000)*0.0225)
      if (p<=200000) return r(1510+(p-75000)*0.035)
      if (p<=375000) return r(5935+(p-200000)*0.04)
      if (p<=725000) return r(12935+(p-375000)*0.0425)
      return r(27810+(p-725000)*0.045)
    case 'ACT':
      if (p<=260000) return r(p*0.006)
      if (p<=300000) return r(1560+(p-260000)*0.022)
      if (p<=500000) return r(2440+(p-300000)*0.034)
      if (p<=750000) return r(9240+(p-500000)*0.0432)
      if (p<=1000000) return r(20040+(p-750000)*0.059)
      if (p<=1455000) return r(34790+(p-1000000)*0.064)
      return r(p*0.0454)
    case 'NT': {
      const V = p/1000
      if (p<=525000) return r(0.06571441*V*V + 15*V)
      return r(p*0.0495)
    }
    default: return 0
  }
}

const STRATEGY_COST_FIELDS = {
  'Purchase':     [['purchasePrice','Purchase Price'],['legals','Legals'],['stampDuty','Stamp Duty (OSR est.)'],['settlementAdj','Settlement Adjustments']],
  'Construction': [['purchasePrice','Land Purchase'],['constructionCost','Construction'],['legals','Legals'],['stampDuty','Stamp Duty (OSR est.)'],['settlementAdj','Settlement Adjustments']],
  'Refinance':    [['refinancePayout','Refinance / Payout Amount'],['legals','Discharge / Legal Fees'],['settlementAdj','Settlement Adjustments']],
}

function calcFunding(strat, dealType) {
  const n = v => Number(v) || 0
  const legals = strat.legals ?? 2500
  const settlementAdj = strat.settlementAdj ?? 1500
  const lmiIncluded = !!strat.lmiIncluded
  const lmi = lmiIncluded ? n(strat.lmi) : 0

  const fields = STRATEGY_COST_FIELDS[dealType] || STRATEGY_COST_FIELDS['Purchase']
  const totalCosts = fields.reduce((sum,[key]) => {
    if (key==='legals') return sum + n(legals)
    if (key==='settlementAdj') return sum + n(settlementAdj)
    return sum + n(strat[key])
  }, 0) + lmi

  // LVR is calculated against the property's value, not its cost — for a
  // purchase those are the same figure, but Construction uses a distinct
  // Estimated Value (post-completion) and Refinance uses Property Value
  // (not the payout amount being refinanced).
  const lvrBase = dealType === 'Construction' ? n(strat.estimatedValue)
    : dealType === 'Refinance' ? n(strat.propertyValue)
    : n(strat.purchasePrice)
  const lvrPct = n(strat.baseLvr) / 100

  // LMI capitalised into the loan (default, when LMI is included at all) vs
  // paid in cash. Capitalising adds it to both the loan and the costs, so
  // it's cost-neutral to the funding gap; paying cash means it still counts
  // as a cost but has to be covered by contributions instead. Base Loan (the
  // LVR-only portion, excluding the capitalised LMI) is only meaningful —
  // and only shown — when LMI is actually being capitalised.
  const capitaliseLMI = lmiIncluded && strat.lmiCapitalised !== false
  const loanFromLender = lvrBase * lvrPct + (capitaliseLMI ? lmi : 0)
  const totalLVR = lvrBase ? (loanFromLender / lvrBase) : 0
  const showBaseLoan = capitaliseLMI && lmi > 0
  const baseLoan = loanFromLender - (capitaliseLMI ? lmi : 0)

  // Sale fees are entered as a percentage of the sale price (Cameron's
  // request) rather than a flat dollar figure.
  const saleFeesPercent = n(strat.sale?.feesPercent)
  const saleFeesAmount = strat.includeSaleProceeds ? (n(strat.sale?.estSalePrice) * saleFeesPercent / 100) : 0
  const netSaleProceeds = strat.includeSaleProceeds
    ? (n(strat.sale?.estSalePrice) - n(strat.sale?.existingLoanPayout) - saleFeesAmount)
    : 0

  const contributionsTotal = (strat.contributions||[]).reduce((sum,c)=>sum+n(c.amount),0)
  const totalFundsAvailable = loanFromLender + n(strat.equity) + n(strat.savings) + contributionsTotal + netSaleProceeds
  const surplusDeficit = totalFundsAvailable - totalCosts

  // Optional secondary calc — only for Construction deals with the toggle on.
  let constructionCalc = null
  if (dealType === 'Construction' && strat.includeConstructionFunding) {
    const additionalPurchaseCosts = n(legals) + n(strat.stampDuty) + n(settlementAdj) + lmi
    const less20PercentLand = 0.2 * n(strat.purchasePrice)
    const constructionFundsAvailable = n(strat.constructionLoanPortionRequested) + netSaleProceeds + n(strat.savingsOffset) - less20PercentLand - additionalPurchaseCosts
    const constructionSurplusDeficit = constructionFundsAvailable - n(strat.fixedPriceContract)
    constructionCalc = { additionalPurchaseCosts, less20PercentLand, constructionFundsAvailable, constructionSurplusDeficit }
  }

  return { fields, legals, settlementAdj, lmiIncluded, lmi, lvrBase, totalCosts, loanFromLender, totalLVR, capitaliseLMI, showBaseLoan, baseLoan, saleFeesAmount, netSaleProceeds, totalFundsAvailable, surplusDeficit, constructionCalc }
}

function fmtM(v) { return v==='' || v===undefined || v===null || isNaN(v) ? '—' : `$${Math.round(Number(v)).toLocaleString()}` }

// A highlighted, non-editable summary row — used for the figures Cameron
// wants visually called out (Total Costs, Loan From Lender, Total Funds
// Available in navy; Surplus/Deficit in green or red; Base Loan in the
// spreadsheet's yellow).
function ComputedRow({ label, value, tone='navy', big, side }) {
  const tones = {
    navy:  { bg:'#EEF2F6', fg:'#3D4F6B' },
    green: { bg:'#F0FDF4', fg:'#16a34a' },
    red:   { bg:'#FEF2F2', fg:'#dc2626' },
    yellow:{ bg:'#FEF9E7', fg:'#92600A' },
  }
  const t = tones[tone] || tones.navy
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', margin:'4px 0', borderRadius:6, background:t.bg }}>
      <span style={{ fontSize:11.5, fontWeight:700, color:t.fg }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        {side && <span style={{ fontSize:11, fontWeight:700, color:t.fg, opacity:0.75 }}>{side}</span>}
        <span style={{ fontSize: big?14:12.5, fontWeight:800, color:t.fg }}>{value}</span>
      </div>
    </div>
  )
}

// Loan From Lender, two-way editable: change the LVR% and the loan amount
// recalculates; write over the loan amount directly and the LVR% is solved
// backwards from it instead. Both ends write to the same underlying baseLvr
// field — the amount is never stored separately, just derived and, if
// edited directly, converted back into an equivalent LVR%.
function LoanAmountRow({ label, lvrValue, onLvrCommit, amountValue, lvrBase, lmiAddOn=0, tone='navy' }) {
  const tones = {
    navy:  { bg:'#EEF2F6', fg:'#3D4F6B' },
    green: { bg:'#F0FDF4', fg:'#16a34a' },
    red:   { bg:'#FEF2F2', fg:'#dc2626' },
    yellow:{ bg:'#FEF9E7', fg:'#92600A' },
  }
  const t = tones[tone] || tones.navy
  const [lvrEdit, setLvrEdit] = useState(lvrValue ?? '')
  const [lvrFocused, setLvrFocused] = useState(false)
  const [amtEdit, setAmtEdit] = useState('')
  const [amtFocused, setAmtFocused] = useState(false)
  useEffect(() => { if (!lvrFocused) setLvrEdit(lvrValue ?? '') }, [lvrValue, lvrFocused])

  function commitLvr() {
    setLvrFocused(false)
    const num = lvrEdit === '' ? '' : Number(lvrEdit)
    if (num !== (lvrValue ?? '')) onLvrCommit(num)
  }
  function commitAmount() {
    setAmtFocused(false)
    const num = amtEdit === '' ? '' : Number(amtEdit)
    if (num === '' || !lvrBase) return
    const impliedLvr = Math.round((((num - lmiAddOn) / lvrBase) * 100) * 100) / 100
    onLvrCommit(impliedLvr)
  }

  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', margin:'4px 0', borderRadius:6, background:t.bg }}>
      <span style={{ fontSize:11.5, fontWeight:700, color:t.fg }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          <input
            type="number" placeholder="—"
            value={lvrFocused ? lvrEdit : (lvrValue ?? '')}
            onFocus={()=>{ setLvrFocused(true); setLvrEdit(lvrValue ?? '') }}
            onChange={e=>setLvrEdit(e.target.value)}
            onBlur={commitLvr}
            style={{ width:48, textAlign:'right', border:'none', borderBottom: lvrFocused?`1px solid ${t.fg}`:'1px solid transparent', background:'transparent', fontSize:12, fontWeight:700, color:t.fg, outline:'none', fontFamily:'inherit' }}
          />
          <span style={{ fontSize:11, fontWeight:700, color:t.fg, opacity:0.75 }}>% LVR</span>
        </div>
        <input
          placeholder="—"
          value={amtFocused ? amtEdit : (amountValue ? `$${Math.round(amountValue).toLocaleString()}` : '—')}
          onFocus={()=>{ setAmtFocused(true); setAmtEdit(amountValue ? String(Math.round(amountValue)) : '') }}
          onChange={e=>setAmtEdit(e.target.value.replace(/[^0-9.]/g,''))}
          onBlur={commitAmount}
          style={{ width:110, textAlign:'right', border:'none', borderBottom: amtFocused?`1px solid ${t.fg}`:'1px solid transparent', background:'transparent', fontSize:13, fontWeight:800, color:t.fg, outline:'none', fontFamily:'inherit' }}
        />
      </div>
    </div>
  )
}

function LiveRowNumber({ label, value, onCommit, suffix, step }) {
  const [val, setVal] = useState(value ?? '')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setVal(value ?? '') }, [value, focused])
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:4, width:'60%', justifyContent:'flex-end' }}>
        <input
          type="number" step={step} value={val} placeholder="—"
          onFocus={()=>setFocused(true)}
          onChange={e=>setVal(e.target.value)}
          onBlur={()=>{ setFocused(false); const num = val===''?'':Number(val); if (num !== (value ?? '')) onCommit(num) }}
          style={{ ...rowValueStyle(focused, false), width:'auto', flex:1 }}
        />
        {suffix && <span style={{ fontSize:11, color:'#7A8090' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function LiveRowCheckbox({ label, checked, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)} />
      <span style={{ fontSize:11.5, color:'#2A3545' }}>{label}</span>
    </label>
  )
}

function StrategyTab({ deal, updateDeal }) {
  const strat = deal._strategy || {}
  const s = (k, v) => updateDeal({ _strategy: { ...strat, [k]: v } })
  const setSale = (k, v) => updateDeal({ _strategy: { ...strat, sale: { ...(strat.sale||{}), [k]: v } } })

  const dealType = deriveDealType(deal['Transaction Type'])
  const calc = calcFunding(strat, dealType)

  const equityRows = strat.equityRows || []
  const addEquityRow = () => s('equityRows', [...equityRows, { property:'', lender:'', lvr:'', valuation:'', debt:'' }])
  const updEquityRow = (i, k, v) => s('equityRows', equityRows.map((r,idx)=> idx===i ? {...r,[k]:v} : r))
  const rmEquityRow = (i) => s('equityRows', equityRows.filter((_,idx)=>idx!==i))

  const contributions = strat.contributions || []
  const addContribution = () => s('contributions', [...contributions, { label:'', amount:'' }])
  const updContribution = (i, k, v) => s('contributions', contributions.map((r,idx)=> idx===i ? {...r,[k]:v} : r))
  const rmContribution = (i) => s('contributions', contributions.filter((_,idx)=>idx!==i))

  const scenarios = strat.comparisonScenarios || []
  const addScenario = () => s('comparisonScenarios', [...scenarios, { id: Date.now(), label:'', rows: [{ property:'Home', purpose:'OO', type:'P&I', term:30, baseLoan:'', lmi:'', rate:'' }] }])
  const updScenario = (i, patch) => s('comparisonScenarios', scenarios.map((sc,idx)=> idx===i ? {...sc,...patch} : sc))
  const rmScenario = (i) => s('comparisonScenarios', scenarios.filter((_,idx)=>idx!==i))
  const addScenarioRow = (i) => updScenario(i, { rows: [...scenarios[i].rows, { property:'Home', purpose:'OO', type:'P&I', term:30, baseLoan:'', lmi:'', rate:'' }] })
  const updScenarioRow = (i, ri, k, v) => updScenario(i, { rows: scenarios[i].rows.map((r,idx)=> idx===ri ? {...r,[k]:v} : r) })
  const rmScenarioRow = (i, ri) => updScenario(i, { rows: scenarios[i].rows.filter((_,idx)=>idx!==ri) })

  function rowRepayment(r) {
    const n = v => Number(v)||0
    const total = n(r.baseLoan) + n(r.lmi)
    const rate = n(r.rate)/100
    const termMo = n(r.term)*12
    if (!rate || !termMo) return 0
    if (r.type === 'IO') return (n(r.baseLoan) * rate) / 12
    const rm = rate/12
    return (total * rm) / (1 - Math.pow(1+rm, -termMo))
  }
  function scenarioTotals(sc) {
    const n = v => Number(v)||0
    const totalBaseLoan = sc.rows.reduce((sum,r)=>sum+n(r.baseLoan),0)
    const totalRepayment = sc.rows.reduce((sum,r)=>sum+rowRepayment(r),0)
    const weightedRate = totalBaseLoan ? sc.rows.reduce((sum,r)=>sum+n(r.rate)*n(r.baseLoan),0)/totalBaseLoan : 0
    return { totalBaseLoan, totalRepayment, weightedRate }
  }

  const fundingTableTitle = dealType === 'Construction' ? 'Land & Construction Funding Table' : `${dealType} Funding Table`
  const baseValueKey = dealType === 'Construction' ? 'estimatedValue' : dealType === 'Refinance' ? 'propertyValue' : 'purchasePrice'
  const baseValueLabel = dealType === 'Construction' ? 'Estimated Value' : dealType === 'Refinance' ? 'Property Value' : 'Purchase Price'
  const showsStampDuty = calc.fields.some(([k])=>k==='stampDuty')
  const dutyEstimateBase = dealType === 'Construction' ? strat.purchasePrice : strat.purchasePrice
  const estimatedStampDuty = showsStampDuty ? calcStampDuty(strat.state||'NSW', dutyEstimateBase) : 0

  return (
    <div>
      <TabCard title="Transaction Type">
        <div style={{ fontSize:12, color:'#7A8090' }}>
          Category <strong style={{color:'#2A3545'}}>{deal.Categories || '—'}</strong> · Transaction Type <strong style={{color:'#2A3545'}}>{deal['Transaction Type'] || '—'}</strong> → showing the <strong style={{color:'#3D4F6B'}}>{dealType}</strong> funding table.
        </div>
        <div style={{ fontSize:11, color:'#9ca3af', marginTop:6 }}>Change Category / Transaction Type on the Loan Details tab to switch this.</div>
        <div style={{ marginTop:10 }}>
          <LiveRowCheckbox label="Include LMI in this deal?" checked={strat.lmiIncluded} onChange={v=>s('lmiIncluded', v)} />
          {strat.lmiIncluded && (
            <LiveRowCheckbox label="Is LMI to be capitalised into the loan?" checked={strat.lmiCapitalised !== false} onChange={v=>s('lmiCapitalised', v)} />
          )}
          <LiveRowCheckbox label="Also selling an existing property as part of this deal?" checked={strat.includeSaleProceeds} onChange={v=>s('includeSaleProceeds', v)} />
          {dealType === 'Construction' && (
            <LiveRowCheckbox label="Include construction funding portion (drawdown vs. fixed price contract)" checked={strat.includeConstructionFunding} onChange={v=>s('includeConstructionFunding', v)} />
          )}
        </div>
      </TabCard>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <TabCard title={fundingTableTitle}>
          {calc.fields.filter(([k])=>k!=='stampDuty').map(([key,label]) => {
            const val = key==='legals' ? calc.legals : key==='settlementAdj' ? calc.settlementAdj : strat[key]
            return <LiveRowCurrency key={key} label={label} value={val} onCommit={v=>s(key, v)} pink={key==='purchasePrice'} />
          })}
          {dealType !== 'Purchase' && (
            <LiveRowCurrency label={baseValueLabel} value={strat[baseValueKey]} onCommit={v=>s(baseValueKey, v)} />
          )}

          {showsStampDuty && (
            <>
              <div style={rowWrap}>
                <span style={rowLabel}>State (for stamp duty estimate)</span>
                <select value={strat.state||'NSW'} onChange={e=>s('state', e.target.value)} style={{ ...rowValueStyle(false,false), width:'40%' }}>
                  {STAMP_DUTY_STATES.map(st=><option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <LiveRowCurrency label="Stamp Duty (OSR est.)" value={strat.stampDuty} onCommit={v=>s('stampDuty', v)} />
              {estimatedStampDuty > 0 && (
                <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, margin:'-4px 0 8px' }}>
                  <span style={{ fontSize:10.5, color:'#9ca3af' }}>Estimated ({strat.state||'NSW'}): {fmtM(estimatedStampDuty)}</span>
                  <button onClick={()=>s('stampDuty', estimatedStampDuty)} style={{...addBtnStyle, padding:'2px 8px', fontSize:10}}>Apply</button>
                </div>
              )}
            </>
          )}

          {strat.lmiIncluded && <LiveRowCurrency label="LMI Est." value={strat.lmi} onCommit={v=>s('lmi', v)} />}

          <ComputedRow label="Total Costs" value={fmtM(calc.totalCosts)} tone="navy" />
          <LoanAmountRow
            label="Loan From Lender"
            lvrValue={strat.baseLvr}
            onLvrCommit={v=>s('baseLvr', v)}
            amountValue={calc.loanFromLender}
            lvrBase={calc.lvrBase}
            lmiAddOn={calc.capitaliseLMI ? calc.lmi : 0}
          />
          {calc.showBaseLoan && <ComputedRow label="Base Loan (excl. capitalised LMI)" value={fmtM(calc.baseLoan)} tone="yellow" />}

          <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
            <LiveRowCurrency label="Equity" value={strat.equity} onCommit={v=>s('equity', v)} />
            <LiveRowCurrency label="Savings" value={strat.savings} onCommit={v=>s('savings', v)} />
            {strat.includeSaleProceeds && <ComputedRow label="Proceeds from Sale of Property" value={fmtM(calc.netSaleProceeds)} tone="navy" />}
          </div>

          <div style={{ marginTop:10 }}>
            <datalist id="contribution-types">{CONTRIBUTION_TYPES.map(t=><option key={t} value={t}/>)}</datalist>
            {contributions.map((c,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                <LiveText small value={c.label} onCommit={v=>updContribution(i,'label',v)} placeholder="e.g. Gift, Liquidated Assets…" list="contribution-types" />
                <LiveNumber small value={c.amount} onCommit={v=>updContribution(i,'amount',v)} />
                <button onClick={()=>rmContribution(i)} style={rmBtnStyle}>✕</button>
              </div>
            ))}
            <button onClick={addContribution} style={{...addBtnStyle, marginTop: contributions.length ? 8 : 0}}>+ Add contribution</button>
          </div>

          <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
            <ComputedRow label="Total Funds Available" value={fmtM(calc.totalFundsAvailable)} tone="navy" big />
            <ComputedRow label="Surplus / (Deficit)" value={fmtM(calc.surplusDeficit)} tone={calc.surplusDeficit < 0 ? 'red' : 'green'} big />
          </div>
        </TabCard>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <TabCard title="Repayment Calculator">
            <LiveRowCurrency label="Amount" value={strat.repayAmount} onCommit={v=>s('repayAmount', v)} />
            <LiveRowNumber label="Term" value={strat.repayTerm} onCommit={v=>s('repayTerm', v)} suffix="yrs" />
            <LiveRowNumber label="Interest Rate" value={strat.repayRate} onCommit={v=>s('repayRate', v)} suffix="%" step="0.01" />
            {(() => {
              const amt = Number(strat.repayAmount)||0, yrs = Number(strat.repayTerm)||0, rate = (Number(strat.repayRate)||0)/100
              const nMo = yrs*12, r = rate/12
              const pi = amt && nMo && r ? (amt*r)/(1-Math.pow(1+r,-nMo)) : 0
              const io = amt && rate ? (amt*rate)/12 : 0
              return (
                <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                  <ComputedRow label="P&I Repayment (monthly)" value={pi ? `$${Math.round(pi).toLocaleString()}` : '—'} tone="navy" />
                  <ComputedRow label="IO Repayment (monthly)" value={io ? `$${Math.round(io).toLocaleString()}` : '—'} tone="navy" />
                </div>
              )
            })()}
          </TabCard>

          {strat.includeSaleProceeds && (
            <TabCard title="Estimated Proceeds From Sale">
              <LiveRowCurrency label="Estimated Sale Price" value={strat.sale?.estSalePrice} onCommit={v=>setSale('estSalePrice', v)} />
              <LiveRowNumber label="Sale Fees" value={strat.sale?.feesPercent} onCommit={v=>setSale('feesPercent', v)} suffix="%" step="0.1" />
              <LiveRowCurrency label="Existing Loan Payout" value={strat.sale?.existingLoanPayout} onCommit={v=>setSale('existingLoanPayout', v)} />
              <ComputedRow label="Sale Fees ($)" value={fmtM(calc.saleFeesAmount)} tone="navy" />
              <ComputedRow label="Estimated Proceeds from Sale" value={fmtM(calc.netSaleProceeds)} tone="yellow" />
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:6 }}>Flows automatically into the funding table's contributions.</div>
            </TabCard>
          )}

          {dealType === 'Construction' && strat.includeConstructionFunding && calc.constructionCalc && (
            <TabCard title="Funding Available for Construction">
              <LiveRowCurrency label="Fixed Price Contract" value={strat.fixedPriceContract} onCommit={v=>s('fixedPriceContract', v)} />
              <LiveRowCurrency label="Portion — Construction Loan (this request)" value={strat.constructionLoanPortionRequested} onCommit={v=>s('constructionLoanPortionRequested', v)} />
              {strat.includeSaleProceeds && <ComputedRow label="Proceeds from Sale" value={fmtM(calc.netSaleProceeds)} tone="navy" />}
              <LiveRowCurrency label="Savings (Offset Accounts)" value={strat.savingsOffset} onCommit={v=>s('savingsOffset', v)} />
              <ComputedRow label="Less 20% of Land" value={fmtM(-calc.constructionCalc.less20PercentLand)} tone="red" />
              <ComputedRow label="Less Additional Purchase Costs" value={fmtM(-calc.constructionCalc.additionalPurchaseCosts)} tone="red" />
              <ComputedRow label="Total Funds Available" value={fmtM(calc.constructionCalc.constructionFundsAvailable)} tone="navy" big />
              <ComputedRow label="Surplus / (Deficit)" value={fmtM(calc.constructionCalc.constructionSurplusDeficit)} tone={calc.constructionCalc.constructionSurplusDeficit < 0 ? 'red' : 'green'} big />
            </TabCard>
          )}
        </div>
      </div>

      <TabCard title="Equity Table — Existing Security" right={<button onClick={addEquityRow} style={addBtnStyle}>+ Add property</button>}>
        <MiniTable columns={['Property','Lender','LVR %','Valuation','LV','Debt','Equity','']} rows={equityRows.map((r,i) => {
          const lv = (Number(r.valuation)||0) * (Number(r.lvr)||0) / 100
          const equity = lv - (Number(r.debt)||0)
          return [
            <LiveText small value={r.property} onCommit={v=>updEquityRow(i,'property',v)}/>,
            <LiveText small value={r.lender} onCommit={v=>updEquityRow(i,'lender',v)}/>,
            <LiveNumber small value={r.lvr} onCommit={v=>updEquityRow(i,'lvr',v)}/>,
            <LiveNumber small value={r.valuation} onCommit={v=>updEquityRow(i,'valuation',v)}/>,
            fmtM(lv),
            <LiveNumber small value={r.debt} onCommit={v=>updEquityRow(i,'debt',v)}/>,
            fmtM(equity),
            <button onClick={()=>rmEquityRow(i)} style={rmBtnStyle}>✕</button>,
          ]
        })} empty="No existing security added yet"/>
      </TabCard>

      <TabCard title="Comparison Tables — Lender Options" right={
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <label style={{ fontSize:11, color:'#7A8090', display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
            <input type="checkbox" checked={!!strat.showLMI} onChange={e=>s('showLMI', e.target.checked)} /> Show LMI column
          </label>
          <button onClick={addScenario} style={addBtnStyle}>+ Add comparison table</button>
        </div>
      }>
        {scenarios.length === 0 && <div style={{ fontSize:11.5, color:'#9ca3af', padding:'10px 0' }}>No comparisons yet — add one for each lender or structuring option (e.g. a split loan across two facilities).</div>}
        {scenarios.map((sc, i) => {
          const totals = scenarioTotals(sc)
          const cols = ['Property','Purpose','Type','Term','Base Loan', ...(strat.showLMI ? ['LMI'] : []), 'Rate','Repayment','']
          return (
            <div key={sc.id||i} style={{ marginBottom:18, paddingBottom:14, borderBottom: i<scenarios.length-1 ? '1px solid #e8eaed' : 'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <LiveText value={sc.label} onCommit={v=>updScenario(i,{label:v})} placeholder="Comparison name (e.g. Pepper Money, or Split Structure A)" />
                <div style={{ display:'flex', gap:6, marginLeft:10 }}>
                  <button onClick={()=>addScenarioRow(i)} style={addBtnStyle}>+ Add row</button>
                  <button onClick={()=>rmScenario(i)} style={rmBtnStyle}>Remove table</button>
                </div>
              </div>
              <MiniTable columns={cols} rows={[
                ...sc.rows.map((r, ri) => {
                  const repay = rowRepayment(r)
                  const base = [
                    <LiveText small value={r.property} onCommit={v=>updScenarioRow(i,ri,'property',v)} placeholder="Home / Inv" />,
                    <LiveText small value={r.purpose} onCommit={v=>updScenarioRow(i,ri,'purpose',v)} placeholder="OO / Inv" />,
                    <LiveSelect small value={r.type} onCommit={v=>updScenarioRow(i,ri,'type',v)} options={['P&I','IO']} allowBlank={false} />,
                    <LiveNumber small value={r.term} onCommit={v=>updScenarioRow(i,ri,'term',v)} />,
                    <LiveNumber small value={r.baseLoan} onCommit={v=>updScenarioRow(i,ri,'baseLoan',v)} />,
                  ]
                  if (strat.showLMI) base.push(<LiveNumber small value={r.lmi} onCommit={v=>updScenarioRow(i,ri,'lmi',v)} />)
                  base.push(<LiveNumber small value={r.rate} onCommit={v=>updScenarioRow(i,ri,'rate',v)} step="0.01" />)
                  base.push(repay ? `$${Math.round(repay).toLocaleString()}` : '—')
                  base.push(<button onClick={()=>rmScenarioRow(i,ri)} style={rmBtnStyle}>✕</button>)
                  return base
                }),
              ]} empty="No rows yet"/>
              <div style={{ display:'flex', gap:24, marginTop:8, paddingLeft:4 }}>
                <div style={{ fontSize:11.5, color:'#7A8090' }}>Total Base Loan: <strong style={{color:'#2A3545'}}>{fmtM(totals.totalBaseLoan)}</strong></div>
                <div style={{ fontSize:11.5, color:'#7A8090' }}>Total Repayment: <strong style={{color:'#2A3545'}}>{totals.totalRepayment ? `$${Math.round(totals.totalRepayment).toLocaleString()}` : '—'}</strong></div>
                <div style={{ fontSize:11.5, color:'#7A8090' }}>Weighted Avg Rate: <strong style={{color:'#2A3545'}}>{totals.weightedRate ? `${totals.weightedRate.toFixed(2)}%` : '—'}</strong></div>
              </div>
            </div>
          )
        })}
      </TabCard>

      <div style={{ fontSize:11, color:'#9ca3af' }}>Stamp duty is a manual estimate for now — flagged for a proper state-based OSR calculator in a later pass.</div>
    </div>
  )
}

// Residential deals don't need business trading analysis / debt servicing —
// keep Structure simple for them. Every other category (Commercial, Full
// Commercial (BANK RM), SMSF, Business Loan, Trade & Invoice Finance, Asset
// Finance, Development) gets the full set, since those routinely involve
// entity financials and servicing calculations.
const SIMPLE_STRUCTURE_CATEGORIES = ['Residential']

function StructureTab({ d, editing, set }) {
  const showFinancialsServicing = !SIMPLE_STRUCTURE_CATEGORIES.includes(d.Categories)
  const subs = [
    {id:'client',label:'Client Details'},
    {id:'security',label:'Security'},
    ...(showFinancialsServicing ? [{id:'financials',label:'Financials'},{id:'servicing',label:'Servicing'}] : []),
  ]
  const [sub, setSub] = useState('client')
  useEffect(() => { if (!subs.find(x=>x.id===sub)) setSub('client') }, [d.Categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const struct = d._structure || {}
  const s = (k, v) => set('_structure', { ...struct, [k]: v })
  const entities = struct.entities || []
  const securities = struct.securities || []
  const facilities = struct.facilities || []
  const fin = struct.financials || {}
  const setFin = (year, k, v) => s('financials', { ...fin, [year]: { ...(fin[year]||{}), [k]: v } })
  const servicing = struct.servicing || {}
  const setServicing = (k, v) => s('servicing', { ...servicing, [k]: v })

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
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {subs.map(x => (
          <button key={x.id} onClick={()=>setSub(x.id)} style={{
            padding:'6px 14px', fontSize:12, fontWeight:600, borderRadius:6, cursor:'pointer',
            border:`1px solid ${sub===x.id?'#3D4F6B':'#e8eaed'}`,
            background: sub===x.id ? '#3D4F6B' : '#fff',
            color: sub===x.id ? '#fff' : '#2A3545',
          }}>{x.label}</button>
        ))}
      </div>
      {!showFinancialsServicing && (
        <div style={{ fontSize:11, color:'#9ca3af', marginBottom:16 }}>Financials & Servicing are hidden for Residential deals — change Category in Loan Details if this deal needs them.</div>
      )}
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
  const category = deal.Categories || ''
  const items = ATTACHMENT_TEMPLATES[category] || ATTACHMENT_TEMPLATES['Other']
  const checked = att.checked || {}

  // Checklist toggling saves straight away, same pattern as Contacts/Referrer — no need to enter edit mode just to tick a box.
  function toggle(item) {
    const updatedAtt = { ...att, checked: { ...checked, [item]: !checked[item] } }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _attachments: updatedAtt } : x)
    setDeals(updated); saveDeals(updated)
    if (editing) set('_attachments', updatedAtt)
  }

  return (
    <div>
      <TabCard title="Required Documents" right={<Pill tone="slate">Auto-read: coming soon</Pill>}>
        {category
          ? <div style={{ fontSize:11, color:'#7A8090', marginBottom:10 }}>Checklist for <strong style={{color:'#2A3545'}}>{category}</strong> — set in Loan Details. Change the Category there if this isn't the right list.</div>
          : <div style={{ fontSize:11, color:'#9ca3af', marginBottom:10 }}>No Category set yet — showing the general checklist. Set a Category in Loan Details for the right one.</div>
        }
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
  // Direct-save helper for fields that no longer need the Edit-deal/Save flow
  // (stage tracker, Loan Details, Strategy). Commits straight to deals +
  // Supabase immediately, and also keeps draft in sync so nothing looks like
  // it reverted if the person happens to be mid-edit on Structure/Notes at
  // the same time.
  function updateDeal(patch) {
    const updated = deals.map(x => x['Transaction Name'] === decodedName ? { ...x, ...patch } : x)
    setDeals(updated)
    saveDeals(updated)
    if (onUpdateDeals) onUpdateDeals(updated)
    if (editing) setDraft(dr => ({ ...dr, ...patch }))
  }
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
        <StageTracker status={deal.Status} onChange={(s)=>updateDeal({ Status: s })} />

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

        {tab === 'details' && <LoanDetailsTab d={d} editing={editing} draft={draft} set={set} deal={deal} deals={deals} setDeals={setDeals} clients={clients} updateDeal={updateDeal} />}
        {tab === 'strategy' && <StrategyTab deal={deal} updateDeal={updateDeal} />}
        {tab === 'structure' && <StructureTab d={d} editing={editing} set={set} />}
        {tab === 'attachments' && <AttachmentsTab deal={deal} deals={deals} setDeals={setDeals} editing={editing} d={d} set={set} />}
        {tab === 'notes' && <NotesTab d={d} editing={editing} set={set} deal={deal} deals={deals} setDeals={setDeals} />}
      </div>
    </div>
  )
}
