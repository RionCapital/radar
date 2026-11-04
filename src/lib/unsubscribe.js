import { sbLoadMarketing, sbSaveMarketing } from './supabase'

// ─── Unsubscribe ─────────────────────────────────────────────────────────────
// A one-click unsubscribe link for outbound emails, and the record behind it.
//
// Three rules from ACMA's email unsubscribe fact sheet shape the whole design,
// and each one rules out an obvious shortcut:
//
//   · No account, no login, no additional personal information. So the link
//     can't land on anything behind RequireAuth, and it can't ask who you are
//     — the token has to say that. It also means the REASON must be optional
//     and asked only after the unsubscribe has already been honoured.
//   · The facility has to keep working at least 30 days after the message was
//     sent. So the token is stored, not derived from something that rotates.
//   · Honoured within 5 working days. Ours is immediate.
//
// A token is opaque and random rather than anything derived from the email
// address: a personal detail must never sit in a URL, and a guessable token
// would let anyone unsubscribe anyone.
//
// Where the request lands matters too. The public endpoint does NOT write to
// the contact store — a publicly reachable write over the whole marketing row
// is one bug away from wiping it. It appends to a dedicated row instead
// (ROW_ID 8, following the convention in directIncome.js), and Rradar applies
// those requests to the real contacts when Marketing loads.

export const UNSUB_REQUESTS_ROW = 8

export const UNSUB_REASONS = [
  { id: 'too-many',        label: 'I get too many emails' },
  { id: 'not-relevant',    label: "The content isn't relevant to me" },
  { id: 'not-client',      label: "I'm no longer a client" },
  { id: 'never-signed-up', label: "I don't remember signing up" },
  { id: 'other',           label: 'Something else' },
]
export const reasonLabel = id => UNSUB_REASONS.find(r => r.id === id)?.label || id || ''

// 22 characters of base36 from crypto — opaque, and far too large a space to
// walk through guessing other people's tokens.
export function makeUnsubToken() {
  const bytes = new Uint8Array(16)
  ;(globalThis.crypto || globalThis.msCrypto).getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 22)
}

// A contact's token, minted on first use. Returns the token and the contact to
// save — the caller persists it, because only it knows which list this contact
// came from.
export function ensureUnsubToken(contact) {
  if (contact?.unsubToken) return { token: contact.unsubToken, contact, created: false }
  const token = makeUnsubToken()
  return { token, contact: { ...contact, unsubToken: token }, created: true }
}

export function unsubscribeUrl(token, origin) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/u/${token}`
}

// ─── The email footer ────────────────────────────────────────────────────────
// Sender identification is part of this, not decoration: the Spam Act requires
// a commercial message to identify who sent it and how to contact them, and an
// unsubscribe line floating on its own doesn't satisfy that.
export function buildUnsubFooterHtml({ url, business, abn, acl, address, phone, email }) {
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const FONT = 'font-family:Aptos,Calibri,Arial,sans-serif'
  const idLine = [
    abn ? `ABN ${esc(abn)}` : null,
    acl ? `Australian Credit Licence ${esc(acl)}` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')
  const contactLine = [
    phone ? `<a href="tel:${esc(String(phone).replace(/\s/g, ''))}" style="color:#3D4F6B;text-decoration:none">${esc(phone)}</a>` : null,
    email ? `<a href="mailto:${esc(email)}" style="color:#3D4F6B;text-decoration:none">${esc(email)}</a>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  return `<div style="${FONT};border-top:1px solid #E6EAEF;margin-top:22px;padding-top:16px">
  <div style="${FONT};font-size:10pt;font-weight:700;color:#2A3545">${esc(business)}</div>
  ${idLine ? `<div style="${FONT};font-size:8.5pt;color:#7A8090;line-height:1.7">${idLine}</div>` : ''}
  ${address ? `<div style="${FONT};font-size:8.5pt;color:#7A8090;line-height:1.7">${esc(address)}</div>` : ''}
  ${contactLine ? `<div style="${FONT};font-size:8.5pt;color:#7A8090;line-height:1.7">${contactLine}</div>` : ''}
  <div style="${FONT};font-size:8pt;color:#96A0AE;line-height:1.75;margin-top:12px;padding-top:11px;border-top:1px solid #F0F3F6">
    You are receiving this because you are a client of ${esc(business)} or have asked to hear from us.<br/>
    Would you rather not? <a href="${esc(url)}" style="color:#3D4F6B;font-weight:700">Unsubscribe here</a> — it takes one click, and we will not email you again.
  </div>
</div>`
}

export function buildUnsubFooterText({ url, business, abn, phone, email }) {
  return [
    '',
    '—',
    business,
    abn ? `ABN ${abn}` : null,
    [phone, email].filter(Boolean).join(' · '),
    '',
    `You are receiving this because you are a client of ${business} or have asked to hear from us.`,
    `To unsubscribe, open: ${url}`,
  ].filter(v => v !== null).join('\n')
}

// ─── Requests coming back from the public page ───────────────────────────────
export async function loadUnsubRequests() {
  try {
    const row = await sbLoadMarketing(UNSUB_REQUESTS_ROW)
    return Array.isArray(row?.requests) ? row.requests : []
  } catch {
    return []
  }
}

// Clears the ones that have been applied, so the queue doesn't grow forever
// and a contact who later resubscribes isn't silently unsubscribed again by a
// request that was already honoured.
export async function clearUnsubRequests(tokens) {
  const done = new Set(tokens)
  const remaining = (await loadUnsubRequests()).filter(r => !done.has(r.token))
  return sbSaveMarketing({ requests: remaining }, UNSUB_REQUESTS_ROW)
}

// Applies pending requests to a list of contacts, matching on token. Pure —
// returns the updated list plus which tokens were used, so the caller decides
// what to save and what to clear.
//
// This is the contact's OWN decision arriving, so the trail entry says so:
// via 'Email link', by 'The contact'. A change an admin makes inside Rradar
// is recorded against that admin's name instead, and the two have to stay
// distinguishable — it's the whole point of keeping the trail.
export const UNSUB_TRAIL_MAX = 40
export const CONTACT_ACTOR = 'The contact'

export function applyUnsubRequests(contacts, requests) {
  if (!requests?.length) return { contacts, applied: [], changed: false }
  const byToken = new Map(requests.map(r => [r.token, r]))
  const applied = []
  let changed = false
  const next = (contacts || []).map(c => {
    const req = c.unsubToken && byToken.get(c.unsubToken)
    if (!req) return c
    applied.push(req.token)
    // Already unsubscribed — the request is honoured, just nothing to change.
    if (c.unsubscribed && c.unsubReason === req.reason) return c
    changed = true
    const at = req.at || new Date().toISOString()
    const history = Array.isArray(c.subHistory) ? c.subHistory : []
    return {
      ...c,
      unsubscribed: true,
      unsubscribedAt: c.unsubscribedAt || at,
      unsubscribedVia: 'Email link',
      unsubscribedBy: CONTACT_ACTOR,
      unsubReason: req.reason || c.unsubReason || '',
      unsubNote: req.note || c.unsubNote || '',
      subHistory: [...history, {
        at, action: 'Unsubscribed', via: 'Email link', by: CONTACT_ACTOR,
        reason: req.reason || '',
      }].slice(-UNSUB_TRAIL_MAX),
    }
  })
  return { contacts: next, applied, changed }
}
