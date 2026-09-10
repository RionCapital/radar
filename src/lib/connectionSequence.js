// Connection No. sequence — a persisted, ever-increasing counter for the
// next connection number to offer on Add New Connection.
//
// This is deliberately NOT just "highest connNo currently in the client
// list, plus one": that approach reissues a number the moment the client
// that held it is deleted (a discharged/closed relationship removed from
// Rradar entirely leaves no trace behind), which is exactly what Cameron
// doesn't want — a connection number should never be handed out twice,
// including to a customer who's now only "history" and no longer in the
// live client list. So this counter only ever moves forward, independent
// of which clients currently exist.
//
// Reuses the existing 'marketing' Supabase table rather than needing a new
// table created manually — see directIncome.js's ROW_ID note for the
// running allocation (1 = referrers/lenders/clientOv, 2 = Project Studio,
// 3 = acknowledgement flags, 4 = Planner, 5 = Direct Income). This is 6,
// previously unused.
import { sbLoadMarketing, sbSaveMarketing } from './supabase'

const ROW_ID = 6
const STORAGE_KEY = 'rion-radar-connno-seq'
export const FIRST_CONN_NO = 1100

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : { nextConnNo: FIRST_CONN_NO }
  } catch {
    return { nextConnNo: FIRST_CONN_NO }
  }
}
function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function loadNextConnNoLocal(fallback = FIRST_CONN_NO) {
  return loadState().nextConnNo || fallback
}

export function saveNextConnNo(nextConnNo) {
  const state = { nextConnNo }
  saveState(state)
  return sbSaveMarketing(state, ROW_ID).catch(() => false)
}

// Pulls the cloud counter down to this device and reconciles — never moves
// the counter backwards, so a device that's been offline for a while (and
// so has a stale, lower local value) can't accidentally hand out a number
// that's already been issued elsewhere in the meantime.
export async function syncConnNoSeqFromSupabase() {
  try {
    const cloud = await sbLoadMarketing(ROW_ID)
    if (cloud && cloud.nextConnNo) {
      const resolved = Math.max(cloud.nextConnNo, loadNextConnNoLocal())
      saveState({ nextConnNo: resolved })
      return resolved
    }
  } catch {}
  return null
}

// The number to actually offer for a brand-new connection: never lower than
// the persisted sequence (see above), and never lower than one past the
// highest connNo on any live, real client either — covers the sequence
// having fallen behind, e.g. a client bulk-imported or manually entered
// with an explicit number higher than the counter ever reached. Demo/sample
// clients are excluded so they can never inflate the suggestion.
export function suggestNextConnNo(clients) {
  const liveMax = Math.max(...(clients || []).filter(c => !c._demo).map(c => Number(c.connNo) || 0), 0)
  return Math.max(liveMax + 1, loadNextConnNoLocal())
}

// Called once a connection number has actually been used (a new connection
// saved with it) — advances the persisted sequence past it so it's never
// offered again, even if the user typed a number manually rather than
// accepting the suggestion, and even if that client is later deleted.
export function commitConnNoUsed(connNo) {
  const used = Number(connNo) || 0
  const next = Math.max(loadNextConnNoLocal(), used + 1)
  return saveNextConnNo(next)
}
