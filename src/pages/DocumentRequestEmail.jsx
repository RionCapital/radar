import React, { useState, useRef } from 'react'
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

  // Which documents (from Settings > CRM > Communication > Email
  // attachments) go out with this specific email — seeded from the
  // template's own defaults, but freely adjustable per send without
  // changing those defaults.
  const availableAttachments = settings.emailAttachments || []
  const [attachmentIds, setAttachmentIds] = useState(() => template?.attachmentIds || [])
  const [libraryPick, setLibraryPick] = useState('')
  const addLibraryAttachment = () => {
    if (!libraryPick) return
    setAttachmentIds(ids => ids.includes(libraryPick) ? ids : [...ids, libraryPick])
    setLibraryPick('')
  }
  const removeLibraryAttachment = id => setAttachmentIds(ids => ids.filter(x => x !== id))

  // One-off attachments picked straight from Cameron's computer for THIS
  // email only — never saved to Settings' shared library. Read client-side
  // as base64 via FileReader, same shape emailUtils.js's downloadEml()
  // expects, so they slot in alongside the library attachments untouched.
  const [manualAttachments, setManualAttachments] = useState([])
  const handleManualFile = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',')[1] || ''
      setManualAttachments(list => [...list, { name: file.name, fileName: file.name, mimeType: file.type || 'application/octet-stream', content: base64 }])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  const removeManualAttachment = i => setManualAttachments(list => list.filter((_, j) => j !== i))

  const attachmentsToSend = [
    ...attachmentIds.map(id => availableAttachments.find(a => a.id === id)).filter(Boolean).map(a => ({ filename: a.fileName, content: a.content })),
    ...manualAttachments.map(a => ({ filename: a.fileName, content: a.content })),
  ]

  const [sending, setSending] = useState(null)
  const [sendError, setSendError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const sections = deal?._attachments?.sections || null

  // The live preview (right-hand panel) is an editable iframe rather than a
  // read-only render — Cameron wants to be able to tweak the actual wording
  // in place before sending, not just via the Key points field. `dirty`
  // tracks whether he's touched it: while false, the preview keeps
  // regenerating live from the template/checklist/key points as before;
  // once he types in the box, we stop overwriting it so his edits survive
  // further changes to the inputs on the left, until he explicitly resets.
  const previewRef = useRef(null)
  const [dirty, setDirty] = useState(false)
  // Frozen snapshot of the preview's HTML, captured once at the moment of
  // the FIRST edit and never touched again — deliberately a ref, not state,
  // so it doesn't feed back into the srcDoc prop on every keystroke. If it
  // did, each keystroke would change srcDoc's string value, React would
  // push that to the iframe's srcdoc attribute, and the browser would
  // reload the whole document — wiping the cursor/selection after every
  // single character. Freezing once means srcDoc stops changing at all
  // once dirty, so the iframe is left alone and typing behaves normally.
  const frozenRef = useRef(null)

  // Reads whatever is CURRENTLY in the preview box — including any manual
  // edits — so what gets sent (and what gets logged to the file note) is
  // always exactly what Cameron last saw on screen, not a freshly
  // regenerated version that could silently differ from his edits.
  function readPreviewContent() {
    const doc = previewRef.current?.contentDocument
    if (doc && doc.documentElement) {
      return { html: doc.documentElement.outerHTML, text: doc.body?.innerText || doc.body?.textContent || '' }
    }
    return { html: buildHtml(), text: '' }
  }

  function resetPreview() {
    setDirty(false)
    frozenRef.current = null
  }

  function logEmailNote(templateLabel, recipientList, methodLabel, sentText) {
    if (!deal) return
    const note = {
      type: 'Email Out',
      title: templateLabel,
      body: `To: ${recipientList} · Method: ${methodLabel}\n\n${sentText || ''}`,
      date: new Date().toISOString().slice(0, 10),
      user: deal.Advisor || assignedBroker.name || 'Cameron Finlayson',
    }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _fileNotes: [note, ...(x._fileNotes || [])] } : x)
    setDealsState(updated)
    saveDeals(updated)
  }

  // <div>, not <p> — see the comment on renderChecklistEntry in
  // emailUtils.js: Outlook's auto-signature splices in right after the
  // first <p> anywhere in the body, so nothing in this email uses <p>.
  function keyPointsHtml() {
    if (!keyPoints.length) return ''
    return `<div style="${EMAIL_FONT_CSS}margin:10px 0 4px">Following our discussion, I have summarised the key points:</div>${
      keyPoints.map(k => `<div style="${EMAIL_FONT_CSS}margin:0 0 4px 36pt;text-indent:-14pt">&#8226;&nbsp;&nbsp;${escapeHtml(k)}</div>`).join('')
    }`
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
    // The greeting is deliberately plain text + <br/> here, not its own <p> —
    // see the comment on renderTemplateBodyHtml in emailUtils.js for why.
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="${EMAIL_FONT_CSS}margin:0;padding:0;color:#1a1a1a;line-height:1.5">
      <div style="${EMAIL_FONT_CSS}max-width:640px">Hi ${escapeHtml(clientNameForTokens)},<br/><br/>
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
    const { html, text } = readPreviewContent()
    setSending('sending'); setSendError(''); setStatusMsg('')
    try {
      const result = await openInPreferredClient({
        to, subject, html, plainText: text || buildPlainText(),
        attachments: attachmentsToSend,
        emailClient: settings.emailClient,
      })
      setSending('sent')
      setStatusMsg(result.label)
      logEmailNote(templateLabel, to, result.label, text)
      setTimeout(() => { setSending(null); setStatusMsg('') }, 5000)
    } catch (err) {
      setSendError(err.message || 'Something went wrong'); setSending('error')
    }
  }

  async function sendVia(client) {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const templateLabel = template?.name || 'Document Request'
    const { html, text } = readPreviewContent()
    const result = await openInPreferredClient({ to, subject, html, plainText: text || buildPlainText(), attachments: attachmentsToSend, emailClient: client })
    setStatusMsg(result.label)
    logEmailNote(templateLabel, to, result.label, text)
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

        <Section title="Attachments">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
            Ticked by default per the template's own settings. Add more from your library, or attach a one-off file from your computer just for this email.
          </div>

          {attachmentIds.map(id => {
            const a = availableAttachments.find(x => x.id === id)
            if (!a) return null
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: 'rgba(235,153,194,0.1)', borderRadius: 6, border: '0.5px solid #EB99C2', color: '#334155' }}>
                  📎 {a.name}
                </div>
                <button onClick={() => removeLibraryAttachment(id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )
          })}
          {manualAttachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: '#f1f5f9', borderRadius: 6, border: '0.5px dashed #94a3b8', color: '#334155' }}>
                📁 {a.name} <span style={{ color: '#94a3b8' }}>(this email only)</span>
              </div>
              <button onClick={() => removeManualAttachment(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          {attachmentIds.length === 0 && manualAttachments.length === 0 && (
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 6 }}>No attachments added.</div>
          )}

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <select style={{ ...inp, flex: 1 }} value={libraryPick} onChange={e => setLibraryPick(e.target.value)}>
              <option value="">Choose from library…</option>
              {availableAttachments.filter(a => !attachmentIds.includes(a.id)).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button onClick={addLibraryAttachment} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10.5, color: NAVY, cursor: 'pointer', fontWeight: 600 }}>
            📁 Attach from computer…
            <input type="file" style={{ display: 'none' }} onChange={handleManualFile} />
          </label>

          {settings.emailClient !== 'outlook' && (attachmentIds.length > 0 || manualAttachments.length > 0) && (
            <div style={{ fontSize: 9.5, color: '#b45309', marginTop: 8 }}>
              Your delivery app is set to {settings.emailClient === 'gmail' ? 'Gmail' : 'Copy to clipboard'} — attachments only travel automatically with Outlook (.eml) sends. You'll need to attach these manually this time.
            </div>
          )}
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

      {/* Right: Preview — editable directly in the box; click into the text
          and type to adjust wording before sending. While untouched it
          keeps regenerating live from the template/checklist/key points on
          the left; once edited, those inputs stop overwriting it. */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{template.name} — {dirty ? 'Edited Preview' : 'Live Preview'}</div>
          {dirty && (
            <button onClick={resetPreview} style={{ fontSize: 10.5, fontWeight: 600, color: NAVY, background: '#EEF2F6', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              ↺ Reset to template
            </button>
          )}
        </div>
        <div style={{ padding: '6px 16px', background: '#fffbea', borderBottom: '0.5px solid #e2e8f0', flexShrink: 0, fontSize: 10, color: '#92742a' }}>
          Click into the preview to edit the wording directly — this is exactly what will be sent.
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f1f5f9' }}>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <iframe
              ref={previewRef}
              srcDoc={dirty ? frozenRef.current : buildHtml()}
              onLoad={() => {
                const doc = previewRef.current?.contentDocument
                if (doc && doc.body) {
                  doc.body.contentEditable = 'true'
                  doc.body.style.cursor = 'text'
                  doc.body.oninput = () => {
                    if (!frozenRef.current) {
                      frozenRef.current = doc.documentElement.outerHTML
                      setDirty(true)
                    }
                  }
                }
              }}
              style={{ width: '100%', height: 700, border: 'none' }}
              title="preview"
            />
          </div>
        </div>
      </div>

    </div>
  )
}
