import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals, syncDealsFromSupabase } from '../lib/deals'
import { sbDeleteDeal } from '../lib/supabase'
import { sbUploadAttachment, sbGetAttachmentUrl, sbDeleteAttachment } from '../lib/supabase'
import { notifySaveFailed } from '../lib/saveStatus'
import CRMTopbar from '../components/CRMTopbar'
import ReferrerPicker from '../components/ReferrerPicker'
import { SettleModal, applySettlement } from '../components/SettleModal'
import { calcUpfront, getUpfrontRate, dealUpfrontCommission, dealUpfrontRateEffective, dealCommissionIsOverridden, loadSettings, getDealStages, stageDisplay } from '../lib/settings'
import { mapRradarContactToDealContact } from '../lib/data'

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

// Stage names/order now come from Settings > CRM > Stages — this palette
// just gives each stage a colour, keyed by its permanent id so a rename
// doesn't lose its colour. A custom stage that isn't one of these falls
// back to a rotating default.
const STAGE_COLOR_MAP = {
  'discovery':     { bg: '#eef4fb', color: '#185fa5' },
  'strategy':      { bg: '#eef4fb', color: '#185fa5' },
  'pre-lodged':    { bg: '#fdf0f6', color: '#9b2c6e' },
  'lodged':        { bg: '#fdf0f6', color: '#9b2c6e' },
  'conditional':   { bg: '#fff8e8', color: '#92600a' },
  'unconditional': { bg: '#eaf6ef', color: '#1a7a45' },
  'settled':       { bg: '#eaf6ef', color: '#1a7a45' },
  'withdrawn':     { bg: '#f5f5f5', color: '#7A8090' },
}
const STAGE_COLOR_FALLBACKS = [
  { bg: '#f3e8ff', color: '#7e22ce' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#e0f2fe', color: '#0369a1' },
]
function stageColorFor(id, index) {
  return STAGE_COLOR_MAP[id] || STAGE_COLOR_FALLBACKS[index % STAGE_COLOR_FALLBACKS.length]
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

const BLANK_CONTACT = {
  name:'', type:'Individual', email:'', mobile:'', homePhone:'', businessPhone:'',
  title:'', firstName:'', middleName:'', lastName:'', dob:'', maritalStatus:'', gender:'',
  abn:'',
  addresses: [], identification: [], relationships: [],
}
const CONTACT_TYPES = ['Individual','Company','Trust','SMSF','Partnership']
const TITLES = ['Mr','Mrs','Miss','Ms','Dr']
const MARITAL_STATUSES = ['Single','Married','De Facto','Divorced','Widowed','Separated']
const GENDERS = ['Male','Female','Other']
const ADDRESS_TYPES = ['Home','Previous','Postal']
const ADDRESS_OWNERSHIP = ['Own Home - Mortgage','Own Home - No Mortgage','Renting','With Parents','Boarding','Other']
const ID_DOC_TYPES = ['Drivers Licence','Passport','Medicare Card','Birth Certificate','Other']
const RELATIONSHIP_TYPES = ['Spouse','De Facto','Child','Parent','Sibling','Business Partner','Guarantor','Other']

function ContactsPanel({ deal, clients, updateDeal }) {
  const [linkMode, setLinkMode] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedIdx, setExpandedIdx] = useState(null)

  const linkedClient = findLinkedClient(deal, clients)
  const dealContacts = deal.Contacts || []

  function setContacts(arr) { updateDeal({ Contacts: arr }) }
  function addContact() {
    const next = [...dealContacts, { ...BLANK_CONTACT }]
    setContacts(next)
    setExpandedIdx(next.length - 1)
  }
  function updContact(i, patch) { setContacts(dealContacts.map((c,idx)=> idx===i ? {...c,...patch} : c)) }
  function removeContact(i) { setContacts(dealContacts.filter((_,idx)=>idx!==i)); if (expandedIdx===i) setExpandedIdx(null) }

  function addAddress(i) { updContact(i, { addresses:[...(dealContacts[i].addresses||[]), { type:'Home', ownership:'', address:'', from:'', to:'' }] }) }
  function updAddress(i,ai,k,v) { updContact(i, { addresses: dealContacts[i].addresses.map((a,idx)=>idx===ai?{...a,[k]:v}:a) }) }
  function rmAddress(i,ai) { updContact(i, { addresses: dealContacts[i].addresses.filter((_,idx)=>idx!==ai) }) }

  function addId(i) { updContact(i, { identification:[...(dealContacts[i].identification||[]), { docType:'Drivers Licence', number:'', nameOnDocument:'', issueDate:'', expiryDate:'' }] }) }
  function updId(i,ii,k,v) { updContact(i, { identification: dealContacts[i].identification.map((doc,idx)=>idx===ii?{...doc,[k]:v}:doc) }) }
  function rmId(i,ii) { updContact(i, { identification: dealContacts[i].identification.filter((_,idx)=>idx!==ii) }) }

  function addRelationship(i) { updContact(i, { relationships:[...(dealContacts[i].relationships||[]), { contactName:'', relationship:'Spouse' }] }) }
  function updRelationship(i,ri,k,v) { updContact(i, { relationships: dealContacts[i].relationships.map((r,idx)=>idx===ri?{...r,[k]:v}:r) }) }
  function rmRelationship(i,ri) { updContact(i, { relationships: dealContacts[i].relationships.filter((_,idx)=>idx!==ri) }) }

  const searchResults = searchTerm.length > 1
    ? clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 6)
    : []
  function selectClient(c) {
    // Copies the client's contacts onto the deal itself, same as at deal
    // creation — so linking a client to an existing deal also brings their
    // details in as real, editable records rather than just a live pointer
    // back to the client (which no field on this deal could ever edit).
    // Only copies if the deal doesn't already have contacts of its own, so
    // this never silently overwrites something the broker already entered
    // or edited here.
    const patch = { RradarClient: c.name }
    if (!dealContacts.length && c.contacts?.length) {
      patch.Contacts = c.contacts.map(mapRradarContactToDealContact)
    }
    updateDeal(patch)
    setLinkMode(null); setSearchTerm('')
  }
  function unlinkClient() { updateDeal({ RradarClient: '' }); setLinkMode(null) }

  // Contacts to display: the deal's own copy takes priority now that
  // linking (and deal creation) copies contacts across — this is what
  // makes them editable. Only falls back to a live, read-only view of the
  // Rradar client's contacts for older deals that got linked before this
  // copying existed and never got a copy of their own.
  const rradarContacts = linkedClient?.contacts || []
  const displayContacts = dealContacts.length > 0
    ? dealContacts
    : rradarContacts.map(c => ({
        name: [c.first, c.middle, c.last].filter(Boolean).join(' ') || c.first || '—',
        type: c.type || 'Individual', email: c.email || '', mobile: c.mobile || '', fromRradar: true,
      }))

  return (
    <TabCard title="Clients & Contacts" right={
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {linkedClient && <Pill tone="green">Rradar linked</Pill>}
        <button onClick={addContact} style={addBtnStyle}>+ Add contact</button>
        <button onClick={()=>setLinkMode(l => l==='search' ? null : 'search')} style={addBtnStyle}>{linkedClient ? '⇄ Change Rradar link' : '+ Link to Rradar'}</button>
        {linkedClient && <button onClick={unlinkClient} style={rmBtnStyle}>Unlink</button>}
      </div>
    }>
      {linkMode === 'search' && (
        <div style={{ marginBottom:12, background:'#f8f9fa', borderRadius:8, padding:'10px 12px', border:'1px solid #e8eaed' }}>
          <div style={{ fontSize:10, color:'#7A8090', marginBottom:6 }}>Search Rradar clients</div>
          <input autoFocus value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Type client name…" style={{...inp, marginBottom:6}} />
          {searchResults.map((c,i) => (
            <div key={i} onClick={()=>selectClient(c)} style={{ padding:'7px 10px', fontSize:11, cursor:'pointer', display:'flex', justifyContent:'space-between', borderBottom: i<searchResults.length-1 ? '0.5px solid #f0f0f0' : 'none' }}>
              <span style={{ fontWeight:500, color:'#2A3545' }}>{c.name}</span>
              <span style={{ fontSize:9, color:'#7A8090' }}>{c.loans?.length||0} loans</span>
            </div>
          ))}
          {searchTerm.length > 1 && searchResults.length === 0 && <div style={{ fontSize:10, color:'#9ca3af' }}>No matching clients found</div>}
        </div>
      )}

      {displayContacts.length === 0 && <div style={{ fontSize:11.5, color:'#9ca3af', padding:'10px 0' }}>No contacts on file</div>}

      {displayContacts.map((c, i) => (
        <div key={i} style={{ borderBottom: i<displayContacts.length-1 ? '0.5px solid #f0f0f0' : 'none', padding:'8px 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <button onClick={()=> !c.fromRradar && setExpandedIdx(expandedIdx===i ? null : i)} style={{ background:'none', border:'none', cursor: c.fromRradar?'default':'pointer', fontSize:12, color:'#7A8090', width:16, padding:0, flexShrink:0 }}>
              {!c.fromRradar ? (expandedIdx===i ? '▾' : '▸') : ''}
            </button>
            <div style={{ flex:'1 1 140px', minWidth:100, fontWeight:600, fontSize:12, color:'#2A3545' }}>{c.name || '—'}</div>
            <Pill tone="pink">{c.type||'Individual'}</Pill>
            {c.email
              ? <a href={`mailto:${c.email}`} title={c.email} style={{ fontSize:11, color:'#7A8090', textDecoration:'none', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.email}</a>
              : <span style={{ fontSize:11, color:'#7A8090' }}>—</span>}
            {c.mobile
              ? <span style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <a href={`tel:${c.mobile.replace(/\s/g,'')}`} style={{ fontSize:11, color:'#EB99C2', textDecoration:'none', fontWeight:500 }}>{c.mobile}</a>
                  <a href={`sms:${c.mobile.replace(/\s/g,'')}`} title="Send text" style={{ background:'#f0f0f0', borderRadius:10, padding:'1px 6px', fontSize:9, color:'#7A8090', textDecoration:'none' }}>💬</a>
                </span>
              : <span style={{ fontSize:11, color:'#7A8090', flexShrink:0 }}>—</span>}
            {!c.fromRradar && <button onClick={()=>removeContact(i)} style={{...rmBtnStyle, flexShrink:0}}>✕</button>}
          </div>

          {!c.fromRradar && expandedIdx === i && (
            <div style={{ marginTop:10, marginLeft:26, background:'#f8f9fa', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 1fr', gap:8, marginBottom:10 }}>
                <LiveSelect small value={c.type} onCommit={v=>updContact(i,{type:v})} options={CONTACT_TYPES} allowBlank={false} />
                <LiveText small value={c.name} onCommit={v=>updContact(i,{name:v})} placeholder="Full name / company name" />
                {c.type === 'Individual'
                  ? <LiveSelect small value={c.title} onCommit={v=>updContact(i,{title:v})} options={TITLES} placeholder="Title" />
                  : <LiveText small value={c.abn} onCommit={v=>updContact(i,{abn:v})} placeholder="ABN" />}
              </div>

              {c.type === 'Individual' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:10 }}>
                    <LiveText small value={c.firstName} onCommit={v=>updContact(i,{firstName:v})} placeholder="First name" />
                    <LiveText small value={c.middleName} onCommit={v=>updContact(i,{middleName:v})} placeholder="Middle name" />
                    <LiveText small value={c.lastName} onCommit={v=>updContact(i,{lastName:v})} placeholder="Last name" />
                    <input type="date" style={rowInp} value={c.dob||''} onChange={e=>updContact(i,{dob:e.target.value})} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <LiveSelect small value={c.maritalStatus} onCommit={v=>updContact(i,{maritalStatus:v})} options={MARITAL_STATUSES} placeholder="Marital status" />
                    <LiveSelect small value={c.gender} onCommit={v=>updContact(i,{gender:v})} options={GENDERS} placeholder="Gender" />
                  </div>
                </>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                <LiveText small value={c.email} onCommit={v=>updContact(i,{email:v})} placeholder="Email" />
                <LiveText small value={c.mobile} onCommit={v=>updContact(i,{mobile:v})} placeholder="Mobile" />
                <LiveText small value={c.homePhone} onCommit={v=>updContact(i,{homePhone:v})} placeholder="Home phone" />
                <LiveText small value={c.businessPhone} onCommit={v=>updContact(i,{businessPhone:v})} placeholder="Business phone" />
              </div>

              <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', textTransform:'uppercase', marginBottom:6 }}>Addresses</div>
              {(c.addresses||[]).map((a,ai) => (
                <div key={ai} style={{ display:'grid', gridTemplateColumns:'0.8fr 1.1fr 1.6fr 0.7fr 0.7fr auto', gap:6, marginBottom:6, alignItems:'center' }}>
                  <LiveSelect small value={a.type} onCommit={v=>updAddress(i,ai,'type',v)} options={ADDRESS_TYPES} allowBlank={false} />
                  <LiveSelect small value={a.ownership} onCommit={v=>updAddress(i,ai,'ownership',v)} options={ADDRESS_OWNERSHIP} placeholder="Ownership" />
                  <LiveText small value={a.address} onCommit={v=>updAddress(i,ai,'address',v)} placeholder="Address" />
                  <input type="date" style={rowInp} value={a.from||''} onChange={e=>updAddress(i,ai,'from',e.target.value)} />
                  <input type="date" style={rowInp} value={a.to||''} onChange={e=>updAddress(i,ai,'to',e.target.value)} />
                  <button onClick={()=>rmAddress(i,ai)} style={rmBtnStyle}>✕</button>
                </div>
              ))}
              <button onClick={()=>addAddress(i)} style={{...addBtnStyle, marginBottom:12}}>+ Add address</button>

              <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', textTransform:'uppercase', marginBottom:6 }}>Identification</div>
              {(c.identification||[]).map((doc,di) => (
                <div key={di} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.3fr 0.7fr 0.7fr auto', gap:6, marginBottom:6, alignItems:'center' }}>
                  <LiveSelect small value={doc.docType} onCommit={v=>updId(i,di,'docType',v)} options={ID_DOC_TYPES} allowBlank={false} />
                  <LiveText small value={doc.number} onCommit={v=>updId(i,di,'number',v)} placeholder="Document number" />
                  <LiveText small value={doc.nameOnDocument} onCommit={v=>updId(i,di,'nameOnDocument',v)} placeholder="Name on document" />
                  <input type="date" style={rowInp} value={doc.issueDate||''} onChange={e=>updId(i,di,'issueDate',e.target.value)} />
                  <input type="date" style={rowInp} value={doc.expiryDate||''} onChange={e=>updId(i,di,'expiryDate',e.target.value)} />
                  <button onClick={()=>rmId(i,di)} style={rmBtnStyle}>✕</button>
                </div>
              ))}
              <button onClick={()=>addId(i)} style={{...addBtnStyle, marginBottom:12}}>+ Add identification</button>

              <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', textTransform:'uppercase', marginBottom:6 }}>Relationships</div>
              <datalist id="contact-names">{dealContacts.map(dc=><option key={dc.name} value={dc.name}/>)}</datalist>
              {(c.relationships||[]).map((r,ri) => (
                <div key={ri} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr auto', gap:6, marginBottom:6, alignItems:'center' }}>
                  <LiveText small value={r.contactName} onCommit={v=>updRelationship(i,ri,'contactName',v)} placeholder="Related contact's name" list="contact-names" />
                  <LiveSelect small value={r.relationship} onCommit={v=>updRelationship(i,ri,'relationship',v)} options={RELATIONSHIP_TYPES} allowBlank={false} />
                  <button onClick={()=>rmRelationship(i,ri)} style={rmBtnStyle}>✕</button>
                </div>
              ))}
              <button onClick={()=>addRelationship(i)} style={addBtnStyle}>+ Add relationship</button>
            </div>
          )}
        </div>
      ))}

      {linkedClient && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
          <span style={{ fontSize:10, color:'#7A8090' }}>Rradar: <strong style={{color:'#2A3545'}}>{linkedClient.name}</strong> · {linkedClient.loans?.filter(l=>!l.closed).length||0} active loans</span>
          <a href={`/radar/clients/${encodeURIComponent(linkedClient.name)}`} style={{ fontSize:10, color:'#EB99C2', textDecoration:'none', padding:'3px 10px', border:'1px solid #EB99C2', borderRadius:6 }}>View in Rradar →</a>
        </div>
      )}

      {!linkedClient && displayContacts.length === 0 && (
        <div style={{ marginTop:8, padding:'8px 10px', background:'#fef9ec', border:'1px solid #fde68a', borderRadius:6, fontSize:10, color:'#92600a' }}>
          ⚡ Not linked to Rradar — link a client above, or add a contact manually.
        </div>
      )}
    </TabCard>
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

// Which security types are realistic depends on the deal Category — a
// straightforward mortgage-style set for Residential, GSA/PMSI weighted
// more heavily for Business/Asset Finance, etc. Falls back to the full list
// for anything not explicitly mapped.
const CATEGORY_SECURITY_TYPES = {
  'Residential': ['1MTG','2MTG','Gtee'],
  'Commercial': ['1MTG','2MTG','GSA','Gtee'],
  'Full Commercial (BANK RM)': ['1MTG','2MTG','GSA','PMSI','Gtee'],
  'SMSF': ['1MTG','Gtee'],
  'Business Loan': ['GSA','1MTG','Gtee'],
  'Trade & Invoice Finance': ['GSA','PMSI'],
  'Asset Finance': ['PMSI','Gtee'],
  'Development': ['1MTG','2MTG','GSA','Gtee'],
}

// Residential financial-position registers — matches the shape Cameron's
// existing Mercury CRM already uses for home loan servicing (Living
// Expenses / Assets - Real Estate / Assets - Other / Liabilities /
// Employment / Other Income), rather than the P&L-style Financials used for
// Commercial/Business/etc. Every residential deal needs this regardless of
// complexity — it's not optional the way trading-analysis financials are.
const FREQUENCIES = ['Weekly','Fortnightly','Monthly','Quarterly','Annually']
const FREQ_TO_MONTHLY = { Weekly: 52/12, Fortnightly: 26/12, Monthly: 1, Quarterly: 1/3, Annually: 1/12 }
function toMonthly(amount, freq) { return (Number(amount)||0) * (FREQ_TO_MONTHLY[freq] || 1) }

const LIVING_EXPENSE_TYPES = ['Clothing & Personal Care','General Insurance','Groceries','Investment Property Costs','Medical & Health','Primary Residence Costs','Recreation & Entertainment','Telephone, Internet, Pay TV & Streaming','Transport','Childcare','Education','Other']
const REAL_ESTATE_PURPOSES = ['Owner Occupied','Investment']
const OTHER_ASSET_TYPES = ['Boat','Home Contents','Motor Vehicle','Savings Account','Superannuation','Shares','Other']
const ASSET_BASIS = ['Applicant Estimate','Bank Valuation','Contract Price']
const LIABILITY_TYPES = ['HECS','Mortgage Loan','Credit Card','Personal Loan','Car Loan','Store Card','Other']
const EMPLOYMENT_TYPES = ['Primary Employment','Secondary Employment']
const EMPLOYMENT_BASIS = ['Full Time','Part Time','Casual']
const EMPLOYMENT_INCOME_TYPES = ['PAYG','Self-Employed']
const INCOME_LINE_TYPES = ['Salary','Overtime','Allowance','Bonus','Commission','Other']
const OTHER_INCOME_TYPES = ['Rental Income','Centrelink / Family Tax Benefit','Dividends','Trust Distribution','Other']

// Keyed by Category (not Transaction Type) — Cameron confirmed Category is
// the right driver here. 'Other' is the fallback for a deal with no Category
// set yet.
// Base items apply to every entity on this transaction type; conditions are
// additional items that only apply depending on who/what this entity is —
// e.g. an Individual on PAYG income needs payslips, a Company needs tax
// returns and financials. A given entity can tick more than one condition
// (e.g. a Trust with a corporate trustee is both 'Trust' and 'Company').
// Matches Cameron's RIF template exactly: each template is a list of named
// sections (headings), each with items. An item can optionally have a
// `repeat` type (Individual / Entity / Property / Statement) — these are
// the ones that need one instance per person/entity/property/account,
// shown with their own "+ [Type]" button in the same row, adding an
// indented sub-line each time it's clicked. Items with no `repeat` are
// single, flat lines. `seed` pre-populates a repeatable item's first
// sub-lines (e.g. Property Address 1/2) to match the template as supplied —
// further ones are added with the button, existing ones can be edited or
// deleted freely.
const ATTACHMENT_TEMPLATES = {
  'Home Loan': {
    sections: [
      { heading: 'Personal Information', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: "Fact Find - You'll receive an invitation to our secure Client Centre shortly, where you can provide the necessary information", repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport", repeat:'Individual' },
      ]},
      { heading: 'Financial Information', items: [
        { text: 'A copy of your two most recent rental statements (or Rental Appraisal) for your investment properties:', repeat:'Property' },
        { text: 'A copy of your two most recent payslips', repeat:'Individual' },
        { text: "A copy of your most recent year's ATO Income Statement", repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Individual Tax Returns and Notice of Assessments', repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Business Tax Returns and associated Financials for all Trading Entities', repeat:'Entity' },
        { text: '12 month ATO ICA & ITA Portals for all entities', repeat:'Entity' },
        { text: 'A copy of the following Statements:', repeat:'Statement', seed:[
          'Everyday bank account (from X to Present) 6 months',
          'IF PAYG - Transaction account showing your salary credits (if different to your Everyday account above) (from X to Present) 3 months',
          'All Existing Home Loans (from X to Present) 6 months',
          'IF PURCHASE – Transaction account showing savings for the purchase (from X to Present)',
          'Credit Cards/Personal Loans/Lease/s (Most recent only)',
          'Superannuation (Most recent only)',
        ]},
      ]},
      { heading: 'Additional Documents', items: [
        { text: 'IF PURCHASE – A copy of the signed Contract of Sale for the purchased property' },
        { text: 'IF CONSTRUCTION – A copy of the following construction documents:', repeat:'Document', seed:['Building Contract','Building Plans','Schedule of Payments','DA/CDC Approval (if available)'] },
      ]},
    ],
  },
  'Commercial Applications — Property & Other': {
    sections: [
      { heading: 'Director/Shareholder Information', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: 'Review, sign, and return the attached Asset & Liability Statement', repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport", repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Individual Tax Returns and Notice of Assessments', repeat:'Individual' },
        { text: 'A copy of your two most recent rental statements (or Rental Appraisal) for your investment properties:', repeat:'Property' },
      ]},
      { heading: 'Financial Information', items: [
        { text: 'A copy of the Lease Agreement and/or a Tenancy Schedule for:', repeat:'Property' },
        { text: 'A copy of your 20XX and 20XX Business Tax Returns and associated Financials for all Trading Entities', repeat:'Entity' },
        { text: 'YTD 20XX Management Financial Statements (including Profit & Loss Statement and Balance Sheet)', repeat:'Entity' },
        { text: '12 month ATO ICA & ITA Portals for all entities', repeat:'Entity' },
        { text: 'Summarised and Aged Accounts Receivable & Payable Ledgers (preferably reconciled with the YTD Management Accounts)', repeat:'Entity' },
        { text: 'If Invoice Finance – Detailed Aged Receivables Ledger', repeat:'Entity' },
      ]},
      { heading: 'Additional Documents', items: [
        { text: 'Specific Information to the transaction (e.g. Quote/Invoice for the Equipment being purchased, including terms of trade)' },
        { text: 'If Invoice Finance - 4 complete sample paper trail including:', repeat:'Document', seed:['Customer Purchase Order','Invoice','Signed Delivery/Consignment or Timesheet','Customer Remittance Advice'] },
      ]},
    ],
  },
  'Asset Finance — Commercial Full Doc': {
    sections: [
      { heading: 'Required Documents', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: 'Review, sign, and return the attached Asset & Liability Statement', repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport (or Medicare Card)", repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Individual Tax Returns and Notice of Assessments', repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Business Tax Returns and associated Financials for all Trading Entities', repeat:'Entity' },
        { text: 'YTD 20XX Management Financial Statements (including Profit & Loss Statement and Balance Sheet)', repeat:'Entity' },
        { text: '12 months of ATO portal statements for all commercial entities (including ICA & ITA)', repeat:'Entity' },
        { text: 'Summarised and Aged Accounts Receivable & Payable Ledgers (preferably reconciled with the YTD Management Accounts)', repeat:'Entity' },
        { text: 'Specific Information to the transaction (e.g. Quote/Invoice for the Equipment being purchased, including terms of trade)' },
      ]},
    ],
  },
  'Asset Finance — Commercial Low Doc': {
    sections: [
      { heading: 'Required Documents', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: 'Review, sign, and return the attached Asset & Liability Statement', repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport (or Medicare Card)", repeat:'Individual' },
        { text: 'Specific Information to the transaction (e.g. Quote/Invoice for the Equipment being purchased, including terms of trade)' },
        { text: 'If available - a statement for any comparable existing credit facility (e.g. current vehicle or equipment loan) showing a satisfactory repayment history' },
      ]},
    ],
  },
  'Asset Finance — Personal Use': {
    sections: [
      { heading: 'Personal Information', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: "Fact Find - You'll receive an invitation to our secure Client Centre shortly, where you can provide the necessary information", repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport", repeat:'Individual' },
      ]},
      { heading: 'Financial Information', items: [
        { text: 'A copy of your two most recent rental statements (or Rental Appraisal) for your investment properties:', repeat:'Property' },
        { text: 'A copy of your two most recent payslips', repeat:'Individual' },
        { text: "A copy of your most recent year's ATO Income Statement", repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Individual Tax Returns and Notice of Assessments', repeat:'Individual' },
        { text: 'A copy of your 20XX and 20XX Business Tax Returns and associated Financials for all Trading Entities', repeat:'Entity' },
        { text: '12 month ATO ICA & ITA Portals for all entities', repeat:'Entity' },
        { text: 'A copy of the following Statements:', repeat:'Statement', seed:[
          'Everyday bank account (from X to Present) 6 months',
          'IF PAYG - Transaction account showing your salary credits (if different to your Everyday account above) (from X to Present) 3 months',
          'All Existing Home Loans (from X to Present) 6 months',
          'IF PURCHASE – Transaction account showing savings for the purchase (from X to Present)',
          'Credit Cards/Personal Loans/Lease/s (Most recent only)',
          'Superannuation (Most recent only)',
        ]},
        { text: 'IF ASSET FINANCE - Specific Information to the transaction (e.g. Quote/Invoice)' },
      ]},
    ],
  },
  'SMSF': {
    sections: [
      { heading: 'Personal Information', items: [
        { text: 'Credit Guide & Piracy Statement (attached) - This will be sent to you separately via DocuSign for ease of review and electronic signing.', repeat:'Individual' },
        { text: 'Review, sign, and return the attached Asset & Liability Statement', repeat:'Individual' },
        { text: "A copy of your driver's licence (both front & back) and passport (or Medicare Card)", repeat:'Individual' },
        { text: 'IF PAYG – 2 Most Recent Payslips showing Super Contributions', repeat:'Individual' },
        { text: 'IF SE - A copy of your 20XX and 20XX Individual Tax Returns and Notice of Assessments', repeat:'Individual' },
        { text: 'IF SE - A copy of your 20XX and 20XX Business Tax Returns and associated Financials for all trading entities', repeat:'Entity' },
      ]},
      { heading: 'The Fund', items: [
        { text: 'Certified copy SMSF Trust Deed if currently available' },
        { text: 'Established Funds - 12 months SMSF bank statements evidencing regular member contributions' },
        { text: 'Established Funds - A copy of your 20XX and 20XX SMSF tax returns and associated Financial Accounts' },
        { text: "New/recently established SMSF – 12 months superannuation statements for all the SMSF beneficiaries from their current industry fund/retail fund" },
        { text: 'New/recently established SMSF - Last two years bank account statements or current industry/retail fund statements to be rolled over, evidencing member contributions and cash/investments' },
      ]},
    ],
  },
}

// Every item text across every template, deduped — offered as suggestions
// (via a datalist) when adding an item to any section, alongside the
// ability to just type something new. This is the "pre-populated list or
// manually created" Cameron asked for, as one input rather than two.
const ATTACHMENT_MASTER_ITEMS = Array.from(new Set(
  Object.values(ATTACHMENT_TEMPLATES).flatMap(t => t.sections.flatMap(s => [
    ...s.items.map(i => i.text),
    ...s.items.flatMap(i => i.seed || []),
  ]))
))

// Maps an item's exact text to its repeat type (Individual/Entity/Property/
// Statement/Document) wherever the template defines one — so picking that
// same item from the +Add Item suggestions gives it the same "+ [Type]"
// button and behavior it has in its home template, not just a plain line.
const ATTACHMENT_ITEM_REPEAT_TYPES = {}
Object.values(ATTACHMENT_TEMPLATES).forEach(t => t.sections.forEach(s => s.items.forEach(i => {
  if (i.repeat) ATTACHMENT_ITEM_REPEAT_TYPES[i.text] = i.repeat
})))

// Best-guess starting template based on the deal's own Category — Cameron
// can always change it per entity, this just saves a click in the common
// case.
function defaultAttachmentTemplate(category) {
  if (category === 'Residential') return 'Home Loan'
  if (category === 'SMSF') return 'SMSF'
  if (category === 'Asset Finance') return 'Asset Finance — Commercial Full Doc'
  if (['Commercial', 'Full Commercial (BANK RM)', 'Business Loan', 'Trade & Invoice Finance', 'Development'].includes(category)) return 'Commercial Applications — Property & Other'
  return 'Home Loan'
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

// Left-hand vertical sub-tab nav — shared by Strategy and Structure so the
// two look consistent with each other, rather than Structure's tabs running
// across the top while Strategy's run down the side.
function SideTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, width:172, flexShrink:0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          textAlign:'left', padding:'10px 14px', fontSize:12.5, fontWeight:600, borderRadius:8, cursor:'pointer',
          border: active===t.id ? 'none' : '1px solid #e8eaed',
          background: active===t.id ? '#3D4F6B' : '#fff',
          color: active===t.id ? '#fff' : '#2A3545',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

function MiniTable({ columns, rows, empty='No rows yet', widths }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout: widths ? 'fixed' : 'auto' }}>
        {widths && (
          <colgroup>
            {widths.map((w,i) => <col key={i} style={{ width:w }} />)}
          </colgroup>
        )}
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
const CONTRIBUTION_TYPES = ['Additional Savings','Gift','Inheritance','Proceeds of Sale','Liquidated Assets (Shares)','Other']
const REPAYMENT_FREQUENCIES = ['Weekly','Fortnightly','Monthly','Annually']
// Multipliers convert the standard monthly PMT figure to the chosen
// frequency (e.g. weekly = monthly * 12 months / 52 weeks).
const REPAYMENT_FREQUENCY_MULT = { Weekly: 12/52, Fortnightly: 12/26, Monthly: 1, Annually: 12 }

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
// Same commit-on-blur behaviour as LiveNumber, but displays with comma
// thousand-separators once you click away — e.g. typing 1400000 shows
// 1,400,000 after leaving the field. Uses type="text" rather than
// type="number" because a native number input rejects commas outright, the
// same issue that caused the LVR alignment bug earlier in this file.
function LiveNumberFormatted({ value, onCommit, placeholder, small }) {
  const [val, setVal] = useState(value ?? '')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setVal(value ?? '') }, [value, focused])
  const display = focused ? val : (value !== '' && value != null ? Number(value).toLocaleString() : '')
  return (
    <input
      style={small ? rowInp : inp}
      type="text" inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={()=>{ setFocused(true); setVal(value ?? '') }}
      onChange={e=>setVal(e.target.value.replace(/[^0-9.]/g,''))}
      onBlur={()=>{
        setFocused(false)
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

// `stages` here is every stage except Withdrawn (Withdrawn shows as a
// separate pill, not a tracker step) — the caller computes this from
// Settings > CRM > Stages and passes it down, along with the current
// display string for the Withdrawn stage specifically.
function StageTracker({ status, onChange, stages, withdrawnDisplay }) {
  const isWithdrawn = status === withdrawnDisplay
  const idx = stages.indexOf(isWithdrawn ? stages[0] : status)
  return (
    <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #e8eaed', padding:'20px 24px 8px', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center' }}>
        {stages.map((s, i) => (
          <div key={s} style={{ display:'flex', alignItems:'center', flex: i === stages.length-1 ? '0 0 auto' : 1 }}>
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
            {i < stages.length-1 && <div style={{ flex:1, height:2, background: i<idx && !isWithdrawn ? '#EB99C2' : '#e8eaed', margin:'0 4px 20px' }}/>}
          </div>
        ))}
        {isWithdrawn && <span style={{ marginLeft:16, marginBottom:20 }}><Pill tone="slate">Withdrawn</Pill></span>}
      </div>
      <div style={{ fontSize:10, color:'#9ca3af', paddingBottom:10 }}>Click any stage to move this deal straight there — set "{withdrawnDisplay}" from Status in Loan Details.</div>
    </div>
  )
}

// ReadRow-styled but directly editable — label left, value right-aligned,
// no visible input box until focused. This is the layout Cameron wants back
// (label/value stacked rows) while keeping the no-edit-button editing model.
const rowWrap = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'0.5px solid #f0f0f0', gap:10 }
const rowLabel = { fontSize:11, color:'#7A8090', flexShrink:0 }
// Shared so every dollar figure and every LVR% in the funding table sits in
// the same column, regardless of which row component renders it.
const AMOUNT_COL_WIDTH = 130
const LVR_COL_WIDTH = 96
function rowValueStyle(focused, pink) {
  return {
    border:'none', borderBottom: focused ? '1px solid #EB99C2' : '1px solid transparent',
    background:'transparent', textAlign:'right', fontSize:11, fontWeight: pink?700:500,
    color: pink ? '#EB99C2' : '#2A3545', outline:'none', width:'60%', padding:'2px 0',
    fontFamily:'inherit', cursor:'text',
  }
}

// Click-to-edit deal title in the header — same "no edit button" pattern as
// everything else, just sized for an H1. Commits on blur or Enter.
function EditableTitle({ value, onCommit }) {
  const [val, setVal] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setVal(value) }, [value, focused])
  return (
    <input
      value={focused ? val : value}
      onFocus={()=>{ setFocused(true); setVal(value) }}
      onChange={e=>setVal(e.target.value)}
      onKeyDown={e=>{ if (e.key === 'Enter') e.currentTarget.blur() }}
      onBlur={()=>{ setFocused(false); onCommit(val) }}
      style={{
        fontSize:20, fontWeight:700, color:'#2A3545', margin:0, border:'none',
        borderBottom: focused ? '1px solid #EB99C2' : '1px solid transparent',
        background:'transparent', outline:'none', fontFamily:'inherit', padding:0,
        width: `${Math.max(value.length, 8)+1}ch`, maxWidth:'70vw',
      }}
    />
  )
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

// Bare currency input, no label/row wrapper — used where an amount needs to
// sit next to another control on the same line (e.g. Stamp Duty's state
// dropdown) rather than as its own full row.
function StampDutyAmountInput({ value, onCommit }) {
  const [editVal, setEditVal] = useState('')
  const [focused, setFocused] = useState(false)
  const display = focused ? editVal : (value ? `$${Number(value).toLocaleString()}` : '')
  return (
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
      style={{ ...rowValueStyle(focused, false), width:AMOUNT_COL_WIDTH, flexShrink:0 }}
    />
  )
}

function LiveRowCurrency({ label, value, onCommit, pink, highlight }) {
  const [editVal, setEditVal] = useState('')
  const [focused, setFocused] = useState(false)
  const display = focused ? editVal : (value ? `$${Number(value).toLocaleString()}` : '')
  // `highlight` renders the whole row on a tinted background (currently only
  // 'green', for cross-collateral security) so it visually stands out from
  // the plain rows around it — distinct from `pink`, which only colours the
  // input text (used for Purchase Price).
  const highlightStyles = {
    green: { bg:'#F0FDF4', fg:'#16a34a' },
  }
  const h = highlight ? highlightStyles[highlight] : null
  return (
    <div style={h ? { ...rowWrap, background:h.bg, borderRadius:6, padding:'7px 10px', margin:'4px 0', borderBottom:'none' } : rowWrap}>
      <span style={h ? { ...rowLabel, color:h.fg, fontWeight:700 } : rowLabel}>{label}</span>
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
        style={{ ...rowValueStyle(focused, pink), ...(h ? { color:h.fg, fontWeight:700 } : {}), width:AMOUNT_COL_WIDTH, flexShrink:0 }}
      />
    </div>
  )
}

function LiveRowSelect({ label, value, onCommit, options, placeholder='—', disabled, allowBlank=true }) {
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={e=>onCommit(e.target.value)}
        style={{ ...rowValueStyle(false, false), appearance:'none', WebkitAppearance:'none', cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#c7cad1' : '#2A3545' }}
      >
        {allowBlank && <option value="">{placeholder}</option>}
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

function LoanDetailsTab({ deal, updateDeal, deals, setDeals, clients }) {
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'
  const validTxnTypes = CATEGORY_TRANSACTION_TYPES[deal.Categories] || []
  const [sub, setSub] = useState('details')
  const LOAN_DETAILS_SUBS = [
    { id:'details', label:'Loan Details' },
    { id:'contacts', label:'Clients & Contacts' },
    { id:'commission', label:'Commission' },
  ]

  return (
    <div style={{ display:'flex', gap:20 }}>
      <SideTabs tabs={LOAN_DETAILS_SUBS} active={sub} onChange={setSub} />

      <div style={{ flex:1, minWidth:0 }}>
        {sub === 'details' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <TabCard title="Loan Details">
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

            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <TabCard title="Key dates">
                <LiveRowDate label="Settlement date" value={deal['Date Settled']} onCommit={v=>updateDeal({'Date Settled':v})} />
                <LiveRowDate label="Finance due date" value={deal['Finance Due Date']} onCommit={v=>updateDeal({ 'Finance Due Date': v, 'Month of Settlement': v ? v.slice(0,7) : deal['Month of Settlement'] })} />
                <LiveRowDate label="Deposit due date" value={deal['Deposit Due Date']} onCommit={v=>updateDeal({'Deposit Due Date':v})} />
                <LiveRowDate label="Fixed rate expiry" value={deal['Fixed Rate Expiry']} onCommit={v=>updateDeal({'Fixed Rate Expiry':v})} />
                <LiveRowDate label="IO expiry" value={deal['Interest Only Expiry']} onCommit={v=>updateDeal({'Interest Only Expiry':v})} />
                <LiveRowDate label="Discharge date" value={deal['Discharge Date']} onCommit={v=>updateDeal({'Discharge Date':v})} />
                <LiveRow label="Discharge reason" value={deal['Discharge Reason']} onCommit={v=>updateDeal({'Discharge Reason':v})} />
              </TabCard>

              <TabCard title="Estimated commission">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'#9ca3af', display:'flex', alignItems:'center', gap:6 }}>
                      Est. upfront ({dealUpfrontRateEffective(deal).toFixed(2)}%)
                      {dealCommissionIsOverridden(deal) && <span style={{ fontSize:9, fontWeight:700, color:'#fff', background:'#EB99C2', borderRadius:10, padding:'1px 6px' }}>Negotiated</span>}
                    </div>
                    <div style={{ fontSize:16, fontWeight:700, color:'#22c55e', marginTop:2 }}>{deal.Amount ? `$${dealUpfrontCommission(deal).toLocaleString()}` : '—'}</div>
                  </div>
                  <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'#9ca3af' }}>Deal amount</div>
                    <div style={{ fontSize:16, fontWeight:700, color:'#EB99C2', marginTop:2 }}>{fmtAmt(deal.Amount)}</div>
                  </div>
                </div>
              </TabCard>
            </div>
          </div>
        )}

        {sub === 'contacts' && (
          <div>
            <ContactsPanel deal={deal} clients={clients} updateDeal={updateDeal} />

            <TabCard title="Referral Partner">
              <ReferrerPicker
                compact
                label=""
                attached={deal['_referrers'] || (deal['_referrer'] ? [{ name:deal['_referrer'], tier:'contenders' }] : [])}
                onAttach={r => {
                  const curr = deal['_referrers'] || []
                  if (curr.find(x => x.name === r.name)) return
                  updateDeal({ '_referrers': [...curr, r] })
                }}
                onDetach={name => {
                  updateDeal({ '_referrers': (deal['_referrers']||[]).filter(r => r.name !== name) })
                }}
              />
            </TabCard>
          </div>
        )}

        {sub === 'commission' && <CommissionTab deal={deal} updateDeal={updateDeal} />}
      </div>
    </div>
  )
}

// Commission for this specific deal — defaults to the standard category
// rate from Settings, with the ability to override for a negotiated
// facility. This is forecasting information only: it feeds the CRM
// Pipeline forecast and Marketing's Inflight Deals view for deals not yet
// settled. It never writes anywhere near a client's actual income — that
// stays sourced from the commission statement alone, deliberately, to
// avoid any risk of double-counting real money.
function CommissionTab({ deal, updateDeal }) {
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'
  const ov = deal._commission || {}
  const standardRate = getUpfrontRate(deal.Categories) * 100
  const isOverridden = dealCommissionIsOverridden(deal)
  const mode = ov.upfrontAmountOverride !== undefined && ov.upfrontAmountOverride !== null && ov.upfrontAmountOverride !== ''
    ? 'amount'
    : (ov.upfrontRateOverride !== undefined && ov.upfrontRateOverride !== null && ov.upfrontRateOverride !== '' ? 'rate' : 'default')

  function setMode(newMode) {
    if (newMode === 'default') {
      updateDeal({ _commission: { ...ov, upfrontRateOverride: null, upfrontAmountOverride: null } })
    } else if (newMode === 'rate') {
      updateDeal({ _commission: { ...ov, upfrontAmountOverride: null, upfrontRateOverride: ov.upfrontRateOverride ?? standardRate } })
    } else if (newMode === 'amount') {
      updateDeal({ _commission: { ...ov, upfrontRateOverride: null, upfrontAmountOverride: ov.upfrontAmountOverride ?? dealUpfrontCommission(deal) } })
    }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <TabCard title="Commission — This Deal">
        <div style={{ fontSize:12, color:'#7A8090', marginBottom:14 }}>
          <strong style={{color:'#2A3545'}}>{deal.Categories || 'No category set'}</strong> deals are set to <strong style={{color:'#2A3545'}}>{standardRate.toFixed(2)}%</strong> upfront in Settings. Use this if a facility has a negotiated rate that's different from the standard.
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:7, border:`1.5px solid ${mode==='default'?'#3D4F6B':'#e8eaed'}`, background:mode==='default'?'#f0f2f5':'#fff', cursor:'pointer' }}>
            <input type="radio" checked={mode==='default'} onChange={()=>setMode('default')} />
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'#2A3545' }}>Use category rate ({standardRate.toFixed(2)}%)</div>
              <div style={{ fontSize:10.5, color:'#7A8090' }}>Standard rate, from Settings — this is the default for every deal.</div>
            </div>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:7, border:`1.5px solid ${mode==='rate'?'#EB99C2':'#e8eaed'}`, background:mode==='rate'?'#fdf0f6':'#fff', cursor:'pointer' }}>
            <input type="radio" checked={mode==='rate'} onChange={()=>setMode('rate')} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#2A3545' }}>Negotiated rate (%)</div>
              {mode==='rate' && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                  <input type="number" step="0.01" value={ov.upfrontRateOverride ?? ''} onChange={e=>updateDeal({ _commission:{ ...ov, upfrontRateOverride: e.target.value===''?'':Number(e.target.value), upfrontAmountOverride:null } })}
                    style={{ width:90, border:'1px solid #e8eaed', borderRadius:5, padding:'5px 8px', fontSize:12, fontFamily:'inherit' }} />
                  <span style={{ fontSize:11, color:'#7A8090' }}>% of deal amount ({fmtAmt(deal.Amount)})</span>
                </div>
              )}
            </div>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:7, border:`1.5px solid ${mode==='amount'?'#EB99C2':'#e8eaed'}`, background:mode==='amount'?'#fdf0f6':'#fff', cursor:'pointer' }}>
            <input type="radio" checked={mode==='amount'} onChange={()=>setMode('amount')} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#2A3545' }}>Negotiated flat amount ($)</div>
              {mode==='amount' && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                  <span style={{ fontSize:12, color:'#7A8090' }}>$</span>
                  <input type="number" value={ov.upfrontAmountOverride ?? ''} onChange={e=>updateDeal({ _commission:{ ...ov, upfrontAmountOverride: e.target.value===''?'':Number(e.target.value), upfrontRateOverride:null } })}
                    style={{ width:120, border:'1px solid #e8eaed', borderRadius:5, padding:'5px 8px', fontSize:12, fontFamily:'inherit' }} />
                </div>
              )}
            </div>
          </label>
        </div>

        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#7A8090', textTransform:'uppercase', marginBottom:6 }}>Note (optional)</div>
          <textarea value={ov.note||''} onChange={e=>updateDeal({ _commission:{ ...ov, note:e.target.value } })} placeholder="e.g. Negotiated with lender due to volume, or non-bank asset finance facility"
            style={{ width:'100%', minHeight:60, border:'1px solid #e8eaed', borderRadius:7, padding:'8px 10px', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical' }} />
        </div>
      </TabCard>

      <TabCard title="Effective Commission">
        <div style={{ background:'#f8f9fa', borderRadius:8, padding:'12px 14px', marginBottom:10 }}>
          <div style={{ fontSize:10, color:'#9ca3af', display:'flex', alignItems:'center', gap:6 }}>
            Est. upfront ({dealUpfrontRateEffective(deal).toFixed(2)}%)
            {isOverridden && <span style={{ fontSize:9, fontWeight:700, color:'#fff', background:'#EB99C2', borderRadius:10, padding:'1px 6px' }}>Negotiated</span>}
          </div>
          <div style={{ fontSize:20, fontWeight:700, color:'#22c55e', marginTop:2 }}>{deal.Amount ? `$${dealUpfrontCommission(deal).toLocaleString()}` : '—'}</div>
        </div>
        <div style={{ fontSize:11, color:'#9ca3af' }}>
          This figure feeds the CRM's pipeline forecast and Marketing's Inflight Deals view while this deal is active. It has no effect on any client's actual recorded income — that only ever comes from the commission statement, once this deal is settled and the statement is imported.
        </div>
      </TabCard>
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
  const hasStampDuty = fields.some(([k])=>k==='stampDuty')
  // Auto-calculated from the state's duty scale and the purchase price —
  // shown as the actual Stamp Duty figure until the person types over it,
  // same "default until touched" pattern as Legals/Settlement Adjustments.
  const stampDutyEstimate = hasStampDuty ? calcStampDuty(strat.state||'NSW', strat.purchasePrice) : 0
  const stampDuty = strat.stampDuty ?? stampDutyEstimate

  const totalCosts = fields.reduce((sum,[key]) => {
    if (key==='legals') return sum + n(legals)
    if (key==='settlementAdj') return sum + n(settlementAdj)
    if (key==='stampDuty') return sum + n(stampDuty)
    return sum + n(strat[key])
  }, 0) + lmi

  // LVR is calculated against the property's value, not its cost — for a
  // purchase those are the same figure, but Construction uses a distinct
  // Estimated Value (post-completion) and Refinance uses Property Value
  // (not the payout amount being refinanced).
  // LVR is calculated against the property's value, not its cost — for a
  // purchase those are the same figure. Construction's Estimated Value is
  // Land Purchase + Construction (computed, not separately entered) — the
  // finished property is assumed worth what it cost to get there unless
  // Cameron tells us otherwise later. Refinance uses Property Value (not
  // the payout amount being refinanced).
  const estimatedValue = n(strat.purchasePrice) + n(strat.constructionCost)
  const lvrBase = dealType === 'Construction' ? estimatedValue
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
  const showBaseLoan = capitaliseLMI && lmi > 0
  const baseLoan = loanFromLender - (capitaliseLMI ? lmi : 0)
  const baseLoanLVR = (showBaseLoan && lvrBase) ? (baseLoan / lvrBase) : 0

  // Cross-collateral: an additional property/security pledged toward this
  // same facility. It's security, not spend, so it deliberately does NOT
  // fold into Total Costs / Surplus-Deficit — those stay "actual cash
  // needed vs. available". It only widens the value the loan is measured
  // against, so Total LVR comes out lower than Loan ÷ Purchase Price alone.
  const crossCollateralIncluded = !!strat.includeCrossCollateral
  const crossCollateralValue = crossCollateralIncluded ? n(strat.crossCollateralValue) : 0
  const totalLVRBase = lvrBase + crossCollateralValue
  const totalLVR = totalLVRBase ? (loanFromLender / totalLVRBase) : 0

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
    const additionalPurchaseCosts = n(legals) + n(stampDuty) + n(settlementAdj) + lmi
    const less20PercentLand = 0.2 * n(strat.purchasePrice)
    const constructionFundsAvailable = n(strat.constructionLoanPortionRequested) + netSaleProceeds + n(strat.savingsOffset) - less20PercentLand - additionalPurchaseCosts
    const constructionSurplusDeficit = constructionFundsAvailable - n(strat.fixedPriceContract)
    constructionCalc = { additionalPurchaseCosts, less20PercentLand, constructionFundsAvailable, constructionSurplusDeficit }
  }

  return { fields, legals, settlementAdj, hasStampDuty, stampDuty, stampDutyEstimate, lmiIncluded, lmi, estimatedValue, lvrBase, totalCosts, loanFromLender, totalLVR, crossCollateralIncluded, crossCollateralValue, capitaliseLMI, showBaseLoan, baseLoan, baseLoanLVR, saleFeesAmount, netSaleProceeds, totalFundsAvailable, surplusDeficit, constructionCalc }
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
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {side && <span style={{ fontSize:11, fontWeight:700, color:t.fg, opacity:0.75, width:LVR_COL_WIDTH, textAlign:'right', display:'inline-block', whiteSpace:'nowrap' }}>{side}</span>}
        <span style={{ fontSize: big?14:12.5, fontWeight:800, color:t.fg, width: side?AMOUNT_COL_WIDTH:'auto', textAlign:'right', display:'inline-block' }}>{value}</span>
      </div>
    </div>
  )
}

// Loan From Lender, two-way editable. The LVR% shown here is the TOTAL LVR
// (i.e. including any capitalised LMI) — Cameron's example: 79% base LVR
// plus LMI capitalised on a $1m value shows as 80.5% here, while Base Loan
// underneath still shows the pre-LMI 79%. Editing either side keeps them in
// sync: change the LVR% and the loan amount recalculates; write over the
// loan amount and the (total) LVR% is solved backwards from it. Both
// directions convert back to the underlying stored baseLvr field internally
// — the amount and the total-LVR% are never stored themselves, just derived.
function LoanAmountRow({ label, lvrBase, amountValue, lmiAddOn=0, onLvrCommit, tone='navy' }) {
  const tones = {
    navy:  { bg:'#EEF2F6', fg:'#3D4F6B' },
    green: { bg:'#F0FDF4', fg:'#16a34a' },
    red:   { bg:'#FEF2F2', fg:'#dc2626' },
    yellow:{ bg:'#FEF9E7', fg:'#92600A' },
  }
  const t = tones[tone] || tones.navy
  const displayLvr = lvrBase ? Math.round((amountValue/lvrBase*100)*10)/10 : ''
  const [lvrEdit, setLvrEdit] = useState(displayLvr)
  const [lvrFocused, setLvrFocused] = useState(false)
  const [amtEdit, setAmtEdit] = useState('')
  const [amtFocused, setAmtFocused] = useState(false)
  useEffect(() => { if (!lvrFocused) setLvrEdit(displayLvr) }, [displayLvr, lvrFocused]) // eslint-disable-line react-hooks/exhaustive-deps

  function commitLvr() {
    setLvrFocused(false)
    const num = lvrEdit === '' ? '' : Number(lvrEdit)
    if (num === '' || !lvrBase) return
    const impliedBaseLvr = Math.round((num - (lmiAddOn / lvrBase * 100)) * 100) / 100
    onLvrCommit(impliedBaseLvr)
  }
  function commitAmount() {
    setAmtFocused(false)
    const num = amtEdit === '' ? '' : Number(amtEdit)
    if (num === '' || !lvrBase) return
    const impliedBaseLvr = Math.round((((num - lmiAddOn) / lvrBase) * 100) * 100) / 100
    onLvrCommit(impliedBaseLvr)
  }

  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', margin:'4px 0', borderRadius:6, background:t.bg }}>
      <span style={{ fontSize:11.5, fontWeight:700, color:t.fg }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:1, width:LVR_COL_WIDTH, flexShrink:0 }}>
          <input
            type="text" inputMode="decimal" placeholder="—"
            value={lvrFocused ? lvrEdit : displayLvr}
            onFocus={()=>{ setLvrFocused(true); setLvrEdit(displayLvr) }}
            onChange={e=>setLvrEdit(e.target.value.replace(/[^0-9.]/g,''))}
            onBlur={commitLvr}
            style={{ width:38, textAlign:'right', border:'none', borderBottom: lvrFocused?`1px solid ${t.fg}`:'1px solid transparent', background:'transparent', fontSize:12, fontWeight:700, color:t.fg, outline:'none', fontFamily:'inherit', padding:0 }}
          />
          <span style={{ fontSize:11, fontWeight:700, color:t.fg, opacity:0.75, whiteSpace:'nowrap' }}>% LVR</span>
        </div>
        <input
          placeholder="—"
          value={amtFocused ? amtEdit : (amountValue ? `$${Math.round(amountValue).toLocaleString()}` : '—')}
          onFocus={()=>{ setAmtFocused(true); setAmtEdit(amountValue ? String(Math.round(amountValue)) : '') }}
          onChange={e=>setAmtEdit(e.target.value.replace(/[^0-9.]/g,''))}
          onBlur={commitAmount}
          style={{ width:AMOUNT_COL_WIDTH, textAlign:'right', border:'none', borderBottom: amtFocused?`1px solid ${t.fg}`:'1px solid transparent', background:'transparent', fontSize:13, fontWeight:800, color:t.fg, outline:'none', fontFamily:'inherit' }}
        />
      </div>
    </div>
  )
}

// Matches the look of Equity/Savings above it — label and amount both look
// like plain text until focused. Only difference is the label itself is
// editable here (with a dropdown of common contribution types), since each
// contribution needs its own description rather than a fixed one.
function ContributionRow({ label, onLabelCommit, amount, onAmountCommit, onRemove, listId }) {
  const [labelVal, setLabelVal] = useState(label ?? '')
  const [labelFocused, setLabelFocused] = useState(false)
  const [amtEdit, setAmtEdit] = useState('')
  const [amtFocused, setAmtFocused] = useState(false)
  useEffect(() => { if (!labelFocused) setLabelVal(label ?? '') }, [label, labelFocused])

  return (
    <div style={rowWrap}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
        <input
          value={labelFocused ? labelVal : (label || '')}
          placeholder="e.g. Gift, Inheritance, Sale of shares…"
          list={listId}
          onFocus={()=>{ setLabelFocused(true); setLabelVal(label || '') }}
          onChange={e=>setLabelVal(e.target.value)}
          onBlur={()=>{ setLabelFocused(false); if ((labelVal||'') !== (label||'')) onLabelCommit(labelVal) }}
          style={{ border:'none', borderBottom: labelFocused ? '1px solid #EB99C2' : '1px solid transparent', background:'transparent', fontSize:11, color:'#7A8090', outline:'none', flex:1, padding:'2px 0', fontFamily:'inherit' }}
        />
        <button onClick={onRemove} style={rmBtnStyle}>✕</button>
      </div>
      <input
        value={amtFocused ? amtEdit : (amount ? `$${Number(amount).toLocaleString()}` : '')}
        placeholder="—"
        onFocus={()=>{ setAmtFocused(true); setAmtEdit(amount ?? '') }}
        onChange={e=>setAmtEdit(e.target.value.replace(/[^0-9.]/g,''))}
        onBlur={()=>{
          setAmtFocused(false)
          const num = amtEdit === '' ? '' : Number(amtEdit)
          if (num !== (amount ?? '')) onAmountCommit(num === '' ? null : num)
        }}
        style={{ ...rowValueStyle(amtFocused, false), width:AMOUNT_COL_WIDTH, flexShrink:0 }}
      />
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

  // Loan From Lender is the deal's real facility amount, so it keeps the
  // top-level Deal Amount in sync — the same field shown on Loan Details, in
  // the header, and on the CRM dashboard/pipeline. Unlike Legals/Stamp Duty
  // this isn't a one-off default: it tracks continuously, since the two
  // numbers should always be the same thing.
  useEffect(() => {
    const rounded = Math.round(calc.loanFromLender)
    if (rounded > 0 && rounded !== deal.Amount) updateDeal({ Amount: rounded })
  }, [calc.loanFromLender]) // eslint-disable-line react-hooks/exhaustive-deps

  const equityTables = strat.equityTables || []
  const addEquityTable = () => s('equityTables', [...equityTables, { id: Date.now(), label:'', rows:[] }])
  const updEquityTable = (i, patch) => s('equityTables', equityTables.map((t,idx)=> idx===i ? {...t,...patch} : t))
  const rmEquityTable = (i) => s('equityTables', equityTables.filter((_,idx)=>idx!==i))
  const addEquityRow = (i) => updEquityTable(i, { rows: [...(equityTables[i].rows||[]), { property:'', lender:'', lvr:'', valuation:'', debt:'' }] })
  const updEquityRow = (i, ri, k, v) => updEquityTable(i, { rows: equityTables[i].rows.map((r,idx)=> idx===ri ? {...r,[k]:v} : r) })
  const rmEquityRow = (i, ri) => updEquityTable(i, { rows: equityTables[i].rows.filter((_,idx)=>idx!==ri) })

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
  const baseValueLabel = dealType === 'Construction' ? 'Estimated Value' : dealType === 'Refinance' ? 'Property Value' : 'Purchase Price'

  const [subTab, setSubTab] = useState('funding')
  const STRATEGY_SUB_TABS = [
    { id:'funding', label:'Funding Table' },
    { id:'equity', label:'Equity Table' },
    { id:'comparison', label:'Comparison Tables' },
  ]

  return (
    <div>
      <div style={{ display:'flex', gap:20 }}>
        <SideTabs tabs={STRATEGY_SUB_TABS} active={subTab} onChange={setSubTab} />

        <div style={{ flex:1, minWidth:0 }}>
          {subTab === 'funding' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <TabCard title={fundingTableTitle}>
                {calc.fields.filter(([k])=>k!=='stampDuty').map(([key,label]) => {
                  const val = key==='legals' ? calc.legals : key==='settlementAdj' ? calc.settlementAdj : strat[key]
                  return <LiveRowCurrency key={key} label={label} value={val} onCommit={v=>s(key, v)} pink={key==='purchasePrice'} />
                })}
                {dealType === 'Construction' && (
                  <ComputedRow label={baseValueLabel} value={fmtM(calc.estimatedValue)} tone="navy" />
                )}
                {dealType === 'Refinance' && (
                  <LiveRowCurrency label={baseValueLabel} value={strat.propertyValue} onCommit={v=>s('propertyValue', v)} />
                )}

                {calc.hasStampDuty && (
                  <>
                    <div style={rowWrap}>
                      <span style={rowLabel}>Stamp Duty (OSR est.)</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <select value={strat.state||'NSW'} onChange={e=>s('state', e.target.value)} style={{ border:'1px solid #e8eaed', borderRadius:5, padding:'2px 6px', fontSize:11, color:'#7A8090', background:'#fff', cursor:'pointer' }}>
                          {STAMP_DUTY_STATES.map(st=><option key={st} value={st}>{st}</option>)}
                        </select>
                        <StampDutyAmountInput value={calc.stampDuty} onCommit={v=>s('stampDuty', v)} />
                      </div>
                    </div>
                    {strat.stampDuty != null && strat.stampDuty !== calc.stampDutyEstimate && calc.stampDutyEstimate > 0 && (
                      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, margin:'-4px 0 8px' }}>
                        <span style={{ fontSize:10.5, color:'#9ca3af' }}>Estimated ({strat.state||'NSW'}): {fmtM(calc.stampDutyEstimate)}</span>
                        <button onClick={()=>s('stampDuty', calc.stampDutyEstimate)} style={{...addBtnStyle, padding:'2px 8px', fontSize:10}}>Apply</button>
                      </div>
                    )}
                  </>
                )}

                {strat.lmiIncluded && <LiveRowCurrency label="LMI Est." value={strat.lmi} onCommit={v=>s('lmi', v)} />}

                {strat.includeCrossCollateral && (
                  <LiveRowCurrency label="Additional Security (Cross Collateral Equity)" value={strat.crossCollateralValue} onCommit={v=>s('crossCollateralValue', v)} highlight="green" />
                )}

                <ComputedRow label="Total Costs" value={fmtM(calc.totalCosts)} tone="navy" />
                <LoanAmountRow
                  label="Loan From Lender"
                  onLvrCommit={v=>s('baseLvr', v)}
                  amountValue={calc.loanFromLender}
                  lvrBase={calc.lvrBase}
                  lmiAddOn={calc.capitaliseLMI ? calc.lmi : 0}
                />
                {calc.showBaseLoan && <ComputedRow label="Base Loan (excl. capitalised LMI)" value={fmtM(calc.baseLoan)} tone="yellow" side={calc.lvrBase ? `${(calc.baseLoanLVR*100).toFixed(1)}% LVR` : null} />}
                {calc.crossCollateralIncluded && (
                  <ComputedRow label="Total LVR (incl. cross-collateral)" value={`${(calc.totalLVR*100).toFixed(1)}%`} tone="green" />
                )}

                <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                  <LiveRowCurrency label="Equity" value={strat.equity} onCommit={v=>s('equity', v)} />
                  <LiveRowCurrency label="Savings" value={strat.savings} onCommit={v=>s('savings', v)} />
                  {strat.includeSaleProceeds && <ComputedRow label="Proceeds from Sale of Property" value={fmtM(calc.netSaleProceeds)} tone="yellow" />}
                </div>

                <div style={{ marginTop:10 }}>
                  <datalist id="contribution-types">{CONTRIBUTION_TYPES.map(t=><option key={t} value={t}/>)}</datalist>
                  {contributions.map((c,i) => (
                    <ContributionRow
                      key={i}
                      label={c.label}
                      onLabelCommit={v=>updContribution(i,'label',v)}
                      amount={c.amount}
                      onAmountCommit={v=>updContribution(i,'amount',v)}
                      onRemove={()=>rmContribution(i)}
                      listId="contribution-types"
                    />
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
                  <LiveRowCurrency label="Amount" value={strat.repayAmount ?? (calc.loanFromLender || '')} onCommit={v=>s('repayAmount', v)} />
                  <LiveRowNumber label="Term" value={strat.repayTerm} onCommit={v=>s('repayTerm', v)} suffix="yrs" />
                  <LiveRowNumber label="Interest Rate" value={strat.repayRate} onCommit={v=>s('repayRate', v)} suffix="%" step="0.01" />
                  <LiveRowSelect label="Repayment Frequency" value={strat.repayFrequency||'Monthly'} onCommit={v=>s('repayFrequency', v)} options={REPAYMENT_FREQUENCIES} allowBlank={false} />
                  {(() => {
                    const amt = Number(strat.repayAmount ?? calc.loanFromLender)||0, yrs = Number(strat.repayTerm)||0, rate = (Number(strat.repayRate)||0)/100
                    const nMo = yrs*12, r = rate/12
                    const pi = amt && nMo && r ? (amt*r)/(1-Math.pow(1+r,-nMo)) : 0
                    const io = amt && rate ? (amt*rate)/12 : 0
                    const freq = strat.repayFrequency || 'Monthly'
                    const mult = REPAYMENT_FREQUENCY_MULT[freq]
                    const freqLabel = freq.toLowerCase()
                    return (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                        <ComputedRow label={`P&I Repayment (${freqLabel})`} value={pi ? `$${Math.round(pi*mult).toLocaleString()}` : '—'} tone="navy" />
                        <ComputedRow label={`IO Repayment (${freqLabel})`} value={io ? `$${Math.round(io*mult).toLocaleString()}` : '—'} tone="navy" />
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
                  <LiveRowCheckbox label="Include Cross Collateralised Security?" checked={strat.includeCrossCollateral} onChange={v=>s('includeCrossCollateral', v)} />
                  {strat.includeCrossCollateral && (
                    <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Adds an "Additional Security" value into the Total LVR calculation only — it doesn't change Total Costs or Surplus/(Deficit).</div>
                  )}
                </div>
              </TabCard>
            </div>
          )}

          {subTab === 'equity' && (
            <TabCard title="Equity Tables" right={<button onClick={addEquityTable} style={addBtnStyle}>+ Add equity table</button>}>
              <div style={{ fontSize:11, color:'#9ca3af', marginBottom:14 }}>Add a separate table for each ownership position — e.g. personal vs. a company or trust — when you're looking at equity from a grouped perspective.</div>
              {equityTables.length === 0 && <div style={{ fontSize:11.5, color:'#9ca3af', padding:'10px 0' }}>No equity tables yet.</div>}
              {equityTables.map((et, i) => (
                <div key={et.id||i} style={{ marginBottom:18, paddingBottom:14, borderBottom: i<equityTables.length-1 ? '1px solid #e8eaed' : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <LiveText value={et.label} onCommit={v=>updEquityTable(i,{label:v})} placeholder="e.g. Personal, ABC Pty Ltd, Family Trust" />
                    <div style={{ display:'flex', gap:6, marginLeft:10 }}>
                      <button onClick={()=>addEquityRow(i)} style={addBtnStyle}>+ Add property</button>
                      <button onClick={()=>rmEquityTable(i)} style={rmBtnStyle}>Remove table</button>
                    </div>
                  </div>
                  <MiniTable widths={['17%','14%','7%','13%','10%','13%','10%','13%','3%']} columns={['Property','Lender','LVR %','Valuation','LV','Debt','Actual LVR','Equity','']} rows={(et.rows||[]).map((r,ri) => {
                    const lv = (Number(r.valuation)||0) * (Number(r.lvr)||0) / 100
                    const equity = lv - (Number(r.debt)||0)
                    const val = Number(r.valuation)||0
                    const debt = Number(r.debt)||0
                    const actualLVR = val > 0 ? (debt / val * 100) : null
                    return [
                      <LiveText small value={r.property} onCommit={v=>updEquityRow(i,ri,'property',v)}/>,
                      <LiveText small value={r.lender} onCommit={v=>updEquityRow(i,ri,'lender',v)}/>,
                      <LiveNumber small value={r.lvr} onCommit={v=>updEquityRow(i,ri,'lvr',v)}/>,
                      <LiveNumberFormatted small value={r.valuation} onCommit={v=>updEquityRow(i,ri,'valuation',v)}/>,
                      fmtM(lv),
                      <LiveNumberFormatted small value={r.debt} onCommit={v=>updEquityRow(i,ri,'debt',v)}/>,
                      // Calculated only — debt against the bank's actual
                      // valuation, not editable. Distinct from the LVR %
                      // input above, which is an assumed/target rate used
                      // to work out lending value, not what's actually owed.
                      <span style={{ color:'#7A8090' }}>{actualLVR != null ? `${actualLVR.toFixed(1)}%` : '—'}</span>,
                      <span style={{ color: equity < 0 ? '#dc2626' : '#16a34a', fontWeight:600 }}>{fmtM(equity)}</span>,
                      <button onClick={()=>rmEquityRow(i,ri)} style={rmBtnStyle}>✕</button>,
                    ]
                  })} empty="No properties in this table yet"/>
                </div>
              ))}
            </TabCard>
          )}

          {subTab === 'comparison' && (
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
          )}

          <div style={{ fontSize:11, color:'#9ca3af' }}>Stamp duty is a manual estimate for now — flagged for a proper state-based OSR calculator in a later pass.</div>
        </div>
      </div>
    </div>
  )
}

// Residential deals don't need business trading analysis / debt servicing —
// keep Structure simple for them. Every other category (Commercial, Full
// Commercial (BANK RM), SMSF, Business Loan, Trade & Invoice Finance, Asset
// Finance, Development) gets the full set, since those routinely involve
// entity financials and servicing calculations.
function StructureTab({ d, editing, set }) {
  const isResidential = d.Categories === 'Residential'
  const subs = [
    {id:'security',label:'Security'},
    ...(isResidential
      ? [
          {id:'livingExpenses',label:'Living Expenses'},
          {id:'realEstate',label:'Assets — Real Estate'},
          {id:'otherAssets',label:'Assets — Other'},
          {id:'liabilities',label:'Liabilities'},
          {id:'employment',label:'Employment'},
          {id:'otherIncome',label:'Other Income'},
        ]
      : [{id:'financials',label:'Financials'},{id:'servicing',label:'Servicing'}]
    ),
  ]
  const [sub, setSub] = useState(subs[0].id)
  useEffect(() => { if (!subs.find(x=>x.id===sub)) setSub(subs[0].id) }, [d.Categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const struct = d._structure || {}
  const s = (k, v) => set('_structure', { ...struct, [k]: v })
  const fin = struct.financials || {}
  const setFin = (year, k, v) => s('financials', { ...fin, [year]: { ...(fin[year]||{}), [k]: v } })
  const servicing = struct.servicing || {}
  const setServicing = (k, v) => s('servicing', { ...servicing, [k]: v })

  const securityTypeOptions = CATEGORY_SECURITY_TYPES[d.Categories] || SECURITY_TYPES
  const securities = struct.securities || []
  const addSecurity = () => s('securities', [...securities, { type:securityTypeOptions[0], description:'', value:'', lendingValue:'', owner:'', band:'FS' }])
  const updSecurity = (i,k,v) => s('securities', securities.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmSecurity = (i) => s('securities', securities.filter((_,idx)=>idx!==i))

  // Individuals now come from Loan Details → Clients & Contacts, rather than
  // a separate entity register here — Cameron folded that in to avoid
  // capturing the same people twice.
  const individuals = (d.Contacts || []).filter(c => c.type === 'Individual' && c.name)
  const OWNERSHIP_OPTIONS = ['Shared Equally', ...individuals.map(e => `100% ${e.name}`)]

  const livingExpenses = struct.livingExpenses || []
  const addLivingExpense = () => s('livingExpenses', [...livingExpenses, { type:'', ownership:'Shared Equally', frequency:'Monthly', amount:'' }])
  const updLivingExpense = (i,k,v) => s('livingExpenses', livingExpenses.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmLivingExpense = (i) => s('livingExpenses', livingExpenses.filter((_,idx)=>idx!==i))

  const realEstateAssets = struct.realEstateAssets || []
  const addRealEstateAsset = () => s('realEstateAssets', [...realEstateAssets, { address:'', purpose:'Owner Occupied', isSecurity:false, isPurchasing:false, value:'', loanBalance:'' }])
  const updRealEstateAsset = (i,k,v) => s('realEstateAssets', realEstateAssets.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmRealEstateAsset = (i) => s('realEstateAssets', realEstateAssets.filter((_,idx)=>idx!==i))

  const otherAssets = struct.otherAssets || []
  const addOtherAsset = () => s('otherAssets', [...otherAssets, { type:'', ownership:'Shared Equally', details:'', value:'', basis:'Applicant Estimate' }])
  const updOtherAsset = (i,k,v) => s('otherAssets', otherAssets.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmOtherAsset = (i) => s('otherAssets', otherAssets.filter((_,idx)=>idx!==i))

  const liabilitiesReg = struct.liabilitiesReg || []
  const addLiabilityReg = () => s('liabilitiesReg', [...liabilitiesReg, { type:'Mortgage Loan', institution:'', accountName:'', security:'', balance:'', limit:'', repayment:'', frequency:'Monthly' }])
  const updLiabilityReg = (i,k,v) => s('liabilitiesReg', liabilitiesReg.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmLiabilityReg = (i) => s('liabilitiesReg', liabilitiesReg.filter((_,idx)=>idx!==i))

  const employment = struct.employment || {}
  const empFor = (name) => employment[name] || []
  const setEmpFor = (name, arr) => s('employment', { ...employment, [name]: arr })
  const addEmployment = (name) => setEmpFor(name, [...empFor(name), { type:'Primary Employment', basis:'Full Time', incomeType:'PAYG', employer:'', abn:'', position:'', payType:'Private', startDate:'', onProbation:false, incomeLines:[] }])
  const updEmployment = (name,i,k,v) => setEmpFor(name, empFor(name).map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmEmployment = (name,i) => setEmpFor(name, empFor(name).filter((_,idx)=>idx!==i))
  const addIncomeLine = (name,i) => updEmployment(name,i,'incomeLines',[...(empFor(name)[i]?.incomeLines||[]), { type:'Salary', amount:'', frequency:'Annually' }])
  const updIncomeLine = (name,i,li,k,v) => updEmployment(name,i,'incomeLines', empFor(name)[i].incomeLines.map((l,idx)=>idx===li?{...l,[k]:v}:l))
  const rmIncomeLine = (name,i,li) => updEmployment(name,i,'incomeLines', empFor(name)[i].incomeLines.filter((_,idx)=>idx!==li))

  const otherIncome = struct.otherIncome || []
  const addOtherIncome = () => s('otherIncome', [...otherIncome, { type:'', ownership:'Shared Equally', frequency:'Monthly', amount:'' }])
  const updOtherIncome = (i,k,v) => s('otherIncome', otherIncome.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  const rmOtherIncome = (i) => s('otherIncome', otherIncome.filter((_,idx)=>idx!==i))

  // Splits a register's monthly-equivalent total across named individuals
  // based on each row's Ownership field ("Shared Equally" or "100% Name").
  function perApplicantTotals(rows) {
    const totals = {}
    individuals.forEach(e => { totals[e.name] = 0 })
    rows.forEach(r => {
      const monthly = toMonthly(r.amount, r.frequency)
      const named = individuals.find(e => r.ownership === `100% ${e.name}`)
      if (named) {
        totals[named.name] = (totals[named.name]||0) + monthly
      } else if (individuals.length) {
        individuals.forEach(e => { totals[e.name] = (totals[e.name]||0) + monthly/individuals.length })
      }
    })
    return totals
  }
  function registerTotalRow(rows) {
    const grand = rows.reduce((sum,r) => sum + toMonthly(r.amount, r.frequency), 0)
    const perApp = perApplicantTotals(rows)
    return { grand, perApp }
  }

  const years = ['Y1','Y2','Y3','YTD','Fcst']
  const dscr = servicing.ebitda && servicing.repayments ? (Number(servicing.ebitda)/Number(servicing.repayments)).toFixed(2) : '—'
  const icr = servicing.ebit && servicing.interestForCover ? (Number(servicing.ebit)/Number(servicing.interestForCover)).toFixed(2) : '—'

  return (
    <div style={{ display:'flex', gap:20 }}>
      <SideTabs tabs={subs} active={sub} onChange={setSub} />

      <div style={{ flex:1, minWidth:0 }}>
        {isResidential && individuals.length === 0 && (
          <div style={{ fontSize:11, color:'#9ca3af', marginBottom:16 }}>Add individuals under Loan Details → Clients & Contacts first — Employment and the ownership splits here are driven by who's listed there.</div>
        )}

        {sub === 'security' && (
          <TabCard title="Securities Held" right={<button onClick={addSecurity} style={addBtnStyle}>+ Add security</button>}>
            <div style={{ fontSize:11, color:'#9ca3af', marginBottom:10 }}>Security types shown are the ones typically used for a <strong style={{color:'#2A3545'}}>{d.Categories || 'this'}</strong> deal — change Category on Loan Details if this list isn't right.</div>
            <MiniTable columns={['Type','Description','Value','Lending Value','Owner','Band','']} rows={securities.map((r,i) => [
              <LiveSelect small value={r.type} onCommit={v=>updSecurity(i,'type',v)} options={securityTypeOptions} allowBlank={false} />,
              <LiveText small value={r.description} onCommit={v=>updSecurity(i,'description',v)} placeholder="e.g. address, or asset description" />,
              <LiveNumber small value={r.value} onCommit={v=>updSecurity(i,'value',v)} />,
              <LiveNumber small value={r.lendingValue} onCommit={v=>updSecurity(i,'lendingValue',v)} />,
              <LiveText small value={r.owner} onCommit={v=>updSecurity(i,'owner',v)} />,
              <LiveSelect small value={r.band} onCommit={v=>updSecurity(i,'band',v)} options={SEC_BANDS.map(b=>b.code)} allowBlank={false} />,
              <button onClick={()=>rmSecurity(i)} style={rmBtnStyle}>✕</button>,
            ])} empty="No security added yet"/>
          </TabCard>
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

        {sub === 'livingExpenses' && (() => {
          const { grand, perApp } = registerTotalRow(livingExpenses)
          return (
            <TabCard title="Living Expenses" right={<button onClick={addLivingExpense} style={addBtnStyle}>+ Add expense</button>}>
              <MiniTable columns={['Type','Ownership','Frequency','Amount','']} rows={livingExpenses.map((r,i) => [
                <LiveSelect small value={r.type} onCommit={v=>updLivingExpense(i,'type',v)} options={LIVING_EXPENSE_TYPES} />,
                <LiveSelect small value={r.ownership} onCommit={v=>updLivingExpense(i,'ownership',v)} options={OWNERSHIP_OPTIONS} allowBlank={false} />,
                <LiveSelect small value={r.frequency} onCommit={v=>updLivingExpense(i,'frequency',v)} options={FREQUENCIES} allowBlank={false} />,
                <LiveNumber small value={r.amount} onCommit={v=>updLivingExpense(i,'amount',v)} />,
                <button onClick={()=>rmLivingExpense(i)} style={rmBtnStyle}>✕</button>,
              ])} empty="No living expenses added yet"/>
              {livingExpenses.length > 0 && (
                <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                  {individuals.map(e => <div key={e.name} style={{fontSize:11.5,color:'#7A8090',textAlign:'right'}}>{e.name}: <strong style={{color:'#2A3545'}}>${(perApp[e.name]||0).toLocaleString(undefined,{maximumFractionDigits:2})}</strong> / month</div>)}
                  <ComputedRow label="Total (All Applicants, monthly)" value={`$${grand.toLocaleString(undefined,{maximumFractionDigits:2})}`} tone="navy" big />
                </div>
              )}
            </TabCard>
          )
        })()}

        {sub === 'realEstate' && (() => {
          const totalValue = realEstateAssets.reduce((sum,r)=>sum+(Number(r.value)||0),0)
          const totalLoanBalance = realEstateAssets.reduce((sum,r)=>sum+(Number(r.loanBalance)||0),0)
          return (
            <TabCard title="Assets — Real Estate" right={<button onClick={addRealEstateAsset} style={addBtnStyle}>+ Add property</button>}>
              <MiniTable columns={['Address','Purpose','Security','Purchasing','Value','Loan Balance','']} rows={realEstateAssets.map((r,i) => [
                <LiveText small value={r.address} onCommit={v=>updRealEstateAsset(i,'address',v)} placeholder="Address" />,
                <LiveSelect small value={r.purpose} onCommit={v=>updRealEstateAsset(i,'purpose',v)} options={REAL_ESTATE_PURPOSES} allowBlank={false} />,
                <input type="checkbox" checked={!!r.isSecurity} onChange={e=>updRealEstateAsset(i,'isSecurity',e.target.checked)} />,
                <input type="checkbox" checked={!!r.isPurchasing} onChange={e=>updRealEstateAsset(i,'isPurchasing',e.target.checked)} />,
                <LiveNumber small value={r.value} onCommit={v=>updRealEstateAsset(i,'value',v)} />,
                <LiveNumber small value={r.loanBalance} onCommit={v=>updRealEstateAsset(i,'loanBalance',v)} />,
                <button onClick={()=>rmRealEstateAsset(i)} style={rmBtnStyle}>✕</button>,
              ])} empty="No real estate assets added yet"/>
              {realEstateAssets.length > 0 && (
                <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                  <ComputedRow label="Total Assets" value={fmtM(totalValue)} tone="navy" />
                  <ComputedRow label="Total Loan Balance" value={fmtM(totalLoanBalance)} tone="yellow" />
                </div>
              )}
            </TabCard>
          )
        })()}

        {sub === 'otherAssets' && (() => {
          const totalValue = otherAssets.reduce((sum,r)=>sum+(Number(r.value)||0),0)
          return (
            <TabCard title="Assets — Other" right={<button onClick={addOtherAsset} style={addBtnStyle}>+ Add asset</button>}>
              <MiniTable columns={['Type','Ownership','Details','Value','Basis','']} rows={otherAssets.map((r,i) => [
                <LiveSelect small value={r.type} onCommit={v=>updOtherAsset(i,'type',v)} options={OTHER_ASSET_TYPES} />,
                <LiveSelect small value={r.ownership} onCommit={v=>updOtherAsset(i,'ownership',v)} options={OWNERSHIP_OPTIONS} allowBlank={false} />,
                <LiveText small value={r.details} onCommit={v=>updOtherAsset(i,'details',v)} />,
                <LiveNumber small value={r.value} onCommit={v=>updOtherAsset(i,'value',v)} />,
                <LiveSelect small value={r.basis} onCommit={v=>updOtherAsset(i,'basis',v)} options={ASSET_BASIS} allowBlank={false} />,
                <button onClick={()=>rmOtherAsset(i)} style={rmBtnStyle}>✕</button>,
              ])} empty="No other assets added yet"/>
              {otherAssets.length > 0 && <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}><ComputedRow label="Total Value" value={fmtM(totalValue)} tone="navy" /></div>}
            </TabCard>
          )
        })()}

        {sub === 'liabilities' && (() => {
          const totalBalance = liabilitiesReg.reduce((sum,r)=>sum+(Number(r.balance)||0),0)
          return (
            <TabCard title="Liabilities" right={<button onClick={addLiabilityReg} style={addBtnStyle}>+ Add liability</button>}>
              <MiniTable columns={['Type','Institution','Account Name','Security','Balance','Limit','Repayment','']} rows={liabilitiesReg.map((r,i) => [
                <LiveSelect small value={r.type} onCommit={v=>updLiabilityReg(i,'type',v)} options={LIABILITY_TYPES} allowBlank={false} />,
                <LiveText small value={r.institution} onCommit={v=>updLiabilityReg(i,'institution',v)} />,
                <LiveText small value={r.accountName} onCommit={v=>updLiabilityReg(i,'accountName',v)} />,
                <LiveText small value={r.security} onCommit={v=>updLiabilityReg(i,'security',v)} placeholder="Address, if secured" />,
                <LiveNumber small value={r.balance} onCommit={v=>updLiabilityReg(i,'balance',v)} />,
                <LiveNumber small value={r.limit} onCommit={v=>updLiabilityReg(i,'limit',v)} />,
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <LiveNumber small value={r.repayment} onCommit={v=>updLiabilityReg(i,'repayment',v)} />
                  <LiveSelect small value={r.frequency} onCommit={v=>updLiabilityReg(i,'frequency',v)} options={FREQUENCIES} allowBlank={false} />
                  <button onClick={()=>rmLiabilityReg(i)} style={rmBtnStyle}>✕</button>
                </div>,
              ])} empty="No liabilities added yet"/>
              {liabilitiesReg.length > 0 && <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}><ComputedRow label="Total Balance" value={fmtM(totalBalance)} tone="yellow" /></div>}
            </TabCard>
          )
        })()}

        {sub === 'employment' && (
          <div>
            {individuals.length === 0 && <TabCard><div style={{fontSize:11.5,color:'#9ca3af'}}>Add individuals under Loan Details → Clients & Contacts first — employment is captured per applicant.</div></TabCard>}
            {individuals.map(e => {
              const records = empFor(e.name)
              return (
                <TabCard key={e.name} title={e.name} right={<button onClick={()=>addEmployment(e.name)} style={addBtnStyle}>+ Add employment</button>}>
                  {records.length === 0 && <div style={{fontSize:11.5,color:'#9ca3af',padding:'6px 0'}}>No employment added yet</div>}
                  {records.map((r,i) => (
                    <div key={i} style={{ marginBottom:16, paddingBottom:14, borderBottom: i<records.length-1 ? '1px solid #e8eaed' : 'none' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                        <LiveSelect small value={r.type} onCommit={v=>updEmployment(e.name,i,'type',v)} options={EMPLOYMENT_TYPES} allowBlank={false} />
                        <LiveSelect small value={r.basis} onCommit={v=>updEmployment(e.name,i,'basis',v)} options={EMPLOYMENT_BASIS} allowBlank={false} />
                        <LiveSelect small value={r.incomeType} onCommit={v=>updEmployment(e.name,i,'incomeType',v)} options={EMPLOYMENT_INCOME_TYPES} allowBlank={false} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                        <LiveText small value={r.employer} onCommit={v=>updEmployment(e.name,i,'employer',v)} placeholder="Employer name" />
                        <LiveText small value={r.position} onCommit={v=>updEmployment(e.name,i,'position',v)} placeholder="Position" />
                      </div>
                      <datalist id={`income-line-types-${e.name}-${i}`}>{INCOME_LINE_TYPES.map(t=><option key={t} value={t}/>)}</datalist>
                      {(r.incomeLines||[]).map((l,li) => (
                        <div key={li} style={{ display:'flex', gap:8, alignItems:'center', padding:'4px 0' }}>
                          <LiveText small value={l.type} onCommit={v=>updIncomeLine(e.name,i,li,'type',v)} list={`income-line-types-${e.name}-${i}`} />
                          <LiveNumber small value={l.amount} onCommit={v=>updIncomeLine(e.name,i,li,'amount',v)} />
                          <LiveSelect small value={l.frequency} onCommit={v=>updIncomeLine(e.name,i,li,'frequency',v)} options={FREQUENCIES} allowBlank={false} />
                          <button onClick={()=>rmIncomeLine(e.name,i,li)} style={rmBtnStyle}>✕</button>
                        </div>
                      ))}
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                        <button onClick={()=>addIncomeLine(e.name,i)} style={addBtnStyle}>+ Add income line</button>
                        <button onClick={()=>rmEmployment(e.name,i)} style={rmBtnStyle}>Remove employment</button>
                      </div>
                    </div>
                  ))}
                </TabCard>
              )
            })}
          </div>
        )}

        {sub === 'otherIncome' && (() => {
          const { grand, perApp } = registerTotalRow(otherIncome)
          return (
            <TabCard title="Other Income" right={<button onClick={addOtherIncome} style={addBtnStyle}>+ Add income</button>}>
              <MiniTable columns={['Type','Ownership','Frequency','Amount','']} rows={otherIncome.map((r,i) => [
                <LiveSelect small value={r.type} onCommit={v=>updOtherIncome(i,'type',v)} options={OTHER_INCOME_TYPES} />,
                <LiveSelect small value={r.ownership} onCommit={v=>updOtherIncome(i,'ownership',v)} options={OWNERSHIP_OPTIONS} allowBlank={false} />,
                <LiveSelect small value={r.frequency} onCommit={v=>updOtherIncome(i,'frequency',v)} options={FREQUENCIES} allowBlank={false} />,
                <LiveNumber small value={r.amount} onCommit={v=>updOtherIncome(i,'amount',v)} />,
                <button onClick={()=>rmOtherIncome(i)} style={rmBtnStyle}>✕</button>,
              ])} empty="No other income added yet"/>
              {otherIncome.length > 0 && (
                <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #e8eaed' }}>
                  {individuals.map(e => <div key={e.name} style={{fontSize:11.5,color:'#7A8090',textAlign:'right'}}>{e.name}: <strong style={{color:'#2A3545'}}>${(perApp[e.name]||0).toLocaleString(undefined,{maximumFractionDigits:2})}</strong> / month</div>)}
                  <ComputedRow label="Total (All Applicants, monthly)" value={`$${grand.toLocaleString(undefined,{maximumFractionDigits:2})}`} tone="navy" big />
                </div>
              )}
            </TabCard>
          )
        })()}
      </div>
    </div>
  )
}

function mkAttachmentId() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}` }

// Highlights "20XX" and standalone "X" placeholders in red so it's obvious
// at a glance what needs writing over (specific years, specific dates) —
// but a plain <input> can't show mixed-color text, so this shows the
// highlighted version at rest and swaps to a normal plain-text input the
// moment you click in, so editing/selecting/retyping still works exactly
// like any other field.
function highlightPlaceholders(text) {
  const parts = String(text||'').split(/(20XX|\bX\b)/g)
  return parts.map((part, i) => (part === '20XX' || part === 'X')
    ? <span key={i} style={{ color:'#dc2626', fontWeight:700 }}>{part}</span>
    : <span key={i}>{part}</span>
  )
}
function ChecklistItemText({ value, onChange, done, bold, placeholder }) {
  const [focused, setFocused] = useState(false)
  const [val, setVal] = useState(value)
  useEffect(() => { if (!focused) setVal(value) }, [value, focused])
  const baseStyle = { flex:1, fontSize:12, fontFamily:'inherit', padding:'2px 4px', borderRadius:4, fontWeight: bold ? 600 : 400 }
  if (focused) {
    return (
      <input
        autoFocus value={val} placeholder={placeholder}
        onChange={ev=>setVal(ev.target.value)}
        onKeyDown={ev=>{ if (ev.key==='Enter') ev.currentTarget.blur() }}
        onBlur={()=>{ setFocused(false); if (val !== value) onChange(val) }}
        style={{ ...baseStyle, border:'1px solid #EB99C2', background:'#fff', color:'#2A3545' }}
      />
    )
  }
  return (
    <div onClick={()=>setFocused(true)} style={{ ...baseStyle, border:'1px solid transparent', cursor:'text', minHeight:'1.6em', display:'flex', alignItems:'center', color: done ? '#B0B5BD' : '#2A3545', textDecoration: done ? 'line-through' : 'none' }}>
      {value ? highlightPlaceholders(value) : <span style={{ color:'#B0B5BD' }}>{placeholder}</span>}
    </div>
  )
}

function buildSectionsFromTemplate(template) {
  return template.sections.map(s => ({
    heading: s.heading,
    items: s.items.map(i => i.repeat
      ? { id: mkAttachmentId(), text: i.text, repeat: i.repeat, subItems: (i.seed||[]).map(t => ({ id: mkAttachmentId(), text: t, checked:false })) }
      : { id: mkAttachmentId(), text: i.text, checked:false }
    ),
  }))
}

function AttachmentsTab({ deal, deals, setDeals, editing, d, set }) {
  const att = d._attachments || {}

  function saveAtt(patch) {
    const updatedAtt = { ...att, ...patch }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _attachments: updatedAtt } : x)
    setDeals(updated); saveDeals(updated)
    if (editing) set('_attachments', updatedAtt)
  }

  const transactionType = att.transactionType || defaultAttachmentTemplate(deal.Categories)
  const sections = att.sections || buildSectionsFromTemplate(ATTACHMENT_TEMPLATES[transactionType] || ATTACHMENT_TEMPLATES['Home Loan'])

  // First time this deal's Attachments tab is opened, there's nothing saved
  // yet — persist the freshly-built default straight away so it's a real,
  // editable record from the first click rather than a throwaway preview
  // that vanishes if you navigate away without editing anything.
  useEffect(() => {
    if (!att.sections) saveAtt({ transactionType, sections })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the transaction type REPLACES the checklist with that
  // template's own list — it does not merge the two together. That's
  // deliberate: picking a different transaction type means "show me that
  // type's requirements," not "add them to whatever's already here." Files
  // now live on individual items rather than a separate list, so this
  // also removes any files that were attached to the old checklist's items
  // — worth being careful with if files are already attached.
  function changeTransactionType(newType) {
    const template = ATTACHMENT_TEMPLATES[newType] || ATTACHMENT_TEMPLATES['Home Loan']
    saveAtt({ transactionType: newType, sections: buildSectionsFromTemplate(template) })
  }

  function updateSections(updater) { saveAtt({ sections: updater(sections) }) }

  function isAllSubChecked(it) { return (it.subItems||[]).length > 0 && it.subItems.every(su => su.checked) }
  // With sub-items present, the checkbox reflects/controls all of them. With
  // none yet, it's just a normal standalone checkbox on the item itself —
  // this matters because a repeatable item (e.g. Credit Guide, which now
  // has a "+ Individual" button) shouldn't have a permanently disabled,
  // unresponsive checkbox just because no one's clicked "+ Individual" on
  // it. That was the actual bug — the checkbox wasn't broken, it was
  // deliberately disabled whenever subItems was empty, which is most of the
  // time for simple items nobody needs to split by person.
  function masterChecked(it) { return (it.subItems||[]).length > 0 ? isAllSubChecked(it) : !!it.checked }

  function toggleItemChecked(si, itemId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id === itemId ? { ...it, checked: !it.checked } : it) }))
  }
  function updateItemText(si, itemId, text) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id === itemId ? { ...it, text } : it) }))
  }
  function removeItem(si, itemId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.filter(it => it.id !== itemId) }))
  }
  const [dragItem, setDragItem] = useState(null) // { si, id }
  // Drag-and-drop reordering within a section — drop the dragged item onto
  // another to have it take that item's position, shifting the rest along.
  // Only reorders within the same section; dragging onto a different
  // section is simply ignored rather than doing anything unexpected.
  function reorderItem(si, draggedId, targetId) {
    if (draggedId === targetId) return
    updateSections(secs => secs.map((s, i) => {
      if (i !== si) return s
      const items = [...s.items]
      const fromIdx = items.findIndex(it => it.id === draggedId)
      const toIdx = items.findIndex(it => it.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return s
      const [moved] = items.splice(fromIdx, 1)
      items.splice(toIdx, 0, moved)
      return { ...s, items }
    }))
  }
  // Picking an item that matches one of the template's own items (by exact
  // text, via the +Add Item suggestions) gives it that same item's repeat
  // behavior — e.g. picking the rental-statements line gets its own
  // "+ Property" button, same as if it had come from the template
  // directly. Anything typed that doesn't match a known item is just a
  // plain flat line, same as before.
  function addItemToSection(si, text) {
    if (!text.trim()) return
    const trimmed = text.trim()
    const repeatType = ATTACHMENT_ITEM_REPEAT_TYPES[trimmed]
    const newItem = repeatType
      ? { id: mkAttachmentId(), text: trimmed, repeat: repeatType, subItems: [] }
      : { id: mkAttachmentId(), text: trimmed, checked: false }
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: [...s.items, newItem] }))
  }
  // Repeatable items (Individual / Entity / Property / Statement / Document)
  // — the "+ [Type]" button adds one more indented, editable sub-line.
  function addSubItem(si, itemId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id !== itemId ? it : { ...it, subItems: [...(it.subItems||[]), { id: mkAttachmentId(), text: '', checked: false }] }) }))
  }
  function updateSubItemText(si, itemId, subId, text) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id !== itemId ? it : { ...it, subItems: it.subItems.map(su => su.id === subId ? { ...su, text } : su) }) }))
  }
  function toggleSubItemChecked(si, itemId, subId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id !== itemId ? it : { ...it, subItems: it.subItems.map(su => su.id === subId ? { ...su, checked: !su.checked } : su) }) }))
  }
  function removeSubItem(si, itemId, subId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => it.id !== itemId ? it : { ...it, subItems: it.subItems.filter(su => su.id !== subId) }) }))
  }
  // The Master checkbox for a request. With sub-items present, it's not its
  // own stored value — it's always just "are all the sub-items ticked right
  // now", so it can never drift out of sync with them, and clicking it
  // cascades to every sub-item. With no sub-items yet, it toggles a normal
  // checked flag on the item itself instead (see masterChecked above).
  function toggleMasterChecked(si, itemId) {
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => {
      if (it.id !== itemId) return it
      if ((it.subItems||[]).length === 0) return { ...it, checked: !it.checked }
      const makeAllChecked = !isAllSubChecked(it)
      return { ...it, subItems: it.subItems.map(su => ({ ...su, checked: makeAllChecked })) }
    }) }))
  }

  const [uploadingKey, setUploadingKey] = useState(null)
  // Uploads a file straight onto a specific checklist row — the master
  // item itself (subId omitted) or one specific sub-item (subId given).
  // Attaching a file automatically ticks that row, since realistically if
  // you've attached the document, it's done — but the checkbox itself is
  // never disabled or locked afterward. If the wrong file gets attached, or
  // you just want to mark it outstanding again for any reason, unticking
  // it works exactly like any other checkbox, regardless of what's
  // attached.
  async function uploadToItem(si, itemId, subId, file) {
    const uploadKey = subId ? `${itemId}-${subId}` : itemId
    setUploadingKey(uploadKey)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${deal['Transaction Name']}/${uploadKey}/${Date.now()}_${safeName}`
    const res = await sbUploadAttachment(path, file)
    setUploadingKey(null)
    if (!res.ok) { notifySaveFailed('attachments', { error: res.error }); return }
    const fileRecord = { name: file.name, path, size: file.size, uploadedAt: new Date().toISOString() }
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(it => {
      if (it.id !== itemId) return it
      if (subId) return { ...it, subItems: it.subItems.map(su => su.id === subId ? { ...su, files: [...(su.files||[]), fileRecord], checked: true } : su) }
      return { ...it, files: [...(it.files||[]), fileRecord], checked: true }
    }) }))
  }
  async function removeItemFile(si, itemId, subId, fileIdx) {
    const sec = sections[si]
    const it = sec.items.find(x => x.id === itemId)
    const target = subId ? (it.subItems||[]).find(su => su.id === subId) : it
    const f = (target?.files||[])[fileIdx]
    if (!f) return
    await sbDeleteAttachment(f.path)
    updateSections(secs => secs.map((s, i) => i !== si ? s : { ...s, items: s.items.map(x => {
      if (x.id !== itemId) return x
      if (subId) return { ...x, subItems: x.subItems.map(su => su.id === subId ? { ...su, files: (su.files||[]).filter((_, fi) => fi !== fileIdx) } : su) }
      return { ...x, files: (x.files||[]).filter((_, fi) => fi !== fileIdx) }
    }) }))
  }
  async function viewItemFile(path) {
    const url = await sbGetAttachmentUrl(path)
    if (url) window.open(url, '_blank')
    else notifySaveFailed('attachments', { error: 'Could not generate a link for this file — check the deal-attachments Storage bucket exists.' })
  }

  // Renders the inline file links + attach control shared by every row —
  // master items, plain items, and sub-items alike.
  function UploadTrigger({ uploadKey, onUpload }) {
    return (
      <label style={{ fontSize:14, color:'#7A8090', cursor:'pointer', flexShrink:0 }} title="Attach a file">
        {uploadingKey === uploadKey ? '…' : '📎'}
        <input type="file" style={{ display:'none' }} disabled={uploadingKey === uploadKey}
          onChange={ev => { if (ev.target.files[0]) onUpload(ev.target.files[0]); ev.target.value = '' }} />
      </label>
    )
  }
  // Sits in the Attachments column, aligned to its item's row. Multiple
  // files for one item stack vertically here — the row itself (both this
  // cell and its matching item cell on the left) grows to fit however many
  // are stacked, since they're cells in the same CSS grid row.
  function FileStack({ files, onRemove }) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:5, padding: files?.length ? '7px 10px' : '0', justifyContent:'center', minHeight:'100%' }}>
        {(files||[]).map((f, fi) => (
          <div key={fi} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span onClick={()=>viewItemFile(f.path)} style={{ fontSize:11.5, color:'#2563eb', cursor:'pointer', textDecoration:'underline' }}>{f.name}</span>
            <button onClick={()=>onRemove(fi)} style={{ ...rmBtnStyle, padding:'0 4px', fontSize:9, flexShrink:0 }}>✕</button>
          </div>
        ))}
      </div>
    )
  }

  const allLeaf = sections.flatMap(s => s.items.flatMap(it => it.repeat ? (it.subItems||[]) : [it]))
  const doneCount = allLeaf.filter(it => it.checked).length

  return (
    <div>
      <datalist id="attachment-master-items">{ATTACHMENT_MASTER_ITEMS.map(t => <option key={t} value={t} />)}</datalist>

      <TabCard>
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#7A8090', textTransform:'uppercase' }}>Transaction type</span>
          <select value={transactionType} onChange={ev=>changeTransactionType(ev.target.value)}
            style={{ border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, flex:'1 1 240px', fontFamily:'inherit' }}>
            {Object.keys(ATTACHMENT_TEMPLATES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <span style={{ fontSize:10.5, color:'#9ca3af' }}>{doneCount}/{allLeaf.length} received</span>
        </div>
        <div style={{ fontSize:10.5, color:'#9ca3af' }}>Changing this replaces the checklist below with that transaction type's own requirements.</div>
      </TabCard>

      {sections.map((sec, si) => (
        <TabCard key={sec.heading} title={null}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 375px', columnGap:0 }}>
            <div style={{ background:'#3D4F6B', color:'#fff', padding:'8px 12px', marginTop:-4, display:'flex', alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>{sec.heading}</span>
            </div>
            <div style={{ background:'#2A3545', color:'#fff', padding:'8px 12px', marginTop:-4, display:'flex', alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>Attachments</span>
            </div>

            {sec.items.map((it) => it.repeat ? (
              <React.Fragment key={it.id}>
                <div draggable onDragStart={()=>setDragItem({si,id:it.id})} onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{ if (dragItem && dragItem.si===si) reorderItem(si, dragItem.id, it.id); setDragItem(null) }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 4px', borderBottom:'0.5px solid #f0f0f0', opacity: dragItem?.id===it.id ? 0.4 : 1 }}>
                  <span style={{ cursor:'grab', color:'#B0B5BD', fontSize:14, userSelect:'none', flexShrink:0 }} title="Drag to reorder">⋮</span>
                  <UploadTrigger uploadKey={it.id} onUpload={file=>uploadToItem(si,it.id,null,file)} />
                  <input type="checkbox" checked={masterChecked(it)}
                    onChange={()=>toggleMasterChecked(si,it.id)} title="Ticks/unticks every item below, once added" style={{ flexShrink:0 }} />
                  <ChecklistItemText value={it.text} onChange={text=>updateItemText(si,it.id,text)} done={masterChecked(it)} bold />
                  <button onClick={()=>addSubItem(si,it.id)} style={{...addBtnStyle, flexShrink:0}}>+ {it.repeat}</button>
                  <button onClick={()=>removeItem(si,it.id)} style={{...rmBtnStyle, flexShrink:0}}>✕</button>
                </div>
                <div style={{ borderBottom:'0.5px solid #f0f0f0', borderLeft:'1px solid #f0f0f0' }}>
                  <FileStack files={it.files} onRemove={fi=>removeItemFile(si,it.id,null,fi)} />
                </div>

                {(it.subItems||[]).map(su => (
                  <React.Fragment key={su.id}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px 5px 48px', borderBottom:'0.5px solid #f7f7f7' }}>
                      <UploadTrigger uploadKey={`${it.id}-${su.id}`} onUpload={file=>uploadToItem(si,it.id,su.id,file)} />
                      <input type="checkbox" checked={!!su.checked} onChange={()=>toggleSubItemChecked(si,it.id,su.id)} style={{ flexShrink:0 }} />
                      <ChecklistItemText value={su.text} onChange={text=>updateSubItemText(si,it.id,su.id,text)} done={su.checked} placeholder={`${it.repeat} name / details…`} />
                      <button onClick={()=>removeSubItem(si,it.id,su.id)} style={{...rmBtnStyle, flexShrink:0}}>✕</button>
                    </div>
                    <div style={{ borderBottom:'0.5px solid #f7f7f7', borderLeft:'1px solid #f0f0f0' }}>
                      <FileStack files={su.files} onRemove={fi=>removeItemFile(si,it.id,su.id,fi)} />
                    </div>
                  </React.Fragment>
                ))}
              </React.Fragment>
            ) : (
              <React.Fragment key={it.id}>
                <div draggable onDragStart={()=>setDragItem({si,id:it.id})} onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{ if (dragItem && dragItem.si===si) reorderItem(si, dragItem.id, it.id); setDragItem(null) }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 4px', borderBottom:'0.5px solid #f0f0f0', opacity: dragItem?.id===it.id ? 0.4 : 1 }}>
                  <span style={{ cursor:'grab', color:'#B0B5BD', fontSize:14, userSelect:'none', flexShrink:0 }} title="Drag to reorder">⋮</span>
                  <UploadTrigger uploadKey={it.id} onUpload={file=>uploadToItem(si,it.id,null,file)} />
                  <input type="checkbox" checked={!!it.checked} onChange={()=>toggleItemChecked(si,it.id)} style={{ flexShrink:0 }} />
                  <ChecklistItemText value={it.text} onChange={text=>updateItemText(si,it.id,text)} done={it.checked} />
                  <button onClick={()=>removeItem(si,it.id)} style={{...rmBtnStyle, flexShrink:0}}>✕</button>
                </div>
                <div style={{ borderBottom:'0.5px solid #f0f0f0', borderLeft:'1px solid #f0f0f0' }}>
                  <FileStack files={it.files} onRemove={fi=>removeItemFile(si,it.id,null,fi)} />
                </div>
              </React.Fragment>
            ))}

            <div style={{ gridColumn:'1 / -1' }}>
              <AddSectionItemRow onAdd={text=>addItemToSection(si,text)} />
            </div>
          </div>
        </TabCard>
      ))}
    </div>
  )
}

// "+ Add Item" row shown at the bottom of every section — type a new item
// and either pick a suggestion from the datalist (built from every item
// across every template) or just type something new and press Enter/Add.
function AddSectionItemRow({ onAdd }) {
  const [val, setVal] = useState('')
  function commit() {
    if (!val.trim()) return
    onAdd(val)
    setVal('')
  }
  return (
    <div style={{ display:'flex', gap:8, marginTop:6, marginBottom:4 }}>
      <input
        value={val}
        onChange={ev=>setVal(ev.target.value)}
        onKeyDown={ev=>{ if (ev.key==='Enter') { ev.preventDefault(); commit() } }}
        placeholder="Add an item — pick a suggestion or type your own…"
        list="attachment-master-items"
        style={{ flex:1, border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, fontFamily:'inherit' }}
      />
      <button onClick={commit} style={addBtnStyle}>+ Add Item</button>
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

// First pass only — pulls together figures that already exist elsewhere on
// the deal (Strategy's funding calc, Financials' servicing) into one
// read-only overview. Cameron hasn't specified exactly what belongs here
// yet, so this is a reasonable starting point to react to rather than a
// finished spec — the numbers themselves are the same ones shown on their
// source tabs, just gathered in one place.
function SummaryTab({ deal }) {
  const strat = deal._strategy || {}
  const dealType = deriveDealType(deal['Transaction Type'])
  const calc = calcFunding(strat, dealType)
  const struct = deal._structure || {}
  const servicing = struct.servicing || {}
  const dscr = servicing.ebitda && servicing.repayments ? (Number(servicing.ebitda)/Number(servicing.repayments)).toFixed(2) : null
  const icr = servicing.ebit && servicing.interestForCover ? (Number(servicing.ebit)/Number(servicing.interestForCover)).toFixed(2) : null
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <TabCard title="Deal Overview">
          <ReadRow label="Category" value={deal.Categories}/>
          <ReadRow label="Transaction type" value={deal['Transaction Type']}/>
          <ReadRow label="Lender" value={deal.Lender}/>
          <ReadRow label="Status" value={deal.Status}/>
          <ReadRow label="Settlement date" value={deal['Date Settled']?.slice(0,10)}/>
          <ReadRow label="Finance due date" value={deal['Finance Due Date']?.slice(0,10)}/>
        </TabCard>

        <TabCard title="Contacts">
          {(deal.Contacts||[]).length === 0 && <div style={{fontSize:11.5,color:'#9ca3af'}}>No contacts on file — add them under Loan Details.</div>}
          {(deal.Contacts||[]).map((c,i) => <ReadRow key={i} label={c.type||'Individual'} value={c.name}/>)}
          {(deal['_referrers']||[]).length > 0 && <ReadRow label="Referral partner" value={(deal['_referrers']||[]).map(r=>r.name).join(', ')}/>}
        </TabCard>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <TabCard title="Funding Summary">
          <ComputedRow label="Total Costs" value={fmtM(calc.totalCosts)} tone="navy" />
          <ComputedRow label="Loan From Lender" value={fmtM(calc.loanFromLender)} tone="navy" side={calc.lvrBase ? `${(calc.totalLVR*100).toFixed(1)}% LVR` : null} />
          {calc.crossCollateralIncluded && (
            <ComputedRow label="Total LVR (incl. cross-collateral)" value={`${(calc.totalLVR*100).toFixed(1)}%`} tone="green" />
          )}
          <ComputedRow label="Total Funds Available" value={fmtM(calc.totalFundsAvailable)} tone="navy" />
          <ComputedRow label="Surplus / (Deficit)" value={fmtM(calc.surplusDeficit)} tone={calc.surplusDeficit < 0 ? 'red' : 'green'} big />
        </TabCard>

        {(dscr || icr) && (
          <TabCard title="Servicing Summary">
            <div style={{ display:'flex', gap:24 }}>
              {dscr && <div><div style={{fontSize:10,color:'#9ca3af'}}>Debt Service Cover Ratio</div><div style={{fontSize:18,fontWeight:700,color:'#3D4F6B'}}>{dscr}x</div></div>}
              {icr && <div><div style={{fontSize:10,color:'#9ca3af'}}>Interest Cover Ratio</div><div style={{fontSize:18,fontWeight:700,color:'#3D4F6B'}}>{icr}x</div></div>}
            </div>
          </TabCard>
        )}

        <TabCard title="Estimated Commission">
          <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'#9ca3af' }}>Est. upfront ({(getUpfrontRate(deal.Categories)*100).toFixed(2)}%)</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#22c55e', marginTop:2 }}>{deal.Amount ? `$${calcUpfront(deal.Amount, deal.Categories).toLocaleString()}` : '—'}</div>
          </div>
        </TabCard>
      </div>
    </div>
  )
}

const addBtnStyle = { fontSize:11, fontWeight:600, color:'#3D4F6B', background:'#fff', border:'1px solid #e8eaed', borderRadius:6, padding:'5px 12px', cursor:'pointer' }
const rmBtnStyle = { fontSize:10, padding:'3px 7px', borderRadius:4, border:'1px solid #fecaca', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }
const rowInp = { border:'1px solid #e8eaed', borderRadius:5, padding:'4px 7px', fontSize:11.5, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }

export default function DealPage({ onUpdateDeals, clients = [], onUpdateClients }) {
  const { dealName } = useParams()
  const navigate = useNavigate()
  const decodedName = decodeURIComponent(dealName)
  const [deals, setDeals] = useState(() => getDeals())
  const [tab, setTab] = useState('details')

  // Stage names/order come from Settings > CRM > Stages — everything below
  // derives from that instead of a hardcoded list.
  const settings = useMemo(() => loadSettings(), [])
  const dealStagesFull = useMemo(() => getDealStages(settings), [settings])
  const STAGES = useMemo(() => dealStagesFull.map(s => s.display), [dealStagesFull])
  const STAGE_COLORS = useMemo(() => {
    const map = {}
    dealStagesFull.forEach((s, i) => { map[s.display] = stageColorFor(s.id, i) })
    return map
  }, [dealStagesFull])
  // Tracker shows every stage except Withdrawn (Withdrawn is a separate pill).
  const TRACKER_STAGES = useMemo(() => dealStagesFull.filter(s => s.id !== 'withdrawn').map(s => s.display), [dealStagesFull])
  const settledDisplay = dealStagesFull.find(s => s.id === 'settled')?.display
  const withdrawnDisplay = dealStagesFull.find(s => s.id === 'withdrawn')?.display

  // If the local cache was empty on load (e.g. cache just cleared), pull the
  // real deals down from Supabase rather than working from nothing.
  useEffect(() => {
    syncDealsFromSupabase().then(cloud => {
      const base = cloud || deals
      // Same one-time rename as CRM.jsx — "1. Lead" to "1. Discovery" —
      // applied here too in case a deal gets opened directly (a bookmarked
      // link, say) without visiting the pipeline list first.
      const discoveryDisplay = stageDisplay('discovery', settings)
      if (base.some(d => d.Status === '1. Lead')) {
        const renamed = base.map(d => d.Status === '1. Lead' ? { ...d, Status: discoveryDisplay } : d)
        saveDeals(renamed)
        setDeals(renamed)
      } else if (cloud) {
        setDeals(cloud)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)
  const [settleModal, setSettleModal] = useState(null)

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
  // Moving a deal to Settled must always go through the Settle modal
  // (client link / loan discharge) — same rule as every other settlement
  // pathway in the CRM, so a deal can't slip through to "Settled" from here
  // without the discharge step ever being offered.
  function requestStageChange(s) {
    if (s === settledDisplay) { setSettleModal(true); return }
    updateDeal({ Status: s })
  }
  function handleSettleConfirm({ deal: settledDeal, settlementDate, existingClient, createNew, dischargeLoans }) {
    updateDeal({ Status: settledDisplay, 'Date Settled': settlementDate })
    if (onUpdateClients) {
      onUpdateClients(prevClients => applySettlement(prevClients, { deal: settledDeal, settlementDate, existingClient, createNew, dischargeLoans }))
    }
    setSettleModal(null)
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

  const [nameError, setNameError] = useState('')
  function renameDeal(newName) {
    const trimmed = newName.trim()
    setNameError('')
    if (!trimmed || trimmed === decodedName) return
    if (deals.some(x => x['Transaction Name'] === trimmed)) {
      setNameError('A deal with that name already exists.')
      return
    }
    const updated = deals.map(x => x['Transaction Name'] === decodedName ? { ...x, 'Transaction Name': trimmed } : x)
    setDeals(updated)
    saveDeals(updated)
    if (onUpdateDeals) onUpdateDeals(updated)
    // The URL is keyed on the deal name, so move to the new one — otherwise
    // every subsequent updateDeal() call would keep looking for the old name.
    navigate(`/crm/deal/${encodeURIComponent(trimmed)}`, { replace: true })
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  async function deleteDeal() {
    const updated = deals.filter(x => x['Transaction Name'] !== decodedName)
    setDeals(updated)
    try { localStorage.setItem('rion-crm-deals', JSON.stringify({ data: updated, savedAt: Date.now() })) } catch {}
    if (onUpdateDeals) onUpdateDeals(updated)
    // Deletion goes through its own dedicated cloud path rather than the
    // regular save — the regular save's merge-safety logic exists to
    // recover deals that go missing by accident, which would otherwise
    // silently undo an intentional delete.
    const ok = await sbDeleteDeal(decodedName)
    if (!ok) notifySaveFailed('deals', { action: 'delete' })
    navigate('/crm')
  }

  const d = editing ? draft : deal
  const sc = STAGE_COLORS[d.Status] || STAGE_COLORS[STAGES[0]]
  const fmtAmt = v => v ? `$${Number(v).toLocaleString()}` : '—'

  const TABS = [
    { id:'details', label:'Loan Details' },
    { id:'strategy', label:'Strategy' },
    { id:'attachments', label:'Attachments' },
    { id:'structure', label:'Financials' },
    { id:'notes', label:'Notes' },
    { id:'summary', label:'Summary' },
  ]

  return (
    <div>
      <CRMTopbar />
      <div style={{ padding:'16px 32px 40px', width:'100%', boxSizing:'border-box' }}>
        <button onClick={()=>navigate('/crm')} style={{ background:'none', border:'none', color:'#EB99C2', cursor:'pointer', fontSize:12, marginBottom:14, padding:0 }}>← Back to pipeline</button>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <EditableTitle value={d['Transaction Name']} onCommit={renameDeal} />
            {nameError && <div style={{ fontSize:11, color:'#dc2626', marginTop:2 }}>{nameError}</div>}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color, fontWeight:500 }}>{d.Status}</span>
              {d.Categories && <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#f0f0f0', color:'#7A8090' }}>{d.Categories}</span>}
              {d.Amount && <span style={{ fontSize:13, fontWeight:600, color:'#EB99C2' }}>{fmtAmt(d.Amount)}</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {saved && <span style={{ fontSize:11, color:'#22c55e', padding:'6px 12px', background:'#f0fdf4', borderRadius:7, border:'1px solid #bbf7d0' }}>✓ Saved</span>}
            {confirmingDelete ? (
              <>
                <span style={{ fontSize:11.5, color:'#b91c1c', fontWeight:600 }}>Delete this deal? This can't be undone.</span>
                <button onClick={()=>setConfirmingDelete(false)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e8eaed', background:'#fff', color:'#7A8090', fontSize:12, cursor:'pointer' }}>Cancel</button>
                <button onClick={deleteDeal} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Yes, delete</button>
              </>
            ) : (
              <>
                <button onClick={()=>setConfirmingDelete(true)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #fecaca', background:'#fff', color:'#b91c1c', fontSize:12, cursor:'pointer' }}>Delete deal</button>
                {!editing
                  ? <button onClick={startEdit} style={{ padding:'8px 20px', borderRadius:8, border:'1.5px solid #EB99C2', background:'#fff', color:'#EB99C2', fontSize:12, fontWeight:500, cursor:'pointer' }}>Edit deal</button>
                  : <>
                      <button onClick={cancelEdit} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e8eaed', background:'#fff', color:'#7A8090', fontSize:12, cursor:'pointer' }}>Cancel</button>
                      <button onClick={saveEdit} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#22c55e', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Save changes</button>
                    </>
                }
              </>
            )}
          </div>
        </div>

        {/* Stage tracker */}
        <StageTracker status={deal.Status} onChange={requestStageChange} stages={TRACKER_STAGES} withdrawnDisplay={withdrawnDisplay} />

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

        {tab === 'details' && <LoanDetailsTab deal={deal} updateDeal={updateDeal} deals={deals} setDeals={setDeals} clients={clients} />}
        {tab === 'strategy' && <StrategyTab deal={deal} updateDeal={updateDeal} />}
        {tab === 'structure' && <StructureTab d={d} editing={editing} set={set} />}
        {tab === 'attachments' && <AttachmentsTab deal={deal} deals={deals} setDeals={setDeals} editing={editing} d={d} set={set} />}
        {tab === 'notes' && <NotesTab d={d} editing={editing} set={set} deal={deal} deals={deals} setDeals={setDeals} />}
        {tab === 'summary' && <SummaryTab deal={deal} />}
      </div>

      {settleModal && (
        <SettleModal deal={deal} clients={clients} onConfirm={handleSettleConfirm} onCancel={()=>setSettleModal(null)} />
      )}
    </div>
  )
}
