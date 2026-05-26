import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcRepayment } from '../lib/dateUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const fmt = v => v ? '$' + Number(v).toLocaleString() : '—'
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
  const greeting = contacts.length > 0
    ? contacts.map(c => c.name.split(' ')[0]).join(' & ')
    : client.name

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: PINK, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Email Builder</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{client.name}</div>
        {contacts.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'rgba(235,153,194,0.15)', color: NAVY, border: `1px solid ${PINK}` }}>
                {c.name} {c.email ? `· ${c.email}` : ''}
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
function emailHeader(greeting) {
  return `
    <div style="background:#3D4F6B;padding:24px 32px;text-align:center">
      <div style="font-family:Georgia,serif;font-size:22px;color:#EB99C2;font-weight:700;letter-spacing:2px">RION <span style="color:#fff;font-weight:300">Capital</span></div>
      <div style="font-family:Georgia,serif;font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px;font-style:italic">All your finance. One Relationship.</div>
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

  const defaultGreeting = contacts.length > 0
    ? contacts.map(c => c.name.split(' ')[0]).join(' & ')
    : client.name

  const [brokerName, setBrokerName] = useState('')
  const [brokerPhone, setBrokerPhone] = useState('')
  const [brokerEmail, setBrokerEmail] = useState('')
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
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
  const resiEquity = secValues.filter(s => s.type !== 'Commercial').reduce((sum, s) => sum + Math.max(0, (Number(s.coreLogicVal) || 0) * 0.8 - totalBalance / Math.max(1, secValues.length)), 0)
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

  function openOutlook() {
    const to = contacts.filter(c => c.email).map(c => c.email).join(';')
    const subject = `Annual Portfolio Review — ${client.name} · ${fmtDate(reviewDate)}`
    const body = `Dear ${defaultGreeting},\n\nPlease find your Annual Portfolio Review attached.\n\nTotal Portfolio Balance: ${fmt(totalBalance)}\n\nYour broker will be in touch within 48 hours.\n\nWarm regards,\n${brokerName || '[Broker Name]'}\n${brokerPhone || ''}\n\nRion Capital`
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
                    <select style={inp} value={s.type || 'Residential'}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyHtml}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${PINK}`, color: PINK, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Copy HTML
            </button>
            <button onClick={openOutlook}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              ✉ Open in Outlook
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
  const greeting = contacts.length > 0 ? contacts.map(c => c.name.split(' ')[0]).join(' & ') : client.name

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
    const to = contacts.filter(c => c.email).map(c => c.email).join(';')
    const subject = `${expiryLabel} — ${loan.lname || client.name} · ${fmtDate(expiryDate)}`
    const body = `Dear ${greeting},\n\nYour ${isFixed ? 'fixed rate' : 'interest only period'} on ${loan.lname || 'your facility'} expires on ${fmtDate(expiryDate)}. Please get in touch to discuss your options.\n\nWarm regards,\n${brokerName || '[Broker Name]'}\n${brokerPhone || ''}`
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Open in Outlook</button>
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
  const greeting = contacts.length > 0 ? contacts.map(c => c.name.split(' ')[0]).join(' & ') : client.name
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
    const to = contacts.filter(c => c.email).map(c => c.email).join(';')
    const subject = `Loan Maturity — ${loan.lname || client.name} · ${fmtDate(loan.maturity)}`
    const body = `Dear ${greeting},\n\nYour facility ${loan.lname || ''} matures on ${fmtDate(loan.maturity)}. Please get in touch to discuss your options.\n\nWarm regards,\n${brokerName || '[Broker Name]'}\n${brokerPhone || ''}`
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Open in Outlook</button>
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
  const greeting = contacts.length > 0 ? contacts.map(c => c.name.split(' ')[0]).join(' & ') : client.name
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
    const to = contacts.filter(c => c.email).map(c => c.email).join(';')
    const body = `Dear ${greeting},\n\n${para1}\n\n${para2}\n\nWarm regards,\n${brokerName || '[Broker Name]'}\n${brokerPhone || ''}`
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject || 'Message from Rion Capital')}&body=${encodeURIComponent(body)}`
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
            <button onClick={openOutlook} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✉ Open in Outlook</button>
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
