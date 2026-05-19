import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle } from '../components/UI'

const TYPE_LABELS = { Ind: 'Individual', Co: 'Company', Tru: 'Trust', SMSF: 'SMSF', Part: 'Partnership' }

function fmtDOB(dob) {
  if (!dob) return '—'
  const d = new Date(dob)
  if (isNaN(d)) return dob
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()} (${age})`
}

function ContactCard({ contact, idx, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  function startEdit() { setDraft({...contact}); setEditing(true) }
  function cancel() { setEditing(false); setDraft(null) }
  function save() { onSave(idx, draft); setEditing(false); setDraft(null) }
  function set(k, v) { setDraft(d => ({...d, [k]: v})) }

  const c = editing ? draft : contact
  const fullName = c.type === 'Ind'
    ? [c.first, c.middle, c.last].filter(Boolean).join(' ')
    : c.first || '—'
  const isInd = c.type === 'Ind'

  const inp = { border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', fontSize: 11, width: '100%', background: '#fff', boxSizing: 'border-box' }
  const row = (label, value) => (
    <div style={{ display: 'flex', padding: '5px 0', borderBottom: '0.5px solid var(--border-light)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 110, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 400 }}>{value || '—'}</span>
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff', marginBottom: 12 }}>
      {/* Card header */}
      <div style={{ background: '#f8fafc', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: isInd ? 'var(--pk)' : '#3D5570', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
            {(c.first || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fullName}</div>
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: isInd ? '#fdf0f6' : '#eef1f5', color: isInd ? 'var(--pk)' : '#2A3D54', fontWeight: 500 }}>
              {TYPE_LABELS[c.type] || c.type}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!editing
            ? <button onClick={startEdit} style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--pk)', color: 'var(--pk)', background: 'transparent', cursor: 'pointer' }}>Edit</button>
            : <>
                <button onClick={save} style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#27ae60', color: '#fff', cursor: 'pointer' }}>Save</button>
                <button onClick={cancel} style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </>
          }
          <button onClick={() => { if (window.confirm('Remove this contact?')) onDelete(idx) }} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid #fde8e8', background: '#fde8e8', color: '#c0392b', cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 14px' }}>
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Type</label>
              <select style={inp} value={c.type} onChange={e => set('type', e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {isInd && <>
              <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>First name</label><input style={inp} value={c.first || ''} onChange={e => set('first', e.target.value)} /></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Middle name(s)</label><input style={inp} value={c.middle || ''} onChange={e => set('middle', e.target.value)} /></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Last name</label><input style={inp} value={c.last || ''} onChange={e => set('last', e.target.value)} /></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date of birth</label><input type="date" style={inp} value={c.dob || ''} onChange={e => set('dob', e.target.value)} /></div>
            </>}
            {!isInd && <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Entity name</label><input style={inp} value={c.first || ''} onChange={e => set('first', e.target.value)} /></div>}
            <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Email</label><input style={inp} value={c.email || ''} onChange={e => set('email', e.target.value)} /></div>
            <div><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Mobile</label><input style={inp} value={c.mobile || ''} onChange={e => set('mobile', e.target.value)} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Home address</label><input style={inp} value={c.homeAddress || ''} onChange={e => set('homeAddress', e.target.value)} /></div>
          </div>
        ) : (
          <div>
            {isInd && row('Date of birth', fmtDOB(c.dob))}
            {row('Email', c.email
              ? <a href={`mailto:${c.email}`} style={{ color: 'var(--pk)', textDecoration: 'none' }} title="Open in Outlook">{c.email} ✉</a>
              : null
            )}
            {row('Mobile', c.mobile
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <a href={`tel:${c.mobile.replace(/\s/g,'')}`} style={{ color: 'var(--pk)', textDecoration: 'none' }} title="Call via Phone Link">{c.mobile} 📞</a>
                  <a href={`sms:${c.mobile.replace(/\s/g,'')}`} style={{ background: '#eef1f5', borderRadius: 12, padding: '1px 8px', fontSize: 10, color: '#2A3D54', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }} title="SMS via Phone Link">💬 SMS</a>
                </span>
              : null
            )}
            {row('Home address', c.homeAddress)}
          </div>
        )}
      </div>
    </div>
  )
}

// Email template modal
const TEMPLATES = [
  {
    id: 'annual_review',
    label: 'Annual Review',
    subject: (name) => `Annual Review — ${name}`,
    body: (name, contacts) => {
      const first = contacts.filter(c => c.type === 'Ind' && c.first).map(c => c.first)[0] || name
      return `Hi ${first},\n\nI hope this message finds you well.\n\nAs part of our commitment to keeping your financial strategy on track, I'd like to schedule your annual review. This is a great opportunity for us to revisit your current lending arrangements, discuss any changes in your circumstances, and ensure your portfolio continues to work as hard as possible for you.\n\nWould you be available for a catch-up in the coming weeks? Please feel free to suggest a time that works for you, or I'm happy to arrange a time that suits.\n\nLooking forward to connecting.\n\nWarm regards,\nCameron Finlayson\nRion Capital`
    }
  },
  {
    id: 'fixed_expiry',
    label: 'Fixed Rate Expiry',
    subject: (name) => `Your Fixed Rate Expiry — Action Required — ${name}`,
    body: (name, contacts) => {
      const first = contacts.filter(c => c.type === 'Ind' && c.first).map(c => c.first)[0] || name
      return `Hi ${first},\n\nI'm reaching out as your fixed interest rate period is approaching its expiry date.\n\nAt the end of your fixed term, your loan will automatically revert to the standard variable rate, which may result in a change to your repayments. I'd like to connect with you to review your options before this happens — whether that's re-fixing, moving to variable, or splitting your loan.\n\nI'll be in touch shortly to arrange a time, but please don't hesitate to reach out if you'd like to discuss sooner.\n\nKind regards,\nCameron Finlayson\nRion Capital`
    }
  },
  {
    id: 'io_expiry',
    label: 'Interest Only Expiry',
    subject: (name) => `Interest Only Period Expiry — ${name}`,
    body: (name, contacts) => {
      const first = contacts.filter(c => c.type === 'Ind' && c.first).map(c => c.first)[0] || name
      return `Hi ${first},\n\nI wanted to flag that your interest only (IO) period is coming to an end.\n\nOnce your IO term expires, your loan will automatically switch to principal and interest repayments, which will increase your monthly repayments. I'd like to talk through your options with you — including the possibility of extending your IO term or restructuring your facility.\n\nPlease reach out at your earliest convenience so we can plan ahead and avoid any surprises.\n\nWarm regards,\nCameron Finlayson\nRion Capital`
    }
  },
  {
    id: 'general',
    label: 'General Enquiry',
    subject: (name) => `Following Up — ${name}`,
    body: (name, contacts) => {
      const first = contacts.filter(c => c.type === 'Ind' && c.first).map(c => c.first)[0] || name
      return `Hi ${first},\n\nI hope you're doing well. I wanted to follow up and see if there's anything I can help you with at this stage.\n\nPlease don't hesitate to reach out if you have any questions or would like to discuss your current arrangements.\n\nKind regards,\nCameron Finlayson\nRion Capital`
    }
  }
]

function EmailModal({ client, onClose }) {
  const [template, setTemplate] = useState(TEMPLATES[0])
  const [subject, setSubject] = useState(TEMPLATES[0].subject(client.name))
  const [body, setBody] = useState(TEMPLATES[0].body(client.name, client.contacts || []))

  function selectTemplate(t) {
    setTemplate(t)
    setSubject(t.subject(client.name))
    setBody(t.body(client.name, client.contacts || []))
  }

  const emails = (client.contacts || []).filter(c => c.email).map(c => c.email)
  const mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 620, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a2535' }}>Email {client.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9aa3ad' }}>×</button>
        </div>

        {/* Recipients */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {emails.length > 0
              ? emails.map(e => <span key={e} style={{ background: '#fdf0f6', color: 'var(--pk)', padding: '2px 10px', borderRadius: 20, fontSize: 11 }}>{e}</span>)
              : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No email addresses on file</span>
            }
          </div>
        </div>

        {/* Template picker */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Template</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 11, cursor: 'pointer', fontWeight: 500, background: template.id === t.id ? 'var(--pk)' : '#fff', color: template.id === t.id ? '#fff' : 'var(--text-secondary)', borderColor: template.id === t.id ? 'var(--pk)' : 'var(--border)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</div>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxSizing: 'border-box' }} />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message</div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <a href={emails.length ? mailto : '#'} onClick={emails.length ? undefined : e => e.preventDefault()}
            style={{ padding: '8px 20px', borderRadius: 7, background: emails.length ? 'var(--pk)' : '#ccc', color: '#fff', fontSize: 12, fontWeight: 600, cursor: emails.length ? 'pointer' : 'not-allowed', textDecoration: 'none', display: 'inline-block' }}>
            Open in Outlook ✉
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ContactPage({ clients, updateClient }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients.find(c => c.name === decodeURIComponent(name))
  const [showEmail, setShowEmail] = useState(false)

  if (!client) return <div style={{ padding: 24 }}>Client not found</div>

  const contacts = client.contacts || []

  function saveContact(idx, updated) {
    updateClient(client.name, c => ({
      ...c,
      contacts: c.contacts.map((ct, i) => i === idx ? updated : ct)
    }))
  }

  function deleteContact(idx) {
    updateClient(client.name, c => ({
      ...c,
      contacts: c.contacts.filter((_, i) => i !== idx)
    }))
  }

  function addContact() {
    updateClient(client.name, c => ({
      ...c,
      contacts: [...(c.contacts || []), { type: 'Ind', first: '', middle: '', last: '', email: '', mobile: '', dob: '', homeAddress: '' }]
    }))
  }

  const emails = contacts.filter(c => c.email).map(c => c.email)

  return (
    <div style={{ padding: '16px 24px', maxWidth: 900 }}>
      {/* Back */}
      <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)} style={{ background: 'none', border: 'none', color: 'var(--pk)', fontSize: 12, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
        ← Back to {client.name}
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{client.name} — Contacts</h2>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''} on file</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowEmail(true)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--pk)', color: 'var(--pk)', background: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ✉ Email all contacts
          </button>
          <button onClick={addContact} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--pk)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            + Add contact
          </button>
        </div>
      </div>

      {/* Contact cards */}
      {contacts.length > 0
        ? contacts.map((c, i) => (
            <ContactCard key={i} contact={c} idx={i} onSave={saveContact} onDelete={deleteContact} />
          ))
        : <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', border: '1px dashed var(--border)', borderRadius: 10, fontSize: 13 }}>
            No contacts on file. Click "+ Add contact" to get started.
          </div>
      }

      {showEmail && <EmailModal client={client} onClose={() => setShowEmail(false)} />}
    </div>
  )
}
