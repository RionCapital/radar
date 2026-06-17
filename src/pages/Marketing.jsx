import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loadClients } from '../lib/data'
import { DEFAULT_REFERRERS } from '../lib/referrersData'
import { loadSettings } from '../lib/settings'

const C = {
  navy:    '#3D4F6B',
  deep:    '#2A3545',
  pink:    '#EB99C2',
  pinkBtn: '#DA408D',
  slate:   '#7A8090',
  white:   '#FFFFFF',
  bg:      '#F4F6FA',
  border:  '#DDE3EC',
  text:    '#1E2A3A',
  muted:   '#5A6478',
}

const REFERRER_TIERS = [
  { id: 'gold',       label: 'Gold',       colour: '#D4A017', desc: 'Strategic Partners · 12+ referrals/yr' },
  { id: 'silver',     label: 'Silver',     colour: '#9CA3AF', desc: 'Core Partners · 4+ referrals/yr' },
  { id: 'bronze',     label: 'Bronze',     colour: '#CD7F32', desc: 'Relegation & Development' },
  { id: 'contenders', label: 'Contenders', colour: '#EB99C2', desc: 'Target & Prospect Network' },
]

const REFERRER_TYPES = ['Accountant','Financial Planner','Real Estate Agent','Conveyancer','Solicitor','Insurance Broker','Other']
const PROFESSIONS    = ['Accountant','Builder/Tradesperson','Business Owner','Doctor/Medical','Engineer','IT Professional','Lawyer','Manager/Executive','Nurse/Allied Health','Real Estate Agent','Retail','Teacher','Transport/Logistics','Other']
const INDUSTRIES     = ['Agriculture','Construction','Education','Finance & Insurance','Food & Hospitality','Health & Medical','IT & Technology','Legal','Manufacturing','Professional Services','Real Estate','Retail','Transport & Logistics','Other']
const LENDER_TYPES   = ['Major Bank','Non-Bank Lender','Credit Union','Building Society','Private Lender','SMSF Lender','Asset Finance','Specialist','Other']
const CONTACT_PREFS  = ['Email','Phone Call','SMS','Any']

const STORAGE_KEYS = {
  referrers: 'rion-marketing-referrers',
  lenders:   'rion-marketing-lenders',
  others:    'rion-marketing-others',
  clientOv:  'rion-marketing-clients',
}

function loadStore(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : [] } catch { return [] }
}
function saveStore(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}
function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?'
}
function avatarColour(name = '') {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const cols = ['#3D4F6B','#EB99C2','#7A8090','#5B7FA6','#DA408D','#4A6FA5']
  return cols[h % cols.length]
}
function newId() { return Date.now() + Math.random().toString(36).slice(2) }
function fmtDOB(dob) {
  if (!dob) return null
  try {
    const d = new Date(dob)
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dob }
}
function age(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}
function upcomingBirthday(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate())
  if (next < now) next.setFullYear(now.getFullYear() + 1)
  const diff = Math.ceil((next - now) / 86400000)
  return diff <= 30 ? diff : null
}

function Avatar({ name, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColour(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: 'Montserrat,sans-serif' }}>
      {initials(name)}
    </div>
  )
}

function Pill({ label, colour }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      background: colour + '22', color: colour, fontSize: 11, fontWeight: 700,
      border: `1px solid ${colour}44`, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,42,58,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 20, color: C.slate, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, fontFamily: 'Montserrat,sans-serif', color: C.text, boxSizing: 'border-box',
  outline: 'none', background: '#FAFBFD',
}
const labelStyle = { fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginBottom: 4, display: 'block' }

function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}><label style={labelStyle}>{label}</label>{children}</div>
}
function Input({ label, ...props }) {
  return <Field label={label}><input style={inputStyle} {...props} /></Field>
}
function Select({ label, options, ...props }) {
  return (
    <Field label={label}>
      <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} {...props}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  )
}
function Textarea({ label, ...props }) {
  return <Field label={label}><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} {...props} /></Field>
}
function Toggle({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
      padding: '10px 12px', background: '#F9FAFB', borderRadius: 8, border: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, fontFamily: 'Montserrat,sans-serif', color: C.text }}>{label}</span>
      <div onClick={() => onChange(!checked)}
        style={{ width: 40, height: 22, borderRadius: 11, background: checked ? C.navy : '#CBD5E1',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
    </div>
  )
}

function NoteEntry({ note, onDelete }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.pink}`, paddingLeft: 12, marginBottom: 12, display: 'flex', gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginBottom: 3 }}>{note.date}</div>
        <div style={{ fontSize: 13, color: C.text, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'pre-wrap' }}>{note.text}</div>
      </div>
      {onDelete && (
        <button onClick={onDelete} style={{ border: 'none', background: 'none', cursor: 'pointer',
          color: '#CBD5E1', fontSize: 14, padding: '0 4px', alignSelf: 'flex-start' }}
          title="Delete note">×</button>
      )}
    </div>
  )
}

function ContactActions({ email, mobile }) {
  const tel = mobile ? mobile.replace(/\s/g, '') : null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
      {email && (
        <a href={`mailto:${email}`} style={{ display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 14px', borderRadius: 8, background: C.navy, color: '#fff',
          textDecoration: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
          ✉ Email
        </a>
      )}
      {tel && (
        <>
          <a href={`tel:${tel}`} style={{ display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 8, background: '#2A7A2A', color: '#fff',
            textDecoration: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
            📞 Call
          </a>
          <a href={`sms:${tel}`} style={{ display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 8, background: C.pinkBtn, color: '#fff',
            textDecoration: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
            💬 SMS
          </a>
        </>
      )}
    </div>
  )
}

function OutreachModal({ contacts, groupLabel, onClose }) {
  const [subject, setSubject] = useState('Message from Cameron – Rion Capital')
  const [body, setBody]       = useState('')
  const [copied, setCopied]   = useState(false)

  // exclude unsubscribed
  const eligible = contacts.filter(c => !c.unsubscribed)
  const emails   = eligible.map(c => c.email).filter(Boolean)
  const skipped  = contacts.length - eligible.length

  function copyEmails() {
    navigator.clipboard.writeText(emails.join('; ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  function openOutlook() {
    const sub = encodeURIComponent(subject)
    const bod = encodeURIComponent(body)
    window.location.href = `mailto:${emails.join(';')}?subject=${sub}&body=${bod}`
  }

  return (
    <Modal title={`Mass Outreach — ${groupLabel}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#F0F4FA', borderRadius: 8,
        fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
        <strong style={{ color: C.text }}>{emails.length}</strong> recipient{emails.length !== 1 ? 's' : ''} with email
        {skipped > 0 && <span style={{ color: '#dc2626' }}> · {skipped} unsubscribed (excluded)</span>}
      </div>
      <Input label="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
      <Textarea label="Body (optional — or compose in Outlook)" value={body} onChange={e => setBody(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={openOutlook} style={{ padding: '9px 18px', borderRadius: 8, border: 'none',
          background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'Montserrat,sans-serif' }}>
          Open in Outlook
        </button>
        <button onClick={copyEmails} style={{ padding: '9px 18px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text }}>
          {copied ? '✓ Copied!' : 'Copy Emails'}
        </button>
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif',
        padding: '8px 10px', background: '#F9FAFB', borderRadius: 6, border: `1px solid ${C.border}`, wordBreak: 'break-all' }}>
        {emails.join('; ') || 'No email addresses found'}
      </div>
    </Modal>
  )
}

// ─── Info tile ────────────────────────────────────────────────────────────────
function InfoTile({ label, value, highlight }) {
  if (!value) return null
  return (
    <div style={{ padding: '10px 14px', background: highlight ? C.pink + '15' : '#F9FAFB', borderRadius: 8,
      border: `1px solid ${highlight ? C.pink + '44' : C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, fontFamily: 'Montserrat,sans-serif',
        marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, fontFamily: 'Montserrat,sans-serif', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

// ─── Contact Detail ───────────────────────────────────────────────────────────
// ─── Touch Points ────────────────────────────────────────────────────────────
const TOUCH_TYPES = [
  { id: 'email',  label: 'Email',  icon: '✉', colour: '#3D4F6B' },
  { id: 'call',   label: 'Call',   icon: '📞', colour: '#2A7A2A' },
  { id: 'sms',    label: 'SMS',    icon: '💬', colour: '#DA408D' },
  { id: 'meeting',label: 'Meeting',icon: '🤝', colour: '#7A8090' },
  { id: 'other',  label: 'Other',  icon: '📝', colour: '#9CA3AF' },
]

function TouchPoints({ contact, onSave }) {
  const [adding, setAdding]     = useState(false)
  const [type, setType]         = useState('call')
  const [summary, setSummary]   = useState('')
  const [touchDate, setTouchDate] = useState(new Date().toISOString().slice(0,10))

  const touches = contact.touchPoints || []

  function addTouch() {
    if (!summary.trim()) return
    const tp = {
      id:      newId(),
      type,
      summary: summary.trim(),
      date:    touchDate,
      ts:      new Date().toISOString(),
      auto:    false,
    }
    onSave({ ...contact, touchPoints: [tp, ...touches] })
    setSummary(''); setAdding(false)
  }

  function deleteTouch(id) {
    onSave({ ...contact, touchPoints: touches.filter(t => t.id !== id) })
  }

  const typeCfg = id => TOUCH_TYPES.find(t => t.id === id) || TOUCH_TYPES[4]

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>
          Touch Points
          {touches.length > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: C.muted }}>({touches.length})</span>}
        </div>
        <button onClick={() => setAdding(v => !v)}
          style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: adding ? C.navy : '#fff', color: adding ? '#fff' : C.navy,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif' }}>
          + Log Touch
        </button>
      </div>

      {/* Quick-log from action buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {contact.email && (
          <a href={`mailto:${contact.email}`}
            onClick={() => {
              const tp = { id: newId(), type: 'email', summary: `Email sent to ${contact.name}`, date: new Date().toISOString().slice(0,10), ts: new Date().toISOString(), auto: true }
              onSave({ ...contact, touchPoints: [tp, ...(contact.touchPoints||[])] })
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
              background: '#3D4F6B', color: '#fff', textDecoration: 'none', fontSize: 12,
              fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
            ✉ Email
          </a>
        )}
        {contact.mobile && (
          <>
            <a href={`tel:${contact.mobile.replace(/\s/g,'')}`}
              onClick={() => {
                const tp = { id: newId(), type: 'call', summary: `Called ${contact.name}`, date: new Date().toISOString().slice(0,10), ts: new Date().toISOString(), auto: true }
                onSave({ ...contact, touchPoints: [tp, ...(contact.touchPoints||[])] })
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
                background: '#2A7A2A', color: '#fff', textDecoration: 'none', fontSize: 12,
                fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
              📞 Call
            </a>
            <a href={`sms:${contact.mobile.replace(/\s/g,'')}`}
              onClick={() => {
                const tp = { id: newId(), type: 'sms', summary: `SMS sent to ${contact.name}`, date: new Date().toISOString().slice(0,10), ts: new Date().toISOString(), auto: true }
                onSave({ ...contact, touchPoints: [tp, ...(contact.touchPoints||[])] })
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
                background: '#DA408D', color: '#fff', textDecoration: 'none', fontSize: 12,
                fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
              💬 SMS
            </a>
          </>
        )}
      </div>

      {/* Manual add form */}
      {adding && (
        <div style={{ padding: 14, background: '#F4F6FA', borderRadius: 10,
          border: `1px solid ${C.border}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {TOUCH_TYPES.map(t => (
              <button key={t.id} onClick={() => setType(t.id)}
                style={{ padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${type === t.id ? t.colour : C.border}`,
                  background: type === t.id ? t.colour : '#fff',
                  color: type === t.id ? '#fff' : C.text, fontSize: 12,
                  fontWeight: type === t.id ? 700 : 500, cursor: 'pointer',
                  fontFamily: 'Montserrat,sans-serif' }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="date" value={touchDate} onChange={e => setTouchDate(e.target.value)}
              style={{ ...inputStyle, width: 140, flexShrink: 0 }} />
            <input value={summary} onChange={e => setSummary(e.target.value)}
              placeholder="Brief summary of the interaction…"
              onKeyDown={e => e.key === 'Enter' && addTouch()}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addTouch}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none',
                background: C.navy, color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Touch point history */}
      {touches.length === 0
        ? <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>No touch points logged yet.</div>
        : touches.map((tp, i) => {
            const cfg = typeCfg(tp.type)
            return (
              <div key={tp.id || i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 0', borderBottom: i < touches.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: cfg.colour + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                  {cfg.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.colour, fontFamily: 'Montserrat,sans-serif' }}>
                      {cfg.label}
                    </span>
                    {tp.auto && <span style={{ fontSize: 10, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>auto-logged</span>}
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginLeft: 'auto' }}>
                      {tp.date}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>{tp.summary}</div>
                </div>
                <button onClick={() => deleteTouch(tp.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer',
                    color: '#CBD5E1', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
              </div>
            )
          })
      }
    </div>
  )
}

function ReferrerClientsPanel({ contact, rradarClients, allClients, onSave }) {
  const referrerName = contact.name
  const fmt  = v => `$${Math.round(v).toLocaleString()}`
  const fmtD = v => `$${Number(v).toFixed(2)}`

  // ── Match clients 3 ways ──────────────────────────────────────────────────
  // 1. Rradar client has referrers[] array containing this referrer (from ClientDashboard picker)
  // 2. Marketing client override has referredBy matching referrer name
  // 3. Manually linked via linkedClients[] on the referrer
  const linkedClients = useMemo(() => {
    const names = new Set(contact.linkedClients || [])

    rradarClients.forEach(rc => {
      // Method 1: client.referrers array (set via ClientDashboard ReferrerPicker)
      if ((rc.referrers || []).some(r => r.name === referrerName)) names.add(rc.name)
      // Method 2: marketing override referredBy field
      const ov = allClients.find(c => c._clientName === rc.name)
      if (ov && (ov.referredBy || '').toLowerCase().includes(referrerName.toLowerCase())) names.add(rc.name)
    })

    return rradarClients.filter(rc => names.has(rc.name))
  }, [rradarClients, allClients, referrerName, contact.linkedClients])

  // ── CRM deals (ALL statuses) matching this referrer ───────────────────────
  const allCrmDeals = useMemo(() => {
    try {
      const deals = JSON.parse(localStorage.getItem('rion-crm-deals') || '[]')
      const rn = referrerName.toLowerCase()
      return deals.filter(d => {
        const ref = (d['_referrers'] || []).map(r => r.name.toLowerCase())
        const legacy = (d['Referrer'] || d['referrer'] || d['Referred By'] || '').toLowerCase()
        return ref.some(r => r.includes(rn)) || legacy.includes(rn)
      })
    } catch { return [] }
  }, [referrerName])

  const settledDeals  = allCrmDeals.filter(d => d.Status === '7. Settled')
  const inflightDeals = allCrmDeals.filter(d => d.Status !== '7. Settled' && d.Status !== '8. Withdrawn')

  // ── Commission per Rradar client ──────────────────────────────────────────
  function clientComm(rc) {
    let upfront = 0, trail = 0
    rc.loans.forEach(l => {
      ;(l.commissionHistory || []).forEach(h => {
        upfront += h.upfrontComm || 0
        trail   += h.trailComm   || 0
      })
    })
    return { upfront, trail, total: upfront + trail }
  }

  const totalComm = useMemo(() => {
    let upfront = 0, trail = 0
    linkedClients.forEach(rc => { const c = clientComm(rc); upfront += c.upfront; trail += c.trail })
    settledDeals.forEach(d => { upfront += d._upfrontComm || 0 })
    return { upfront, trail, total: upfront + trail }
  }, [linkedClients, settledDeals])

  // ── Manual link helpers ───────────────────────────────────────────────────
  const manualLinks = contact.linkedClients || []
  const [addingClient, setAddingClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const linkedNames = new Set(linkedClients.map(rc => rc.name))
  const availableClients = rradarClients
    .filter(rc => !linkedNames.has(rc.name))
    .filter(rc => !clientSearch || rc.name.toLowerCase().includes(clientSearch.toLowerCase()))
    .slice(0, 8)

  const STAGE_COLORS = {
    '1. Lead':          '#94a3b8',
    '2. Strategy':      '#60a5fa',
    '3. Pre-Lodged':    '#a78bfa',
    '4. Lodged':        '#fb923c',
    '5. Conditional':   '#facc15',
    '6. Unconditional': '#4ade80',
    '7. Settled':       '#22c55e',
    '8. Withdrawn':     '#f87171',
  }

  const sHead = { fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif',
    marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, marginTop: 20, borderTop: `1px solid ${C.border}` }

  return (
    <div>
      {/* ── Commission summary ── */}
      {(linkedClients.length > 0 || settledDeals.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
          marginTop: 20, marginBottom: 4 }}>
          {[
            { label: 'Total Upfront', value: fmt(totalComm.upfront), col: C.navy },
            { label: 'Trail p.a.',    value: fmt(totalComm.trail),   col: '#2A7A2A' },
            { label: 'Total Earned',  value: fmt(totalComm.total),   col: C.pinkBtn },
          ].map(t => (
            <div key={t.label} style={{ padding: '12px 14px', borderRadius: 10,
              background: t.col + '10', border: `1px solid ${t.col}30`, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.col, textTransform: 'uppercase',
                letterSpacing: '0.05em', fontFamily: 'Montserrat,sans-serif', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.col, fontFamily: 'Montserrat,sans-serif' }}>{t.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Settled Clients + Inflight side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', marginTop: 4 }}>

        {/* LEFT: Settled Clients */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>
              Settled Clients ({linkedClients.length})
            </span>
            <button onClick={() => setAddingClient(v => !v)}
              style={{ padding: '3px 9px', borderRadius: 6, border: `1px solid ${C.border}`,
                background: addingClient ? C.navy : '#fff', color: addingClient ? '#fff' : C.navy,
                fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif' }}>
              + Link
            </button>
          </div>

          {addingClient && (
            <div style={{ marginBottom: 10, padding: 10, background: '#F4F6FA', borderRadius: 8, border: `1px solid ${C.border}` }}>
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Search client…" style={{ ...inputStyle, marginBottom: 6, fontSize: 12 }} autoFocus />
              {availableClients.map(rc => (
                <div key={rc.name}
                  onClick={() => { onSave({ ...contact, linkedClients: [...manualLinks, rc.name] }); setAddingClient(false); setClientSearch('') }}
                  style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    fontFamily: 'Montserrat,sans-serif', color: C.text, borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = '#E8EDF5'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {rc.name} <span style={{ color: C.muted, fontSize: 10 }}>#{rc.connNo}</span>
                </div>
              ))}
              {clientSearch && availableClients.length === 0 && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>No matches.</div>
              )}
            </div>
          )}

          {linkedClients.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', fontStyle: 'italic' }}>
              No settled clients yet.
            </div>
          )}

          {linkedClients.map(rc => {
            const comm     = clientComm(rc)
            const isManual = manualLinks.includes(rc.name)
            const loans    = rc.loans.filter(l => !l.closed)
            const totalBal = loans.reduce((s, l) => s + (l.balance || 0), 0)
            return (
              <div key={rc.name} style={{ marginBottom: 8, border: `1px solid ${C.border}`,
                borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                  cursor: 'pointer', background: '#FAFBFD' }}
                  onClick={() => { sessionStorage.setItem('rion-from-marketing','1'); window.location.href=`/radar/clients/${encodeURIComponent(rc.name)}` }}
                  onMouseEnter={e => e.currentTarget.style.background='#EFF6FF'}
                  onMouseLeave={e => e.currentTarget.style.background='#FAFBFD'}>
                  <Avatar name={rc.name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy,
                      fontFamily: 'Montserrat,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rc.name} <span style={{ color: C.muted, fontSize: 10, fontWeight: 400 }}>#{rc.connNo}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
                      {loans.length} loan{loans.length !== 1 ? 's' : ''} · Bal {fmt(totalBal)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#2A7A2A', fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>~ {fmtD(comm.trail)}/yr</div>
                    <div style={{ fontSize: 10, color: C.navy, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>↑ {fmtD(comm.upfront)}</div>
                  </div>
                  {isManual && (
                    <button onClick={e => { e.stopPropagation(); onSave({ ...contact, linkedClients: manualLinks.filter(n => n !== rc.name) }) }}
                      style={{ border:'none', background:'none', cursor:'pointer', color:'#CBD5E1', fontSize:13, padding:'0 2px' }}>×</button>
                  )}
                  <span style={{ color: C.slate, fontSize: 13 }}>›</span>
                </div>
                {loans.filter(l => (l.commissionHistory||[]).length > 0).map(loan => {
                  const lU = (loan.commissionHistory||[]).reduce((s,h)=>s+(h.upfrontComm||0),0)
                  const lT = (loan.commissionHistory||[]).reduce((s,h)=>s+(h.trailComm||0),0)
                  if (!lU && !lT) return null
                  return (
                    <div key={loan.acc} style={{ display:'flex', gap:8, padding:'5px 12px',
                      borderTop:`1px solid ${C.border}`, fontSize:11, fontFamily:'Montserrat,sans-serif' }}>
                      <div style={{ flex:1, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {loan.lname || loan.bank} <span style={{ color:C.muted }}>{loan.bank}</span>
                      </div>
                      <span style={{ color:C.navy, fontWeight:600 }}>↑ {fmtD(lU)}</span>
                      <span style={{ color:'#2A7A2A', fontWeight:600 }}>~ {fmtD(lT)}/yr</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* RIGHT: Inflight + Settled CRM Deals */}
        <div>
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>
              Inflight Deals ({inflightDeals.length})
            </span>
          </div>

          {inflightDeals.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', fontStyle: 'italic', marginBottom: 8 }}>
              No active deals.
            </div>
          )}

          {inflightDeals.map((d, i) => {
            const SC = {'1. Lead':'#94a3b8','2. Strategy':'#60a5fa','3. Pre-Lodged':'#a78bfa','4. Lodged':'#fb923c','5. Conditional':'#facc15','6. Unconditional':'#4ade80'}
            const col = SC[d.Status] || '#94a3b8'
            return (
              <div key={i}
                onClick={() => { sessionStorage.setItem('rion-from-marketing','1'); window.location.href=`/crm/deal/${encodeURIComponent(d['Transaction Name'])}` }}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px',
                  border:`1px solid ${C.border}`, borderRadius:8, marginBottom:6,
                  background:'#fff', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'}
                onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                <div style={{ width:7,height:7,borderRadius:'50%',background:col,flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.navy, fontFamily:'Montserrat,sans-serif',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d['Transaction Name']}</div>
                  <div style={{ fontSize:10, color:C.muted, fontFamily:'Montserrat,sans-serif' }}>
                    {[d.Categories, d['Transaction Type'], d.Lender].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.pinkBtn, fontFamily:'Montserrat,sans-serif' }}>
                    {d.Amount ? `$${Number(d.Amount).toLocaleString()}` : '—'}
                  </div>
                  <div style={{ fontSize:9, fontWeight:600, color:col, background:col+'20',
                    padding:'1px 6px', borderRadius:8, fontFamily:'Montserrat,sans-serif', marginTop:2 }}>
                    {d.Status}
                  </div>
                </div>
                <span style={{ color:C.slate, fontSize:13 }}>›</span>
              </div>
            )
          })}

          {settledDeals.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:C.slate, textTransform:'uppercase',
                letterSpacing:'0.05em', fontFamily:'Montserrat,sans-serif', marginTop:10, marginBottom:6 }}>
                Settled via CRM ({settledDeals.length})
              </div>
              {settledDeals.map((d, i) => (
                <div key={i}
                  onClick={() => { sessionStorage.setItem('rion-from-marketing','1'); window.location.href=`/crm/deal/${encodeURIComponent(d['Transaction Name'])}` }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                    border:`1px solid ${C.border}`, borderRadius:8, marginBottom:6,
                    background:'#fff', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'}
                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:'#22c55e',flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.navy, fontFamily:'Montserrat,sans-serif',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d['Transaction Name']}</div>
                    <div style={{ fontSize:10, color:C.muted, fontFamily:'Montserrat,sans-serif' }}>
                      {d['Date Settled']||d['Month of Settlement']} · {d.Categories}
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.navy, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                    {d.Amount ? `$${Number(d.Amount).toLocaleString()}` : '—'}
                  </div>
                  <span style={{ color:C.slate, fontSize:13 }}>›</span>
                </div>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  )
}


function ContactDetail({ contact, section, onBack, onSave, onDelete, onMove, rradarClients, allClients, brokers }) {
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({ ...contact })
  const [noteText, setNoteText] = useState('')

  const rradarClient = section === 'clients'
    ? rradarClients.find(c => c.name === contact._clientName)
    : null

  const clientSince = rradarClient
    ? rradarClient.loans.map(l => l.settled).filter(Boolean).sort()[0]
    : null

  function handleSave() { onSave({ ...form }); setEditing(false) }

  function addNote() {
    if (!noteText.trim()) return
    const note = {
      id: newId(),
      date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      text: noteText.trim()
    }
    onSave({ ...contact, notes: [note, ...(contact.notes || [])] })
    setNoteText('')
  }

  function deleteNote(id) {
    onSave({ ...contact, notes: (contact.notes || []).filter(n => n.id !== id) })
  }

  const tierCfg    = REFERRER_TIERS.find(t => t.id === contact.tier)
  const dobDisplay = fmtDOB(contact.dob)
  const ageVal     = age(contact.dob)
  const bdayIn     = upcomingBirthday(contact.dob)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <button onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer',
        color: C.navy, fontWeight: 600, fontSize: 13, fontFamily: 'Montserrat,sans-serif',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back
      </button>

      {/* header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
        <Avatar name={contact.name} size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>{contact.name}</div>
          {section === 'clients' && contact._clientName && (
            <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>
              {contact._clientName} Connection · #{contact._connNo}
            </div>
          )}
          {contact.company && <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>{contact.company}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {tierCfg && <Pill label={tierCfg.label} colour={tierCfg.colour} />}
            {contact.stream && <Pill label={contact.stream} colour={contact.stream === 'Commercial' ? C.pinkBtn : C.navy} />}
            {contact.profession && <Pill label={contact.profession} colour={C.slate} />}
            {contact.unsubscribed && <Pill label="Unsubscribed" colour="#dc2626" />}
            {bdayIn !== null && <Pill label={`🎂 Birthday in ${bdayIn}d`} colour={C.pink} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {rradarClient && (
            <a href={`/radar/clients/${rradarClient.name}`} onClick={() => sessionStorage.setItem('rion-from-marketing', '1')}
              style={{ padding: '7px 14px', borderRadius: 8, background: C.pink + '22',
                color: C.pinkBtn, textDecoration: 'none', fontWeight: 700, fontSize: 12,
                fontFamily: 'Montserrat,sans-serif', border: `1px solid ${C.pink}` }}>
              View in Rradar →
            </a>
          )}
          <button onClick={() => setEditing(true)} style={{ padding: '7px 14px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 12,
            cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text }}>
            Edit
          </button>
          {onMove && (
            <select defaultValue="" onChange={e => { if(e.target.value) onMove(contact, e.target.value) }}
              style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
              <option value="">Move to…</option>
              {['referrers','lenders','others'].filter(s => s !== section)
                .map(s => <option key={s} value={s}>{{ referrers:'Referral Partners', lenders:'Lenders', others:'Others' }[s]}</option>)}
            </select>
          )}
          <button onClick={onDelete} style={{ padding: '7px 14px', borderRadius: 8,
            border: `1px solid #fecaca`, background: '#fff', fontWeight: 600, fontSize: 12,
            cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: '#dc2626' }}>
            Delete
          </button>
        </div>
      </div>

      {/* Contact action buttons — always shown at top */}
      {(contact.email || contact.mobile) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 4 }}>
          {contact.email && (
            <a href={`mailto:${contact.email}`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px',
                borderRadius: 8, background: C.navy, color: '#fff', textDecoration: 'none',
                fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
              ✉ Email
            </a>
          )}
          {contact.mobile && (
            <>
              <a href={`tel:${contact.mobile.replace(/\s/g,'')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px',
                  borderRadius: 8, background: '#2A7A2A', color: '#fff', textDecoration: 'none',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
                📞 Call
              </a>
              <a href={`sms:${contact.mobile.replace(/\s/g,'')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px',
                  borderRadius: 8, background: C.pinkBtn, color: '#fff', textDecoration: 'none',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
                💬 SMS
              </a>
            </>
          )}
        </div>
      )}

      {/* ── Contact details card ── always visible, compact row layout ── */}
      <div style={{ marginTop: 16, background: '#F9FAFB', borderRadius: 10,
        border: `1px solid ${C.border}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: 'uppercase',
            letterSpacing: '0.06em', fontFamily: 'Montserrat,sans-serif' }}>Contact Details</span>
          <button onClick={() => setEditing(true)}
            style={{ fontSize: 10, padding: '2px 9px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: '#fff', color: C.navy, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 600 }}>
            ✎ Edit
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {[
            ['Email',           contact.email         || '—'],
            ['Mobile',          contact.mobile        || '—'],
            ['Company',         contact.company       || '—'],
            ['Type',            contact.type          || '—'],
            ['Address',         contact.address       || '—'],
            ...(dobDisplay ? [[`DOB${ageVal ? ` (${ageVal}yrs)` : ''}`, dobDisplay]] : []),
            ...(clientSince ? [['Client Since', (() => { try { return new Date(clientSince).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}) } catch { return clientSince } })()]] : []),
            ...(contact.profession ? [['Profession', contact.profession]] : []),
            ...(contact.industry   ? [['Industry',   contact.industry]]   : []),
            ...(contact.referralCount ? [['Referrals', `${contact.referralCount} total`]] : []),
            ...(contact.preferredContact ? [['Pref. Contact', contact.preferredContact]] : []),
            ...(contact.spouseName ? [['Spouse/Partner', contact.spouseName]] : []),
            ...(contact.referredBy ? [['Referred By', contact.referredBy]] : []),
            ...(contact.bdmName    ? [['BDM', contact.bdmName]]            : []),
            ...(contact.linkedIn   ? [['LinkedIn', contact.linkedIn]]      : []),
            ['Assigned To',     contact.assignedBroker || brokers[0]?.name || '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'flex-start',
              fontSize: 12, fontFamily: 'Montserrat,sans-serif', minWidth: 0 }}>
              <span style={{ color: C.slate, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 90 }}>
                {label}:
              </span>
              <span style={{ color: value === '—' ? '#CBD5E1' : C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-all' }}>
                {value}
              </span>
            </div>
          ))}
        </div>
        {/* Broker assignment inline */}
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            Assigned to:
          </span>
          <select value={contact.assignedBroker || brokers[0]?.name || ''}
            onChange={e => onSave({ ...contact, assignedBroker: e.target.value })}
            style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
            {brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* linked referrers (for clients) */}
      {section === 'clients' && contact.linkedReferrers?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: 'uppercase',
            letterSpacing: '0.05em', fontFamily: 'Montserrat,sans-serif', marginBottom: 6 }}>Referred By</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {contact.linkedReferrers.map(r => <Pill key={r} label={r} colour={C.navy} />)}
          </div>
        </div>
      )}

      {/* Referrer → settled clients + commission panel */}
      {section === 'referrers' && (
        <ReferrerClientsPanel
          contact={contact}
          rradarClients={rradarClients}
          allClients={allClients || []}
          onSave={onSave}
        />
      )}

      {/* Touch Points */}
      <TouchPoints contact={contact} onSave={onSave} />

      {/* Notes */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif', marginBottom: 12 }}>Notes</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addNote() }}
            style={{ ...inputStyle, flex: 1, resize: 'none', height: 60 }} />
          <button onClick={addNote} style={{ padding: '0 18px', borderRadius: 8, border: 'none',
            background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            Add
          </button>
        </div>
        {(contact.notes || []).length === 0
          ? <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>No notes yet.</div>
          : (contact.notes || []).map(n => <NoteEntry key={n.id} note={n} onDelete={() => deleteNote(n.id)} />)
        }
      </div>

      {editing && (
        <EditContactModal contact={form} section={section} onChange={setForm} onSave={handleSave} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditContactModal({ contact, section, onChange, onSave, onClose }) {
  const f = contact
  const set = (k, v) => onChange({ ...f, [k]: v })

  return (
    <Modal title={f.id ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <Input label="Full Name *" value={f.name || ''} onChange={e => set('name', e.target.value)} />
      <Input label="Email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
      <Input label="Mobile" value={f.mobile || ''} onChange={e => set('mobile', e.target.value)} />
      <Input label="Company / Firm" value={f.company || ''} onChange={e => set('company', e.target.value)} />
      <Input label="Address" value={f.address || ''} onChange={e => set('address', e.target.value)} />

      {section === 'clients' && (
        <>
          <Select label="Profession" options={PROFESSIONS} value={f.profession || ''} onChange={e => set('profession', e.target.value)} />
          <Select label="Industry (Business)" options={INDUSTRIES} value={f.industry || ''} onChange={e => set('industry', e.target.value)} />
          <Select label="Preferred Contact Method" options={CONTACT_PREFS} value={f.preferredContact || ''} onChange={e => set('preferredContact', e.target.value)} />
          <Input label="Spouse / Partner Name" value={f.spouseName || ''} onChange={e => set('spouseName', e.target.value)} />
          <Input label="LinkedIn URL" value={f.linkedIn || ''} onChange={e => set('linkedIn', e.target.value)} />
          <Input label="Referred By" value={f.referredBy || ''} onChange={e => set('referredBy', e.target.value)} />
          <Toggle label="Birthday reminders" checked={!!f.birthdayReminder} onChange={v => set('birthdayReminder', v)} />
          <Toggle label="Unsubscribed from group emails" checked={!!f.unsubscribed} onChange={v => set('unsubscribed', v)} />
        </>
      )}

      {section === 'referrers' && (
        <>
          <Select label="Type" options={REFERRER_TYPES} value={f.type || ''} onChange={e => set('type', e.target.value)} />
          <Select label="Tier" options={REFERRER_TIERS.map(t => t.id)} value={f.tier || ''} onChange={e => set('tier', e.target.value)} />
          <Select label="Preferred Contact Method" options={CONTACT_PREFS} value={f.preferredContact || ''} onChange={e => set('preferredContact', e.target.value)} />
          <Input label="LinkedIn URL" value={f.linkedIn || ''} onChange={e => set('linkedIn', e.target.value)} />
          <Input label="Referral Count (all time)" value={f.referralCount || ''} onChange={e => set('referralCount', e.target.value)} />
          <Toggle label="Unsubscribed from group emails" checked={!!f.unsubscribed} onChange={v => set('unsubscribed', v)} />
        </>
      )}

      {section === 'lenders' && (
        <>
          <Select label="Lender Type" options={LENDER_TYPES} value={f.type || ''} onChange={e => set('type', e.target.value)} />
          <Input label="BDM Name" value={f.bdmName || ''} onChange={e => set('bdmName', e.target.value)} />
          <Input label="BDM Email" value={f.bdmEmail || ''} onChange={e => set('bdmEmail', e.target.value)} />
          <Input label="BDM Mobile" value={f.bdmMobile || ''} onChange={e => set('bdmMobile', e.target.value)} />
        </>
      )}

      {section === 'others' && (
        <>
          <Input label="Role / Category" value={f.type || ''} onChange={e => set('type', e.target.value)} />
          <Toggle label="Unsubscribed from group emails" checked={!!f.unsubscribed} onChange={v => set('unsubscribed', v)} />
        </>
      )}

      <Field label="Assigned Broker">
        <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          value={f.assignedBroker || ''}
          onChange={e => set('assignedBroker', e.target.value)}>
          {(loadSettings().users || []).filter(u => u.active).map(b => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
      </Field>
      <Textarea label="Notes (optional)" value={f.notesDraft || ''} onChange={e => set('notesDraft', e.target.value)} />

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onSave} disabled={!f.name?.trim()}
          style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: f.name?.trim() ? C.navy : C.border, color: '#fff',
            fontWeight: 700, fontSize: 13, cursor: f.name?.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'Montserrat,sans-serif' }}>
          Save
        </button>
        <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text }}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

// ─── Contact List ─────────────────────────────────────────────────────────────
// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportToCSV(contacts, section, label) {
  const cols = section === 'clients'
    ? ['Name','Email','Mobile','Connection','Connection #','Stream','Profession','Industry','Preferred Contact','Referred By','Spouse/Partner','LinkedIn','Unsubscribed']
    : section === 'referrers'
    ? ['Name','Email','Mobile','Company','Type','Tier','LinkedIn','Preferred Contact','Referral Count','Unsubscribed']
    : section === 'lenders'
    ? ['Name','Email','Mobile','Company','Type','BDM Name','BDM Email','BDM Mobile']
    : ['Name','Email','Mobile','Company','Type']

  const rows = contacts.map(c => {
    if (section === 'clients') return [
      c.name, c.email, c.mobile, c._clientName, c._connNo, c.stream,
      c.profession, c.industry, c.preferredContact, c.referredBy,
      c.spouseName, c.linkedIn, c.unsubscribed ? 'Yes' : 'No'
    ]
    if (section === 'referrers') return [
      c.name, c.email, c.mobile, c.company, c.type,
      REFERRER_TIERS.find(t => t.id === c.tier)?.label || c.tier,
      c.linkedIn, c.preferredContact, c.referralCount, c.unsubscribed ? 'Yes' : 'No'
    ]
    if (section === 'lenders') return [c.name, c.email, c.mobile, c.company, c.type, c.bdmName, c.bdmEmail, c.bdmMobile]
    return [c.name, c.email, c.mobile, c.company, c.type]
  })

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${label.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-AU').replace(/\//g,'-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ContactList({ contacts, section, onSelect, onOutreach, onAdd, onDeleteMultiple, onMoveContacts }) {
  const [search,   setSearch]   = useState('')
  const [filters,  setFilters]  = useState({}) // { tier:'gold', stream:'Commercial', type:'Accountant', ... }
  const [selected, setSelected] = useState(new Set())
  const [moveTarget, setMoveTarget] = useState(null) // section to move selected to
  const [openAccordion, setOpenAccordion] = useState(null)

  // Build active filter chips based on section
  const FILTER_GROUPS = useMemo(() => {
    if (section === 'referrers') return [
      { key: 'tier',   label: 'Tier',   opts: REFERRER_TIERS.map(t => ({ value: t.id, label: t.label, colour: t.colour })) },
      { key: 'type',   label: 'Type',   opts: REFERRER_TYPES.map(t => ({ value: t, label: t })) },
    ]
    if (section === 'clients') return [
      { key: 'stream',     label: 'Stream',     opts: ['Private Wealth','Commercial'].map(s => ({ value: s, label: s })) },
      { key: 'profession', label: 'Profession', opts: PROFESSIONS.map(p => ({ value: p, label: p })) },
      { key: 'industry',   label: 'Industry',   opts: INDUSTRIES.map(i => ({ value: i, label: i })) },
    ]
    return []
  }, [section])

  const filtered = useMemo(() => {
    let list = contacts
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c._clientName || '').toLowerCase().includes(q) ||
        (c.type || '').toLowerCase().includes(q)
      )
    }
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return
      list = list.filter(c => (c[key] || '').toLowerCase() === val.toLowerCase())
    })
    return list
  }, [contacts, search, filters])

  useMemo(() => setSelected(new Set()), [search, filters])

  const activeFilters = Object.entries(filters).filter(([,v]) => v)
  const hasFilters    = search || activeFilters.length > 0

  function clearAllFilters() { setSearch(''); setFilters({}) }
  function setFilter(key, val) { setFilters(f => ({ ...f, [key]: f[key] === val ? '' : val })) }

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id || c._id))
  function toggleAll() {
    allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map(c => c.id || c._id)))
  }
  function toggleOne(id) {
    const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next)
  }
  function handleDeleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} contact${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    onDeleteMultiple([...selected]); setSelected(new Set())
  }
  function handleMove() {
    if (!moveTarget || selected.size === 0) return
    if (!window.confirm(`Move ${selected.size} contact${selected.size !== 1 ? 's' : ''} to ${moveTarget}?`)) return
    const toMove = filtered.filter(c => selected.has(c.id || c._id))
    onMoveContacts(toMove, moveTarget)
    setSelected(new Set())
    setMoveTarget(null)
  }

  const sectionLabel = { clients: 'Clients', referrers: 'Referral Partners', lenders: 'Lenders', others: 'Others' }
  const moveTargets   = Object.keys(sectionLabel).filter(s => s !== section && s !== 'clients')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

      {/* ── Row 1: search + add ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${sectionLabel[section]}…`}
          style={{ ...inputStyle, flex: 1 }} />
        {hasFilters && (
          <button onClick={clearAllFilters}
            style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: '#fff', fontSize: 12, cursor: 'pointer', color: C.muted,
              fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            ✕ Clear
          </button>
        )}
        {section !== 'clients' && (
          <button onClick={onAdd}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none',
              background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            + Add
          </button>
        )}
      </div>

      {/* ── Accordion filter groups ── */}
      {FILTER_GROUPS.map(group => {
        const isOpen    = openAccordion === group.key
        const activeVal = filters[group.key]
        return (
          <div key={group.key} style={{ marginBottom: 6, borderRadius: 9,
            border: `1px solid ${activeVal ? C.navy + '55' : C.border}`,
            background: activeVal ? C.navy + '06' : '#fff', overflow: 'hidden' }}>
            {/* accordion header */}
            <button onClick={() => setOpenAccordion(isOpen ? null : group.key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'Montserrat,sans-serif' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: activeVal ? C.navy : C.text }}>
                  {group.label}
                </span>
                {activeVal && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: C.navy, color: '#fff', fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
                    {group.opts.find(o => o.value === activeVal)?.label || activeVal}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: C.muted, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </button>
            {/* accordion body */}
            {isOpen && (
              <div style={{ padding: '4px 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: `1px solid ${C.border}` }}>
                {group.opts.map(opt => {
                  const active = filters[group.key] === opt.value
                  const colour = opt.colour || C.navy
                  return (
                    <button key={opt.value} onClick={() => { setFilter(group.key, opt.value); setOpenAccordion(null) }}
                      style={{ padding: '5px 13px', borderRadius: 20,
                        border: `1px solid ${active ? colour : C.border}`,
                        background: active ? colour : '#fff', color: active ? '#fff' : C.text,
                        fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                        fontFamily: 'Montserrat,sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Action bar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 14px', flexWrap: 'wrap' }}>
        <button onClick={() => onOutreach(filtered)}
          style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            fontFamily: 'Montserrat,sans-serif', color: C.text, whiteSpace: 'nowrap' }}>
          ✉ Outreach ({filtered.length})
        </button>
        <button onClick={() => exportToCSV(filtered, section, `${sectionLabel[section]}${activeFilters.map(([,v])=>'_'+v).join('')}`)}
          style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            fontFamily: 'Montserrat,sans-serif', color: C.text, whiteSpace: 'nowrap' }}>
          ⬇ Export ({filtered.length})
        </button>

        {/* Move selected */}
        {selected.size > 0 && moveTargets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select value={moveTarget || ''} onChange={e => setMoveTarget(e.target.value)}
              style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
              <option value="">Move to…</option>
              {moveTargets.map(t => <option key={t} value={t}>{sectionLabel[t]}</option>)}
            </select>
            {moveTarget && (
              <button onClick={handleMove}
                style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.navy}`,
                  background: C.navy, color: '#fff', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
                Move {selected.size}
              </button>
            )}
          </div>
        )}

        {selected.size > 0 && section !== 'clients' && (
          <button onClick={handleDeleteSelected}
            style={{ padding: '7px 13px', borderRadius: 8, border: '1px solid #fecaca',
              background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              fontFamily: 'Montserrat,sans-serif', color: '#dc2626', whiteSpace: 'nowrap' }}>
            🗑 Delete ({selected.size})
          </button>
        )}

        <span style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
          {filtered.length} of {contacts.length}
          {contacts.filter(c => c.unsubscribed).length > 0 && ` · ${contacts.filter(c => c.unsubscribed).length} unsub`}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
      </div>

      {/* ── List (tier-grouped for referrers when no filter active) ── */}
      {section === 'referrers' && activeFilters.every(([k]) => k !== 'tier') && !search
        ? REFERRER_TIERS.map(tier => {
            const tierFilter = filters['tier']
            const tc = filtered.filter(c => c.tier === tier.id)
            if (tc.length === 0) return null
            return (
              <div key={tier.id} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Pill label={`${tier.label} · ${tc.length}`} colour={tier.colour} />
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>{tier.desc}</span>
                </div>
                <ContactTable contacts={tc} section={section} onSelect={onSelect}
                  selected={selected} onToggle={toggleOne}
                  onToggleAll={() => {
                    const allOn = tc.every(c => selected.has(c.id || c._id))
                    const next  = new Set(selected)
                    tc.forEach(c => allOn ? next.delete(c.id || c._id) : next.add(c.id || c._id))
                    setSelected(next)
                  }} />
              </div>
            )
          })
        : <ContactTable contacts={filtered} section={section} onSelect={onSelect}
            selected={selected} onToggle={toggleOne} onToggleAll={toggleAll} />
      }
    </div>
  )
}

function ContactTable({ contacts, section, onSelect, selected, onToggle, onToggleAll }) {
  if (contacts.length === 0) {
    return <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', padding: '20px 0' }}>No contacts found.</div>
  }
  const allOn = contacts.length > 0 && contacts.every(c => selected.has(c.id || c._id))
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* select-all header */}
      {section !== 'clients' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
          borderBottom: `1px solid ${C.border}`, background: '#FAFBFD' }}>
          <input type="checkbox" checked={allOn} onChange={onToggleAll}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.navy }} />
          <span style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
            Select all {contacts.length}
          </span>
        </div>
      )}
      {contacts.map((c, i) => {
        const tierCfg = REFERRER_TIERS.find(t => t.id === c.tier)
        const bdayIn  = upcomingBirthday(c.dob)
        const cid     = c.id || c._id
        const isChecked = selected.has(cid)
        return (
          <div key={cid || i}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
              background: isChecked ? '#EFF6FF' : '#fff', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#F4F6FA' }}
            onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = '#fff' }}>
            {section !== 'clients' && (
              <input type="checkbox" checked={isChecked}
                onChange={e => { e.stopPropagation(); onToggle(cid) }}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: C.navy, flexShrink: 0 }} />
            )}
            <div onClick={() => onSelect(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
              <Avatar name={c.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.unsubscribed ? C.muted : C.text,
                  fontFamily: 'Montserrat,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: c.unsubscribed ? 'line-through' : 'none' }}>
                  {c.name}
                  {bdayIn !== null && <span style={{ marginLeft: 6, fontSize: 11 }}>🎂</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 1 }}>
                  {section === 'clients'
                    ? `${c._clientName} · #${c._connNo}`
                    : c.company || c.type || ''}
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', textAlign: 'right', flexShrink: 0 }}>
                {c.email && <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>}
                {c.mobile && <div>{c.mobile}</div>}
              </div>
              {tierCfg && <Pill label={tierCfg.label} colour={tierCfg.colour} />}
              {section === 'clients' && c.stream && <Pill label={c.stream === 'Private Wealth' ? 'PW' : 'Comm'} colour={c.stream === 'Commercial' ? C.pinkBtn : C.navy} />}
              {(c.notes || []).length > 0 && (
                <span style={{ fontSize: 11, color: C.slate, fontFamily: 'Montserrat,sans-serif' }}>
                  {c.notes.length}n
                </span>
              )}
              <span style={{ color: C.slate, fontSize: 16 }}>›</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function Marketing() {
  const navigate = useNavigate()
  const location = useLocation()

  // Auto-open a referrer when navigated from ReferrerPicker pill (e.g. ?open=Chris+Angel)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const openName = params.get('open') || sessionStorage.getItem('rion-marketing-open-referrer')
    if (openName) {
      sessionStorage.removeItem('rion-marketing-open-referrer')
      setSection('referrers')
      // Find the referrer by name and open their detail page
      const found = loadStore(STORAGE_KEYS.referrers).find(r => r.name === openName)
      if (found) setSelected(found)
    }
  }, [])

  const rradarClients = useMemo(() => loadClients(), [])
  const brokers = useMemo(() => {
    const settings = loadSettings()
    return (settings.users || []).filter(u => u.active)
  }, [])
  const defaultBroker = brokers[0]?.name || 'Cameron Finlayson' 
  const [clientOverrides, setClientOverrides] = useState(() => loadStore(STORAGE_KEYS.clientOv))
  const [referrers, setReferrers] = useState(() => {
    // v2 = cleaned (nan nan removed). If stored version differs, reseed.
    const REFERRER_VERSION = 'v2'
    const storedVer = localStorage.getItem('rion-marketing-referrers-version')
    if (storedVer !== REFERRER_VERSION) {
      saveStore(STORAGE_KEYS.referrers, DEFAULT_REFERRERS)
      localStorage.setItem('rion-marketing-referrers-version', REFERRER_VERSION)
      return DEFAULT_REFERRERS
    }
    const stored = loadStore(STORAGE_KEYS.referrers)
    return stored.length > 0 ? stored : DEFAULT_REFERRERS
  })
  const [lenders,   setLenders]   = useState(() => loadStore(STORAGE_KEYS.lenders))
  const [others,    setOthers]    = useState(() => loadStore(STORAGE_KEYS.others))

  const [section,  setSection]  = useState('clients')
  const [selected, setSelected] = useState(null)
  const [outreach, setOutreach] = useState(null)
  const [adding,   setAdding]   = useState(false)
  const [addForm,  setAddForm]  = useState({})

  // store scroll position per section so list stays in place
  const [scrollPos, setScrollPos] = useState({})

  // Build client contacts from Rradar data
  const clients = useMemo(() => {
    return rradarClients.flatMap(rc => {
      const individuals = (rc.contacts || []).filter(ct => ct.type === 'Ind' && (ct.first || ct.last))
      if (individuals.length === 0) return []
      return individuals.map(ct => {
        const ovKey = `${rc.name}__${ct.first}_${ct.last}`
        const ov = clientOverrides.find(o => o._ovKey === ovKey) || {}
        return {
          _id:         ovKey,
          _clientName: rc.name,
          _connNo:     rc.connNo,
          _ovKey:      ovKey,
          id:          ovKey,
          name:        [ct.first, ct.last].filter(Boolean).join(' '),
          email:       ct.email   || '',
          mobile:      ct.mobile  || '',
          dob:         ct.dob     || '',
          address:     ct.homeAddress || '',
          stream:      rc.stream,
          notes:       ov.notes   || [],
          assignedBroker: ov.assignedBroker || defaultBroker,
          profession:      ov.profession      || '',
          industry:        ov.industry        || '',
          referredBy:      ov.referredBy      || '',
          linkedReferrers: ov.linkedReferrers || [],
          preferredContact:ov.preferredContact|| '',
          spouseName:      ov.spouseName      || '',
          linkedIn:        ov.linkedIn        || '',
          birthdayReminder:ov.birthdayReminder|| false,
          unsubscribed:    ov.unsubscribed    || false,
          ...ov,
        }
      })
    })
  }, [rradarClients, clientOverrides])

  function saveClientOv(updated) {
    const next = clientOverrides.filter(o => o._ovKey !== updated._ovKey)
    next.push(updated)
    setClientOverrides(next)
    saveStore(STORAGE_KEYS.clientOv, next)
  }

  function saveList(sec, fn) {
    if (sec === 'referrers') { const n = fn(referrers); setReferrers(n); saveStore(STORAGE_KEYS.referrers, n) }
    if (sec === 'lenders')   { const n = fn(lenders);   setLenders(n);   saveStore(STORAGE_KEYS.lenders, n) }
    if (sec === 'others')    { const n = fn(others);    setOthers(n);    saveStore(STORAGE_KEYS.others, n) }
  }

  function handleSaveContact(updated) {
    if (section === 'clients') {
      saveClientOv(updated)
      setSelected(prev => ({ ...prev, ...updated }))
    } else {
      saveList(section, list => list.map(c => c.id === updated.id ? updated : c))
      setSelected(updated)
    }
  }

  function handleDeleteContact(contact) {
    if (!window.confirm(`Delete ${contact.name}?`)) return
    if (section !== 'clients') {
      saveList(section, list => list.filter(c => c.id !== contact.id))
    }
    setSelected(null)
  }

  function handleAdd() {
    if (!addForm.name?.trim()) return
    const newContact = { ...addForm, id: newId(), notes: [],
      assignedBroker: addForm.assignedBroker || defaultBroker }
    if (addForm.notesDraft) {
      newContact.notes = [{ id: newId(), date: new Date().toLocaleDateString('en-AU'), text: addForm.notesDraft }]
      delete newContact.notesDraft
    }
    saveList(section, list => [...list, newContact])
    setAdding(false)
    setAddForm({})
  }

  const sectionContacts = useMemo(() => {
    if (section === 'clients')   return clients
    if (section === 'referrers') return referrers
    if (section === 'lenders')   return lenders
    if (section === 'others')    return others
    return []
  }, [section, clients, referrers, lenders, others])

  const sectionLabel = { clients: 'Clients', referrers: 'Referral Partners', lenders: 'Lenders', others: 'Others' }

  const NAV_ITEMS = [
    { id: 'clients',   label: 'Clients',           count: clients.length,   emoji: '👥' },
    { id: 'referrers', label: 'Referral Partners',  count: referrers.length, emoji: '🤝' },
    { id: 'lenders',   label: 'Lenders',            count: lenders.length,   emoji: '🏦' },
    { id: 'others',    label: 'Others',              count: others.length,    emoji: '📋' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Montserrat,sans-serif', background: C.bg }}>

      {/* ── sidebar ── */}
      <div style={{ width: 230, background: C.navy, display: 'flex', flexDirection: 'column',
        boxShadow: '2px 0 12px rgba(0,0,0,0.12)', flexShrink: 0 }}>
        <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => navigate('/')}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Montserrat,sans-serif',
              marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
            ← Home
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>Marketing</div>
          <div style={{ fontSize: 11, color: C.pink, marginTop: 2 }}>Rion Capital</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id}
              onClick={() => { setSection(item.id); setSelected(null) }}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
                background: section === item.id ? 'rgba(235,153,194,0.15)' : 'transparent',
                borderLeft: section === item.id ? `3px solid ${C.pink}` : '3px solid transparent',
                transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16 }}>{item.emoji}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: section === item.id ? 700 : 500,
                color: section === item.id ? '#fff' : 'rgba(255,255,255,0.7)',
                fontFamily: 'Montserrat,sans-serif' }}>{item.label}</span>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
                borderRadius: 10, padding: '2px 7px', fontFamily: 'Montserrat,sans-serif' }}>{item.count}</span>
            </button>
          ))}
        </nav>

        {section === 'referrers' && (
          <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Tier Guide</div>
            {REFERRER_TIERS.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.colour, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: 'Montserrat,sans-serif', fontWeight: 600 }}>{t.label}</span>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'Montserrat,sans-serif' }}>{t.desc.split(' · ')[1]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* top bar */}
        <div style={{ padding: '18px 32px', background: '#fff', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{sectionLabel[section]}</div>
            {section === 'referrers' && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Gold: {referrers.filter(r => r.tier === 'gold').length} · Silver: {referrers.filter(r => r.tier === 'silver').length} · Bronze: {referrers.filter(r => r.tier === 'bronze').length} · Contenders: {referrers.filter(r => r.tier === 'contenders').length}
              </div>
            )}
            {section === 'clients' && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {clients.filter(c => c.stream === 'Private Wealth').length} Private Wealth · {clients.filter(c => c.stream === 'Commercial').length} Commercial · {clients.filter(c => c.unsubscribed).length} unsubscribed
              </div>
            )}
          </div>
        </div>

        {selected
          ? <ContactDetail contact={selected} section={section} rradarClients={rradarClients}
              allClients={clients} brokers={brokers}
              onBack={() => setSelected(null)} onSave={handleSaveContact}
              onDelete={() => handleDeleteContact(selected)}
              onMove={(contact, targetSection) => {
                const clean = { ...contact }
                delete clean._clientName; delete clean._connNo; delete clean._ovKey; delete clean._id
                saveList(targetSection, list => {
                  if (list.find(c => c.id === clean.id)) return list
                  return [...list, { ...clean, tier: targetSection === 'referrers' ? (clean.tier || 'contenders') : clean.tier }]
                })
                if (section !== 'clients') saveList(section, list => list.filter(c => c.id !== contact.id))
                setSelected(null)
              }} />
          : <ContactList contacts={sectionContacts} section={section}
              onSelect={setSelected} onOutreach={setOutreach}
              onAdd={() => { setAddForm({}); setAdding(true) }}
              onDeleteMultiple={ids => {
                if (section !== 'clients') {
                  saveList(section, list => list.filter(c => !ids.includes(c.id)))
                }
              }}
              onMoveContacts={(contacts, targetSection) => {
                // Add to target list
                saveList(targetSection, list => {
                  const existingIds = new Set(list.map(c => c.id))
                  const toAdd = contacts
                    .filter(c => !existingIds.has(c.id))
                    .map(c => ({ ...c,
                      // strip client-specific fields when moving to referrer/lender/other
                      _clientName: undefined, _connNo: undefined, _ovKey: undefined, _id: undefined,
                      tier: targetSection === 'referrers' ? (c.tier || 'contenders') : undefined,
                    }))
                  return [...list, ...toAdd]
                })
                // Remove from current list (not clients — those are read-only from Rradar)
                if (section !== 'clients') {
                  const ids = contacts.map(c => c.id)
                  saveList(section, list => list.filter(c => !ids.includes(c.id)))
                }
              }} />
        }
      </div>

      {adding && (
        <EditContactModal contact={addForm} section={section} onChange={setAddForm}
          onSave={handleAdd} onClose={() => setAdding(false)} />
      )}
      {outreach && (
        <OutreachModal contacts={outreach}
          groupLabel={`${sectionLabel[section]} (${outreach.length})`}
          onClose={() => setOutreach(null)} />
      )}
    </div>
  )
}
