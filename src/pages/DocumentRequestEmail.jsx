import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals } from '../lib/deals'
import { loadSettings, getClientBroker, getEmailTemplateByType } from '../lib/settings'
import {
  emailHeader, emailFooter,
  buildChecklistHtml, buildChecklistText, renderTemplateSubject, renderTemplateBodyHtml,
  openInPreferredClient, escapeHtml,
} from '../lib/emailUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const inp = { width: '100%', fontSize: 11, padding: '5px 8px', border: '0.5px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#1e293b', boxSizing: 'border-box' }
const label = txt => <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>
const Section = ({ title, children }) => (
  <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #f1f5f9' }}>{title}</div>
    {children}
  </div>
)

const MODE_META = {
  rfi: { title: '📋 Request for Information', blurb: 'Initial email listing every item on the current checklist.' },
  outstanding: { title: '📋 Outstanding Documents', blurb: 'Follow-up email listing only the items still unticked.' },
}

export default function DocumentRequestEmail() {
  const { dealName, mode: rawMode } = useParams()
  const navigate = useNavigate()
  const mode = rawMode === 'outstanding' ? 'outstanding' : 'rfi'
  const meta = MODE_META[mode]

  const decodedName = decodeURIComponent(dealName)
  const [deals, setDealsState] = useState(() => loadDeals())
  const deal = deals.find(d => d['Transaction Name'] === decodedName)
  const settings = loadSettings()
  const template = getEmailTemplateByType(mode, settings)

  const assignedBroker = getClientBroker(undefined, settings)
  const [brokerName, setBrokerName] = useState(assignedBroker.name)
  const [brokerPhone, setBrokerPhone] = useState(assignedBroker.phone)
  const [brokerEmail, setBrokerEmail] = useState(assignedBroker.email)

  const contacts = deal?.Contacts || []
  const contactGreeting = () => {
    const individuals = contacts.filter(c => c.type === 'Individual' || !c.type)
    const names = individuals.map(c => c.firstName || c.name || '').filter(Boolean)
    return names.length ? names.join(' & ') : (deal?.['Transaction Name'] || '')
  }
  const clientNameForTokens = contactGreeting()

  const defaultRecipients = contacts.filter(c => c.email).map(c => ({ name: c.name || '', email: c.email }))
  const [recipients, setRecipients] = useState(defaultRecipients)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const addRecipient = () => {
    if (!addEmail) return
    setRecipients(r => [...r, { name: addName, email: addEmail }])
    setAddName(''); setAddEmail('')
  }
  const removeRecipient = i => setRecipients(r => r.filter((_, j) => j !== i))

  const [subject, setSubject] = useState(() => renderTemplateSubject(template?.subject, clientNameForTokens))
  const [keyPoints, setKeyPoints] = useState([])
  const [newKeyPoint, setNewKeyPoint] = useState('')
  const addKeyPoint = () => { if (!newKeyPoint.trim()) return; setKeyPoints(k => [...k, newKeyPoint.trim()]); setNewKeyPoint('') }
  const removeKeyPoint = i => setKeyPoints(k => k.filter((_, j) => j !== i))

  const [sending, setSending] = useState(null)
  const [sendError, setSendError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  function logEmailNote(templateLabel, recipientList, methodLabel) {
    if (!deal) return
    const note = {
      type: 'Email Out',
      title: templateLabel,
      body: `To: ${recipientList}. Method: ${methodLabel}.`,
      date: new Date().toISOString().slice(0, 10),
      user: deal.Advisor || brokerName || 'Cameron Finlayson',
    }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _fileNotes: [note, ...(x._fileNotes || [])] } : x)
    setDealsState(updated)
    saveDeals(updated)
  }

  const sections = deal?._attachments?.sections || null
  const onlyOutstanding = mode === 'outstanding'

  function keyPointsHtml() {
    if (!keyPoints.length) return ''
    return `
      <div style="margin:16px 0">
        <div style="font-size:13px;color:#2A3545;margin:0 0 8px">Following our discussion, I have summarised the key points:</div>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#2A3545">
          ${keyPoints.map(k => `<li style="margin-bottom:6px;line-height:1.5">${escapeHtml(k)}</li>`).join('')}
        </ul>
      </div>`
  }

  function buildHtml() {
    if (!sections) return ''
    const checklistHtml = buildChecklistHtml(sections, { onlyOutstanding })
    const body = renderTemplateBodyHtml(template?.body, {
      CLIENT_NAME: clientNameForTokens,
      CHECKLIST: checklistHtml,
      KEY_POINTS_BLOCK: keyPointsHtml(),
    })
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(contactGreeting())}
        ${body}
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  function buildPlainText() {
    if (!sections) return ''
    return buildChecklistText(sections, { onlyOutstanding })
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const templateLabel = template?.name || (mode === 'outstanding' ? 'Outstanding Documents' : 'Request for Information')
    const html = buildHtml()
    setSending('sending'); setSendError(''); setStatusMsg('')
    try {
      const result = await openInPreferredClient({
        to, subject, html, plainText: buildPlainText(),
        emailClient: settings.emailClient,
      })
      setSending('sent')
      setStatusMsg(result.label)
      logEmailNote(templateLabel, to, result.label)
      setTimeout(() => { setSending(null); setStatusMsg('') }, 5000)
    } catch (err) {
      setSendError(err.message || 'Something went wrong'); setSending('error')
    }
  }

  async function sendVia(client) {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const templateLabel = template?.name || (mode === 'outstanding' ? 'Outstanding Documents' : 'Request for Information')
    const html = buildHtml()
    const result = await openInPreferredClient({ to, subject, html, plainText: buildPlainText(), emailClient: client })
    setStatusMsg(result.label)
    logEmailNote(templateLabel, to, result.label)
    setTimeout(() => setStatusMsg(''), 5000)
  }

  if (!deal) return <div style={{ padding: 32, color: '#c0392b' }}>Deal not found.</div>

  if (!sections) {
    return (
      <div style={{ padding: 32 }}>
        <button onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>
          ← Back to {deal['Transaction Name']}
        </button>
        <div style={{ color: '#c0392b', fontSize: 13 }}>
          This deal doesn't have an Attachments checklist yet — open its Attachments tab first, then come back here.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Left: Inputs */}
      <div style={{ overflowY: 'auto', padding: 16, background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back to {deal['Transaction Name']}
        </button>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{meta.title}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{deal['Transaction Name']}</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{meta.blurb}</div>
        </div>

        <Section title="Recipients">
          {recipients.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: 'rgba(235,153,194,0.1)', borderRadius: 6, border: '0.5px solid #EB99C2', color: '#334155' }}>
                {r.name} · <span style={{ color: '#64748b' }}>{r.email}</span>
              </div>
              <button onClick={() => removeRecipient(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          {recipients.length === 0 && <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 6 }}>No contact emails on file — add one below.</div>}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Name" value={addName} onChange={e => setAddName(e.target.value)} />
            <input style={{ ...inp, flex: 2 }} placeholder="email@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRecipient()} />
            <button onClick={addRecipient} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
          </div>
        </Section>

        <Section title="Subject">
          <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} />
        </Section>

        <Section title="Broker details">
          <div style={{ marginBottom: 8 }}>
            {label('Broker name')}
            <input style={inp} value={brokerName} onChange={e => setBrokerName(e.target.value)} placeholder="Cameron Finlayson" />
          </div>
          <div style={{ marginBottom: 8 }}>
            {label('Broker phone')}
            <input style={inp} value={brokerPhone} onChange={e => setBrokerPhone(e.target.value)} placeholder="0400 000 000" />
          </div>
          <div>
            {label('Broker email')}
            <input style={inp} type="email" value={brokerEmail} onChange={e => setBrokerEmail(e.target.value)} placeholder="broker@rion-capital.com.au" />
          </div>
        </Section>

        <Section title="Key points (optional)">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>Add any ad hoc points from your conversation with the client — shown as a bullet list before the closing paragraph.</div>
          {keyPoints.map((k, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, padding: '4px 8px', background: '#f8fafc', borderRadius: 5, border: '0.5px solid #e2e8f0' }}>
              <span style={{ fontSize: 11, flex: 1 }}>{k}</span>
              <button onClick={() => removeKeyPoint(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="e.g. Settlement targeted for end of month" value={newKeyPoint}
              onChange={e => setNewKeyPoint(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyPoint()} />
            <button onClick={addKeyPoint} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
          </div>
        </Section>

        {/* Send controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={handleSend} disabled={sending === 'sending'}
            style={{ padding: '10px', borderRadius: 8, border: 'none', background: sending === 'sent' ? '#22c55e' : PINK, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {sending === 'sending' ? '⏳ Working…' : sending === 'sent' ? '✓ Done!' : `📤 Send (${settings.emailClient === 'gmail' ? 'Gmail' : settings.emailClient === 'other' ? 'Copy' : 'Outlook'})`}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => sendVia('outlook')} style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>📎 Outlook</button>
            <button onClick={() => sendVia('gmail')} style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>✉ Gmail</button>
            <button onClick={() => sendVia('other')} style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>📋 Copy</button>
          </div>
          {statusMsg && <div style={{ fontSize: 11, color: '#1a7a45', marginTop: 4 }}>{statusMsg}</div>}
          {sendError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{sendError}</div>}
          <div style={{ fontSize: 9.5, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
            Default delivery app is set in Settings &gt; CRM &gt; Communication. Template content is also editable there.
          </div>
        </div>
      </div>

      {/* Right: Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{meta.title} — Live Preview</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f1f5f9' }}>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <iframe srcDoc={buildHtml()} style={{ width: '100%', height: 700, border: 'none' }} title="preview" />
          </div>
        </div>
      </div>

    </div>
  )
}
