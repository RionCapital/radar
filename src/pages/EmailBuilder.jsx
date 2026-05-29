import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcRepayment } from '../lib/dateUtils'
import { getCurrentUser } from '../lib/settings'

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
const LOGO_DATA_URI = "data:image/jpeg;base64,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"

function emailHeader(greeting) {
  return `
    <div style="background:#3D4F6B;padding:22px 40px;text-align:center">
      <img src="${LOGO_DATA_URI}" alt="Rion Capital" style="width:300px;max-width:100%;height:auto;display:block;margin:0 auto" />
    </div>
    <div style="background:#fff;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#2A3545">
      <p style="font-size:15px;font-weight:600;margin:0 0 8px">Dear ${greeting},</p>`
}

function emailFooter(brokerName, brokerPhone) {
  return `
    </div>
    <div style="background:#3D4F6B;padding:22px 40px;text-align:center">
      <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0">${brokerName || 'Your Rion Capital Broker'} · ${brokerPhone || ''}</p>
      <p style="font-size:11px;color:rgba(255,255,255,0.35);margin:4px 0 0">Rion Capital Investments Pty Ltd · All your finance. One Relationship.</p>
      <p style="font-size:10px;color:rgba(255,255,255,0.25);margin:4px 0 0">This email is confidential and intended for the named recipient(s) only.</p>
    </div>`
}

// Send HTML email via Rradar's /api/send-email endpoint
async function sendEmail(to, subject, html, brokerName, brokerEmail, attachments = []) {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to, subject, html,
      fromName: brokerName || 'Rion Capital',
      from: brokerEmail || undefined,
      attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to send')
  return data
}

// Fallback: download .eml file (opens in Outlook as draft)
function downloadEml(to, subject, htmlBody, attachments = []) {
  const boundary = 'rion_boundary_' + Date.now()
  const lines = [
    'MIME-Version: 1.0',
    `To: ${to}`,
    `Subject: ${subject}`,
    'X-Unsent: 1',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
  ]
  // Add each attachment
  attachments.forEach(a => {
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: application/octet-stream; name="${a.filename}"`)
    lines.push('Content-Transfer-Encoding: base64')
    lines.push(`Content-Disposition: attachment; filename="${a.filename}"`)
    lines.push('')
    lines.push(a.content)
    lines.push('')
  })
  lines.push(`--${boundary}--`)

  const eml = lines.join('\r\n')
  const blob = new Blob([eml], { type: 'message/rfc822' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = subject.replace(/[^a-zA-Z0-9\s\-·]/g, '').trim() + '.eml'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

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
    { lender: '', rate: '', compRate: '', repayment: '', features: '' },
    { lender: '', rate: '', compRate: '', repayment: '', features: '' },
    { lender: '', rate: '', compRate: '', repayment: '', features: '' },
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
        ${c.compRate ? `<div style="font-size:11px;margin-bottom:4px">Comparison rate: <strong>${c.compRate}%</strong></div>` : ''}
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
        <p style="font-size:13px;line-height:1.7;margin:0 0 20px">Thank you for being a valued Rion Capital client. As part of our ongoing commitment to your financial wellbeing, we've prepared your <strong>Annual Portfolio Review</strong> for ${fmtDate(reviewDate)}. Please find your current loan position and an overview of market options below.</p>

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

        ${comparisons.some(c => c.lender) ? `
        <div style="margin-top:24px">
          <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
            <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Market Comparison — Options to Consider</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
            <tbody><tr>${compCols}</tr></tbody>
          </table>
        </div>` : ''}

        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Next Steps</div>
          ${['Review your current loan facilities against the market options above.',
            'Consider whether your current rate and structure still meets your needs.',
            'Speak with us about refinancing, equity release or debt consolidation opportunities.',
            'Book a 30-minute review call — no obligation, just a conversation.',
            '<strong>Loan term:</strong> Consider whether your current loan term still suits your goals — shortening or extending your term can significantly impact your repayments and total interest paid.'].map((s, i) => `
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

        <Section title="Lender comparisons">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
            Monthly repayments are indicative. A disclaimer noting 30-year P&I assumption is included automatically in the email.
          </div>
          {comparisons.map((c, i) => (
            <div key={i} style={{ marginBottom: 12, padding: '10px', background: '#f8fafc', borderRadius: 6, border: '0.5px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Option {i + 1}</div>
              <Field lbl="Lender" value={c.lender} onChange={v => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, lender: v } : x))} placeholder="e.g. CBA, Westpac" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <div>
                  {label('Rate (%)')}
                  <input type="number" step="0.01" style={inp} value={c.rate}
                    onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                </div>
                <div>
                  {label('Comp. rate (%)')}
                  <input type="number" step="0.01" style={inp} value={c.compRate}
                    onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, compRate: e.target.value } : x))} />
                </div>
                <div>
                  {label('Monthly repayment ($)')}
                  <input type="number" step="1" style={inp} value={c.repayment}
                    onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, repayment: e.target.value } : x))}
                    placeholder="e.g. 2450" />
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                {label('Key features')}
                <input style={inp} value={c.features} placeholder="e.g. Offset, redraw, no ongoing fees"
                  onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, features: e.target.value } : x))} />
              </div>
            </div>
          ))}
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
