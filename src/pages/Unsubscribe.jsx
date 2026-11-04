import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { UNSUB_REASONS } from '../lib/unsubscribe'
import { loadSettings } from '../lib/settings'

// ─── The public unsubscribe page ─────────────────────────────────────────────
// Sits OUTSIDE RequireAuth — ACMA is explicit that an unsubscribe facility
// can't require an account or a login, so this is the one route in Rradar that
// anyone can open.
//
// There are two ways in, because there have to be:
//
//   /u/<token>  — the one-click link, personal to one recipient. The
//                 unsubscribe is sent the moment the page opens, before
//                 anything is asked. That ordering is the whole point: the
//                 request is honoured first and the reason is a genuinely
//                 optional afterthought. A page that collected a reason
//                 before acting would be requiring additional personal
//                 information to unsubscribe, which isn't allowed.
//
//   /u          — the generic link, for a footer pasted into a bulk send
//                 from Outlook. One mailto carries one body to everyone, so
//                 it cannot carry a link per person. This page asks which
//                 address to remove. Asking for the address the message was
//                 sent to is not "additional personal information" — it is
//                 the electronic address the Act is about — but it is one
//                 more step, so the one-click link is still the better path
//                 wherever it can be used.

const NAVY = '#3D4F6B'
const PINK = '#EB99C2'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function Unsubscribe() {
  const { token } = useParams()
  const settings = loadSettings()
  const co = settings.companyDetails || {}
  const business = co.fullCompanyName || co.tradingName || 'Rion Capital'

  // With a token there is nothing to ask, so the page opens already working.
  // Without one it has to ask for the address first.
  const [state, setState] = useState(token ? 'working' : 'ask') // ask | working | done | failed
  const [email, setEmail] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [resubscribed, setResubscribed] = useState(false)

  // Whatever identifies this person for the rest of the session. Set once —
  // the reason, and a change of mind, have to go to the same place as the
  // unsubscribe did.
  const identity = useRef(token ? { token } : null)

  async function post(payload) {
    const res = await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(identity.current || {}), ...payload }),
    })
    if (!res.ok) throw new Error('failed')
    return res.json()
  }

  // Honour it immediately, on arrival. The ref means one request per token
  // even under StrictMode's double-invoke in development — the endpoint is
  // idempotent, but there is no reason to send it twice. The ref is the
  // dedupe, so the result is applied whichever mount it belongs to:
  // cancelling on unmount would leave StrictMode's second mount waiting
  // forever for a request the first one already sent.
  const sentFor = useRef(null)
  useEffect(() => {
    if (!token) return
    if (sentFor.current === token) return
    sentFor.current = token
    post({})
      .then(() => setState('done'))
      .catch(() => setState('failed'))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  function submitEmail(ev) {
    ev?.preventDefault?.()
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) { setEmailErr('That doesn’t look like an email address.'); return }
    setEmailErr('')
    identity.current = { email: v }
    setState('working')
    post({})
      .then(() => setState('done'))
      .catch(() => setState('failed'))
  }

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }
  const wrap = { minHeight: '100vh', background: '#F4F6F9', fontFamily: 'Aptos,Calibri,Arial,sans-serif' }

  const Header = () => (
    <div style={{ background: NAVY, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
        <span style={{ color: PINK }}>R</span>radar
      </span>
      <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
        Powered by {co.tradingName || 'Rion Capital'}
      </span>
    </div>
  )

  const SenderDetails = () => (
    <div style={{ marginTop: 20, fontSize: 11.5, color: '#96A0AE', lineHeight: 1.7 }}>
      {business}{co.abn ? ` · ABN ${co.abn}` : ''}<br />
      {co.phone && <a href={`tel:${String(co.phone).replace(/\s/g, '')}`} style={{ color: NAVY, textDecoration: 'none' }}>{co.phone}</a>}
      {co.phone && co.email ? ' · ' : ''}
      {co.email && <a href={`mailto:${co.email}`} style={{ color: NAVY, textDecoration: 'none' }}>{co.email}</a>}
    </div>
  )

  async function sendFeedback() {
    try { await post({ reason, note }) } catch {}
    setSent(true)
  }
  async function resubscribe() {
    try { await post({ resubscribe: true }); setResubscribed(true) } catch {}
  }

  // ── No token: ask which address to take off the list ──
  if (state === 'ask') {
    return (
      <div style={wrap}>
        <Header />
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 56px' }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#2A3545' }}>Unsubscribe from our emails</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6B7686', lineHeight: 1.7 }}>
            Enter the email address you received our message at and we'll take it off our marketing list.
            Nothing else is needed — no account, no password.
          </p>
          {/* noValidate: the browser's own bubble varies by browser and
              vanishes on the next click. One message, in the page, that
              stays put until it's fixed. */}
          <form onSubmit={submitEmail} noValidate style={{ marginTop: 20, ...card, padding: '20px 22px' }}>
            <label htmlFor="unsub-email" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7686', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Your email address
            </label>
            <input id="unsub-email" type="email" inputMode="email" autoComplete="email" autoFocus
              value={email} onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr('') }}
              placeholder="you@example.com.au"
              style={{
                width: '100%', boxSizing: 'border-box', border: `1.5px solid ${emailErr ? '#FCA5A5' : '#E2E8F0'}`,
                borderRadius: 9, padding: '12px 13px', fontSize: 14, fontFamily: 'inherit', color: '#2A3545',
                minHeight: 44,
              }} />
            {emailErr && <div role="alert" style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>{emailErr}</div>}
            <button type="submit"
              style={{
                marginTop: 14, background: NAVY, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5,
                padding: '12px 24px', borderRadius: 9, minHeight: 44, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Unsubscribe me
            </button>
          </form>
          <div style={{ marginTop: 16, fontSize: 11.5, color: '#96A0AE', lineHeight: 1.7 }}>
            This only stops marketing and newsletter emails. We will still contact you about any loan or
            application in progress.
          </div>
          <SenderDetails />
        </div>
      </div>
    )
  }

  if (state === 'working') {
    return (
      <div style={wrap}>
        <Header />
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 20px', color: '#6B7686', fontSize: 14 }}>
          One moment — removing you from the list…
        </div>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div style={wrap}>
        <Header />
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
          <div style={{ ...card, borderColor: '#FECACA', background: '#FEF2F2', padding: '18px 22px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#B91C1C' }}>We couldn't complete that</div>
            <p style={{ fontSize: 13.5, color: '#7F3B3B', lineHeight: 1.7, margin: '6px 0 0' }}>
              Something went wrong at our end, so we can't confirm you've been removed. Please try again,
              or email {co.email ? <a href={`mailto:${co.email}`} style={{ color: '#B91C1C', fontWeight: 700 }}>{co.email}</a> : 'us'} and
              we will take care of it by hand.
            </p>
          </div>
          <SenderDetails />
        </div>
      </div>
    )
  }

  if (resubscribed) {
    return (
      <div style={wrap}>
        <Header />
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2A3545', margin: 0 }}>You're back on the list</h1>
          <p style={{ fontSize: 14, color: '#6B7686', lineHeight: 1.7, marginTop: 8 }}>
            Welcome back — you'll keep hearing from us.
          </p>
          <SenderDetails />
        </div>
      </div>
    )
  }

  // ── Done: unsubscribed, now the optional part ──
  return (
    <div style={wrap}>
      <Header />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} role="img" aria-label="Done">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>You have been unsubscribed</div>
            <div style={{ fontSize: 12.5, color: '#3F6B4C', lineHeight: 1.6, marginTop: 3 }}>
              {/* With a typed address, "if it was on our list" is the honest
                  wording AND the safe one: confirming that a given address
                  is on the list would make this page a way of finding out
                  who we email. */}
              {identity.current?.email
                ? <>If <strong>{identity.current.email}</strong> was on our marketing list, it has been removed. Nothing further is needed from you.</>
                : <>You've been removed from our email list. Nothing further is needed from you.</>}
            </div>
          </div>
        </div>

        {sent ? (
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2A3545' }}>That's all done</div>
            <p style={{ fontSize: 13.5, color: '#6B7686', lineHeight: 1.7, margin: '6px 0 0' }}>
              Thank you for letting us know why — it genuinely helps.
            </p>
          </div>
        ) : (
          <>
            <div>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#2A3545' }}>Mind telling us why?</h1>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B7686', lineHeight: 1.6 }}>
                Entirely optional — you are already unsubscribed either way. It just helps us send better things to the people who do want them.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {UNSUB_REASONS.map(r => (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
                  border: `1.5px solid ${reason === r.id ? NAVY : '#E2E8F0'}`, borderRadius: 9,
                  padding: '14px 16px', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box',
                }}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    style={{ accentColor: NAVY, width: 18, height: 18, margin: 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, color: '#2A3545' }}>{r.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label htmlFor="unsub-note" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7686', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Anything else? (optional)
              </label>
              <textarea id="unsub-note" rows={3} value={note} onChange={e => setNote(e.target.value)}
                placeholder="Tell us more, if you like"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: 9, padding: '11px 13px', fontSize: 13, fontFamily: 'inherit', color: '#2A3545', resize: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={sendFeedback} disabled={!reason && !note.trim()}
                style={{
                  background: (!reason && !note.trim()) ? '#C6CDD7' : NAVY, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 13.5, padding: '12px 24px', borderRadius: 9, minHeight: 44,
                  cursor: (!reason && !note.trim()) ? 'default' : 'pointer', fontFamily: 'inherit',
                }}>
                Send feedback
              </button>
              <button onClick={() => setSent(true)}
                style={{ background: 'none', border: 'none', color: '#6B7686', fontSize: 13, textDecoration: 'underline', padding: '12px 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                No thanks, I'm done
              </button>
            </div>
          </>
        )}

        <div style={{ paddingTop: 16, borderTop: '1px solid #E6EAEF', fontSize: 11.5, color: '#96A0AE', lineHeight: 1.7 }}>
          Unsubscribed by mistake?{' '}
          <button onClick={resubscribe}
            style={{ background: 'none', border: 'none', padding: 0, color: NAVY, fontWeight: 700, fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
            Put me back on the list
          </button>
          <br />
          This only stops marketing and newsletter emails. We will still contact you about any loan or application in progress.
        </div>

        <SenderDetails />
      </div>
    </div>
  )
}
