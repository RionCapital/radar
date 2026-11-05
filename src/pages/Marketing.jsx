import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loadClients } from '../lib/data'
import { sbLoadMarketing, sbSaveMarketing } from '../lib/supabase'
import { loadSettings, getDealStages, dealUpfrontCommission, getCurrentUser } from '../lib/settings'
import { loadUnsubRequests, clearUnsubRequests, applyUnsubRequests, ensureUnsubToken,
  unsubscribeUrl, buildUnsubFooterHtml, buildUnsubFooterText, reasonLabel,
  CONTACT_ACTOR, staleUnmatchedRequests, requestKey } from '../lib/unsubscribe'
import { loadDirectIncomeLocal, syncDirectIncomeFromSupabase, directIncomeForClient, entryMatchesLoan, entryCommissionSplit } from '../lib/directIncome'

// Dot colour per CRM stage, keyed by permanent stage id (Settings > CRM >
// Stages) rather than the editable label, so a rename doesn't lose its
// colour. Anything not in this map (a brand-new custom stage) falls back
// to the same neutral grey Discovery used to have.
const STAGE_DOT_COLOR = {
  discovery: '#94a3b8', strategy: '#60a5fa', 'pre-lodged': '#a78bfa',
  lodged: '#fb923c', conditional: '#facc15', unconditional: '#4ade80',
  settled: '#22c55e', withdrawn: '#f87171',
}
function stageDotColor(id) { return STAGE_DOT_COLOR[id] || '#94a3b8' }

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

const CAMPAIGN_OUTCOMES = ['','Referred','No Response','Not Suitable','Follow Up Later']
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
function syncMarketingToSupabase() {
  const payload = {
    referrers: (() => { try { const s = localStorage.getItem('rion-marketing-referrers'); return s ? JSON.parse(s) : [] } catch { return [] } })(),
    lenders:   (() => { try { const s = localStorage.getItem('rion-marketing-lenders');   return s ? JSON.parse(s) : [] } catch { return [] } })(),
    others:    (() => { try { const s = localStorage.getItem('rion-marketing-others');    return s ? JSON.parse(s) : [] } catch { return [] } })(),
    clientOv:  (() => { try { const s = localStorage.getItem('rion-marketing-clients');   return s ? JSON.parse(s) : [] } catch { return [] } })(),
  }
  sbSaveMarketing(payload).catch(() => {})
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

function OutreachModal({ contacts, groupLabel, onClose, onSaveContacts }) {
  const [subject, setSubject] = useState('Message from Cameron – Rion Capital')
  const [body, setBody]       = useState('')
  const [copied, setCopied]   = useState(false)
  const [footerCopied, setFooterCopied] = useState(false)

  // exclude unsubscribed
  const eligible = contacts.filter(c => !c.unsubscribed)
  const emails   = eligible.map(c => c.email).filter(Boolean)
  const skipped  = contacts.length - eligible.length

  const co = (loadSettings().companyDetails) || {}
  const sender = {
    business: co.fullCompanyName || co.tradingName || 'Rion Capital',
    abn: co.abn, acl: co.acl, address: co.address, phone: co.phone, email: co.email,
  }

  // Minting has to be idempotent across clicks. `contacts` is the snapshot
  // from when the modal opened, so after the first save it still shows no
  // tokens — mint straight off it twice and the same person gets a different
  // link in every email, silently breaking the one in the email they got
  // last week. The facility has to keep working for at least 30 days after
  // a message was sent, so a token, once given out, is permanent.
  const [minted, setMinted] = useState({})
  const keyOf = c => c._ovKey || c.id || c.email

  function tokensFor(list) {
    const updated = []
    const out = list.map(c => {
      const k = keyOf(c)
      const existing = c.unsubToken || minted[k]
      if (existing) return { contact: { ...c, unsubToken: existing }, token: existing }
      const { token, contact } = ensureUnsubToken(c)
      updated.push(contact)
      return { contact, token }
    })
    if (updated.length) {
      setMinted(prev => {
        const n = { ...prev }
        updated.forEach(c => { n[keyOf(c)] = c.unsubToken })
        return n
      })
      if (onSaveContacts) onSaveContacts(updated)
    }
    return out
  }

  // One mailto carries every recipient in a single message, so it cannot
  // carry a per-recipient link. Mint the tokens anyway and hand over a
  // generic footer — the page asks nothing of the person beyond the click,
  // and the per-recipient link is available one contact at a time from their
  // own page. Sending individually (one mailto each) is the way to get a
  // personal link into a group send.
  function copyFooter() {
    tokensFor(eligible)
    navigator.clipboard.writeText(buildUnsubFooterText({ ...sender, url: unsubscribeUrl('') }))
      .then(() => { setFooterCopied(true); setTimeout(() => setFooterCopied(false), 2500) })
      .catch(() => {})
  }

  function copyEmails() {
    navigator.clipboard.writeText(emails.join('; ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  function openOutlook() {
    const sub = encodeURIComponent(subject)
    const bod = encodeURIComponent(body)
    window.location.href = `mailto:${emails.join(';')}?subject=${sub}&body=${bod}`
  }

  // One message per recipient, each with their own unsubscribe link. Slower
  // to send, but it's the only way a group send can carry a working
  // one-click link — and the only way a reply doesn't go to everyone.
  function openIndividually() {
    const withLinks = tokensFor(eligible.filter(c => c.email))
      .map(({ contact, token }) => ({ email: contact.email, url: unsubscribeUrl(token) }))
    if (!withLinks.length) return
    if (!window.confirm(`This opens ${withLinks.length} separate draft${withLinks.length === 1 ? '' : 's'}, each with that person's own unsubscribe link. Continue?`)) return
    withLinks.forEach((r, i) => {
      const footer = buildUnsubFooterText({ ...sender, url: r.url })
      const bod = encodeURIComponent(`${body}\n${footer}`)
      setTimeout(() => { window.open(`mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${bod}`, '_blank') }, i * 400)
    })
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
        <button onClick={openIndividually} style={{ padding: '9px 18px', borderRadius: 8,
          border: `1px solid ${C.navy}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.navy }}>
          Send individually (personal unsubscribe links)
        </button>
        <button onClick={copyFooter} style={{ padding: '9px 18px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text }}>
          {footerCopied ? '✓ Footer copied!' : 'Copy footer'}
        </button>
      </div>

      <div style={{ marginTop: 12, padding: '10px 13px', background: '#FEF9E7', border: '1px solid #f5e6a8',
        borderRadius: 8, fontSize: 11.5, color: '#92600A', lineHeight: 1.65, fontFamily: 'Montserrat,sans-serif' }}>
        <strong>Every marketing email needs an unsubscribe link and your business details.</strong>{' '}
        <em>Open in Outlook</em> puts everyone in one message, which can't carry a link per person — paste the copied
        footer into it. Its link asks the person which address to remove, so it's one extra step for them.
        <em> Send individually</em> opens one draft per person, each with their own one-click link — better for
        the recipient, and the stronger record if anyone ever queries it.
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

// The first month of the trailing 12, as a 'YYYY-MM' key — trail is banked
// monthly, so a referrer's annual worth is the last twelve of those, not the
// lifetime pile.
function twelveMonthsAgoKey() {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ReferrerClientsPanel({ contact, rradarClients, allClients, onSave }) {
  const referrerName = contact.name
  const fmt  = v => `$${Math.round(v).toLocaleString()}`
  const fmtD = v => `$${Number(v).toFixed(2)}`

  // Direct Income is real commission that never appears on an aggregator
  // statement, so it isn't in loan.commissionHistory. Leaving it out made a
  // referrer whose clients are Direct-only read $0 — see clientComm below.
  const [diEntries, setDiEntries] = useState(() => loadDirectIncomeLocal())
  useEffect(() => {
    syncDirectIncomeFromSupabase().then(cloud => { if (cloud) setDiEntries(cloud.entries) })
  }, [])
  const since12 = useMemo(twelveMonthsAgoKey, [])

  // Stage names/order come from Settings > CRM > Stages.
  const dealStagesFull = useMemo(() => getDealStages(loadSettings()), [])
  const settledDisplay = dealStagesFull.find(s => s.id === 'settled')?.display
  const withdrawnDisplay = dealStagesFull.find(s => s.id === 'withdrawn')?.display
  const stageIdByDisplay = useMemo(() => Object.fromEntries(dealStagesFull.map(s => [s.display, s.id])), [dealStagesFull])

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
      const parsed = JSON.parse(localStorage.getItem('rion-crm-deals') || '[]')
      const deals = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [])
      const rn = referrerName.toLowerCase()
      return deals.filter(d => {
        const ref = (d['_referrers'] || []).map(r => r.name.toLowerCase())
        const legacy = (d['Referrer'] || d['referrer'] || d['Referred By'] || '').toLowerCase()
        return ref.some(r => r.includes(rn)) || legacy.includes(rn)
      })
    } catch { return [] }
  }, [referrerName])

  const settledDeals  = allCrmDeals.filter(d => d.Status === settledDisplay)
  const inflightDeals = allCrmDeals.filter(d => d.Status !== settledDisplay && d.Status !== withdrawnDisplay)

  // ── Commission per Rradar client ──────────────────────────────────────────
  // Both income streams, ex-GST, so they add up: statement commission off the
  // loan, plus any Direct Income invoice allocated to this client.
  function clientComm(rc) {
    let upfront = 0, trail = 0, trail12 = 0
    rc.loans.forEach(l => {
      ;(l.commissionHistory || []).forEach(h => {
        upfront += h.upfrontComm || 0
        trail   += h.trailComm   || 0
        if (h.month && h.month >= since12) trail12 += h.trailComm || 0
      })
    })
    directIncomeForClient(diEntries, rc.name).forEach(e => {
      const sp = entryCommissionSplit(e)
      upfront += sp.upfront
      trail   += sp.trail
      if (e.month && e.month >= since12) trail12 += sp.trail
    })
    return { upfront, trail, trail12, total: upfront + trail }
  }

  // The same split for one loan — statement rows plus the Direct Income
  // invoices linked to that loan account.
  function loanComm(loan) {
    let upfront = 0, trail = 0
    ;(loan.commissionHistory || []).forEach(h => {
      upfront += h.upfrontComm || 0
      trail   += h.trailComm   || 0
    })
    diEntries.filter(e => entryMatchesLoan(e, loan)).forEach(e => {
      const sp = entryCommissionSplit(e)
      upfront += sp.upfront
      trail   += sp.trail
    })
    return { upfront, trail }
  }

  // Only money actually received — statement commission and Direct Income.
  // (This used to add d._upfrontComm for each settled CRM deal, but nothing
  // anywhere ever wrote that field, so the term was always zero.)
  const totalComm = useMemo(() => {
    let upfront = 0, trail = 0, trail12 = 0
    linkedClients.forEach(rc => { const c = clientComm(rc); upfront += c.upfront; trail += c.trail; trail12 += c.trail12 })
    return { upfront, trail, trail12, total: upfront + trail }
  }, [linkedClients, diEntries, since12]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual link helpers ───────────────────────────────────────────────────
  const manualLinks = contact.linkedClients || []
  const [addingClient, setAddingClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const linkedNames = new Set(linkedClients.map(rc => rc.name))
  const availableClients = rradarClients
    .filter(rc => !linkedNames.has(rc.name))
    .filter(rc => !clientSearch || rc.name.toLowerCase().includes(clientSearch.toLowerCase()))
    .slice(0, 8)


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
            { label: 'Total Upfront', value: fmt(totalComm.upfront), col: C.navy, sub: 'All time, excl. GST' },
            { label: 'Trail p.a.',    value: fmt(totalComm.trail12), col: '#2A7A2A', sub: `Last 12 months · ${fmt(totalComm.trail)} lifetime` },
            { label: 'Total Earned',  value: fmt(totalComm.total),   col: C.pinkBtn, sub: 'Upfront + trail, all time' },
          ].map(t => (
            <div key={t.label} style={{ padding: '12px 14px', borderRadius: 10,
              background: t.col + '10', border: `1px solid ${t.col}30`, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.col, textTransform: 'uppercase',
                letterSpacing: '0.05em', fontFamily: 'Montserrat,sans-serif', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.col, fontFamily: 'Montserrat,sans-serif' }}>{t.value}</div>
              {t.sub && <div style={{ fontSize: 9, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 3 }}>{t.sub}</div>}
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
                    <div title={`Last 12 months of trail · ${fmtD(comm.trail)} lifetime`}
                      style={{ fontSize: 10, color: '#2A7A2A', fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>~ {fmtD(comm.trail12)}/yr</div>
                    <div style={{ fontSize: 10, color: C.navy, fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>↑ {fmtD(comm.upfront)}</div>
                  </div>
                  {isManual && (
                    <button onClick={e => { e.stopPropagation(); onSave({ ...contact, linkedClients: manualLinks.filter(n => n !== rc.name) }) }}
                      style={{ border:'none', background:'none', cursor:'pointer', color:'#CBD5E1', fontSize:13, padding:'0 2px' }}>×</button>
                  )}
                  <span style={{ color: C.slate, fontSize: 13 }}>›</span>
                </div>
                {rc.loans.map((loan, li) => {
                  const { upfront: lU, trail: lT } = loanComm(loan)
                  if (!lU && !lT) return null
                  return (
                    <div key={loan.acc || `loan-${li}`} style={{ display:'flex', gap:8, padding:'5px 12px',
                      borderTop:`1px solid ${C.border}`, fontSize:11, fontFamily:'Montserrat,sans-serif' }}>
                      <div style={{ flex:1, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {loan.lname || loan.bank} <span style={{ color:C.muted }}>{loan.bank}</span>
                        {loan.closed && <span style={{ color:C.muted }}> · closed</span>}
                      </div>
                      <span title="Upfront received on this loan, all time" style={{ color:C.navy, fontWeight:600 }}>↑ {fmtD(lU)}</span>
                      <span title="Trail received on this loan, all time" style={{ color:'#2A7A2A', fontWeight:600 }}>~ {fmtD(lT)}</span>
                    </div>
                  )
                })}
                {(() => {
                  // Direct Income allocated to the client but not to a specific
                  // loan still belongs to this referrer — show it on its own
                  // line rather than letting the loan rows come up short.
                  const loose = directIncomeForClient(diEntries, rc.name)
                    .filter(e => !rc.loans.some(l => entryMatchesLoan(e, l)))
                  if (!loose.length) return null
                  const t = loose.reduce((acc, e) => {
                    const sp = entryCommissionSplit(e)
                    acc.upfront += sp.upfront; acc.trail += sp.trail
                    return acc
                  }, { upfront: 0, trail: 0 })
                  if (!t.upfront && !t.trail) return null
                  return (
                    <div style={{ display:'flex', gap:8, padding:'5px 12px',
                      borderTop:`1px solid ${C.border}`, fontSize:11, fontFamily:'Montserrat,sans-serif' }}>
                      <div style={{ flex:1, color:C.muted, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title="Direct Income invoices allocated to this client but not to a particular loan">
                        Direct income · no loan linked
                      </div>
                      <span style={{ color:C.navy, fontWeight:600 }}>↑ {fmtD(t.upfront)}</span>
                      <span style={{ color:'#2A7A2A', fontWeight:600 }}>~ {fmtD(t.trail)}</span>
                    </div>
                  )
                })()}
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
            const col = stageDotColor(stageIdByDisplay[d.Status])
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
                  <div style={{ fontSize:9, color:'#2A7A2A', fontFamily:'Montserrat,sans-serif', marginTop:1 }}>
                    {d.Amount ? `~$${dealUpfrontCommission(d).toLocaleString()} upfront` : ''}
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

      {/* ── Contact details card ── */}
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

        {/* helper: renders value — plain text or clickable link */}
        {(() => {
          const isUrl  = v => v && (v.startsWith('http') || v.startsWith('www') || v.includes('.com') || v.includes('.au'))
          const isTel  = v => v && /^[\d\s\+\(\)]{7,}$/.test(v)
          const isEmail= v => v && v.includes('@')

          const DetailRow = ({ label, value, icon }) => {
            let content
            if (!value)
              content = <span style={{ color:'#CBD5E1', fontStyle:'italic', fontSize:11 }}>Not set</span>
            else if (isEmail(value))
              content = <a href={`mailto:${value}`} style={{ color: C.navy, textDecoration:'underline', wordBreak:'break-all' }}>{value}</a>
            else if (isTel(value))
              content = <a href={`tel:${value.replace(/\s/g,'')}`} style={{ color: C.navy, textDecoration:'underline' }}>{value}</a>
            else if (isUrl(value))
              content = <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
                style={{ color: C.navy, textDecoration:'underline', wordBreak:'break-all' }}>{value} ↗</a>
            else
              content = <span style={{ color: C.text, wordBreak:'break-word' }}>{value}</span>
            return (
              <div style={{ display:'flex', gap:6, alignItems:'flex-start', fontSize:12, fontFamily:'Montserrat,sans-serif', minWidth:0 }}>
                <span style={{ color:C.slate, fontWeight:600, whiteSpace:'nowrap', flexShrink:0, minWidth:90 }}>
                  {icon && <span style={{ marginRight:3 }}>{icon}</span>}{label}:
                </span>
                {content}
              </div>
            )
          }

          // Build field list based on section — always show all relevant fields
          const fields = [
            { label:'Full Legal Name', value:contact.company },
            { label:'ABN',            value:contact.abn },
            { label:'ACN',            value:contact.acn },
            { label:'Address',        value:contact.address },
            { label:'Email',          value:contact.email,          icon:'✉' },
            { label:'Mobile',         value:contact.mobile,         icon:'📱' },
            { label:'Bus. Phone',     value:contact.busPhone,       icon:'📞' },
            { label:'Type / Role',    value:contact.type },
            { label:`DOB${ageVal ? ` (${ageVal}yrs)` : ''}`, value: dobDisplay || contact.dob || '' },
            ...(clientSince ? [{ label:'Client Since', value: (() => { try { return new Date(clientSince).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}) } catch { return clientSince } })() }] : []),
            ...(section === 'clients' ? [
              { label:'Profession',    value:contact.profession },
              { label:'Industry',     value:contact.industry },
              { label:'Spouse/Partner',value:contact.spouseName },
              { label:'Referred By',  value:contact.referredBy },
            ] : []),
            ...(section === 'referrers' ? [
              { label:'Referrals',    value:contact.referralCount ? `${contact.referralCount} total` : '' },
              { label:'Tier',         value:tierCfg?.label || contact.tier },
            ] : []),
            ...(section === 'lenders' ? [
              { label:'BDM Name',     value:contact.bdmName },
              { label:'BDM Email',    value:contact.bdmEmail, icon:'✉' },
              { label:'BDM Mobile',   value:contact.bdmMobile, icon:'📱' },
            ] : []),
            { label:'Pref. Contact',  value:contact.preferredContact },
            { label:'Website',        value:contact.website,        icon:'🌐' },
            { label:'LinkedIn',       value:contact.linkedIn,       icon:'in' },
            { label:'Facebook',       value:contact.facebook,       icon:'f' },
            { label:'Instagram',      value:contact.instagram,      icon:'◎' },
            { label:'Twitter/X',      value:contact.twitter,        icon:'𝕏' },
          ]

          const unsub = !!contact.unsubscribed
          const fmtWhen = v => { try { return new Date(v).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}) } catch { return '' } }
          const unsubDate = contact.unsubscribedAt ? fmtWhen(contact.unsubscribedAt) : ''

          // Only an admin may change someone's subscription from inside
          // Rradar. Everyone else sees the status and the trail — it governs
          // whether this person may be emailed, so it has to be visible to
          // whoever is about to email them — but can't flip it. The contact's
          // own link is unaffected: that never required a login in the first
          // place, and it isn't gated by anything here.
          const me = getCurrentUser()
          const canChangeSub = me?.role === 'admin'
          const actor = me?.name || me?.email || 'Rradar user'
          const trail = subscriptionTrail(contact).slice().reverse()

          return (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px 16px' }}>
                {fields.map(f => <DetailRow key={f.label} label={f.label} value={f.value} icon={f.icon} />)}
              </div>

              {/* Marketing consent sits in the contact's details rather than
                  only inside the Edit form — it governs whether this person
                  may be emailed at all, so it has to be visible without
                  opening anything. Toggling it here records the date, which
                  is what an unsubscribe request has to be evidenced by. */}
              <div style={{ marginTop:12, paddingTop:10, borderTop:`1px solid ${C.border}`,
                display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:'Montserrat,sans-serif', minWidth:0 }}>
                  <span style={{ color:C.slate, fontWeight:600, whiteSpace:'nowrap' }}>✉ Group emails:</span>
                  <span style={{ fontWeight:700, color: unsub ? '#dc2626' : '#166534' }}>
                    {unsub ? 'Unsubscribed' : 'Subscribed'}
                  </span>
                  {unsub && unsubDate && <span style={{ color:C.muted, fontSize:11 }}>since {unsubDate}</span>}
                  {unsub && contact.unsubscribedVia && <span style={{ color:C.muted, fontSize:11 }}>· {contact.unsubscribedVia}</span>}
                  {unsub && contact.unsubscribedBy && <span style={{ color:C.muted, fontSize:11 }}>· by {contact.unsubscribedBy}</span>}
                </div>
                {canChangeSub ? (
                  <button
                    data-sub-toggle
                    onClick={() => {
                      // Unsubscribing on someone's behalf needs no ceremony —
                      // it's the safe direction. Putting someone BACK on a
                      // list they took themselves off does not get to be a
                      // stray click, so it asks, and says who asked for it.
                      if (unsub) {
                        const who = contact.unsubscribedVia === 'Email link'
                          ? `${contact.name || 'This contact'} unsubscribed themselves via the link in an email`
                          : `${contact.name || 'This contact'} was unsubscribed by ${contact.unsubscribedBy || 'a Rradar user'}`
                        if (!window.confirm(`${who}${unsubDate ? ` on ${unsubDate}` : ''}.\n\nOnly put them back on the list if they have asked you to. This will be recorded against your name.`)) return
                      }
                      onSave(setSubscription(contact, !unsub, 'Rradar (admin)', actor))
                    }}
                    title={unsub ? 'Put this contact back on the list' : 'Stop this contact receiving group emails'}
                    style={{ fontSize:11, fontWeight:600, padding:'5px 12px', borderRadius:7, cursor:'pointer',
                      fontFamily:'Montserrat,sans-serif',
                      border:`1px solid ${unsub ? '#bbf7d0' : '#fecaca'}`,
                      background:'#fff', color: unsub ? '#166534' : '#dc2626' }}>
                    {unsub ? 'Resubscribe' : 'Unsubscribe'}
                  </button>
                ) : (
                  <span data-sub-locked style={{ fontSize:10.5, color:C.muted, fontFamily:'Montserrat,sans-serif',
                    padding:'5px 10px', borderRadius:7, background:'#F9FAFB', border:`1px solid ${C.border}` }}>
                    🔒 Admin only
                  </span>
                )}
              </div>
              {unsub && (
                <div style={{ fontSize:10.5, color:'#dc2626', marginTop:6, fontFamily:'Montserrat,sans-serif', lineHeight:1.6 }}>
                  Excluded from Outreach sends and flagged in every export.
                  {contact.unsubReason && <><br/>Reason given: <strong>{reasonLabel(contact.unsubReason)}</strong></>}
                  {contact.unsubNote && <><br/>“{contact.unsubNote}”</>}
                </div>
              )}
              {!unsub && contact.email && (
                <div style={{ fontSize:10.5, color:C.muted, marginTop:6, fontFamily:'Montserrat,sans-serif' }}>
                  <button onClick={() => onSave(copyPersonalUnsubLink(contact))}
                    style={{ background:'none', border:'none', padding:0, color:C.navy, fontSize:10.5, textDecoration:'underline', cursor:'pointer', fontFamily:'inherit' }}>
                    Copy this contact's unsubscribe link
                  </button>
                  {' '}— for pasting into a one-off email.
                </div>
              )}

              {/* The trail. The current status says whether we may email
                  them; this says who decided that and when — which is the
                  question that actually comes up when someone says they
                  never unsubscribed, or says they did and still got an
                  email. A change the contact made themselves and a change a
                  Rradar admin made are kept visibly apart. */}
              {trail.length > 0 && (
                <div data-sub-trail style={{ marginTop:8, paddingTop:8, borderTop:`1px dashed ${C.border}` }}>
                  <div style={{ fontSize:9.5, fontWeight:700, color:C.slate, fontFamily:'Montserrat,sans-serif',
                    textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
                    Subscription history
                  </div>
                  {trail.map((h, i) => {
                    const byContact = h.by === CONTACT_ACTOR || h.via === 'Email link'
                    return (
                      <div key={i} style={{ fontSize:10.5, color:C.muted, fontFamily:'Montserrat,sans-serif',
                        lineHeight:1.65, display:'flex', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:700, color: h.action === 'Unsubscribed' ? '#dc2626' : '#166534' }}>
                          {h.action}
                        </span>
                        <span>{fmtWhen(h.at)}</span>
                        <span>·</span>
                        <span style={{ color: byContact ? C.navy : C.muted, fontWeight: byContact ? 700 : 400 }}>
                          {byContact ? 'by the contact (email link)' : `by ${h.by || 'a Rradar user'}`}
                        </span>
                        {h.reason && <span>· {reasonLabel(h.reason)}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {/* Broker assignment */}
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            Assigned to:
          </span>
          <select value={contact.assignedBroker || brokers[0]?.name || ''}
            onChange={e => onSave({ ...contact, assignedBroker: e.target.value })}
            style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
            {brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        {/* Active Campaign toggle — only for contenders */}
        {section === 'referrers' && contact.tier === 'contenders' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 8,
              background: contact.targeted ? '#FFFBEB' : '#F9FAFB',
              border: `1px solid ${contact.targeted ? '#F59E0B' : C.border}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: contact.targeted ? '#92400E' : C.text,
                  fontFamily: 'Montserrat,sans-serif' }}>
                  🎯 Active Campaign Target
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>
                  {contact.targeted ? 'In current outreach cohort' : 'Not in active campaign'}
                </div>
              </div>
              <div onClick={() => onSave({ ...contact, targeted: !contact.targeted,
                  campaignOutcome: !contact.targeted ? contact.campaignOutcome : '' })}
                style={{ width: 42, height: 24, borderRadius: 12,
                  background: contact.targeted ? '#D97706' : '#CBD5E1',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  left: contact.targeted ? 21 : 3 }} />
              </div>
            </div>

            {/* Campaign outcome — shown when targeted */}
            {contact.targeted && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, fontFamily: 'Montserrat,sans-serif', marginBottom: 5 }}>
                  Campaign Outcome
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Awaiting','Referred','No Response','Not Suitable','Follow Up Later'].map(outcome => {
                    const cols = { 'Referred':'#16a34a','No Response':'#9CA3AF','Not Suitable':'#dc2626','Follow Up Later':'#D4A017','Awaiting':'#6B7280' }
                    const val  = outcome === 'Awaiting' ? '' : outcome
                    const active = (contact.campaignOutcome || '') === val
                    const col  = cols[outcome] || C.slate
                    return (
                      <button key={outcome} onClick={() => onSave({ ...contact, campaignOutcome: val })}
                        style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${active ? col : C.border}`,
                          background: active ? col : '#fff', color: active ? '#fff' : C.text,
                          fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
                          fontFamily: 'Montserrat,sans-serif', transition: 'all 0.15s' }}>
                        {outcome}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
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
// Keeps the Edit form's consent toggle writing the same record as the one on
// the contact page — date, source and who, not just a flag — and behind the
// same admin gate, so the Edit form isn't a way around it.
function SubscriptionToggle({ f, onChange }) {
  const me = getCurrentUser()
  const canChangeSub = me?.role === 'admin'
  const actor = me?.name || me?.email || 'Rradar user'
  if (!canChangeSub) {
    return (
      <div style={{ fontSize:11.5, color:C.muted, fontFamily:'Montserrat,sans-serif',
        padding:'9px 12px', background:'#F9FAFB', borderRadius:8, border:`1px solid ${C.border}` }}>
        <strong style={{ color: f.unsubscribed ? '#dc2626' : '#166534' }}>
          {f.unsubscribed ? 'Unsubscribed' : 'Subscribed'}
        </strong> from group emails · 🔒 only an admin can change this
      </div>
    )
  }
  return (
    <div>
      <Toggle label="Unsubscribed from group emails" checked={!!f.unsubscribed}
        onChange={v => onChange(setSubscription(f, v, 'Rradar (admin)', actor))} />
      {f.unsubscribed && f.unsubscribedAt && (
        <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:3, fontFamily:'Montserrat,sans-serif' }}>
          Recorded {String(f.unsubscribedAt).slice(0,10)}
          {f.unsubscribedVia ? ` · ${f.unsubscribedVia}` : ''}
          {f.unsubscribedBy ? ` · by ${f.unsubscribedBy}` : ''}
        </div>
      )}
    </div>
  )
}

function EditContactModal({ contact, section, onChange, onSave, onClose }) {
  const f = contact
  const set = (k, v) => onChange({ ...f, [k]: v })

  return (
    <Modal title={f.id ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <Input label="Full Name *" value={f.name || ''} onChange={e => set('name', e.target.value)} />
      <Input label="Full Legal Name" value={f.company || ''} onChange={e => set('company', e.target.value)} />
      <Input label="ABN" value={f.abn || ''} onChange={e => set('abn', e.target.value)} />
      <Input label="ACN" value={f.acn || ''} onChange={e => set('acn', e.target.value)} />
      <Input label="Address" value={f.address || ''} onChange={e => set('address', e.target.value)} />
      <Input label="Email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
      <Input label="Mobile" value={f.mobile || ''} onChange={e => set('mobile', e.target.value)} />

      {section === 'clients' && (
        <>
          <Select label="Profession" options={PROFESSIONS} value={f.profession || ''} onChange={e => set('profession', e.target.value)} />
          <Select label="Industry (Business)" options={INDUSTRIES} value={f.industry || ''} onChange={e => set('industry', e.target.value)} />
          <Select label="Preferred Contact Method" options={CONTACT_PREFS} value={f.preferredContact || ''} onChange={e => set('preferredContact', e.target.value)} />
          <Input label="Spouse / Partner Name" value={f.spouseName || ''} onChange={e => set('spouseName', e.target.value)} />
          <Input label="Website URL" value={f.website || ''} onChange={e => set('website', e.target.value)} />
          <Input label="LinkedIn URL" value={f.linkedIn || ''} onChange={e => set('linkedIn', e.target.value)} />
          <Input label="Facebook URL" value={f.facebook || ''} onChange={e => set('facebook', e.target.value)} />
          <Input label="Instagram URL" value={f.instagram || ''} onChange={e => set('instagram', e.target.value)} />
          <Input label="Twitter / X URL" value={f.twitter || ''} onChange={e => set('twitter', e.target.value)} />
          <Input label="Referred By" value={f.referredBy || ''} onChange={e => set('referredBy', e.target.value)} />
          <Toggle label="Birthday reminders" checked={!!f.birthdayReminder} onChange={v => set('birthdayReminder', v)} />
          <SubscriptionToggle f={f} onChange={next => onChange(next)} />
          {f.tier === 'contenders' && (
            <Toggle label="🎯 Add to Active Campaign" checked={!!f.targeted} onChange={v => set('targeted', v)} />
          )}
        </>
      )}

      {section === 'referrers' && (
        <>
          <Select label="Type" options={REFERRER_TYPES} value={f.type || ''} onChange={e => set('type', e.target.value)} />
          <Select label="Tier" options={REFERRER_TIERS.map(t => t.id)} value={f.tier || ''} onChange={e => set('tier', e.target.value)} />
          <Input label="Business Phone" value={f.busPhone || ''} onChange={e => set('busPhone', e.target.value)} />
          <Input label="Website URL" value={f.website || ''} onChange={e => set('website', e.target.value)} />
          <Input label="LinkedIn URL" value={f.linkedIn || ''} onChange={e => set('linkedIn', e.target.value)} />
          <Input label="Facebook URL" value={f.facebook || ''} onChange={e => set('facebook', e.target.value)} />
          <Input label="Instagram URL" value={f.instagram || ''} onChange={e => set('instagram', e.target.value)} />
          <Input label="Twitter / X URL" value={f.twitter || ''} onChange={e => set('twitter', e.target.value)} />
          <Select label="Preferred Contact Method" options={CONTACT_PREFS} value={f.preferredContact || ''} onChange={e => set('preferredContact', e.target.value)} />
          <Input label="Referral Count (all time)" value={f.referralCount || ''} onChange={e => set('referralCount', e.target.value)} />
          <SubscriptionToggle f={f} onChange={next => onChange(next)} />
          {f.tier === 'contenders' && (
            <Toggle label="🎯 Add to Active Campaign" checked={!!f.targeted} onChange={v => set('targeted', v)} />
          )}
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
          <SubscriptionToggle f={f} onChange={next => onChange(next)} />
          {f.tier === 'contenders' && (
            <Toggle label="🎯 Add to Active Campaign" checked={!!f.targeted} onChange={v => set('targeted', v)} />
          )}
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
// A contact's name is stored as one free-text field ("Chris Angel") rather
// than separate first/last fields — fine for display, but useless for a
// mail-merge greeting ("Hi {{First Name}},"). This splits it the same
// simple way any mail-merge tool would: first word is the first name,
// everything else is the last name. Good enough for the vast majority of
// real names; anything unusual (a single name, a title prefix) just lands
// however a human doing the same split by eye would read it, and is easy
// to hand-correct in the spreadsheet afterward.
function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// Each contact's link carries their own token. Minted on first use rather
// than up front, so a contact who is never emailed never gets one.
function copyPersonalUnsubLink(contact) {
  const { token, contact: withToken } = ensureUnsubToken(contact)
  try { navigator.clipboard.writeText(unsubscribeUrl(token)) } catch {}
  return withToken
}

// ─── Marketing consent ───────────────────────────────────────────────────────
// A boolean alone isn't enough: an unsubscribe request has to be evidenced,
// so the date, the channel it came through, and WHO made the change are
// recorded with it.
//
// Two things can change this status, and the record has to tell them apart:
//
//   · the contact themselves, by clicking the link in an email — via
//     'Email link', by 'The contact'. That is their own decision and the
//     evidence that matters if they ever query it.
//   · a Rradar admin, from this page — via 'Rradar (admin)', by the signed-in
//     user's name. Someone rang up and asked, or asked in person.
//
// The current status answers "may we email them". The TRAIL answers "who
// did this, and when" — which is the question that actually gets asked when
// a contact says they never unsubscribed, or says they did and still got an
// email. So every change appends; nothing is overwritten.
const SUB_TRAIL_MAX = 40

export function subscriptionTrail(contact) {
  return Array.isArray(contact?.subHistory) ? contact.subHistory : []
}

export function setSubscription(contact, unsubscribed, via, by) {
  const entry = {
    at: new Date().toISOString(),
    action: unsubscribed ? 'Unsubscribed' : 'Resubscribed',
    via: via || 'Manual',
    by: by || '',
  }
  const subHistory = [...subscriptionTrail(contact), entry].slice(-SUB_TRAIL_MAX)

  if (!unsubscribed) {
    // Resubscribing clears the current record rather than leaving a stale
    // date sitting against someone who is back on the list — but the trail
    // keeps the fact that they were once off it, and who put them back.
    const { unsubscribedAt, unsubscribedVia, unsubscribedBy, unsubReason, unsubNote, ...rest } = contact
    return { ...rest, unsubscribed: false, subHistory }
  }
  return {
    ...contact,
    unsubscribed: true,
    unsubscribedAt:  contact.unsubscribedAt  || entry.at,
    unsubscribedVia: contact.unsubscribedVia || entry.via,
    unsubscribedBy:  contact.unsubscribedBy  || entry.by,
    subHistory,
  }
}

const subscriptionCols = ['Subscribed', 'Unsubscribed', 'Unsubscribed On', 'Unsubscribed Via', 'Changed By', 'Reason Given']
const subscriptionVals = c => [
  c.unsubscribed ? 'No' : 'Yes',
  c.unsubscribed ? 'Yes' : 'No',
  c.unsubscribed && c.unsubscribedAt ? String(c.unsubscribedAt).slice(0, 10) : '',
  c.unsubscribed ? (c.unsubscribedVia || 'Manual') : '',
  c.unsubscribed ? (c.unsubscribedBy || '') : '',
  c.unsubscribed ? reasonLabel(c.unsubReason) : '',
]

// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportToCSV(contacts, section, label) {
  const cols = (section === 'clients'
    ? ['Name','First Name','Last Name','Email','Mobile','Connection','Connection #','Stream','Profession','Industry','Preferred Contact','Referred By','Spouse/Partner','LinkedIn']
    : section === 'referrers'
    ? ['Name','First Name','Last Name','Email','Mobile','Company','Type','Tier','LinkedIn','Preferred Contact','Referral Count']
    : section === 'lenders'
    ? ['Name','First Name','Last Name','Email','Mobile','Company','Type','BDM Name','BDM Email','BDM Mobile']
    : ['Name','First Name','Last Name','Email','Mobile','Company','Type']
  ).concat(subscriptionCols)

  const rows = contacts.map(c => {
    const { first, last } = splitName(c.name)
    const base = section === 'clients' ? [
      c.name, first, last, c.email, c.mobile, c._clientName, c._connNo, c.stream,
      c.profession, c.industry, c.preferredContact, c.referredBy,
      c.spouseName, c.linkedIn
    ] : section === 'referrers' ? [
      c.name, first, last, c.email, c.mobile, c.company, c.type,
      REFERRER_TIERS.find(t => t.id === c.tier)?.label || c.tier,
      c.linkedIn, c.preferredContact, c.referralCount
    ] : section === 'lenders'
      ? [c.name, first, last, c.email, c.mobile, c.company, c.type, c.bdmName, c.bdmEmail, c.bdmMobile]
      : [c.name, first, last, c.email, c.mobile, c.company, c.type]
    return base.concat(subscriptionVals(c))
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

// Filtering by consent is what makes an export safe to send from — narrow to
// Subscribed, export, and the unsubscribed never leave the building.
// A filter group's value is an array. Older state (and anything that ever
// set one directly) could be a bare string, so read it through this rather
// than assuming — a string would otherwise be spread into characters.
const valsOf = v => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : [])

const SUBSCRIPTION_FILTER = {
  key: 'subscription', label: 'Emails',
  opts: [{ value: 'subscribed', label: 'Subscribed' }, { value: 'unsubscribed', label: 'Unsubscribed' }],
}

function ContactList({ contacts, section, onSelect, onOutreach, onAdd, onDeleteMultiple, onMoveContacts, onBulkTarget }) {
  const [search,   setSearch]   = useState('')
  // Each filter holds a SET of values, not one: "email the Gold, Silver and
  // Bronze partners" is one send, not three. An empty or missing array means
  // the filter isn't narrowing anything.
  const [filters,  setFilters]  = useState({}) // { tier:['gold','silver'], type:['Accountant'], ... }
  const [selected, setSelected] = useState(new Set())
  const [moveTarget, setMoveTarget] = useState(null) // section to move selected to
  const [openAccordion, setOpenAccordion] = useState(null)

  // Build active filter chips based on section
  const FILTER_GROUPS = useMemo(() => {
    if (section === 'referrers') return [
      { key: 'tier',   label: 'Tier',   opts: REFERRER_TIERS.map(t => ({ value: t.id, label: t.label, colour: t.colour })) },
      { key: 'type',   label: 'Type',   opts: REFERRER_TYPES.map(t => ({ value: t, label: t })) },
      SUBSCRIPTION_FILTER,
    ]
    if (section === 'clients') return [
      { key: 'stream',     label: 'Stream',     opts: ['Private Wealth','Commercial'].map(s => ({ value: s, label: s })) },
      { key: 'profession', label: 'Profession', opts: PROFESSIONS.map(p => ({ value: p, label: p })) },
      { key: 'industry',   label: 'Industry',   opts: INDUSTRIES.map(i => ({ value: i, label: i })) },
      SUBSCRIPTION_FILTER,
    ]
    return [SUBSCRIPTION_FILTER]
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
    // Within a group the values are OR'd (Gold OR Silver), across groups
    // they are AND'd (a Silver AND an Accountant) — which is how anyone
    // reading the chips would expect it to read.
    Object.entries(filters).forEach(([key, vals]) => {
      const set = valsOf(vals)
      if (!set.length) return
      // Consent is a boolean, not a text field, so it can't go through the
      // generic string match the other filters use.
      if (key === 'subscription') {
        list = list.filter(c => set.some(v => v === 'unsubscribed' ? !!c.unsubscribed : !c.unsubscribed))
        return
      }
      const lower = set.map(v => String(v).toLowerCase())
      list = list.filter(c => lower.includes(String(c[key] || '').toLowerCase()))
    })
    return list
  }, [contacts, search, filters])

  useMemo(() => setSelected(new Set()), [search, filters])

  const activeFilters = Object.entries(filters).filter(([, v]) => valsOf(v).length)
  const hasFilters    = search || activeFilters.length > 0

  function clearAllFilters() { setSearch(''); setFilters({}) }

  // Toggle one value in a group, leaving the rest of the group alone.
  function setFilter(key, val) {
    setFilters(f => {
      const cur = valsOf(f[key])
      const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val]
      return { ...f, [key]: next }
    })
  }
  function clearFilterGroup(key) { setFilters(f => ({ ...f, [key]: [] })) }
  function setFilterGroup(key, vals) { setFilters(f => ({ ...f, [key]: vals })) }

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
        const isOpen  = openAccordion === group.key
        const chosen  = valsOf(filters[group.key])
        const on      = chosen.length > 0
        const labelOf = v => group.opts.find(o => o.value === v)?.label || v
        const allOn   = chosen.length === group.opts.length
        return (
          <div key={group.key} data-filter-group={group.key} style={{ marginBottom: 6, borderRadius: 9,
            border: `1px solid ${on ? C.navy + '55' : C.border}`,
            background: on ? C.navy + '06' : '#fff', overflow: 'hidden' }}>
            {/* accordion header */}
            <button onClick={() => setOpenAccordion(isOpen ? null : group.key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'Montserrat,sans-serif', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.navy : C.text }}>
                  {group.label}
                </span>
                {/* Every chosen value is named. "Tier (3)" would make you
                    open the group to find out what you're about to email. */}
                {chosen.map(v => (
                  <span key={v} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: C.navy, color: '#fff', fontWeight: 600, fontFamily: 'Montserrat,sans-serif' }}>
                    {labelOf(v)}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </button>
            {/* accordion body — stays open as you pick, because picking more
                than one is the point. */}
            {isOpen && (
              <div style={{ padding: '4px 14px 12px', borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.opts.map(opt => {
                    const active = chosen.includes(opt.value)
                    const colour = opt.colour || C.navy
                    return (
                      <button key={opt.value} data-filter-opt={opt.value}
                        aria-pressed={active}
                        onClick={() => setFilter(group.key, opt.value)}
                        style={{ padding: '5px 13px', borderRadius: 20,
                          border: `1px solid ${active ? colour : C.border}`,
                          background: active ? colour : '#fff', color: active ? '#fff' : C.text,
                          fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                          fontFamily: 'Montserrat,sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                        {active ? '✓ ' : ''}{opt.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 9 }}>
                  <button data-filter-all onClick={() => setFilterGroup(group.key, allOn ? [] : group.opts.map(o => o.value))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 11, color: C.navy, fontWeight: 600, textDecoration: 'underline', fontFamily: 'Montserrat,sans-serif' }}>
                    {allOn ? 'Clear all' : 'Select all'}
                  </button>
                  {on && !allOn && (
                    <button data-filter-clear onClick={() => clearFilterGroup(group.key)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: 11, color: C.muted, textDecoration: 'underline', fontFamily: 'Montserrat,sans-serif' }}>
                      Clear {group.label.toLowerCase()}
                    </button>
                  )}
                </div>
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
        <button onClick={() => exportToCSV(filtered, section, `${sectionLabel[section]}${activeFilters.flatMap(([,v])=>valsOf(v)).map(v=>'_'+v).join('')}`)}
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

        {selected.size > 0 && section === 'referrers' && (
          <button onClick={() => {
            // Target all selected contenders
            const ids = [...selected]
            onBulkTarget(ids)
            setSelected(new Set())
          }}
            style={{ padding: '7px 13px', borderRadius: 8, border: '1px solid #F59E0B',
              background: '#FFFBEB', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              fontFamily: 'Montserrat,sans-serif', color: '#92400E', whiteSpace: 'nowrap' }}>
            🎯 Target ({selected.size})
          </button>
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
        ? <>
            {/* Active Campaign section — targeted contenders shown first */}
            {(() => {
              const targeted = filtered.filter(c => c.tier === 'contenders' && c.targeted)
              if (targeted.length === 0) return null
              const OUTCOME_COLOURS = {
                'Referred': '#16a34a', 'No Response': '#9CA3AF',
                'Not Suitable': '#dc2626', 'Follow Up Later': '#D4A017'
              }
              return (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                      background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 20 }}>
                      <span style={{ fontSize: 13 }}>🎯</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', fontFamily: 'Montserrat,sans-serif' }}>
                        Active Campaign · {targeted.length}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
                      Current outreach cohort — working this group now
                    </span>
                  </div>
                  <div style={{ border: `2px solid #F59E0B`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    {/* select-all */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                      borderBottom: `1px solid ${C.border}`, background: '#FFFBEB' }}>
                      <input type="checkbox"
                        checked={targeted.every(c => selected.has(c.id || c._id))}
                        onChange={() => {
                          const allOn = targeted.every(c => selected.has(c.id || c._id))
                          const next = new Set(selected)
                          targeted.forEach(c => allOn ? next.delete(c.id||c._id) : next.add(c.id||c._id))
                          setSelected(next)
                        }}
                        style={{ width:15, height:15, cursor:'pointer', accentColor:'#D97706' }} />
                      <span style={{ fontSize: 11, color: '#92400E', fontFamily: 'Montserrat,sans-serif', fontWeight: 600 }}>
                        Select all in campaign
                      </span>
                    </div>
                    {targeted.map((c, i) => {
                      const cid = c.id || c._id
                      const isChecked = selected.has(cid)
                      const outCol = OUTCOME_COLOURS[c.campaignOutcome] || C.muted
                      return (
                        <div key={cid}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                            borderBottom: i < targeted.length - 1 ? `1px solid ${C.border}` : 'none',
                            background: isChecked ? '#FEF9C3' : '#FFFBEB' }}
                          onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#FEF3C7' }}
                          onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = '#FFFBEB' }}>
                          <input type="checkbox" checked={isChecked}
                            onChange={e => { e.stopPropagation(); toggleOne(cid) }}
                            style={{ width:15, height:15, cursor:'pointer', accentColor:'#D97706', flexShrink:0 }} />
                          <div onClick={() => onSelect(c)} style={{ display:'flex', alignItems:'center', gap:12, flex:1, cursor:'pointer', minWidth:0 }}>
                            <Avatar name={c.name} size={34} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:C.text, fontFamily:'Montserrat,sans-serif',
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {c.name}
                              </div>
                              <div style={{ fontSize:11, color:C.muted, fontFamily:'Montserrat,sans-serif' }}>
                                {c.company || c.type || 'Contender'}
                              </div>
                            </div>
                            {/* Campaign outcome badge */}
                            {c.campaignOutcome ? (
                              <span style={{ fontSize:10, fontWeight:700, color:outCol,
                                background:outCol+'18', padding:'2px 9px', borderRadius:10,
                                fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap',
                                border:`1px solid ${outCol}44` }}>
                                {c.campaignOutcome}
                              </span>
                            ) : (
                              <span style={{ fontSize:10, color:'#D97706', fontFamily:'Montserrat,sans-serif',
                                fontStyle:'italic' }}>Awaiting outcome</span>
                            )}
                            <span style={{ color:C.slate, fontSize:14 }}>›</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Regular tier groups */}
            {REFERRER_TIERS.map(tier => {
              // For contenders: exclude targeted ones (shown above)
              const tc = filtered.filter(c => c.tier === tier.id && !(tier.id === 'contenders' && c.targeted))
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
            })}
          </>
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
  const [referrers, setReferrers] = useState(() => loadStore(STORAGE_KEYS.referrers))
  const [lenders,   setLenders]   = useState(() => loadStore(STORAGE_KEYS.lenders))
  const [others,    setOthers]    = useState(() => loadStore(STORAGE_KEYS.others))

  const [unsubApplied, setUnsubApplied] = useState(0)
  // Requests that reached Rradar but matched nobody. These MUST be visible:
  // the Spam Act gives five working days to honour an unsubscribe, and one
  // sitting silently in a queue is the worst of both worlds — we have the
  // request and we aren't acting on it.
  const [unsubPending, setUnsubPending] = useState([])

  // ─── Supabase startup sync ────────────────────────────────────────────────
  useEffect(() => {
    sbLoadMarketing().then(async cloud => {
      let ref = cloud?.referrers, len = cloud?.lenders, oth = cloud?.others, cov = cloud?.clientOv
      if (ref?.length) { saveStore(STORAGE_KEYS.referrers, ref); setReferrers(ref) }
      if (len?.length) { saveStore(STORAGE_KEYS.lenders,   len); setLenders(len) }
      if (oth?.length) { saveStore(STORAGE_KEYS.others,    oth); setOthers(oth) }
      if (cov?.length) { saveStore(STORAGE_KEYS.clientOv,  cov); setClientOverrides(cov) }

      // Anyone who clicked the unsubscribe link in an email is sitting in a
      // separate queue (the public endpoint never touches the contact store).
      // Apply them here, where we're signed in, then clear what was applied.
      try {
        const requests = await loadUnsubRequests()
        if (!requests.length) { setUnsubPending([]); return }
        const done = []
        let touched = false

        // Referrers, lenders and others ARE the contacts — the stored array
        // is the list itself, so matching against it is matching against them.
        const lists = [
          ['referrers', ref || loadStore(STORAGE_KEYS.referrers), setReferrers],
          ['lenders',   len || loadStore(STORAGE_KEYS.lenders),   setLenders],
          ['others',    oth || loadStore(STORAGE_KEYS.others),    setOthers],
        ]
        lists.forEach(([key, list, setter]) => {
          const { contacts, applied, changed } = applyUnsubRequests(list || [], requests)
          done.push(...applied)
          if (!changed) return
          touched = true
          saveStore(STORAGE_KEYS[key], contacts)
          setter(contacts)
        })

        // Clients are NOT. A client contact lives on the client record in
        // Rradar; clientOv holds only the EDITS made to one here, and a
        // client nobody has ever edited has no row in it at all. Matching
        // the queue against clientOv was therefore matching against a list
        // that mostly doesn't contain the people being matched — the
        // request would sit unapplied forever, and the contact would keep
        // showing as subscribed. Compose the real contacts, match those,
        // and write an override row back for whoever was hit.
        const overrides = cov || loadStore(STORAGE_KEYS.clientOv) || []
        const ovByKey = new Map(overrides.map(o => [o._ovKey, o]))
        const clientContacts = (rradarClients || []).flatMap(rc =>
          (rc.contacts || [])
            .filter(ct => ct.type === 'Ind' && (ct.first || ct.last))
            .map(ct => {
              const _ovKey = `${rc.name}__${ct.first}_${ct.last}`
              const ov = ovByKey.get(_ovKey) || {}
              return {
                ...ov,
                _ovKey,
                name: [ct.first, ct.last].filter(Boolean).join(' '),
                // The address is on the client record; an override only has
                // one if someone edited it here.
                email: ov.email || ct.email || '',
              }
            }))
        const cRes = applyUnsubRequests(clientContacts, requests)
        done.push(...cRes.applied)
        if (cRes.changed) {
          touched = true
          const hit = new Set(
            cRes.contacts.filter((c, i) => c !== clientContacts[i]).map(c => c._ovKey))
          const nextOv = [
            ...overrides.filter(o => !hit.has(o._ovKey)),
            ...cRes.contacts.filter(c => hit.has(c._ovKey)),
          ]
          saveStore(STORAGE_KEYS.clientOv, nextOv)
          setClientOverrides(nextOv)
        }

        // Whatever is left matched nobody. Surface it rather than swallow it.
        const hitKeys = new Set(done)
        setUnsubPending(requests.filter(r => !hitKeys.has(requestKey(r))))
        // Also let go of typed addresses that have been sitting unmatched
        // for a fortnight — see staleUnsubRequests. They are cleared, not
        // applied, so they don't show in the "applied" count.
        const stale = staleUnmatchedRequests(requests, done)
        if (done.length) {
          if (touched) { syncMarketingToSupabase(); setUnsubApplied(done.length) }
        }
        if (done.length || stale.length) {
          clearUnsubRequests([...done, ...stale]).catch(() => {})
        }
      } catch {}
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

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
    syncMarketingToSupabase()
  }

  function saveList(sec, fn) {
    if (sec === 'referrers') { const n = fn(referrers); setReferrers(n); saveStore(STORAGE_KEYS.referrers, n) }
    if (sec === 'lenders')   { const n = fn(lenders);   setLenders(n);   saveStore(STORAGE_KEYS.lenders, n) }
    if (sec === 'others')    { const n = fn(others);    setOthers(n);    saveStore(STORAGE_KEYS.others, n) }
    syncMarketingToSupabase()
  }

  // Several contacts changed at once — minting an unsubscribe token for every
  // recipient of a group send. One state write and one cloud sync rather than
  // one per contact, which with 200 referrers would be 200 saves.
  function saveContactsBatch(updatedList) {
    if (!updatedList?.length) return
    const ovs  = updatedList.filter(c => c._ovKey)
    const rest = updatedList.filter(c => !c._ovKey)

    if (ovs.length) {
      const keys = new Set(ovs.map(c => c._ovKey))
      const next = clientOverrides.filter(o => !keys.has(o._ovKey)).concat(ovs)
      setClientOverrides(next)
      saveStore(STORAGE_KEYS.clientOv, next)
    }
    if (rest.length && section !== 'clients') {
      const byId = new Map(rest.map(c => [c.id, c]))
      // saveList writes the store and syncs, which also picks up the
      // overrides written just above.
      saveList(section, list => list.map(c => byId.get(c.id) || c))
      refreshOutreachSnapshot(updatedList)
      return
    }
    syncMarketingToSupabase()
    refreshOutreachSnapshot(updatedList)
  }

  // The Outreach modal holds the list it was opened with. Fold anything just
  // saved back into it so its snapshot doesn't drift from what's stored.
  function refreshOutreachSnapshot(updatedList) {
    setOutreach(prev => {
      if (!prev) return prev
      const byKey = new Map(updatedList.map(c => [c._ovKey || c.id || c.email, c]))
      return prev.map(c => byKey.get(c._ovKey || c.id || c.email) || c)
    })
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

        {/* What came back from the unsubscribe links. Silence here was the
            whole problem: a request could arrive, match nobody and sit in
            the queue with nothing on screen to say so. */}
        {unsubApplied > 0 && (
          <div data-unsub-applied style={{ padding: '9px 16px', background: '#F0FDF4', borderBottom: '1px solid #BBF7D0',
            fontSize: 12, color: '#166534', fontFamily: 'Montserrat,sans-serif' }}>
            ✓ {unsubApplied} unsubscribe {unsubApplied === 1 ? 'request' : 'requests'} from email links applied.
          </div>
        )}
        {unsubPending.length > 0 && (
          <div data-unsub-pending style={{ padding: '10px 16px', background: '#FEF9E7', borderBottom: '1px solid #f5e6a8',
            fontSize: 12, color: '#92600A', fontFamily: 'Montserrat,sans-serif', lineHeight: 1.6 }}>
            <strong>
              {unsubPending.length} unsubscribe {unsubPending.length === 1 ? 'request' : 'requests'} could not be matched to a contact.
            </strong>
            <div style={{ marginTop: 3 }}>
              {unsubPending.map((r, i) => (
                <span key={i} style={{ marginRight: 10 }}>
                  {r.email
                    ? r.email
                    : 'a one-click link issued to someone no longer in these lists'}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 4, fontSize: 11 }}>
              They are still waiting, and still have to be honoured. Usually this means the address isn't in
              Clients, Referral Partners, Lenders or Others — or it's held here under a different address.
              Find them and unsubscribe them by hand, and the request clears itself.
            </div>
          </div>
        )}

        {/* top bar */}
        <div style={{ padding: '18px 32px', background: '#fff', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{sectionLabel[section]}</div>
            {section === 'referrers' && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Gold: {referrers.filter(r => r.tier === 'gold').length} · Silver: {referrers.filter(r => r.tier === 'silver').length} · Bronze: {referrers.filter(r => r.tier === 'bronze').length} · Contenders: {referrers.filter(r => r.tier === 'contenders').length} · 🎯 Campaign: {referrers.filter(r => r.targeted).length}
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
              onBulkTarget={ids => {
                saveList('referrers', list => list.map(c =>
                  ids.includes(c.id) && c.tier === 'contenders'
                    ? { ...c, targeted: true }
                    : c
                ))
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
        <OutreachModal contacts={outreach} onSaveContacts={saveContactsBatch}
          groupLabel={`${sectionLabel[section]} (${outreach.length})`}
          onClose={() => setOutreach(null)} />
      )}
    </div>
  )
}
