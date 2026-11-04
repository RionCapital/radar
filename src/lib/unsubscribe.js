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

// With a token, the one-click link. Without one, the generic link that goes
// in a footer pasted into a bulk send from Outlook — a single mailto carries
// one body to everyone, so it cannot carry a link per person. That page asks
// which address to remove. No trailing slash: `/u/` would not match the
// tokenless route, and a dead link in a compliance footer is worse than none.
export function unsubscribeUrl(token, origin) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return token ? `${base}/u/${token}` : `${base}/u`
}

// A request is identified either by the token we minted or by the address
// the person typed. One key covers both so the queue can hold a mix without
// an email request (which has no token) being matched against, or cleared
// by, `undefined`.
export const normaliseEmail = v => String(v || '').trim().toLowerCase()
export const requestKey = r => r?.token ? `t:${r.token}` : `e:${normaliseEmail(r?.email)}`

// How long a typed address that matches no contact is kept. See
// staleUnmatchedRequests below.
export const UNMATCHED_EMAIL_TTL_MS = 14 * 24 * 60 * 60 * 1000

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
export async function clearUnsubRequests(keys) {
  const done = new Set(keys)
  const remaining = (await loadUnsubRequests()).filter(r => !done.has(requestKey(r)))
  return sbSaveMarketing({ requests: remaining }, UNSUB_REQUESTS_ROW)
}

// A typed address that matches no contact could sit in the queue forever. A
// token can't do that — we minted it, so the contact exists somewhere — but
// anyone can type anything into a public page, and a steady trickle of
// addresses that match nobody would push real requests out of the capped
// queue. So a typed one gets a fortnight to find its contact (a list may not
// have synced yet, or the contact may be added next week) and is then let go.
// Nothing is lost by doing so: an address on no list has nothing to honour.
export function staleUnmatchedRequests(requests, matchedKeys, now = Date.now()) {
  const matched = new Set(matchedKeys)
  return (requests || [])
    .filter(r => !r.token && !matched.has(requestKey(r)))
    .filter(r => {
      const t = Date.parse(r.at || '')
      return Number.isFinite(t) && now - t > UNMATCHED_EMAIL_TTL_MS
    })
    .map(requestKey)
}

// Applies pending requests to a list of contacts, matching on token. Pure —
// returns the updated list plus which tokens were used, so the caller decides
// what to save and what to clear.
//
// This is the contact's OWN decision arriving, so the trail entry says so:
// by 'The contact'. A change an admin makes inside Rradar is recorded against
// that admin's name instead, and the two have to stay distinguishable — it's
// the whole point of keeping the trail.
//
// The two public paths are also kept apart, because they are not equally
// strong evidence. A token can only have come from the email we sent to that
// person. A typed address is whatever someone put in the box on a page
// anybody can open — almost always the person themselves, but not provably
// so, and it is the one that could be used to take someone else off the
// list. Both are honoured without question; only the record differs.
export const UNSUB_TRAIL_MAX = 40
export const CONTACT_ACTOR = 'The contact'
export const VIA_LINK  = 'Email link'
export const VIA_TYPED = 'Email link (address entered)'

export function applyUnsubRequests(contacts, requests) {
  if (!requests?.length) return { contacts, applied: [], changed: false }
  const byToken = new Map()
  const byEmail = new Map()
  requests.forEach(r => {
    if (r.token) byToken.set(r.token, r)
    else if (r.email) byEmail.set(normaliseEmail(r.email), r)
  })

  const applied = []
  let changed = false
  const next = (contacts || []).map(c => {
    // Token first: it is the stronger match, and it survives a contact
    // changing their email address.
    const req = (c.unsubToken && byToken.get(c.unsubToken))
      || (c.email && byEmail.get(normaliseEmail(c.email)))
    if (!req) return c
    applied.push(requestKey(req))
    // Already unsubscribed — the request is honoured, just nothing to change.
    if (c.unsubscribed && c.unsubReason === req.reason) return c
    changed = true
    const at = req.at || new Date().toISOString()
    const via = req.token ? VIA_LINK : VIA_TYPED
    const history = Array.isArray(c.subHistory) ? c.subHistory : []
    return {
      ...c,
      unsubscribed: true,
      unsubscribedAt: c.unsubscribedAt || at,
      unsubscribedVia: via,
      unsubscribedBy: CONTACT_ACTOR,
      unsubReason: req.reason || c.unsubReason || '',
      unsubNote: req.note || c.unsubNote || '',
      subHistory: [...history, {
        at, action: 'Unsubscribed', via, by: CONTACT_ACTOR,
        reason: req.reason || '',
      }].slice(-UNSUB_TRAIL_MAX),
    }
  })
  return { contacts: next, applied, changed }
}
