import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadClients } from '../lib/data'

// ── colours ──────────────────────────────────────────────────────────────────
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

// ── tier config ───────────────────────────────────────────────────────────────
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

const STORAGE_KEYS = {
  referrers: 'rion-marketing-referrers',
  lenders:   'rion-marketing-lenders',
  others:    'rion-marketing-others',
}

// ── helpers ───────────────────────────────────────────────────────────────────
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

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const bg = avatarColour(name)
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, fontFamily: 'Montserrat,sans-serif' }}>
      {initials(name)}
    </div>
  )
}

// ── Pill ──────────────────────────────────────────────────────────────────────
function Pill({ label, colour }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      background: colour + '22', color: colour, fontSize: 11, fontWeight: 700,
      border: `1px solid ${colour}44`, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,42,58,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 540,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 20, color: C.slate, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Form helpers ──────────────────────────────────────────────────────────────
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

// ── Note entry ────────────────────────────────────────────────────────────────
function NoteEntry({ note }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.pink}`, paddingLeft: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginBottom: 3 }}>{note.date}</div>
      <div style={{ fontSize: 13, color: C.text, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'pre-wrap' }}>{note.text}</div>
    </div>
  )
}

// ── Contact actions bar ───────────────────────────────────────────────────────
function ContactActions({ email, mobile, name }) {
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

// ── Mass outreach modal ───────────────────────────────────────────────────────
function OutreachModal({ contacts, groupLabel, onClose }) {
  const [subject, setSubject] = useState(`Message from Cameron – Rion Capital`)
  const [body, setBody]       = useState('')
  const [copied, setCopied]   = useState(false)

  const emails = contacts.map(c => c.email).filter(Boolean)

  function copyEmails() {
    navigator.clipboard.writeText(emails.join('; ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function openOutlook() {
    const to  = emails.join(';')
    const sub = encodeURIComponent(subject)
    const bod = encodeURIComponent(body)
    window.location.href = `mailto:${to}?subject=${sub}&body=${bod}`
  }

  return (
    <Modal title={`Mass Outreach — ${groupLabel}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#F0F4FA', borderRadius: 8,
        fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
        {emails.length} recipient{emails.length !== 1 ? 's' : ''} with email addresses
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
      <div style={{ marginTop: 16, fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>
        <strong>Email list:</strong><br />
        <div style={{ marginTop: 6, padding: '8px 10px', background: '#F9FAFB', borderRadius: 6,
          border: `1px solid ${C.border}`, fontSize: 11, wordBreak: 'break-all' }}>
          {emails.join('; ') || 'No email addresses found'}
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function ContactDetail({ contact, section, onBack, onSave, onDelete, clients }) {
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({ ...contact })
  const [noteText, setNoteText] = useState('')

  // For clients, find the Rradar client object
  const rradarClient = section === 'clients'
    ? clients.find(c => c.name === contact._clientName)
    : null

  function handleSave() {
    onSave({ ...form, notes: contact.notes || [] })
    setEditing(false)
  }

  function addNote() {
    if (!noteText.trim()) return
    const note = { id: newId(), date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }), text: noteText.trim() }
    const updated = { ...contact, notes: [note, ...(contact.notes || [])] }
    onSave(updated)
    setNoteText('')
  }

  const tierCfg = REFERRER_TIERS.find(t => t.id === contact.tier)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      {/* back */}
      <button onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer',
        color: C.navy, fontWeight: 600, fontSize: 13, fontFamily: 'Montserrat,sans-serif',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back
      </button>

      {/* header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
        <Avatar name={form.name || contact.name} size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif' }}>
            {contact.name}
          </div>
          {contact.company && <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 2 }}>{contact.company}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {tierCfg && <Pill label={tierCfg.label} colour={tierCfg.colour} />}
            {contact.type && <Pill label={contact.type} colour={C.navy} />}
            {contact.stream && <Pill label={contact.stream} colour={C.navy} />}
            {contact.profession && <Pill label={contact.profession} colour={C.slate} />}
            {contact.industry && <Pill label={contact.industry} colour={C.slate} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {rradarClient && (
            <a href={`/radar/clients/${rradarClient.name}`}
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

      {/* actions */}
      <ContactActions email={contact.email} mobile={contact.mobile} name={contact.name} />

      {/* info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
        {[
          ['Email',   contact.email   || '—'],
          ['Mobile',  contact.mobile  || '—'],
          ['Company', contact.company || '—'],
          ['Address', contact.address || '—'],
          ['Tier',    tierCfg?.label  || '—'],
          ['Type',    contact.type    || '—'],
          ['Referral Count', contact.referralCount || '—'],
          ['Referred By', contact.referredBy || '—'],
          ['Profession', contact.profession || '—'],
          ['Industry', contact.industry || '—'],
        ].filter(([, v]) => v && v !== '—').map(([k, v]) => (
          <div key={k} style={{ padding: '10px 14px', background: '#F9FAFB', borderRadius: 8,
            border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, fontFamily: 'Montserrat,sans-serif', marginBottom: 3, textTransform: 'uppercase' }}>{k}</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: 'Montserrat,sans-serif', wordBreak: 'break-all' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* linked referrer (for clients) */}
      {section === 'clients' && contact.linkedReferrers?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif', marginBottom: 10 }}>Linked Referral Partners</div>
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
            style={{ ...inputStyle, flex: 1, resize: 'none', height: 60 }} />
          <button onClick={addNote} style={{ padding: '0 18px', borderRadius: 8, border: 'none',
            background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
            Add
          </button>
        </div>
        {(contact.notes || []).length === 0
          ? <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>No notes yet.</div>
          : (contact.notes || []).map(n => <NoteEntry key={n.id} note={n} />)
        }
      </div>

      {/* edit modal */}
      {editing && (
        <EditContactModal
          contact={form}
          section={section}
          onChange={setForm}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT MODAL (shared for add/edit)
// ═══════════════════════════════════════════════════════════════════════════════
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
          <Input label="Referred By" value={f.referredBy || ''} onChange={e => set('referredBy', e.target.value)} />
        </>
      )}

      {section === 'referrers' && (
        <>
          <Select label="Type" options={REFERRER_TYPES} value={f.type || ''} onChange={e => set('type', e.target.value)} />
          <Select label="Tier" options={REFERRER_TIERS.map(t => t.id)} value={f.tier || ''} onChange={e => set('tier', e.target.value)} />
          <Input label="Referral Count (all time)" value={f.referralCount || ''} onChange={e => set('referralCount', e.target.value)} />
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

      <Textarea label="Notes (optional)" value={f.notesDraft || ''} onChange={e => set('notesDraft', e.target.value)} />

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onSave}
          disabled={!f.name?.trim()}
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT LIST (clients, referrers, lenders, others)
// ═══════════════════════════════════════════════════════════════════════════════
function ContactList({ contacts, section, onSelect, onOutreach, onAdd, filterExtra }) {
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
        (c.type || '').toLowerCase().includes(q)
      )
    }
    if (filter) {
      list = list.filter(c => c.tier === filter || c.type === filter || c.stream === filter || c.profession === filter || c.industry === filter)
    }
    return list
  }, [contacts, search, filter])

  // filter options based on section
  const filterOptions = section === 'referrers'
    ? [{ group: 'Tier', opts: REFERRER_TIERS.map(t => ({ value: t.id, label: t.label })) },
       { group: 'Type', opts: REFERRER_TYPES.map(t => ({ value: t, label: t })) }]
    : section === 'clients'
    ? [{ group: 'Stream', opts: ['Private Wealth','Commercial'].map(s => ({ value: s, label: s })) },
       { group: 'Profession', opts: PROFESSIONS.map(p => ({ value: p, label: p })) }]
    : []

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      {/* toolbar */}
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
        <button onClick={onAdd} style={{ padding: '9px 16px', borderRadius: 8, border: 'none',
          background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
          + Add
        </button>
        <button onClick={() => onOutreach(filtered)} style={{ padding: '9px 16px', borderRadius: 8,
          border: `1px solid ${C.border}`, background: '#fff', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', color: C.text, whiteSpace: 'nowrap' }}>
          ✉ Mass Outreach
        </button>
      </div>

      {/* count */}
      <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginBottom: 12 }}>
        {filtered.length} of {contacts.length} contacts
      </div>

      {/* tier groups for referrers */}
      {section === 'referrers' && !filter && !search
        ? REFERRER_TIERS.map(tier => {
            const tierContacts = filtered.filter(c => c.tier === tier.id)
            if (tierContacts.length === 0) return null
            return (
              <div key={tier.id} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Pill label={`${tier.label} · ${tierContacts.length}`} colour={tier.colour} />
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif' }}>{tier.desc}</span>
                </div>
                <ContactTable contacts={tierContacts} section={section} onSelect={onSelect} />
              </div>
            )
          })
        : <ContactTable contacts={filtered} section={section} onSelect={onSelect} />
      }
    </div>
  )
}

// ── table ─────────────────────────────────────────────────────────────────────
function ContactTable({ contacts, section, onSelect }) {
  if (contacts.length === 0) {
    return <div style={{ fontSize: 13, color: C.muted, fontFamily: 'Montserrat,sans-serif', padding: '20px 0' }}>No contacts found.</div>
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      {contacts.map((c, i) => {
        const tierCfg = REFERRER_TIERS.find(t => t.id === c.tier)
        return (
          <div key={c.id || c._id || i}
            onClick={() => onSelect(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
              cursor: 'pointer', transition: 'background 0.15s',
              background: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            <Avatar name={c.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: 'Montserrat,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', marginTop: 1 }}>{c.company || c.type || c.stream || ''}</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Montserrat,sans-serif', textAlign: 'right', flexShrink: 0 }}>
              {c.email && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{c.email}</div>}
              {c.mobile && <div>{c.mobile}</div>}
            </div>
            {tierCfg && <Pill label={tierCfg.label} colour={tierCfg.colour} />}
            {section === 'clients' && c.stream && <Pill label={c.stream === 'Private Wealth' ? 'PW' : 'Comm'} colour={c.stream === 'Commercial' ? C.pinkBtn : C.navy} />}
            {(c.notes || []).length > 0 && (
              <span style={{ fontSize: 11, color: C.slate, fontFamily: 'Montserrat,sans-serif' }}>{c.notes.length} note{c.notes.length !== 1 ? 's' : ''}</span>
            )}
            <span style={{ color: C.slate, fontSize: 16 }}>›</span>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MARKETING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Marketing() {
  const navigate = useNavigate()

  // raw rradar clients → flatten to marketing contacts
  const rradarClients = useMemo(() => loadClients(), [])
  const [clientOverrides, setClientOverrides] = useState(() => loadStore('rion-marketing-clients'))
  const [referrers, setReferrers] = useState(() => loadStore(STORAGE_KEYS.referrers))
  const [lenders,   setLenders]   = useState(() => loadStore(STORAGE_KEYS.lenders))
  const [others,    setOthers]    = useState(() => loadStore(STORAGE_KEYS.others))

  const [section,  setSection]  = useState('clients')   // clients | referrers | lenders | others
  const [selected, setSelected] = useState(null)        // contact in detail view
  const [outreach, setOutreach] = useState(null)        // contacts array for outreach modal
  const [adding,   setAdding]   = useState(false)
  const [addForm,  setAddForm]  = useState({})

  // Build client list from Rradar data + per-client overrides
  const clients = useMemo(() => {
    return rradarClients.flatMap(rc => {
      const individuals = (rc.contacts || []).filter(ct => ct.type === 'Ind' && (ct.first || ct.last))
      if (individuals.length === 0) return []
      return individuals.map(ct => {
        const ovKey = `${rc.name}__${ct.first}_${ct.last}`
        const ov = clientOverrides.find(o => o._ovKey === ovKey) || {}
        return {
          _id: ovKey,
          _clientName: rc.name,
          _ovKey: ovKey,
          id: ovKey,
          name: [ct.first, ct.last].filter(Boolean).join(' '),
          email: ct.email || '',
          mobile: ct.mobile || '',
          company: '',
          address: ct.homeAddress || '',
          stream: rc.stream,
          notes: ov.notes || [],
          profession: ov.profession || '',
          industry: ov.industry || '',
          referredBy: ov.referredBy || '',
          linkedReferrers: ov.linkedReferrers || [],
          ...ov,
        }
      })
    })
  }, [rradarClients, clientOverrides])

  function saveClientOv(updated) {
    const next = clientOverrides.filter(o => o._ovKey !== updated._ovKey)
    next.push(updated)
    setClientOverrides(next)
    saveStore('rion-marketing-clients', next)
  }

  function saveList(section, fn) {
    if (section === 'referrers') { const n = fn(referrers); setReferrers(n); saveStore(STORAGE_KEYS.referrers, n) }
    if (section === 'lenders')   { const n = fn(lenders);   setLenders(n);   saveStore(STORAGE_KEYS.lenders, n) }
    if (section === 'others')    { const n = fn(others);    setOthers(n);    saveStore(STORAGE_KEYS.others, n) }
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
    { id: 'clients',   label: 'Clients',          count: clients.length,   emoji: '👥' },
    { id: 'referrers', label: 'Referral Partners', count: referrers.length, emoji: '🤝' },
    { id: 'lenders',   label: 'Lenders',           count: lenders.length,   emoji: '🏦' },
    { id: 'others',    label: 'Others',             count: others.length,    emoji: '📋' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Montserrat,sans-serif', background: C.bg }}>
      {/* ── left sidebar ── */}
      <div style={{ width: 230, background: C.navy, display: 'flex', flexDirection: 'column',
        boxShadow: '2px 0 12px rgba(0,0,0,0.12)', flexShrink: 0 }}>
        {/* header */}
        <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => navigate('/')}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Montserrat,sans-serif',
              marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Home
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>Marketing</div>
          <div style={{ fontSize: 11, color: C.pink, marginTop: 2 }}>Rion Capital</div>
        </div>

        {/* nav */}
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
                fontFamily: 'Montserrat,sans-serif' }}>
                {item.label}
              </span>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
                borderRadius: 10, padding: '2px 7px', fontFamily: 'Montserrat,sans-serif' }}>
                {item.count}
              </span>
            </button>
          ))}
        </nav>

        {/* tier legend for referrers */}
        {section === 'referrers' && (
          <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Tiers</div>
            {REFERRER_TIERS.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.colour, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'Montserrat,sans-serif' }}>{t.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* top bar */}
        <div style={{ padding: '18px 32px', background: '#fff', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{sectionLabel[section]}</div>
            {section === 'referrers' && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Gold: {referrers.filter(r => r.tier === 'gold').length} · Silver: {referrers.filter(r => r.tier === 'silver').length} · Bronze: {referrers.filter(r => r.tier === 'bronze').length} · Contenders: {referrers.filter(r => r.tier === 'contenders').length}
              </div>
            )}
          </div>
        </div>

        {/* detail or list */}
        {selected
          ? <ContactDetail
              contact={selected}
              section={section}
              clients={rradarClients}
              onBack={() => setSelected(null)}
              onSave={handleSaveContact}
              onDelete={() => handleDeleteContact(selected)}
            />
          : <ContactList
              contacts={sectionContacts}
              section={section}
              onSelect={setSelected}
              onOutreach={setOutreach}
              onAdd={() => { setAddForm({}); setAdding(true) }}
            />
        }
      </div>

      {/* add modal */}
      {adding && (
        <EditContactModal
          contact={addForm}
          section={section}
          onChange={setAddForm}
          onSave={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}

      {/* outreach modal */}
      {outreach && (
        <OutreachModal
          contacts={outreach}
          groupLabel={`${sectionLabel[section]} (${outreach.length})`}
          onClose={() => setOutreach(null)}
        />
      )}
    </div>
  )
}
