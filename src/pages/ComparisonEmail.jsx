import React, { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals } from '../lib/deals'
import { loadClients } from '../lib/data'
import { loadSettings, getClientBroker } from '../lib/settings'
import { findLinkedClient } from './DealPage'
import {
  buildChecklistHtml, openInPreferredClient, escapeHtml, EMAIL_FONT_CSS,
} from '../lib/emailUtils'
import { normalizeScenario, findRecommendedGroup, buildComparisonTableHtml, buildRecommendationTableHtml } from '../lib/comparisonUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const inp = { width: '100%', fontSize: 11, padding: '5px 8px', border: '0.5px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#1e293b', boxSizing: 'border-box' }
const Section = ({ title, children }) => (
  <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #f1f5f9' }}>{title}</div>
    {children}
  </div>
)

const isIndividual = c => !c.type || /^ind/i.test(c.type)

// Same manual hanging-indent bullet as emailUtils.js's checklist bullets —
// real <ul>/<li> gets Word's own non-configurable list indent when Outlook
// renders it, and a <p> anywhere in the body trips Outlook's "insert
// signature after the first <p>" heuristic, so every bullet here is a
// <div> with a manual bullet character.
const BULLET = '&#8226;&nbsp;&nbsp;'
function bulletDiv(html, { placeholder } = {}) {
  const color = placeholder ? 'color:#c0392b;' : ''
  return `<div style="${EMAIL_FONT_CSS}${color}margin:0 0 4px 36pt;text-indent:-14pt">${BULLET}${html}</div>`
}
function textDiv(html, extra = '') {
  return `<div style="${EMAIL_FONT_CSS}margin:0 0 10px;${extra}">${html}</div>`
}
// Takes pre-built HTML (the caller escapes any dynamic text itself) rather
// than plain text, since the recommendation heading needs to interpolate
// either an escaped lender name or an unescaped red placeholder <span>.
function headingDiv(html) {
  return `<div style="${EMAIL_FONT_CSS}font-weight:700;margin:14px 0 8px">${html}</div>`
}
const PLACEHOLDER = txt => `<span style="color:#c0392b">&lt;${escapeHtml(txt)}&gt;</span>`

export default function ComparisonEmail() {
  const { dealName } = useParams()
  const navigate = useNavigate()

  const decodedName = decodeURIComponent(dealName)
  const [deals, setDealsState] = useState(() => loadDeals())
  const deal = deals.find(d => d['Transaction Name'] === decodedName)
  const [clients] = useState(() => loadClients())
  const settings = loadSettings()
  const assignedBroker = getClientBroker(undefined, settings)

  const strat = deal?._strategy || {}
  const scenarios = (strat.comparisonScenarios || []).map(normalizeScenario)
  const rec = strat.comparisonRecommendation || null
  const { recommendedGroup } = findRecommendedGroup(scenarios, rec)
  const showLMI = !!strat.showLMI

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

  const [subject, setSubject] = useState(() => `Lender Comparison — ${clientNameForTokens}`)

  const availableAttachments = settings.emailAttachments || []
  const [attachmentIds, setAttachmentIds] = useState([])
  const [libraryPick, setLibraryPick] = useState('')
  const addLibraryAttachment = () => {
    if (!libraryPick) return
    setAttachmentIds(ids => ids.includes(libraryPick) ? ids : [...ids, libraryPick])
    setLibraryPick('')
  }
  const removeLibraryAttachment = id => setAttachmentIds(ids => ids.filter(x => x !== id))
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

  const previewRef = useRef(null)
  const [dirty, setDirty] = useState(false)
  const frozenRef = useRef(null)

  function readPreviewContent() {
    const doc = previewRef.current?.contentDocument
    if (doc && doc.documentElement) {
      return { html: doc.documentElement.outerHTML, text: doc.body?.innerText || doc.body?.textContent || '' }
    }
    return { html: buildHtml(), text: '' }
  }
  function resetPreview() { setDirty(false); frozenRef.current = null }

  function logEmailNote(recipientList, methodLabel, sentText) {
    if (!deal) return
    const note = {
      type: 'Email Out',
      title: 'Lender Comparison',
      body: `To: ${recipientList} · Method: ${methodLabel}\n\n${sentText || ''}`,
      date: new Date().toISOString().slice(0, 10),
      user: deal.Advisor || assignedBroker.name || 'Cameron Finlayson',
    }
    const updated = deals.map(x => x['Transaction Name'] === deal['Transaction Name'] ? { ...x, _fileNotes: [note, ...(x._fileNotes || [])] } : x)
    setDealsState(updated)
    saveDeals(updated)
  }

  // Every lender that appears anywhere across the deal's comparison
  // scenarios, in the order first seen, deduplicated — this is the
  // "shortlisted lenders" bullet list. Genuinely derived from the live
  // comparison data rather than typed out separately, so it can't drift out
  // of sync with the table underneath it.
  function shortlistedLenders() {
    const seen = new Set()
    const names = []
    scenarios.forEach(sc => sc.groups.forEach(g => {
      const name = (g.lender || '').trim()
      if (name && !seen.has(name)) { seen.add(name); names.push(name) }
    }))
    return names
  }

  function buildHtml() {
    const lenders = shortlistedLenders()
    // Pre-safe HTML either way — an escaped real lender name, or an
    // unescaped placeholder <span> — so nothing downstream needs to know
    // which case it is.
    const recLenderHtml = recommendedGroup?.lender ? escapeHtml(recommendedGroup.lender) : PLACEHOLDER('Lender Name')
    const sections = deal?._attachments?.sections || null
    const outstandingHtml = sections
      ? buildChecklistHtml(sections, { onlyOutstanding: true })
      : `${bulletDiv(PLACEHOLDER('Insert outstanding items 1'), { placeholder: true })}${bulletDiv(PLACEHOLDER('Insert outstanding items 2'), { placeholder: true })}`

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="${EMAIL_FONT_CSS}margin:0;padding:0;color:#1a1a1a;line-height:1.5">
      <div style="${EMAIL_FONT_CSS}max-width:1100px">Hi ${escapeHtml(clientNameForTokens)},<br/><br/>
        ${textDiv('Thank you for providing the requested information, I appreciate your prompt response.')}
        ${textDiv("Following our recent discussions and taking into account your goals, financial position, and preferences, I've shortlisted the most suitable lenders for your scenario:")}
        ${lenders.length ? lenders.map(l => bulletDiv(escapeHtml(l))).join('') : bulletDiv(PLACEHOLDER('Lender 1'), { placeholder: true }) + bulletDiv(PLACEHOLDER('Lender 2'), { placeholder: true })}
        ${textDiv(`These options were selected based on ${PLACEHOLDER('insert rationale')}. Below is a summary comparing key features across these lenders:`)}
        ${headingDiv('Lender Comparison Table')}
        ${buildComparisonTableHtml(scenarios, { showLMI }) || textDiv(PLACEHOLDER('Insert Table'))}
        ${headingDiv(`My Recommendation: ${recLenderHtml}`)}
        ${recommendedGroup ? buildRecommendationTableHtml(recommendedGroup) : textDiv(PLACEHOLDER('Insert Table'))}
        ${textDiv(`Based on the above, I recommend we proceed with ${recLenderHtml} as the most aligned solution. This strategy has been selected because:`)}
        ${bulletDiv(PLACEHOLDER('Insert reason 1 – e.g. maximises borrowing capacity'), { placeholder: true })}
        ${bulletDiv(PLACEHOLDER('Insert reason 2 – e.g. offers multiple offset accounts / flexible redraw / fixed & variable split'), { placeholder: true })}
        ${bulletDiv(PLACEHOLDER('Insert reason 3 – e.g. aligns with your construction timeline/property settlement date'), { placeholder: true })}
        ${textDiv("It's designed to support both your short-term needs and long-term financial goals.")}
        ${textDiv("If you're happy to proceed with this recommendation, just reply to confirm and I'll begin preparing the next steps.")}
        ${textDiv('If you have any questions or would like to chat through the options further, let me know and we can arrange a quick call to walk through everything together.')}
        ${headingDiv('Next Steps')}
        ${textDiv("To move forward, I'll need a few final documents:")}
        ${outstandingHtml}
        ${textDiv("Please feel free to reach out anytime — I'm here to help and want to ensure you're completely comfortable before we proceed.")}
        ${textDiv('Looking forward to hearing from you.')}
        <div style="${EMAIL_FONT_CSS}margin-top:10px">Regards,</div>
      </div></body></html>`
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const { html, text } = readPreviewContent()
    setSending('sending'); setSendError(''); setStatusMsg('')
    try {
      const result = await openInPreferredClient({ to, subject, html, plainText: text, attachments: attachmentsToSend, emailClient: settings.emailClient })
      setSending('sent')
      setStatusMsg(result.label)
      logEmailNote(to, result.label, text)
      setTimeout(() => { setSending(null); setStatusMsg('') }, 5000)
    } catch (err) {
      setSendError(err.message || 'Something went wrong'); setSending('error')
    }
  }
  async function sendVia(client) {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const { html, text } = readPreviewContent()
    const result = await openInPreferredClient({ to, subject, html, plainText: text, attachments: attachmentsToSend, emailClient: client })
    setStatusMsg(result.label)
    logEmailNote(to, result.label, text)
    setTimeout(() => setStatusMsg(''), 5000)
  }

  if (!deal) return <div style={{ padding: 32, color: '#c0392b' }}>Deal not found.</div>

  if (scenarios.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <button onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>
          ← Back to {deal['Transaction Name']}
        </button>
        <div style={{ color: '#c0392b', fontSize: 13 }}>
          This deal doesn't have any Comparison Tables yet — open Strategy &gt; Comparison Tables first, add at least one lender, then come back here.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      <div style={{ overflowY: 'auto', padding: 16, background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back to {deal['Transaction Name']}
        </button>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>✉ Lender Comparison Email</div>
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

        <Section title="Attachments">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
            Add from your library, or attach a one-off file from your computer just for this email.
          </div>
          {attachmentIds.map(id => {
            const a = availableAttachments.find(x => x.id === id)
            if (!a) return null
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: 'rgba(235,153,194,0.1)', borderRadius: 6, border: '0.5px solid #EB99C2', color: '#334155' }}>📎 {a.name}</div>
                <button onClick={() => removeLibraryAttachment(id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )
          })}
          {manualAttachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: '#f1f5f9', borderRadius: 6, border: '0.5px dashed #94a3b8', color: '#334155' }}>📁 {a.name} <span style={{ color: '#94a3b8' }}>(this email only)</span></div>
              <button onClick={() => removeManualAttachment(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          {attachmentIds.length === 0 && manualAttachments.length === 0 && <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 6 }}>No attachments added.</div>}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <select style={{ ...inp, flex: 1 }} value={libraryPick} onChange={e => setLibraryPick(e.target.value)}>
              <option value="">Choose from library…</option>
              {availableAttachments.filter(a => !attachmentIds.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
            The red placeholder text in the preview (rationale, reasons, and any missing lenders/recommendation) needs replacing before you send — click straight into the preview to edit it, same as typing in Outlook.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Lender Comparison — {dirty ? 'Edited Preview' : 'Live Preview'}</div>
          {dirty && (
            <button onClick={resetPreview} style={{ fontSize: 10.5, fontWeight: 600, color: NAVY, background: '#EEF2F6', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              ↺ Reset to template
            </button>
          )}
        </div>
        <div style={{ padding: '6px 16px', background: '#fffbea', borderBottom: '0.5px solid #e2e8f0', flexShrink: 0, fontSize: 10, color: '#92742a' }}>
          Click into the preview to edit the wording (including the red placeholder text) directly — this is exactly what will be sent.
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
              style={{ width: '100%', height: 900, border: 'none' }}
              title="preview"
            />
          </div>
        </div>
      </div>

    </div>
  )
}
