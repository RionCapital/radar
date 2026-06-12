import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcRepayment } from '../lib/dateUtils'
import { getCurrentUser } from '../lib/settings'
import { LOGO_DATA_URI, sendEmail, downloadEml, emailHeader, emailFooter } from '../lib/emailUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const fmt = v => v ? '$' + Number(v).toLocaleString() : '—'
const contactName = c => c ? (c.first ? `${c.first}${c.last?' '+c.last:''}`.trim() : c.name || '') : ''
const contactGreeting = (contacts) => contacts.length > 0 
  ? contacts.filter(c=>c.type==='Ind'||c.type==='Individual').map(c=>c.first||contactName(c)).filter(Boolean).join(' & ') || contacts.map(contactName).filter(Boolean).join(' & ')
  : ''
const fmtPct = v => v ? Number(v).toFixed(2) + '%' : '—'
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) }

// ── Template Picker ───────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'annual',   icon: '📋', title: 'Annual Review',         desc: 'Full portfolio review with loan details, securities, LVR, equity and lender comparisons.' },
  { id: 'fixed',    icon: '🔒', title: 'Fixed / IO Term Expiry', desc: 'Alert clients that a fixed rate or interest-only period is approaching expiry.' },
  { id: 'maturity', icon: '📅', title: 'Loan Maturity',          desc: 'Notify clients of an upcoming maturity date and open a refinancing conversation.' },
  { id: 'general',  icon: '✉️', title: 'General / Freeform',     desc: 'Blank canvas for any client communication — subject, body and custom CTA.' },
]

function TemplatePicker({ client, onSelect }) {
  const contacts = client.contacts || []
  const greeting = contactGreeting(contacts) || client.name || ''

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: PINK, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Email Builder</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{client.name}</div>
        {contacts.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'rgba(235,153,194,0.15)', color: NAVY, border: `1px solid ${PINK}` }}>
                {contactName(c)} {c.email ? `· ${c.email}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select a template</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {TEMPLATES.map(t => (
          <button key={t.id} onClick={() => onSelect(t.id)}
            style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 10, border: `1.5px solid #e2e8f0`, background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(235,153,194,0.15)` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{t.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Shared email HTML generator ───────────────────────────────────────────────





// ── Input helpers ─────────────────────────────────────────────────────────────
const inp = { width: '100%', fontSize: 11, padding: '5px 8px', border: '0.5px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#1e293b', boxSizing: 'border-box' }
const label = (txt) => <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>
const Field = ({ lbl, value, onChange, placeholder, type = 'text', rows }) => (
  <div style={{ marginBottom: 10 }}>
    {label(lbl)}
    {rows
      ? <textarea rows={rows} style={{ ...inp, resize: 'vertical' }} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      : <input type={type} style={inp} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
  </div>
)

// ── Panel wrapper ─────────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #f1f5f9' }}>{title}</div>
    {children}
  </div>
)

// ── ANNUAL REVIEW ─────────────────────────────────────────────────────────────
function AnnualReview({ client, onBack, logNote }) {
  const navigate = useNavigate()
  const contacts = client.contacts || []
  const loans = client.loans || []
  const securities = client.securities || []
  const currentUser = getCurrentUser()

  const defaultGreeting = contactGreeting(contacts) || client.name || ''

  const [brokerName, setBrokerName] = useState(currentUser?.name || '')
  const [brokerPhone, setBrokerPhone] = useState(currentUser?.phone || '')
  const [brokerEmail, setBrokerEmail] = useState(currentUser?.email || '')
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(null)
  const [sendError, setSendError] = useState('')

  // Recipients — editable list pre-populated from client contacts
  const [recipients, setRecipients] = useState(
    contacts.filter(c => c.email).map(c => ({ name: contactName(c), email: c.email }))
  )
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  function addRecipient() {
    if (!addEmail.trim()) return
    setRecipients(r => [...r, { name: addName.trim() || addEmail.trim(), email: addEmail.trim() }])
    setAddEmail(''); setAddName('')
  }
  function removeRecipient(i) { setRecipients(r => r.filter((_, j) => j !== i)) }

  const [attachments, setAttachments] = useState([])

  function handleAttachFiles(e) {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const b64 = ev.target.result.split(',')[1]
        setAttachments(prev => [...prev, { filename: file.name, content: b64, size: file.size }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = '' // reset so same file can be re-added
  }
  function removeAttachment(i) { setAttachments(a => a.filter((_, j) => j !== i)) }

  const [comparisons, setComparisons] = useState([
    { lender: '', rate: '', repayment: '', features: '' },
    { lender: '', rate: '', repayment: '', features: '' },
    { lender: '', rate: '', repayment: '', features: '' },
  ])
  const [secValues, setSecValues] = useState(securities.map(s => ({ ...s, coreLogicVal: s.estVal || '' })))

  const totalBalance = loans.filter(l => l.balance).reduce((s, l) => s + (l.balance || 0), 0)
  const totalSecValue = secValues.reduce((s, sv) => s + (Number(sv.coreLogicVal) || 0), 0)

  // LVR + Equity calc
  const portfolioLVR = totalSecValue > 0 ? Math.round((totalBalance / totalSecValue) * 100) : null
  const resiEquity = secValues.filter(s => s.type !== 'Commercial').reduce((sum, s) => sum + Math.max(0, (Number(s.coreLogicVal) || 0) * ((s.lvr||80)/100) - totalBalance / Math.max(1, secValues.length)), 0)
  const commEquity = secValues.filter(s => s.type === 'Commercial').reduce((sum, s) => sum + Math.max(0, (Number(s.coreLogicVal) || 0) * 0.7 - totalBalance / Math.max(1, secValues.length)), 0)
  const borrowingEquity = Math.round(resiEquity + commEquity)

  function buildHtml() {
    const greeting = defaultGreeting
    const fmtWhole = v => v ? '$' + Math.round(Number(v)).toLocaleString() : '—'

    const loanRows = loans.filter(l => l.acc || l.lname).map(l => `
      <tr style="border-bottom:0.5px solid #f1f5f9">
        <td style="padding:6px 6px;font-size:10px">${l.lname || l.acc || '—'}</td>
        <td style="padding:6px 6px;font-size:10px">${l.bank || '—'}</td>
        <td style="padding:6px 6px;font-size:10px">${l.rpmt || '—'}</td>
        <td style="padding:6px 8px;font-size:10px;text-align:right;white-space:nowrap">${fmtWhole(l.balance)}</td>
        <td style="padding:6px 6px;font-size:10px;text-align:right;white-space:nowrap">${l.rate ? l.rate.toFixed(2) + '%' : '—'}</td>
        <td style="padding:6px 6px;font-size:10px;text-align:right;white-space:nowrap">${calcRepayment(l) ? '$' + calcRepayment(l).toLocaleString() : '—'}</td>
      </tr>`).join('')

    const secRows = secValues.map(s => `
      <tr style="border-bottom:0.5px solid #f1f5f9">
        <td style="padding:7px 8px;font-size:11px">${s.address || '—'}</td>
        <td style="padding:7px 8px;font-size:11px">${s.type || 'Residential'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${s.coreLogicVal ? fmtWhole(s.coreLogicVal) : '—'}</td>
      </tr>`).join('')

    const compCols = comparisons.filter(c => c.lender).map(c => `
      <td style="padding:12px;text-align:center;vertical-align:top;width:33%">
        <div style="font-weight:700;color:#3D4F6B;font-size:13px;margin-bottom:8px">${c.lender}</div>
        ${c.rate ? `<div style="font-size:11px;margin-bottom:4px">Rate: <strong>${c.rate}%</strong></div>` : ''}
        ${c.repayment ? `<div style="font-size:12px;margin-bottom:4px;color:#3D4F6B;font-weight:700">Est. monthly: <strong>$${Number(c.repayment).toLocaleString()}</strong></div>` : ''}
        ${c.features ? `<div style="font-size:10px;color:#64748b;margin-top:6px">${c.features}</div>` : ''}
      </td>`).join('')

    // Build combined disclaimer block for bottom of email
    const hasEquity = totalSecValue > 0
    const hasComparisons = comparisons.some(c => c.lender)
    const disclaimerBlock = (hasEquity || hasComparisons) ? `
      <div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #e2e8f0">
        <p style="font-size:10px;color:#94a3b8;margin:0 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Disclaimers</p>
        ${hasEquity ? `<p style="font-size:10px;color:#94a3b8;margin:0 0 6px;line-height:1.5;font-style:italic"><strong>Borrowing equity:</strong> Borrowing equity figures are estimates only based on CoreLogic valuations and standard LVR benchmarks (Residential 80% / Commercial 70%). Portfolio balances reflected above may include the benefit of any offset accounts held against the relevant facilities. Actual borrowing capacity is subject to formal valuation, lender assessment and serviceability criteria. These figures do not constitute financial advice.</p>` : ''}
        ${hasComparisons ? `<p style="font-size:10px;color:#94a3b8;margin:0;line-height:1.5;font-style:italic"><strong>Repayments:</strong> Estimated monthly repayments shown in the market comparison are indicative only, calculated on a 30-year principal &amp; interest term. Actual repayments will vary based on the loan term, repayment type, fees and individual lender assessment. These figures do not constitute financial advice.</p>` : ''}
      </div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        <p style="font-size:13px;line-height:1.7;margin:0 0 20px">Thank you for being a valued Rion Capital client. As part of our commitment to your financial wellbeing, we have prepared your <strong>Annual Portfolio Review</strong>. Please find your current loan position and property summary below.</p>
        <p style="font-size:13px;line-height:1.7;margin:0 0 20px">We have <strong>requested a pricing review with your current lender(s)</strong> and are working through the market on your behalf. A separate detailed comparison will follow for each of your properties — we will be in touch shortly with our findings and recommendations.</p>

        <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0;margin-bottom:0">
          <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Current Loan Facilities</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;border:0.5px solid #e2e8f0;table-layout:fixed;word-break:break-word">
          <colgroup>
            <col style="width:22%"/>
            <col style="width:14%"/>
            <col style="width:10%"/>
            <col style="width:22%"/>
            <col style="width:14%"/>
            <col style="width:18%"/>
          </colgroup>
          <thead style="background:#f8fafc">
            <tr>${['Facility','Lender','Type','Balance','Rate','Rpmt'].map(h => `<th style="padding:5px 6px;font-size:9px;text-align:${['Balance','Rate','Rpmt'].includes(h)?'right':'left'};color:#64748b;font-weight:600;text-transform:uppercase">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>${loanRows}</tbody>
          <tfoot style="background:#f8fafc">
            <tr><td colspan="3" style="padding:5px 6px;font-size:10px;font-weight:700">Total portfolio</td>
            <td style="padding:6px 8px;font-size:11px;font-weight:700;text-align:right;white-space:nowrap">${fmtWhole(totalBalance)}</td>
            <td colspan="2"></td></tr>
          </tfoot>
        </table>

        ${secValues.length > 0 ? `
        <div style="margin-top:20px">
          <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
            <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Securities &amp; Property Values</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
            <thead style="background:#f8fafc">
              <tr>${['Property','Type','CoreLogic Est. Value'].map(h => `<th style="padding:7px 8px;font-size:10px;text-align:${h==='CoreLogic Est. Value'?'right':'left'};color:#64748b;font-weight:600;text-transform:uppercase">${h}</th>`).join('')}</tr>
            </thead>
            <tbody>${secRows}</tbody>
          </table>
          <p style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:4px">CoreLogic property report attached for your reference.</p>
        </div>` : ''}

        ${totalSecValue > 0 ? `
        <div style="margin-top:20px">
          <table style="width:100%;border-collapse:collapse"><tr>
            <td style="width:33%;padding:14px;background:#f0fdf4;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Portfolio LVR</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${portfolioLVR !== null ? portfolioLVR + '%' : '—'}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">Current</div>
            </td>
            <td style="width:6px"></td>
            <td style="width:33%;padding:14px;background:#fef9c3;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Est. Borrowing Equity</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${fmtWhole(borrowingEquity)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">Resi @80% / Comm @70%</div>
            </td>
            <td style="width:6px"></td>
            <td style="width:33%;padding:14px;background:#eff6ff;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Total Sec. Value</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${fmtWhole(totalSecValue)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">CoreLogic estimates</div>
            </td>
          </tr></table>
        </div>` : ''}

        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Next Steps</div>
          ${['Review your current loan position above.',
            'Confirm your current contact details are up to date — we may need to reach you to discuss your options.',
            'A detailed market comparison will follow separately for each of your properties.',
            'Once we have the lender responses in hand, we will contact you to walk through our recommendations.',
            'Book a review call at a time that suits you — no obligation, just a conversation.'].map((s, i) => `
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
            <tr>
              <td style="width:26px;vertical-align:top;padding-top:2px">
                <table style="border-collapse:collapse">
                  <tr><td style="width:22px;height:22px;background:#3D4F6B;color:#ffffff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;border-radius:11px">${i + 1}</td></tr>
                </table>
              </td>
              <td style="font-size:12px;color:#2A3545;line-height:1.6;padding-left:10px">${s}</td>
            </tr>
          </table>`).join('')}
        </div>

        ${notes ? `<div style="margin-top:16px;padding:14px;background:#fff;border:0.5px solid #e2e8f0;border-radius:8px"><p style="font-size:12px;color:#2A3545;margin:0;line-height:1.7">${notes}</p></div>` : ''}

        <div style="margin-top:20px;padding:14px;background:#EB99C2;border-radius:8px;text-align:center">
          <p style="font-size:12px;color:#fff;margin:0 0 4px;font-weight:600">${brokerName || 'Your broker'} will be in touch within 48 hours to discuss your options.</p>
          ${brokerPhone ? `<p style="font-size:12px;color:#fff;margin:0">Or call us directly: <strong>${brokerPhone}</strong></p>` : ''}
        </div>

        <p style="font-size:13px;margin-top:20px;line-height:1.7">Warm regards,<br/><strong>${brokerName || '[Broker Name]'}</strong><br/>${brokerPhone || ''}</p>

        ${disclaimerBlock}

        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const subject = `Annual Portfolio Review — ${client.name} · ${fmtDate(reviewDate)}`
    const html = buildHtml()

    // Check total payload size — Vercel Hobby plan hard limit is 4.5MB
    const attachList = attachments.map(a => ({ filename: a.filename, content: a.content }))
    const payloadSize = new Blob([JSON.stringify({ to, subject, html, attachments: attachList })]).size
    const LIMIT = 3.5 * 1024 * 1024 // 3.5MB to be safe

    if (payloadSize > LIMIT) {
      const sizeMB = (payloadSize / 1024 / 1024).toFixed(1)
      const proceed = window.confirm(
        `The total email size (${sizeMB}MB) is too large to send directly.\n\n` +
        `Click OK to download as .eml instead — this opens in Outlook as a ready-to-send draft with all attachments included.\n\n` +
        `Or click Cancel and compress your attachment at ilovepdf.com first.`
      )
      if (proceed) {
        downloadEml(to, subject, html, attachments)
        logNote?.('Annual Portfolio Review', recipients.map(r=>r.name||r.email).join(', '), '.eml download')
      }
      return
    }

    setSending('sending'); setSendError('')
    try {
      await sendEmail(to, subject, html, brokerName, brokerEmail, attachments)
      setSending('sent')
      logNote?.('Annual Portfolio Review', recipients.map(r=>r.name||r.email).join(', '), 'Direct send')
      setTimeout(() => setSending(null), 4000)
    } catch (err) {
      setSendError(err.message)
      setSending('error')
    }
  }

  function openOutlook() {
    const to = recipients.map(r => r.email).join(', ')
    const subject = `Annual Portfolio Review — ${client.name} · ${fmtDate(reviewDate)}`
    downloadEml(to, subject, buildHtml())
    logNote?.('Annual Portfolio Review', recipients.map(r=>r.name||r.email).join(', '), '.eml download')
  }

  function copyHtml() {
    navigator.clipboard.writeText(buildHtml())
      .then(() => alert('HTML copied — paste into Outlook › Insert › HTML or your email platform'))
      .catch(() => alert('Copy failed — please try again'))
  }

  const [viewMode, setViewMode] = useState('split') // 'desktop' | 'mobile' | 'split'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Left: Inputs */}
      <div style={{ overflowY: 'auto', padding: '16px', background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={onBack} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}>← Back to templates</button>
        <Section title="Recipients">
          {recipients.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: 'rgba(235,153,194,0.1)', borderRadius: 6, border: '0.5px solid #EB99C2', color: '#334155' }}>
                {r.name} · <span style={{ color: '#64748b' }}>{r.email}</span>
              </div>
              <button onClick={() => removeRecipient(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Name (optional)" value={addName} onChange={e => setAddName(e.target.value)} />
            <input style={{ ...inp, flex: 2 }} placeholder="email@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRecipient()} />
            <button onClick={addRecipient} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#3D4F6B', color: '#fff', fontSize: 11, cursor: 'pointer' }}>+ Add</button>
          </div>
        </Section>

        <Section title="Broker details">
          <Field lbl="Broker name" value={brokerName} onChange={setBrokerName} placeholder="Cameron Finlayson" />
          <Field lbl="Broker phone" value={brokerPhone} onChange={setBrokerPhone} placeholder="0400 000 000" />
          <Field lbl="Broker email" value={brokerEmail} onChange={setBrokerEmail} placeholder="broker@rion-capital.com.au" />
          <Field lbl="Review date" value={reviewDate} onChange={setReviewDate} type="date" />
        </Section>

        <Section title={`Loan facilities (${loans.length})`}>
          {loans.length === 0
            ? <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No loans found for this client</div>
            : loans.map((l, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '0.5px solid #f1f5f9', fontSize: 11, color: '#334155' }}>
                <div style={{ fontWeight: 600 }}>{l.lname || l.acc || `Loan ${i + 1}`}</div>
                <div style={{ color: '#64748b' }}>{l.bank} · {l.rpmt} · {fmtPct(l.rate)} · Balance: {fmt(l.balance)}</div>
              </div>
            ))
          }
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>Pre-populated from client record. Edit loans in the client screen.</div>
        </Section>

        <Section title="Securities & CoreLogic values">
          {secValues.length === 0
            ? <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No securities linked to this client</div>
            : secValues.map((s, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>#{s.num} — {s.address}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    {label('CoreLogic value ($)')}
                    <input type="number" style={inp} value={s.coreLogicVal || ''} placeholder={s.estVal || 'Enter value'}
                      onChange={e => setSecValues(prev => prev.map((sv, j) => j === i ? { ...sv, coreLogicVal: +e.target.value } : sv))} />
                  </div>
                  <div style={{ width: 90 }}>
                    {label('Type')}
                    <select style={inp} value={s.type || (s.lvr <= 70 ? 'Commercial' : 'Residential')}
                      onChange={e => setSecValues(prev => prev.map((sv, j) => j === i ? { ...sv, type: e.target.value } : sv))}>
                      <option>Residential</option><option>Commercial</option>
                    </select>
                  </div>
                </div>
              </div>
            ))
          }
        </Section>

        <Section title="Attachments">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
            Add files to include with the email (e.g. CoreLogic property report, fact find).
          </div>
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, padding: '4px 8px', background: '#f8fafc', borderRadius: 5, border: '0.5px solid #e2e8f0' }}>
              <span style={{ fontSize: 11, flex: 1, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {a.filename}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{(a.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => removeAttachment(i)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
            </div>
          ))}
          <label style={{ display: 'block', marginTop: 6, padding: '6px 10px', background: '#3D4F6B', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            + Attach files
            <input type="file" multiple style={{ display: 'none' }} onChange={handleAttachFiles}
              accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg" />
          </label>
        </Section>

        <Section title="Additional notes">
          <Field lbl="Broker notes (optional)" value={notes} onChange={setNotes} placeholder="Any specific observations or recommendations for this client..." rows={4} />
        </Section>
      </div>

      {/* Right: Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>📋 Annual Review — Live Preview</div>
            {/* View mode toggle */}
            <div style={{ display: 'flex', border: `1px solid #e2e8f0`, borderRadius: 6, overflow: 'hidden' }}>
              {[['desktop','🖥','Desktop'],['mobile','📱','Mobile'],['split','⊞','Split']].map(([mode, icon, label]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  style={{ fontSize: 10, padding: '4px 8px', border: 'none', cursor: 'pointer', fontWeight: 600,
                    background: viewMode === mode ? NAVY : '#fff',
                    color: viewMode === mode ? '#fff' : '#64748b' }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {sending === 'sent' && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Sent!</span>}
            {sending === 'error' && <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sendError}>✕ {sendError}</span>}
            <button onClick={copyHtml}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${PINK}`, color: PINK, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Copy HTML
            </button>
            <button onClick={openOutlook}
              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              ↓ .eml
            </button>
            <button onClick={handleSend} disabled={sending === 'sending'}
              style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: sending === 'sending' ? '#94a3b8' : NAVY, color: '#fff', cursor: sending === 'sending' ? 'default' : 'pointer', fontWeight: 600 }}>
              {sending === 'sending' ? 'Sending…' : '✉ Send Email'}
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f1f5f9' }}>
          {viewMode === 'split' ? (
            // Side-by-side: desktop left, mobile right
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 375px', gap: 16, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🖥 Desktop</div>
                <div style={{ maxWidth: 600, margin: '0 auto', background: '#fff', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                  dangerouslySetInnerHTML={{ __html: buildHtml() }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📱 Mobile</div>
                {/* Phone frame */}
                <div style={{ width: 375, background: '#1a1a2e', borderRadius: 32, padding: '12px 8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', margin: '0 auto' }}>
                  <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden' }}>
                    {/* Status bar */}
                    <div style={{ background: '#f8f8f8', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333', borderBottom: '0.5px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 700 }}>09:41</span>
                      <span>●●● WiFi 🔋</span>
                    </div>
                    <div style={{ maxHeight: '70vh', overflowY: 'auto', width: 359 }}
                      dangerouslySetInnerHTML={{ __html: buildHtml() }} />
                  </div>
                </div>
              </div>
            </div>
          ) : viewMode === 'mobile' ? (
            // Mobile only — centred phone frame
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📱 Mobile</div>
                <div style={{ width: 375, background: '#1a1a2e', borderRadius: 32, padding: '12px 8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                  <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden' }}>
                    <div style={{ background: '#f8f8f8', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333', borderBottom: '0.5px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 700 }}>09:41</span>
                      <span>●●● WiFi 🔋</span>
                    </div>
                    <div style={{ maxHeight: '75vh', overflowY: 'auto', width: 359 }}
                      dangerouslySetInnerHTML={{ __html: buildHtml() }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Desktop only
            <div style={{ maxWidth: 600, margin: '0 auto' }}
              dangerouslySetInnerHTML={{ __html: buildHtml() }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── FIXED / IO EXPIRY ─────────────────────────────────────────────────────────
function ExpiryEmail({ client, onBack, expiryType, logNote }) {
  const contacts = client.contacts || []
  const loans = client.loans || []
  const greeting = contactGreeting(contacts) || client.name || ''

  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [selectedLoan, setSelectedLoan] = useState(0)
  const [notes, setNotes] = useState('')

  const loan = loans[selectedLoan] || {}
  const expiryDate = expiryType === 'fixed' ? loan.fixed : loan.io
  const expiryLabel = expiryType === 'fixed' ? 'Fixed Rate Expiry' : 'Interest Only Period Expiry'
  const isFixed = expiryType === 'fixed'

  function buildHtml() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        <div style="padding:12px 16px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;margin-bottom:20px">
          <strong style="font-size:13px;color:#92400e">⚠ ${expiryLabel} — Action Required</strong>
          <p style="font-size:12px;color:#78350f;margin:4px 0 0">Your ${isFixed ? 'fixed rate' : 'interest only period'} on <strong>${loan.lname || loan.acc || 'your facility'}</strong> expires on <strong>${fmtDate(expiryDate)}</strong>. Now is the time to review your options.</p>
        </div>

        <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
          <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Affected Facility</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
          <thead style="background:#f8fafc"><tr>
            <th style="padding:7px 8px;font-size:10px;text-align:left;color:#64748b;font-weight:600">Facility</th>
            <th style="padding:7px 8px;font-size:10px;text-align:left;color:#64748b;font-weight:600">Lender</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Balance</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Current Rate</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">${isFixed ? 'Fixed Expiry' : 'IO Expiry'}</th>
          </tr></thead>
          <tbody><tr>
            <td style="padding:7px 8px;font-size:11px">${loan.lname || loan.acc || '—'}</td>
            <td style="padding:7px 8px;font-size:11px">${loan.bank || '—'}</td>
            <td style="padding:5px 4px;font-size:10px;text-align:right">${fmt(loan.balance)}</td>
            <td style="padding:5px 4px;font-size:10px;text-align:right">${fmtPct(loan.rate)}</td>
            <td style="padding:7px 8px;font-size:11px;text-align:right;color:#d97706;font-weight:600">${fmtDate(expiryDate)}</td>
          </tr></tbody>
        </table>

        <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Your Options at Expiry</div>
          ${(isFixed
            ? ['Roll to a variable rate at your current lender\'s standard rate.',
              'Lock in a new fixed rate term — we\'ll compare available rates across the market.',
              'Refinance to a more competitive lender with a better rate or features.']
            : ['Switch to principal & interest — your repayments will increase but you\'ll reduce your loan balance.',
              'Extend your IO period with your current lender (subject to approval).',
              'Refinance to a new lender with a fresh IO period or restructure your facility.']
          ).map((s, i) => `
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
              <tr>
                <td style="width:26px;vertical-align:top;padding-top:2px">
                  <table style="border-collapse:collapse"><tr><td style="width:22px;height:22px;background:#3D4F6B;color:#ffffff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;border-radius:11px">${i + 1}</td></tr></table>
                </td>
                <td style="font-size:12px;color:#2A3545;line-height:1.6;padding-left:10px">${s}</td>
              </tr>
            </table>`).join('')}
        </div>

        ${notes ? `<div style="margin-top:16px;padding:14px;background:#fff;border:0.5px solid #e2e8f0;border-radius:8px"><p style="font-size:12px;color:#2A3545;margin:0;line-height:1.7">${notes}</p></div>` : ''}

        <div style="margin-top:20px;padding:14px;background:#EB99C2;border-radius:8px;text-align:center">
          <p style="font-size:12px;color:#fff;margin:0 0 4px;font-weight:600">${brokerName || 'Your broker'} will be in touch within 48 hours to discuss your options.</p>
          ${brokerPhone ? `<p style="font-size:12px;color:#fff;margin:0">Or call us directly: <strong>${brokerPhone}</strong></p>` : ''}
        </div>
        <p style="font-size:13px;margin-top:20px;line-height:1.7">Warm regards,<br/><strong>${brokerName || '[Broker Name]'}</strong><br/>${brokerPhone || ''}</p>
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  function openOutlook() {
    const to = contacts.filter(c => c.email).map(c => c.email).join(', ')
    const subject = `${expiryLabel} — ${loan.lname || client.name} · ${fmtDate(expiryDate)}`
    downloadEml(to, subject, buildHtml())
    logNote?.(expiryLabel, to, '.eml download')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div style={{ overflowY: 'auto', padding: '16px', background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={onBack} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>← Back to templates</button>
        <Section title="Broker details">
          <Field lbl="Broker name" value={brokerName} onChange={setBrokerName} placeholder="Cameron Finlayson" />
          <Field lbl="Broker phone" value={brokerPhone} onChange={setBrokerPhone} placeholder="0400 000 000" />
        </Section>
        <Section title="Select facility">
          {loans.map((l, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" checked={selectedLoan === i} onChange={() => setSelectedLoan(i)} />
              <span>{l.lname || l.acc || `Loan ${i + 1}`} — {l.bank} — {expiryType === 'fixed' ? fmtDate(l.fixed) : fmtDate(l.io)}</span>
            </label>
          ))}
        </Section>
        <Section title="Notes"><Field lbl="Additional notes" value={notes} onChange={setNotes} rows={4} /></Section>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>🔒 {expiryLabel} — Live Preview</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(buildHtml())} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${PINK}`, color: PINK, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Copy HTML</button>
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>↓ .eml</button>
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { const subj = buildSubject ? buildSubject() : 'Email from Rion Capital'; await sendEmail(to, subj, buildHtml()); logNote?.(subj, to, 'Direct send'); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: buildHtml() }} />
        </div>
      </div>
    </div>
  )
}

// ── LOAN MATURITY ─────────────────────────────────────────────────────────────
function MaturityEmail({ client, onBack, logNote }) {
  const contacts = client.contacts || []
  const loans = client.loans || []
  const greeting = contactGreeting(contacts) || client.name || ''
  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [selectedLoan, setSelectedLoan] = useState(0)
  const [notes, setNotes] = useState('')
  const loan = loans[selectedLoan] || {}

  function buildHtml() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        <div style="padding:12px 16px;background:#dcfce7;border-radius:8px;border-left:4px solid #22c55e;margin-bottom:20px">
          <strong style="font-size:13px;color:#166534">📅 Loan Maturity Approaching — Opportunity to Review</strong>
          <p style="font-size:12px;color:#166534;margin:4px 0 0">Your facility <strong>${loan.lname || loan.acc || 'your loan'}</strong> matures on <strong>${fmtDate(loan.maturity)}</strong>. This is a great opportunity to reassess your position and explore your options.</p>
        </div>
        <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
          <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Maturing Facility</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
          <thead style="background:#f8fafc"><tr>
            <th style="padding:7px 8px;font-size:10px;text-align:left;color:#64748b;font-weight:600">Facility</th>
            <th style="padding:7px 8px;font-size:10px;text-align:left;color:#64748b;font-weight:600">Lender</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Balance</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Rate</th>
            <th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Maturity</th>
            ${loan.balloon > 0 ? '<th style="padding:7px 8px;font-size:10px;text-align:right;color:#64748b;font-weight:600">Balloon</th>' : ''}
          </tr></thead>
          <tbody><tr>
            <td style="padding:7px 8px;font-size:11px">${loan.lname || loan.acc || '—'}</td>
            <td style="padding:7px 8px;font-size:11px">${loan.bank || '—'}</td>
            <td style="padding:5px 4px;font-size:10px;text-align:right">${fmt(loan.balance)}</td>
            <td style="padding:5px 4px;font-size:10px;text-align:right">${fmtPct(loan.rate)}</td>
            <td style="padding:7px 8px;font-size:11px;text-align:right;color:#166534;font-weight:600">${fmtDate(loan.maturity)}</td>
            ${loan.balloon > 0 ? `<td style="padding:7px 8px;font-size:11px;text-align:right;color:#d97706;font-weight:600">${fmt(loan.balloon)}</td>` : ''}
          </tr></tbody>
        </table>
        <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Your Refinancing Options</div>
          ${['Refinance to a new lender — access better rates and features available in the current market.',
            'Extend with your current lender — negotiate terms or restructure your facility.',
            `${loan.balloon > 0 ? 'Clear the balloon payment from savings, sale proceeds or refinancing into a new facility.' : 'Consider restructuring — P&I vs IO, term length, or offset and redraw features.'}`
          ].map((s, i) => `
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
              <tr>
                <td style="width:26px;vertical-align:top;padding-top:2px">
                  <table style="border-collapse:collapse"><tr><td style="width:22px;height:22px;background:#3D4F6B;color:#ffffff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;border-radius:11px">${i + 1}</td></tr></table>
                </td>
                <td style="font-size:12px;color:#2A3545;line-height:1.6;padding-left:10px">${s}</td>
              </tr>
            </table>`).join('')}
        </div>
        ${notes ? `<div style="margin-top:16px;padding:14px;background:#fff;border:0.5px solid #e2e8f0;border-radius:8px"><p style="font-size:12px;color:#2A3545;margin:0;line-height:1.7">${notes}</p></div>` : ''}
        <div style="margin-top:20px;padding:14px;background:#EB99C2;border-radius:8px;text-align:center">
          <p style="font-size:12px;color:#fff;margin:0 0 4px;font-weight:600">${brokerName || 'Your broker'} will be in touch within 48 hours to discuss your options.</p>
          ${brokerPhone ? `<p style="font-size:12px;color:#fff;margin:0">Or call us directly: <strong>${brokerPhone}</strong></p>` : ''}
        </div>
        <p style="font-size:13px;margin-top:20px;line-height:1.7">Warm regards,<br/><strong>${brokerName || '[Broker Name]'}</strong><br/>${brokerPhone || ''}</p>
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  function openOutlook() {
    const to = contacts.filter(c => c.email).map(c => c.email).join(', ')
    const subject = `Loan Maturity — ${loan.lname || client.name} · ${fmtDate(loan.maturity)}`
    downloadEml(to, subject, buildHtml())
    logNote?.('Loan Maturity', to, '.eml download')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div style={{ overflowY: 'auto', padding: '16px', background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={onBack} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>← Back to templates</button>
        <Section title="Broker details">
          <Field lbl="Broker name" value={brokerName} onChange={setBrokerName} placeholder="Cameron Finlayson" />
          <Field lbl="Broker phone" value={brokerPhone} onChange={setBrokerPhone} placeholder="0400 000 000" />
        </Section>
        <Section title="Select facility">
          {loans.map((l, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" checked={selectedLoan === i} onChange={() => setSelectedLoan(i)} />
              <span>{l.lname || l.acc || `Loan ${i + 1}`} — {l.bank} — matures {fmtDate(l.maturity)}{l.balloon ? ` · balloon ${fmt(l.balloon)}` : ''}</span>
            </label>
          ))}
        </Section>
        <Section title="Notes"><Field lbl="Additional notes" value={notes} onChange={setNotes} rows={4} /></Section>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>📅 Loan Maturity — Live Preview</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(buildHtml())} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${PINK}`, color: PINK, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Copy HTML</button>
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>↓ .eml</button>
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { const subj = buildSubject ? buildSubject() : 'Email from Rion Capital'; await sendEmail(to, subj, buildHtml()); logNote?.(subj, to, 'Direct send'); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: buildHtml() }} />
        </div>
      </div>
    </div>
  )
}

// ── GENERAL / FREEFORM ────────────────────────────────────────────────────────
function GeneralEmail({ client, onBack, logNote }) {
  const contacts = client.contacts || []
  const greeting = contactGreeting(contacts) || client.name || ''
  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [para1, setPara1] = useState('')
  const [para2, setPara2] = useState('')
  const [ctaLabel, setCtaLabel] = useState('Get in Touch')

  function buildHtml() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        ${para1 ? `<p style="font-size:13px;line-height:1.7;margin:0 0 16px">${para1}</p>` : ''}
        ${para2 ? `<p style="font-size:13px;line-height:1.7;margin:0 0 20px">${para2}</p>` : ''}
        <div style="text-align:center;margin:24px 0">
          <a href="mailto:${contacts[0]?.email || ''}" style="display:inline-block;padding:12px 28px;background:#3D4F6B;color:#fff;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none">${ctaLabel}</a>
        </div>
        <div style="margin-top:20px;padding:14px;background:#EB99C2;border-radius:8px;text-align:center">
          <p style="font-size:12px;color:#fff;margin:0 0 4px;font-weight:600">${brokerName || 'Your broker'} will be in touch within 48 hours.</p>
          ${brokerPhone ? `<p style="font-size:12px;color:#fff;margin:0">Call us: <strong>${brokerPhone}</strong></p>` : ''}
        </div>
        <p style="font-size:13px;margin-top:20px;line-height:1.7">Warm regards,<br/><strong>${brokerName || '[Broker Name]'}</strong><br/>${brokerPhone || ''}</p>
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  function openOutlook() {
    const to = contacts.filter(c => c.email).map(c => c.email).join(', ')
    downloadEml(to, subject || 'Message from Rion Capital', buildHtml())
    logNote?.(subject || 'General Email', to, '.eml download')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div style={{ overflowY: 'auto', padding: '16px', background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={onBack} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>← Back to templates</button>
        <Section title="Broker details">
          <Field lbl="Broker name" value={brokerName} onChange={setBrokerName} placeholder="Cameron Finlayson" />
          <Field lbl="Broker phone" value={brokerPhone} onChange={setBrokerPhone} placeholder="0400 000 000" />
        </Section>
        <Section title="Email content">
          <Field lbl="Subject line" value={subject} onChange={setSubject} placeholder="e.g. A quick update from Rion Capital" />
          <Field lbl="Paragraph 1" value={para1} onChange={setPara1} placeholder="Opening paragraph..." rows={4} />
          <Field lbl="Paragraph 2 (optional)" value={para2} onChange={setPara2} placeholder="Additional content..." rows={4} />
          <Field lbl="CTA button label" value={ctaLabel} onChange={setCtaLabel} placeholder="Get in Touch" />
        </Section>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>✉️ General Email — Live Preview</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(buildHtml())} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${PINK}`, color: PINK, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Copy HTML</button>
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${NAVY}`, color: NAVY, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>↓ .eml</button>
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { const subj = buildSubject ? buildSubject() : 'Email from Rion Capital'; await sendEmail(to, subj, buildHtml()); logNote?.(subj, to, 'Direct send'); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: buildHtml() }} />
        </div>
      </div>
    </div>
  )
}

// ── Main EmailBuilder page ─────────────────────────────────────────────────────
export default function EmailBuilder({ clients, updateClient }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients?.find(c => c.name === decodeURIComponent(name)) || {}
  const [template, setTemplate] = useState(null)

  // Log a note to the client's contact history after email is sent
  function logEmailNote(templateLabel, recipientList, method) {
    if (!updateClient || !client.name) return
    const recipNames = recipientList || 'client'
    const note = {
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      text: `📧 Email sent — ${templateLabel}. To: ${recipNames}. Method: ${method}.`
    }
    updateClient(client.name, c => ({ ...c, notes: [note, ...(c.notes || [])] }))
  }

  const topbar = (
    <div style={{ height: 48, background: NAVY, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
      <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name || '')}`)}
        style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}>
        ← {client.name}
      </button>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Email Builder</div>
      <div style={{ fontSize: 11, color: PINK, marginLeft: 4 }}>✉</div>
    </div>
  )

  if (!template) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {topbar}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
        <TemplatePicker client={client} onSelect={setTemplate} />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {topbar}
      {template === 'annual'   && <AnnualReview   client={client} onBack={() => setTemplate(null)} logNote={logEmailNote} />}
      {template === 'fixed'    && <ExpiryEmail     client={client} onBack={() => setTemplate(null)} expiryType="fixed" logNote={logEmailNote} />}
      {template === 'io'       && <ExpiryEmail     client={client} onBack={() => setTemplate(null)} expiryType="io" logNote={logEmailNote} />}
      {template === 'maturity' && <MaturityEmail   client={client} onBack={() => setTemplate(null)} logNote={logEmailNote} />}
      {template === 'general'  && <GeneralEmail    client={client} onBack={() => setTemplate(null)} logNote={logEmailNote} />}
    </div>
  )
}
