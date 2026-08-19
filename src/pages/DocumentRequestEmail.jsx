import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals } from '../lib/deals'
import { loadClients } from '../lib/data'
import { loadSettings, getClientBroker } from '../lib/settings'
import { findLinkedClient } from './DealPage'
import {
  buildChecklistHtml, buildChecklistText, renderTemplateSubject, renderTemplateBodyHtml,
  openInPreferredClient, escapeHtml, EMAIL_FONT_CSS,
} from '../lib/emailUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const inp = { width: '100%', fontSize: 11, padding: '5px 8px', border: '0.5px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#1e293b', boxSizing: 'border-box' }
const Section = ({ title, children }) => (
  <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #f1f5f9' }}>{title}</div>
    {children}
  </div>
)

// A contact counts as an individual whether it came from the deal's own
// (mapped) Contacts — where the type is spelled out, 'Individual' — or from
// an older linked deal that's still reading live off the Rradar client's
// raw contacts, where the type is Rradar's own short code, 'Ind'. Matching
// on a case-insensitive "starts with ind" catches both, so recipients and
// the greeting resolve correctly either way.
const isIndividual = c => !c.type || /^ind/i.test(c.type)

export default function DocumentRequestEmail() {
  const { dealName, templateId } = useParams()
  const navigate = useNavigate()

  const decodedName = decodeURIComponent(dealName)
  const [deals, setDealsState] = useState(() => loadDeals())
  const deal = deals.find(d => d['Transaction Name'] === decodedName)
  const [clients] = useState(() => loadClients())
  const settings = loadSettings()
  const template = (settings.emailTemplates || []).find(t => t.id === templateId)
  const onlyOutstanding = template?.type === 'outstanding'
  const assignedBroker = getClientBroker(undefined, settings)

  // Same fallback DealPage.jsx's own Contacts tab uses: the deal's own copy
  // of its contacts if it has one, otherwise a live read of the linked
  // Rradar client's contacts (for older deals linked before contacts were
  // copied across onto the deal itself).
  const linkedClient = deal ? findLinkedClient(deal, clients) : null
  const rawContacts = deal?.Contacts?.length
    ? deal.Contacts
    : (linkedClient?.contacts || []).map(c => ({
        name: [c.first, c.middle, c.last].filter(Boolean).join(' ') || c.first || '',
        type: c.type || 'Individual',
        email: c.email || '',
        mobile: c.mobile || '',
        firstName: c.first || '',
      }))

  // Greet and address the email to the individuals on the deal (not the
  // linked companies/trusts/SMSFs) — e.g. "Hi Raymond & Jessica," even
  // though the deal itself may have half a dozen entity contacts attached.
  const individualContacts = rawContacts.filter(isIndividual)
  const contactGreeting = () => {
    const names = individualContacts.map(c => c.firstName || c.name || '').filter(Boolean)
    return names.length ? names.join(' & ') : (deal?.['Transaction Name'] || '')
  }
  const clientNameForTokens = contactGreeting()

  const defaultRecipients = individualContacts.filter(c => c.email).map(c => ({ name: c.name || '', email: c.email }))
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

  const sections = deal?._attachments?.sections || null

  // A plain-text rendition of the actual email that went out — resolves the
  // same placeholders buildHtml() does, so the file note shows what was
  // really sent rather than just a one-line "email sent" summary.
  function buildEmailNotePlainText() {
    if (!sections || !template) return ''
    const checklistText = buildChecklistText(sections, { onlyOutstanding })
    const keyPointsText = keyPoints.length
      ? `Following our discussion, I have summarised the key points:\n${keyPoints.map(k => `  - ${k}`).join('\n')}`
      : ''
    const bodyText = (template.body || '')
      .replace(/\{\{CLIENT_NAME\}\}/g, clientNameForTokens)
      .replace(/\{\{CHECKLIST\}\}/g, checklistText)
      .replace(/\{\{KEY_POINTS_BLOCK\}\}/g, keyPointsText)
      .replace(/\n{3,}/g, '\n\n')
    return `Hi ${clientNameForTokens},\n\n${bodyText}`
  }

  function logEmailNote(templateLabel, recipientList, methodLabel) {
    if (!deal) return
    const note = {
      type: 'Email Out',
      title: templateLabel,
      body: `To: ${recipientList} · Method: ${methodLabel}\n\n${buildEmailNotePlainText()}`,
      date: new Date().toISOString().slice(0, 10),
      user: deal.Advisor || assignedBroker.name || 'Cameron Finlayson',
    }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _fileNotes: [note, ...(x._fileNotes || [])] } : x)
    setDealsState(updated)
    saveDeals(updated)
  }

  function keyPointsHtml() {
    if (!keyPoints.length) return ''
    return `
      <div style="margin:14px 0">
        <div style="${EMAIL_FONT_CSS}margin:0 0 6px">Following our discussion, I have summarised the key points:</div>
        <ul style="margin:4px 0 0;padding-left:20px">
          ${keyPoints.map(k => `<li style="${EMAIL_FONT_CSS}margin-bottom:6px">${escapeHtml(k)}</li>`).join('')}
        </ul>
      </div>`
  }

  // Deliberately plain — Aptos 10pt, uniform throughout (only section
  // headings are bold), no logo/header bar/footer, no "Kind regards" sign-
  // off. Cameron wants this to read as a personal email he typed himself
  // in Outlook, with Outlook's own default signature filling in the
  // sign-off underneath (that branded/corporate treatment stays on the
  // Annual/Security Review emails instead).
  function buildHtml() {
    if (!sections || !template) return ''
    const checklistHtml = buildChecklistHtml(sections, { onlyOutstanding })
    const body = renderTemplateBodyHtml(template.body, {
      CLIENT_NAME: clientNameForTokens,
      CHECKLIST: checklistHtml,
      KEY_POINTS_BLOCK: keyPointsHtml(),
    })
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="${EMAIL_FONT_CSS}margin:0;padding:0;color:#1a1a1a;line-height:1.5">
      <div style="${EMAIL_FONT_CSS}max-width:640px">
        <p style="${EMAIL_FONT_CSS}margin:0 0 14px">Hi ${escapeHtml(clientNameForTokens)},</p>
        ${body}
      </div></body></html>`
  }

  function buildPlainText() {
    if (!sections) return ''
    return buildChecklistText(sections, { onlyOutstanding })
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const templateLabel = template?.name || 'Document Request'
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
    const templateLabel = template?.name || 'Document Request'
    const html = buildHtml()
    const result = await openInPreferredClient({ to, subject, html, plainText: buildPlainText(), emailClient: client })
    setStatusMsg(result.label)
    logEmailNote(templateLabel, to, result.label)
    setTimeout(() => setStatusMsg(''), 5000)
  }

  if (!deal) return <div style={{ padding: 32, color: '#c0392b' }}>Deal not found.</div>

  if (!template) {
    return (
      <div style={{ padding: 32 }}>
        <button onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>
          ← Back to {deal['Transaction Name']}
        </button>
        <div style={{ color: '#c0392b', fontSize: 13 }}>
          Couldn't find that email template — it may have been deleted in Settings &gt; CRM &gt; Communication.
        </div>
      </div>
    )
  }

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
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>✉ {template.name}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{deal['Transaction Name']}</div>
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

        <Section title="Key points (optional)">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>Add any ad hoc points from your conversation with the client — shown as a bullet list before the checklist.</div>
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
            Outlook opens as a new message — your own default signature fills in the sign-off underneath. Default delivery app and template content are set in Settings &gt; CRM &gt; Communication.
          </div>
        </div>
      </div>

      {/* Right: Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{template.name} — Live Preview</div>
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
