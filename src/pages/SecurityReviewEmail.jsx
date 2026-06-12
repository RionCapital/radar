import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../lib/settings'
import { calcRepayment } from '../lib/dateUtils'
import { LOGO_DATA_URI, sendEmail, downloadEml, emailHeader, emailFooter } from '../lib/emailUtils'

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const fmt = v => v ? '$' + Number(v).toLocaleString() : '—'
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) }
const inp = { width: '100%', fontSize: 11, padding: '5px 8px', border: '0.5px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#1e293b', boxSizing: 'border-box' }
const label = txt => <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</div>
const Section = ({ title, children }) => (
  <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '0.5px solid #f1f5f9' }}>{title}</div>
    {children}
  </div>
)

const INCUMBENT_STATUS = [
  { id: 'repriced', label: 'Repriced — rate reduced', color: '#22c55e', bg: '#f0fdf4' },
  { id: 'declined', label: 'Unable to improve', color: '#ef4444', bg: '#fef2f2' },
  { id: 'pending',  label: 'Awaiting response',  color: '#e8a020', bg: '#fffbeb' },
]

const blankComparisons = () => [
  { lender: '', rate: '', repayment: '', features: '' },
  { lender: '', rate: '', repayment: '', features: '' },
  { lender: '', rate: '', repayment: '', features: '' },
]

export default function SecurityReviewEmail({ clients, updateClient }) {
  const { name, secIdx } = useParams()
  const navigate = useNavigate()
  const client = clients?.find(c => c.name === decodeURIComponent(name))

  const secIndex = parseInt(secIdx) || 0
  const security = client?.securities?.[secIndex]
  const secNum = String(security?.num || secIndex + 1)

  // All active loans tied to this security (direct or cross-col)
  const linkedLoans = (client?.loans || []).filter(l => {
    if (l.closed) return false
    const direct = String(l.security || '').trim() === secNum
    const crossed = l.crossed && l.crossed.split(',').map(x => x.trim()).includes(secNum)
    return direct || crossed
  })

  const user = getCurrentUser()
  const brokerName = user?.name || ''
  const brokerPhone = user?.phone || ''
  const brokerEmail = user?.email || ''

  const contactGreeting = () => {
    const contacts = (client?.contacts || []).filter(c => c.type === 'Ind' || (!c.type && c.name))
    if (contacts.length === 0) return client?.name || ''
    return contacts.map(c => c.first || c.name || '').filter(Boolean).join(' & ')
  }

  // Recipients — auto-populate from contacts
  const defaultRecipients = (client?.contacts || [])
    .filter(c => c.email)
    .map(c => ({ name: c.first ? `${c.first || ''} ${c.last || ''}`.trim() : c.name || '', email: c.email }))

  const [recipients, setRecipients] = useState(defaultRecipients)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const addRecipient = () => {
    if (!addEmail) return
    setRecipients(r => [...r, { name: addName, email: addEmail }])
    setAddName(''); setAddEmail('')
  }
  const removeRecipient = i => setRecipients(r => r.filter((_, j) => j !== i))

  // Per-loan state
  const [loanData, setLoanData] = useState(
    linkedLoans.map(l => ({
      incumbent: { status: 'pending', rateOffered: '', notes: '' },
      comparisons: blankComparisons(),
    }))
  )

  const updateLoan = (li, field, val) =>
    setLoanData(prev => prev.map((d, i) => i === li ? { ...d, [field]: val } : d))
  const updateIncumbent = (li, field, val) =>
    setLoanData(prev => prev.map((d, i) => i === li ? { ...d, incumbent: { ...d.incumbent, [field]: val } } : d))
  const updateComparison = (li, ci, field, val) =>
    setLoanData(prev => prev.map((d, i) => i === li ? {
      ...d,
      comparisons: d.comparisons.map((c, j) => j === ci ? { ...c, [field]: val } : c)
    } : d))

  const [estVal, setEstVal] = useState(security?.estVal || '')
  const [recommendation, setRecommendation] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(null)
  const [sendError, setSendError] = useState('')
  const [viewMode, setViewMode] = useState('split')

  function handleAttachFiles(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const b64 = ev.target.result.split(',')[1]
        setAttachments(prev => [...prev, { filename: file.name, content: b64, size: file.size }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function buildHtml() {
    const greeting = contactGreeting()
    const fmtWhole = v => v ? '$' + Math.round(Number(v)).toLocaleString() : '—'

    // Security position block
    const ev = Number(estVal) || security?.estVal || 0
    const lvr = security?.lvr !== undefined ? security.lvr : 80
    const totalLinkedDebt = linkedLoans.reduce((s, l) => s + (l.balance || 0), 0)
    const lendingEquity = ev > 0 ? Math.round(ev * lvr / 100 - totalLinkedDebt) : null
    const actualLVR = ev > 0 && totalLinkedDebt > 0 ? Math.round(totalLinkedDebt / ev * 100) : null

    // Per-loan HTML
    const loanSections = linkedLoans.map((l, li) => {
      const ld = loanData[li]
      const inc = ld.incumbent
      const statusInfo = INCUMBENT_STATUS.find(s => s.id === inc.status) || INCUMBENT_STATUS[2]
      const comps = ld.comparisons.filter(c => c.lender)

      const compRows = comps.map((c, ci) => `
        <tr style="border-bottom:0.5px solid #f1f5f9;${ci===0?'background:#fdf0f6':''}">
          <td style="padding:8px 10px;font-size:11px;font-weight:600;color:${ci===0?'#DA408D':'#2A3545'}">
            ${c.lender}${ci===0?' <span style="background:#DA408D;color:#fff;font-size:9px;padding:1px 5px;border-radius:10px;margin-left:4px">Best rate</span>':''}
          </td>
          <td style="padding:8px 10px;font-size:11px;text-align:right;font-weight:${ci===0?'700':'400'};color:${ci===0?'#DA408D':'#2A3545'}">${c.rate ? c.rate + '% p.a.' : '—'}</td>
          <td style="padding:8px 10px;font-size:11px;text-align:right">${c.repayment ? '$' + Number(c.repayment).toLocaleString() + '/mo' : '—'}</td>
          <td style="padding:8px 10px;font-size:10px;color:#64748b">${c.features || '—'}</td>
        </tr>`).join('')

      return `
        <div style="margin-top:20px;border:0.5px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <div style="background:#3D4F6B;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:700;color:#fff">${l.lname || l.acc || 'Loan'}</span>
            <span style="font-size:11px;color:#EB99C2">${l.bank || '—'} · ${l.acc || ''}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border-bottom:0.5px solid #e2e8f0">
            <tbody>
              <tr>
                ${[['Balance', fmtWhole(l.balance)], ['Rate', l.rate ? l.rate.toFixed(2) + '% p.a.' : '—'], ['Type', l.rpmt || '—'], ['Repayment', calcRepayment(l) ? '$' + calcRepayment(l).toLocaleString() + '/mo' : '—']].map(([k, v]) =>
                  `<td style="padding:8px 10px;font-size:11px;text-align:center"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${k}</div><strong>${v}</strong></td>`
                ).join('')}
              </tr>
            </tbody>
          </table>

          <div style="padding:12px 14px;background:${statusInfo.bg};border-bottom:0.5px solid #e2e8f0">
            <div style="font-size:10px;font-weight:700;color:${statusInfo.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:${inc.rateOffered||inc.notes?'8px':'0'}">${l.bank||'Lender'} — ${statusInfo.label}</div>
            ${inc.rateOffered ? `<div style="font-size:12px;color:#2A3545">Repriced to: <strong>${inc.rateOffered}% p.a.</strong></div>` : ''}
            ${inc.notes ? `<div style="font-size:12px;color:#2A3545;margin-top:4px;line-height:1.6">${inc.notes}</div>` : ''}
          </div>

          ${comps.length > 0 ? `
          <div style="padding:0">
            <div style="background:#f8fafc;padding:8px 14px;border-bottom:0.5px solid #e2e8f0">
              <span style="font-size:10px;font-weight:700;color:#3D4F6B;text-transform:uppercase;letter-spacing:0.06em">Market comparison</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f8fafc">
                ${['Lender','Rate','Est. repayment','Key feature'].map(h => `<th style="padding:6px 10px;font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;text-align:${['Rate','Est. repayment'].includes(h)?'right':'left'}">${h}</th>`).join('')}
              </tr></thead>
              <tbody>${compRows}</tbody>
            </table>
            <div style="padding:6px 10px;font-size:9px;color:#94a3b8;font-style:italic;border-top:0.5px solid #f1f5f9">
              Estimated repayments are indicative only, calculated on a 30-year P&I term. These figures do not constitute financial advice.
            </div>
          </div>` : ''}
        </div>`
    }).join('')

    const recBlock = recommendation ? `
      <div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:0.5px solid #fde68a;border-radius:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Our recommendation</div>
        <div style="font-size:12px;color:#2A3545;line-height:1.7">${recommendation}</div>
      </div>` : ''

    const propBlock = ev > 0 ? `
      <div style="margin-top:20px">
        <div style="background:#3D4F6B;padding:10px 14px;border-radius:6px 6px 0 0">
          <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.06em">Property position</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:0.5px solid #e2e8f0">
          <tbody><tr>
            <td style="padding:10px 6px;text-align:center;background:#f0fdf4">
              <div style="font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:3px">Est. value</div>
              <div style="font-size:12px;font-weight:700;color:#3D4F6B">${fmtWhole(ev)}</div>
            </td>
            <td style="padding:10px 6px;text-align:center;background:#fef9c3">
              <div style="font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:3px">Total debt</div>
              <div style="font-size:12px;font-weight:700;color:#3D4F6B">${fmtWhole(totalLinkedDebt)}</div>
            </td>
            <td style="padding:10px 6px;text-align:center;background:#eff6ff">
              <div style="font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:3px">Lending equity @${lvr}%</div>
              <div style="font-size:12px;font-weight:700;color:${lendingEquity>0?'#166534':'#c0392b'}">${lendingEquity !== null ? fmtWhole(lendingEquity) : '—'}</div>
            </td>
            <td style="padding:10px 6px;text-align:center;background:#f0f4f8">
              <div style="font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:3px">Actual LVR</div>
              <div style="font-size:12px;font-weight:700;color:#3D4F6B">${actualLVR !== null ? actualLVR + '%' : '—'}</div>
            </td>
          </tr></tbody>
        </table>
      </div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc">
      <div style="max-width:600px;margin:0 auto;background:#fff">
        ${emailHeader(greeting)}
        <p style="font-size:13px;line-height:1.7;margin:0 0 16px">Following our recent Annual Portfolio Review, we have now completed our market analysis for your <strong>${security?.address || 'property'}</strong>. Please find below the outcome of the pricing review with your current lender(s), together with a selection of comparable market options.</p>
        ${propBlock}
        ${loanSections}
        ${recBlock}
        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #EB99C2">
          <div style="font-size:12px;font-weight:700;color:#3D4F6B;margin-bottom:10px">Next steps</div>
          ${['Contact us to confirm how you would like to proceed with the above.',
            'We can arrange formal loan applications for any refinance option above.',
            'If you have other properties under review, a separate comparison will follow.',
            'Book a call with your broker to walk through any questions.'].map((s, i) => `
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px"><tr>
            <td style="width:26px;vertical-align:top;padding-top:2px">
              <table style="border-collapse:collapse"><tr><td style="width:22px;height:22px;background:#3D4F6B;color:#fff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;border-radius:11px">${i+1}</td></tr></table>
            </td>
            <td style="font-size:12px;color:#2A3545;line-height:1.6;padding-left:10px">${s}</td>
          </tr></table>`).join('')}
        </div>
        ${notes ? `<div style="margin-top:16px;padding:14px;background:#fff;border:0.5px solid #e2e8f0;border-radius:8px"><p style="font-size:12px;color:#2A3545;margin:0;line-height:1.7">${notes}</p></div>` : ''}
        <div style="margin-top:20px;padding:14px;background:#EB99C2;border-radius:8px;text-align:center">
          <p style="font-size:12px;color:#fff;margin:0 0 4px;font-weight:600">${brokerName || 'Your broker'} is available to discuss your options at any time.</p>
          ${brokerPhone ? `<p style="font-size:12px;color:#fff;margin:0">Call us directly: <strong>${brokerPhone}</strong></p>` : ''}
        </div>
        <p style="font-size:13px;margin-top:20px;line-height:1.7">Warm regards,<br/><strong>${brokerName || '[Broker Name]'}</strong><br/>${brokerPhone || ''}</p>
        ${emailFooter(brokerName, brokerPhone)}
      </div></body></html>`
  }

  async function handleSend() {
    const to = recipients.map(r => r.email).join(', ')
    if (!to) { alert('Please add at least one recipient'); return }
    const subject = `Property Review — ${security?.address || client?.name} — Rion Capital`
    const html = buildHtml()
    const payloadSize = new Blob([JSON.stringify({ to, subject, html, attachments })]).size
    const LIMIT = 3.5 * 1024 * 1024
    if (payloadSize > LIMIT) {
      if (window.confirm(`Email size (${(payloadSize/1024/1024).toFixed(1)}MB) is too large. Download as .eml for Outlook instead?`)) {
        downloadEml(to, subject, html, attachments)
      }
      return
    }
    setSending('sending'); setSendError('')
    try {
      await sendEmail(to, subject, html, brokerName, brokerEmail, attachments)
      setSending('sent')
      setTimeout(() => setSending(null), 4000)
    } catch (err) {
      setSendError(err.message); setSending('error')
    }
  }

  function openOutlook() {
    const to = recipients.map(r => r.email).join(', ')
    const subject = `Property Review — ${security?.address || client?.name} — Rion Capital`
    downloadEml(to, subject, buildHtml(), attachments)
  }

  if (!client) return <div style={{ padding: 32, color: '#c0392b' }}>Client not found.</div>
  if (!security) return <div style={{ padding: 32, color: '#c0392b' }}>Security not found.</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Left: Inputs */}
      <div style={{ overflowY: 'auto', padding: 16, background: '#f8fafc', borderRight: '0.5px solid #e2e8f0' }}>
        <button onClick={() => navigate(`/radar/clients/${encodeURIComponent(client.name)}`)}
          style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back to {client.name}
        </button>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>📍 Property Review Follow-up</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{security.address}</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
            {linkedLoans.length} loan{linkedLoans.length !== 1 ? 's' : ''} linked to this security
          </div>
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
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Name" value={addName} onChange={e => setAddName(e.target.value)} />
            <input style={{ ...inp, flex: 2 }} placeholder="email@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRecipient()} />
            <button onClick={addRecipient} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: NAVY, color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
          </div>
        </Section>

        <Section title="Property details">
          <div style={{ marginBottom: 8 }}>
            {label('Updated estimated value ($)')}
            <input type="number" style={inp} value={estVal} onChange={e => setEstVal(e.target.value)}
              placeholder={security.estVal ? String(security.estVal) : 'e.g. 850000'} />
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
            Current: {security.estVal ? fmt(security.estVal) : 'not set'} · LVR benchmark: {security.lvr !== undefined ? security.lvr : 80}%
          </div>
        </Section>

        {/* Per-loan sections */}
        {linkedLoans.map((l, li) => {
          const ld = loanData[li]
          return (
            <Section key={li} title={l.lname || l.acc || `Loan ${li + 1}`}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10, padding: '6px 8px', background: '#f8fafc', borderRadius: 5 }}>
                {l.bank || '—'} · {l.balance ? fmt(l.balance) : '—'} · {l.rate ? l.rate.toFixed(2) + '% p.a.' : '—'} · {l.rpmt || '—'}
              </div>

              {/* Incumbent response */}
              <div style={{ marginBottom: 10 }}>
                {label('Incumbent lender response')}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                  {INCUMBENT_STATUS.map(s => (
                    <button key={s.id} onClick={() => updateIncumbent(li, 'status', s.id)}
                      style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, border: `1px solid ${ld.incumbent.status === s.id ? s.color : '#e2e8f0'}`, background: ld.incumbent.status === s.id ? s.bg : '#fff', color: ld.incumbent.status === s.id ? s.color : '#64748b', cursor: 'pointer', fontWeight: ld.incumbent.status === s.id ? 700 : 400 }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {ld.incumbent.status === 'repriced' && (
                  <div style={{ marginBottom: 6 }}>
                    {label('New rate offered (%)')}
                    <input type="number" step="0.01" style={inp} value={ld.incumbent.rateOffered}
                      onChange={e => updateIncumbent(li, 'rateOffered', e.target.value)} placeholder="e.g. 5.99" />
                  </div>
                )}
                <div>
                  {label('Notes / detail')}
                  <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={ld.incumbent.notes}
                    onChange={e => updateIncumbent(li, 'notes', e.target.value)}
                    placeholder="e.g. 'Effective 1 July 2026, no change to terms'" />
                </div>
              </div>

              {/* 3 market comparisons */}
              <div>
                {label('Market comparisons')}
                {ld.comparisons.map((c, ci) => (
                  <div key={ci} style={{ marginBottom: 8, padding: '8px 10px', background: ci === 0 ? '#fdf0f6' : '#f8fafc', borderRadius: 6, border: `0.5px solid ${ci === 0 ? '#f4c7dc' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: ci === 0 ? PINK : '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {ci === 0 ? '⭐ Best option' : `Option ${ci + 1}`}
                    </div>
                    <input style={{ ...inp, marginBottom: 4 }} value={c.lender} placeholder="Lender name"
                      onChange={e => updateComparison(li, ci, 'lender', e.target.value)} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                      <input style={inp} type="number" step="0.01" value={c.rate} placeholder="Rate %"
                        onChange={e => updateComparison(li, ci, 'rate', e.target.value)} />
                      <input style={inp} type="number" step="1" value={c.repayment} placeholder="Rpmt $/mo"
                        onChange={e => updateComparison(li, ci, 'repayment', e.target.value)} />
                    </div>
                    <input style={inp} value={c.features} placeholder="Key feature (offset, redraw, no fee…)"
                      onChange={e => updateComparison(li, ci, 'features', e.target.value)} />
                  </div>
                ))}
              </div>
            </Section>
          )
        })}

        <Section title="Overall recommendation">
          <textarea rows={4} style={{ ...inp, resize: 'vertical' }} value={recommendation}
            onChange={e => setRecommendation(e.target.value)}
            placeholder="e.g. 'Given the lender's repricing and your current balance, we recommend accepting their offer. However, if you're planning to renovate, refinancing to Macquarie could unlock the equity at a lower rate…'" />
        </Section>

        <Section title="Additional notes">
          <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any other context for the client..." />
        </Section>

        <Section title="Attachments">
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>Attach property report, fact find, or comparison documents.</div>
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, padding: '4px 8px', background: '#f8fafc', borderRadius: 5, border: '0.5px solid #e2e8f0' }}>
              <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {a.filename}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{(a.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <label style={{ display: 'block', marginTop: 6, padding: '6px 10px', background: NAVY, color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            + Attach files
            <input type="file" multiple style={{ display: 'none' }} onChange={handleAttachFiles} accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg" />
          </label>
        </Section>

        {/* Send buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={handleSend} disabled={sending === 'sending'}
            style={{ padding: '10px', borderRadius: 8, border: 'none', background: sending === 'sent' ? '#22c55e' : PINK, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {sending === 'sending' ? '⏳ Sending…' : sending === 'sent' ? '✓ Sent!' : `📤 Send review email`}
          </button>
          <button onClick={openOutlook}
            style={{ padding: '8px', borderRadius: 8, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            📎 Download .eml (Outlook)
          </button>
          {sendError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{sendError}</div>}
        </div>
      </div>

      {/* Right: Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>📍 Property Review — Live Preview</div>
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
            {[['split', '⊞', 'Split'], ['desktop', '🖥', 'Desktop'], ['mobile', '📱', 'Mobile']].map(([mode, icon, lbl]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ fontSize: 10, padding: '4px 8px', border: 'none', cursor: 'pointer', fontWeight: 600, background: viewMode === mode ? NAVY : '#fff', color: viewMode === mode ? '#fff' : '#64748b' }}>
                {icon} {lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f1f5f9' }}>
          {viewMode === 'split' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', padding: '6px 10px', background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>Desktop</div>
                <iframe srcDoc={buildHtml()} style={{ width: '100%', height: 600, border: 'none' }} title="preview-desktop" />
              </div>
              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', padding: '6px 10px', background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>Mobile</div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', background: '#e2e8f0' }}>
                  <div style={{ width: 375, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <iframe srcDoc={buildHtml()} style={{ width: '100%', height: 580, border: 'none' }} title="preview-mobile" />
                  </div>
                </div>
              </div>
            </div>
          ) : viewMode === 'mobile' ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 390, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                <iframe srcDoc={buildHtml()} style={{ width: '100%', height: 700, border: 'none' }} title="preview" />
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <iframe srcDoc={buildHtml()} style={{ width: '100%', height: 700, border: 'none' }} title="preview" />
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
