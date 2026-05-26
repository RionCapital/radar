import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcRepayment } from '../lib/dateUtils'

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
const LOGO_DATA_URI = "data:image/png;base64,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"

function emailHeader(greeting) {
  return `
    <div style="background:#3D4F6B;padding:20px 32px;text-align:center">
      <img src="${LOGO_DATA_URI}" alt="Rion Capital" style="height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto" />
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
async function sendEmail(to, subject, html, brokerName, brokerEmail) {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html, fromName: brokerName || 'Rion Capital', from: brokerEmail || undefined }),
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

  const defaultGreeting = contactGreeting(contacts) || client.name || ''

  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [brokerEmail, setBrokerEmail] = useState('')
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [sendError, setSendError] = useState('')
  const [comparisons, setComparisons] = useState([
    { lender: '', rate: '', compRate: '', monthly: '', features: '' },
    { lender: '', rate: '', compRate: '', monthly: '', features: '' },
    { lender: '', rate: '', compRate: '', monthly: '', features: '' },
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
        ${c.compRate ? `<div style="font-size:11px;margin-bottom:4px">Comparison: <strong>${c.compRate}%</strong></div>` : ''}
        ${c.monthly ? `<div style="font-size:11px;margin-bottom:4px">Monthly: <strong>$${c.monthly}</strong></div>` : ''}
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
        </div>` : ''}

        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Next Steps</div>
          ${['Review your current loan facilities against the market options above.',
            'Consider whether your current rate and structure still meets your needs.',
            'Speak with us about refinancing, equity release or debt consolidation opportunities.',
            'Book a 30-minute review call — no obligation, just a conversation.'].map((s, i) => `
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
            <div style="width:20px;height:20px;border-radius:50%;background:#3D4F6B;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
            <div style="font-size:12px;color:#2A3545;line-height:1.5">${s}</div>
          </div>`).join('')}
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
    const to = contacts.filter(c => c.email).map(c => c.email).join(', ')
    const subject = `Annual Portfolio Review — ${client.name} · ${fmtDate(reviewDate)}`
    setSending('sending'); setSendError('')
    try {
      await sendEmail(to, subject, buildHtml(), brokerName, brokerEmail)
      setSending('sent')
      setTimeout(() => setSending(null), 4000)
    } catch (err) {
      setSendError(err.message)
      setSending('error')
    }
  }

  function openOutlook() {
    const to = contacts.filter(c => c.email).map(c => c.email).join(', ')
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
        <Section title="Broker details">
          <Field lbl="Broker name" value={brokerName} onChange={setBrokerName} placeholder="Cameron Finlayson" />
          <Field lbl="Broker phone" value={brokerPhone} onChange={setBrokerPhone} placeholder="0400 000 000" />
          <Field lbl="Broker email" value={brokerEmail} onChange={setBrokerEmail} placeholder="broker@rioncapital.com.au" />
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
          {comparisons.map((c, i) => (
            <div key={i} style={{ marginBottom: 12, padding: '10px', background: '#f8fafc', borderRadius: 6, border: '0.5px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Option {i + 1}</div>
              <Field lbl="Lender" value={c.lender} onChange={v => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, lender: v } : x))} placeholder="e.g. CBA, Westpac" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  {label('Rate (%)')}
                  <input type="number" step="0.01" style={inp} value={c.rate}
                    onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                </div>
                <div>
                  {label('Comparison rate (%)')}
                  <input type="number" step="0.01" style={inp} value={c.compRate}
                    onChange={e => setComparisons(prev => prev.map((x, j) => j === i ? { ...x, compRate: e.target.value } : x))} />
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
            <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
              <div style="width:20px;height:20px;border-radius:50%;background:#3D4F6B;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
              <div style="font-size:12px;color:#2A3545;line-height:1.5">${s}</div>
            </div>`).join('')}
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
            <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
              <div style="width:20px;height:20px;border-radius:50%;background:#3D4F6B;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
              <div style="font-size:12px;color:#2A3545;line-height:1.5">${s}</div>
            </div>`).join('')}
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
