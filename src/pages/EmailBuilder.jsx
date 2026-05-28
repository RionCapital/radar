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
const LOGO_DATA_URI = "data:image/jpeg;base64,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U0ZPqax+qQ7s+rfHGNtpTh+P+ZLeXH2u8uLvbt8+Z5dvpuYtj9atWXiDWdOtjZ2l+6wMd3lMqumfUBgQKz6K6mk9GfGczvcnur68vZ/tV1dSSyjGHZuRjoB6Ae1Xn8U+IpJ4rl9XuPNhOUcEA5xjJwPm445zWVRS5UwuzrtH1R4NJ1fUJdftl1a+SOOEvNhwgbLZ4wD6CubutV1C9iWC4uSYkYusSqqIGPfaoAz79aq5NFJRSdxuTasXF1nVF07+yVvpRZ5J8nI289ffmn3Gu6xd2UenXOozSW0ahFjYjAUdBnGcfjVCinZCuzQ/4SDWjZx2H9pT+REMIuRlR6BvvY9s4p0niPXZb6LUpNVuGuoM+XKSMrkYPbHNZtFHKuwcz7k13eXV/O1zeTtNK3Vm6/pUNFFMQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/2Q=="

function emailHeader(greeting) {
  return `
    <div style="background:#3D4F6B;padding:20px 32px;text-align:center">
      <img src="${LOGO_DATA_URI}" alt="Rion Capital" style="height:188px;max-width:600px;object-fit:contain;display:block;margin:0 auto" />
    </div>
    <div style="background:#fff;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#2A3545">
      <p style="font-size:15px;font-weight:600;margin:0 0 8px">Dear ${greeting},</p>`
}

function emailFooter(brokerName, brokerPhone) {
  return `
    </div>
    <div style="background:#3D4F6B;padding:20px 32px;text-align:center">
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
function downloadEml(to, subject, htmlBody) {
  const boundary = 'rion_boundary_' + Date.now()
  const eml = [
    'MIME-Version: 1.0',
    `To: ${to}`,
    `Subject: ${subject}`,
    'X-Unsent: 1',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Please view this email in an HTML-capable email client.',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n')
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
function AnnualReview({ client, onBack }) {
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
    const loanRows = loans.filter(l => l.acc || l.lname).map(l => `
      <tr style="border-bottom:0.5px solid #f1f5f9">
        <td style="padding:7px 8px;font-size:11px">${l.lname || l.acc || '—'}</td>
        <td style="padding:7px 8px;font-size:11px">${l.bank || '—'}</td>
        <td style="padding:7px 8px;font-size:11px">${l.rpmt || '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${fmtDate(l.maturity)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${fmt(l.balance)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${l.rate ? l.rate.toFixed(2) + '%' : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${calcRepayment(l) ? '$' + calcRepayment(l).toLocaleString() : '—'}</td>
      </tr>`).join('')

    const secRows = secValues.map(s => `
      <tr style="border-bottom:0.5px solid #f1f5f9">
        <td style="padding:7px 8px;font-size:11px">#${s.num} — ${s.address || '—'}</td>
        <td style="padding:7px 8px;font-size:11px">${s.type || 'Residential'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right">${s.coreLogicVal ? fmt(s.coreLogicVal) : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:#64748b;font-style:italic">CoreLogic estimate — report attached</td>
      </tr>`).join('')

    const compCols = comparisons.filter(c => c.lender).map(c => `
      <td style="padding:12px;text-align:center;vertical-align:top;width:33%">
        <div style="font-weight:700;color:#3D4F6B;font-size:13px;margin-bottom:8px">${c.lender}</div>
        ${c.rate ? `<div style="font-size:11px;margin-bottom:4px">Rate: <strong>${c.rate}%</strong></div>` : ''}
        ${c.compRate ? `<div style="font-size:11px;margin-bottom:4px">Comparison rate: <strong>${c.compRate}%</strong></div>` : ''}
        ${c.repayment ? `<div style="font-size:12px;margin-bottom:4px;color:#3D4F6B;font-weight:700">Est. monthly: <strong>$${Number(c.repayment).toLocaleString()}</strong></div>` : ''}
        ${c.features ? `<div style="font-size:10px;color:#64748b;margin-top:6px">${c.features}</div>` : ''}
      </td>`).join('')

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        <p style="font-size:13px;line-height:1.7;margin:0 0 20px">Thank you for being a valued Rion Capital client. As part of our ongoing commitment to your financial wellbeing, we've prepared your <strong>Annual Portfolio Review</strong> for ${fmtDate(reviewDate)}. Please find your current loan position and an overview of market options below.</p>

        <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0;margin-bottom:0">
          <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Current Loan Facilities</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;border:0.5px solid #e2e8f0">
          <thead style="background:#f8fafc">
            <tr>${['Facility','Lender','Type','Maturity','Balance','Rate','Est. Repayment'].map(h => `<th style="padding:7px 8px;font-size:10px;text-align:${['Balance','Rate','Est. Repayment','Maturity'].includes(h)?'right':'left'};color:#64748b;font-weight:600;text-transform:uppercase">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>${loanRows}</tbody>
          <tfoot style="background:#f8fafc">
            <tr><td colspan="4" style="padding:7px 8px;font-size:11px;font-weight:700">Total portfolio</td>
            <td style="padding:7px 8px;font-size:11px;font-weight:700;text-align:right">${fmt(totalBalance)}</td>
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
              <tr>${['Property','Type','CoreLogic Est. Value','Note'].map(h => `<th style="padding:7px 8px;font-size:10px;text-align:${['CoreLogic Est. Value'].includes(h)?'right':'left'};color:#64748b;font-weight:600;text-transform:uppercase">${h}</th>`).join('')}</tr>
            </thead>
            <tbody>${secRows}</tbody>
          </table>
          <p style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:4px">CoreLogic property report attached for your reference.</p>
        </div>` : ''}

        ${totalSecValue > 0 ? `
        <div style="margin-top:20px;display:flex;gap:12px">
          <table style="width:100%;border-collapse:collapse"><tr>
            <td style="width:33%;padding:14px;background:#f0fdf4;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Portfolio LVR</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${portfolioLVR !== null ? portfolioLVR + '%' : '—'}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">Current</div>
            </td>
            <td style="width:6px"></td>
            <td style="width:33%;padding:14px;background:#fef9c3;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Est. Borrowing Equity</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${fmt(borrowingEquity)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">Resi @80% / Comm @70%</div>
            </td>
            <td style="width:6px"></td>
            <td style="width:33%;padding:14px;background:#eff6ff;border-radius:8px;text-align:center;vertical-align:top">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px">Total Sec. Value</div>
              <div style="font-size:22px;font-weight:700;color:#3D4F6B">${fmt(totalSecValue)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">CoreLogic estimates</div>
            </td>
          </tr></table>
        </div>
        <p style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:6px;padding:8px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b">
          <strong>Disclaimer:</strong> Borrowing equity figures are estimates only based on CoreLogic valuations and standard LVR benchmarks (Residential 80% / Commercial 70%). Actual borrowing capacity is subject to formal valuation, lender assessment and serviceability criteria. These figures do not constitute financial advice.
        </p>` : ''}

        ${comparisons.some(c => c.lender) ? `
        <div style="margin-top:24px">
          <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
            <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Market Comparison — Options to Consider</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
            <tbody><tr>${compCols}</tr></tbody>
          </table>
          <p style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:4px;padding:8px;background:#f8fafc;border-radius:6px;border-left:3px solid #e2e8f0">
            <strong>Repayment disclaimer:</strong> Estimated monthly repayments shown above are indicative only, calculated on a 30-year principal &amp; interest term. Actual repayments will vary based on the loan term, repayment type, fees and individual lender assessment. These figures do not constitute financial advice.
          </p>
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
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const subject = `Annual Portfolio Review — ${client.name} · ${fmtDate(reviewDate)}`
    setSending('sending'); setSendError('')
    try {
      await sendEmail(to, subject, buildHtml(), brokerName, brokerEmail, attachments)
      setSending('sent')
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
  }

  function copyHtml() {
    navigator.clipboard.writeText(buildHtml())
      .then(() => alert('HTML copied — paste into Outlook › Insert › HTML or your email platform'))
      .catch(() => alert('Copy failed — please try again'))
  }

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
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>📋 Annual Review — Live Preview</div>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}
            dangerouslySetInnerHTML={{ __html: buildHtml() }} />
        </div>
      </div>
    </div>
  )
}

// ── FIXED / IO EXPIRY ─────────────────────────────────────────────────────────
function ExpiryEmail({ client, onBack, expiryType }) {
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
            <td style="padding:7px 8px;font-size:11px;text-align:right">${fmt(loan.balance)}</td>
            <td style="padding:7px 8px;font-size:11px;text-align:right">${fmtPct(loan.rate)}</td>
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
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { await sendEmail(to, buildSubject ? buildSubject() : 'Email from Rion Capital', buildHtml()); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
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
function MaturityEmail({ client, onBack }) {
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
            <td style="padding:7px 8px;font-size:11px;text-align:right">${fmt(loan.balance)}</td>
            <td style="padding:7px 8px;font-size:11px;text-align:right">${fmtPct(loan.rate)}</td>
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
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { await sendEmail(to, buildSubject ? buildSubject() : 'Email from Rion Capital', buildHtml()); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
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
function GeneralEmail({ client, onBack }) {
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
            <button onClick={async () => { const to = contacts.filter(c=>c.email).map(c=>c.email).join(', '); try { await sendEmail(to, buildSubject ? buildSubject() : 'Email from Rion Capital', buildHtml()); alert('Sent!') } catch(e) { alert('Error: ' + e.message) } }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Send Email</button>
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
export default function EmailBuilder({ clients }) {
  const { name } = useParams()
  const navigate = useNavigate()
  const client = clients?.find(c => c.name === decodeURIComponent(name)) || {}
  const [template, setTemplate] = useState(null)

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
      {template === 'annual'   && <AnnualReview   client={client} onBack={() => setTemplate(null)} />}
      {template === 'fixed'    && <ExpiryEmail     client={client} onBack={() => setTemplate(null)} expiryType="fixed" />}
      {template === 'io'       && <ExpiryEmail     client={client} onBack={() => setTemplate(null)} expiryType="io" />}
      {template === 'maturity' && <MaturityEmail   client={client} onBack={() => setTemplate(null)} />}
      {template === 'general'  && <GeneralEmail    client={client} onBack={() => setTemplate(null)} />}
    </div>
  )
}
