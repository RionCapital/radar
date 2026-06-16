import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadClients } from '../lib/data'
import { DEFAULT_REFERRERS } from '../lib/referrersData'

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
function ContactDetail({ contact, section, onBack, onSave, onDelete, rradarClients }) {
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({ ...contact })
  const [noteText, setNoteText] = useState('')

  const rradarClient = section === 'clients'
    ? rradarClients.find(c => c.name === contact._clientName)
    : null

  // client since = earliest settlement date across loans
  const clientSince = rradarClient
    ? rradarClient.loans.map(l => l.settled).filter(Boolean).sort()[0]
    : null

  function handleSave() {
    onSave({ ...form })
    setEditing(false)
  }

  function addNote() {
    if (!noteText.trim()) return
    const note = {
      id: newId(),
      date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      text: noteText.trim()
    }
    const updated = { ...contact, notes: [note, ...(contact.notes || [])] }
    onSave(updated)
    setNoteText('')
  }

  function deleteNote(noteId) {
    const updated = { ...contact, notes: (contact.notes || []).filter(n => n.id !== noteId) }
    onSave(updated)
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
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>
            {contact.name}
          </div>
          {/* connection info for clients */}
          {section === 'clients' && contact._clientName && (
            <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>
              {contact._clientName} Connection · #{contact._connNo}
            </div>
          )}
          {contact.company && <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>{contact.company}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {tierCfg && <Pill label={tierCfg.label} colour={tierCfg.colour} />}
            {contact.stream && <Pill label={contact.stream === 'Private Wealth' ? 'Private Wealth' : 'Commercial'} colour={contact.stream === 'Commercial' ? C.pinkBtn : C.navy} />}
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
          <button onClick={onDelete} style={{ padding: '7px 14px', borderRadius: 8,
            border: `1px solid #fecaca`, background: '#fff', fontWeight: 600, fontSize: 12,
            cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: '#dc2626' }}>
            Delete
          </button>
        </div>
      </div>

      <ContactActions email={contact.email} mobile={contact.mobile} />

      {/* info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
        <InfoTile label="Email" value={contact.email} />
        <InfoTile label="Mobile" value={contact.mobile} />
        {dobDisplay && <InfoTile label={`Date of Birth${ageVal ? ` (Age ${ageVal})` : ''}`} value={dobDisplay} highlight={bdayIn !== null} />}
        {clientSince && <InfoTile label="Client Since" value={(() => { try { return new Date(clientSince).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return clientSince } })()} />}
        <InfoTile label="Address" value={contact.address} />
        <InfoTile label="Company" value={contact.company} />
        <InfoTile label="Profession" value={contact.profession} />
        <InfoTile label="Industry" value={contact.industry} />
        <InfoTile label="Preferred Contact" value={contact.preferredContact} />
        <InfoTile label="Referred By" value={contact.referredBy} />
        <InfoTile label="Spouse / Partner" value={contact.spouseName} />
        {contact.linkedIn && <InfoTile label="LinkedIn" value={contact.linkedIn} />}
        {/* referrer-specific */}
        <InfoTile label="Tier" value={tierCfg?.label} />
        <InfoTile label="Type" value={contact.type} />
        <InfoTile label="Referral Count" value={contact.referralCount ? `${contact.referralCount} referrals` : null} />
        {/* lender-specific */}
        <InfoTile label="BDM Name" value={contact.bdmName} />
        <InfoTile label="BDM Email" value={contact.bdmEmail} />
        <InfoTile label="BDM Mobile" value={contact.bdmMobile} />
      </div>

      {/* linked referrers */}
      {section === 'clients' && contact.linkedReferrers?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
            letterSpacing: '0.05em', fontFamily: 'Montserrat,sans-serif', marginBottom: 8 }}>Referred By</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {contact.linkedReferrers.map(r => <Pill key={r} label={r} colour={C.navy} />)}
          </div>
        </div>
      )}

      {/* notes */}
      <div style={{ marginTop: 28 }}>
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
function ContactList({ contacts, section, onSelect, onOutreach, onAdd }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')

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
    if (filter) {
      list = list.filter(c => c.tier === filter || c.type === filter || c.stream === filter || c.profession === filter)
    }
    return list
  }, [contacts, search, filter])

  const filterOptions = section === 'referrers'
    ? [{ group: 'Tier', opts: REFERRER_TIERS.map(t => ({ value: t.id, label: t.label })) },
       { group: 'Type', opts: REFERRER_TYPES.map(t => ({ value: t, label: t })) }]
    : section === 'clients'
    ? [{ group: 'Stream', opts: ['Private Wealth','Commercial'].map(s => ({ value: s, label: s })) },
       { group: 'Profession', opts: PROFESSIONS.map(p => ({ value: p, label: p })) }]
    : []

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${section}…`}
          style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        {filterOptions.length > 0 && (
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            <option value="">All</option>
            {filterOptions.map(fg => (
              <optgroup key={fg.group} label={fg.group}>
                {fg.opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        {section !== 'clients' && (
          <button onClick={onAdd} style={{ padding: '9px 16px', borderRadius: 8, border: 'none',
            background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            + Add
          </button>
        )}
        <button onClick={() => onOutreach(filtered)} style={{ padding: '9px 16px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text, whiteSpace: 'nowrap' }}>
          ✉ Mass Outreach
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginBottom: 12 }}>
        {filtered.length} of {contacts.length} · {contacts.filter(c => c.unsubscribed).length} unsubscribed
      </div>

      {/* tier groups for referrers */}
      {section === 'referrers' && !filter && !search
        ? REFERRER_TIERS.map(tier => {
            const tc = filtered.filter(c => c.tier === tier.id)
            if (tc.length === 0) return null
            return (
              <div key={tier.id} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Pill label={`${tier.label} · ${tc.length}`} colour={tier.colour} />
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>{tier.desc}</span>
                </div>
                <ContactTable contacts={tc} section={section} onSelect={onSelect} />
              </div>
            )
          })
        : <ContactTable contacts={filtered} section={section} onSelect={onSelect} />
      }
    </div>
  )
}

function ContactTable({ contacts, section, onSelect }) {
  if (contacts.length === 0) {
    return <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', padding: '20px 0' }}>No contacts found.</div>
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {contacts.map((c, i) => {
        const tierCfg = REFERRER_TIERS.find(t => t.id === c.tier)
        const bdayIn  = upcomingBirthday(c.dob)
        return (
          <div key={c.id || c._id || i}
            onClick={() => onSelect(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
              cursor: 'pointer', background: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
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

  const rradarClients = useMemo(() => loadClients(), [])
  const [clientOverrides, setClientOverrides] = useState(() => loadStore(STORAGE_KEYS.clientOv))
  const [referrers, setReferrers] = useState(() => {
    const stored = loadStore(STORAGE_KEYS.referrers)
    if (stored.length > 0) return stored
    // Seed from imported list on first load
    saveStore(STORAGE_KEYS.referrers, DEFAULT_REFERRERS)
    return DEFAULT_REFERRERS
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
    const newContact = { ...addForm, id: newId(), notes: [] }
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
              onBack={() => setSelected(null)} onSave={handleSaveContact}
              onDelete={() => handleDeleteContact(selected)} />
          : <ContactList contacts={sectionContacts} section={section}
              onSelect={setSelected} onOutreach={setOutreach}
              onAdd={() => { setAddForm({}); setAdding(true) }} />
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
