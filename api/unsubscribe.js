// Vercel serverless function — the public unsubscribe endpoint.
//
// This is the only part of Rradar reachable without signing in, so it is
// deliberately the narrowest thing that can do the job:
//
//   · It only ever APPENDS to the unsubscribe-requests row (marketing id 8).
//     It never reads or writes the contact store. A publicly reachable write
//     across the real marketing row would be one bug away from wiping the
//     contact list, and no amount of validation here would make that safe.
//     Rradar applies these requests to the actual contacts when Marketing
//     loads, where the person is signed in.
//   · It returns nothing about the contact — not their name, not their email,
//     not whether the token is even real. A token that doesn't exist and a
//     token that does look identical from outside, so the endpoint can't be
//     used to test whether someone is on the list.
//   · A repeat of the same token is not an error. People click unsubscribe
//     twice, and forwarded emails get clicked by other people; the request is
//     idempotent either way.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uudxlflyoeffcertpkrj.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_CI6JvPKvNuCHM7nJdgEUew_z_z1IFBj'
const ROW_ID = 8
const MAX_REQUESTS = 2000
const VALID_TOKEN = /^[a-z0-9]{8,64}$/i
const VALID_REASON = /^[a-z-]{1,32}$/
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_NOTE = 2000
const MAX_EMAIL = 254

// A request is identified by the token we minted, or — for the generic
// footer that goes into a bulk send, which cannot carry a link per person —
// by the address the person typed. This mirrors requestKey() in
// src/lib/unsubscribe.js; the two have to agree or a request would be queued
// under one key and looked for under another. It is duplicated rather than
// imported because this function is bundled on its own, away from src/.
const keyOf = r => r?.token
  ? `t:${r.token}`
  : `e:${String(r?.email || '').trim().toLowerCase()}`

async function sb(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  return res
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const token = String(body.token || '').trim()
    const email = String(body.email || '').trim().toLowerCase().slice(0, MAX_EMAIL)
    const reason = String(body.reason || '').trim()
    const note = String(body.note || '').trim().slice(0, MAX_NOTE)
    const resubscribe = !!body.resubscribe

    // One or the other. A token is preferred where there is one; an address
    // is what the tokenless footer has to work with.
    if (token) {
      if (!VALID_TOKEN.test(token)) return res.status(400).json({ error: 'Invalid link' })
    } else if (email) {
      if (!VALID_EMAIL.test(email)) return res.status(400).json({ error: 'Invalid email address' })
    } else {
      return res.status(400).json({ error: 'Invalid link' })
    }
    if (reason && !VALID_REASON.test(reason)) return res.status(400).json({ error: 'Invalid reason' })

    const read = await sb(`marketing?id=eq.${ROW_ID}&select=data`)
    const rows = read.ok ? await read.json() : []
    const existing = Array.isArray(rows) && rows[0]?.data ? rows[0].data : {}
    const requests = Array.isArray(existing.requests) ? existing.requests : []

    // One live request per person — a second click updates the first rather
    // than stacking up, and a resubscribe simply withdraws it.
    const key = token ? `t:${token}` : `e:${email}`
    const others = requests.filter(r => keyOf(r) !== key)
    const entry = token ? { token } : { email }
    const next = resubscribe
      ? others
      : [...others, { ...entry, reason, note, at: new Date().toISOString(), action: 'unsubscribe' }]

    const upsert = await sb('marketing', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: ROW_ID,
        data: { ...existing, requests: next.slice(-MAX_REQUESTS) },
        updated_at: new Date().toISOString(),
      }),
    })
    if (!upsert.ok) {
      // The request was valid; we just couldn't record it. Say so rather than
      // telling someone they're unsubscribed when they might not be.
      return res.status(502).json({ error: 'Could not record that just now' })
    }

    // Deliberately the same response whether or not the token or address
    // matches anyone. With an address this matters more, not less: a
    // different answer for a known and an unknown address would turn the
    // page into a way of testing who is on the list.
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Something went wrong' })
  }
}
