const BASE_DATA = []

const STORAGE_KEY = 'rion-radar-clients-v13';
// Tracks when THIS browser session last actually confirmed its state
// against Supabase — set only by syncFromSupabase(), never by a local edit.
// This is what makes the staleness guard in sbSaveClients meaningful: a tab
// left open for two days without reloading keeps this frozen at whenever
// it started, even though every local edit still stamps savedAt with
// "right now". Comparing savedAt alone can't tell a fresh edit in a stale
// tab apart from a genuinely fresh one — this can.
const LAST_SYNCED_KEY = 'rion-radar-clients-lastsync';

// ─── Supabase-backed load/save (with localStorage cache) ─────────────────────
import { sbLoadClients, sbSaveClients } from './supabase.js'
import { notifySaveFailed } from './saveStatus.js'

export function loadClients() {
  // Fast synchronous load from localStorage cache
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Handle both wrapped { data, savedAt } and legacy plain array
      return Array.isArray(parsed) ? parsed : (parsed.data || JSON.parse(JSON.stringify(BASE_DATA)));
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(BASE_DATA));
}

function getLastSyncedAt() {
  try { return Number(localStorage.getItem(LAST_SYNCED_KEY)) || 0 } catch { return 0 }
}
function setLastSyncedAt(ts) {
  try { localStorage.setItem(LAST_SYNCED_KEY, String(ts)) } catch {}
}

export function saveClients(data) {
  // Write to localStorage immediately (sync) with a timestamp
  const payload = { data, savedAt: Date.now(), lastSyncedAt: getLastSyncedAt() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {}
  // Then persist to Supabase in background (async, fire-and-forget) — but
  // still check the actual result. sbSaveClients resolves to `false` on a
  // Supabase-side error rather than throwing, so a plain .catch() alone
  // never saw that case; this is what makes a failed save visible instead
  // of silently only-ever-local.
  sbSaveClients(payload).then(ok => {
    if (ok) {
      // A successful save from THIS session means this session's view of
      // the world — including the change it just made — is now the
      // authoritative latest state. Without advancing this, a session left
      // open past the staleness threshold would have its own SECOND save
      // judged "stale" relative to its own FIRST save (since that first
      // save just bumped the cloud's timestamp), and the staleness guard
      // would silently discard the second save's changes for any client
      // that already existed. That's a real bug this fixes, not a
      // hypothetical one — it's what caused May's import to vanish after
      // April's had already landed in the same session.
      setLastSyncedAt(Date.now())
    } else {
      notifySaveFailed('clients')
    }
  }).catch(err => {
    console.warn('Supabase save failed:', err)
    notifySaveFailed('clients', { error: String(err) })
  });
  return true;
}

// Same as saveClients, but actually returns the Supabase result instead of
// firing-and-forgetting — for the one or two call sites (commission
// imports especially) where it matters enough to know for certain the
// write landed before telling the user it's done, rather than trusting
// the write succeeded and finding out weeks later that it didn't.
export async function saveClientsAwaitable(data) {
  const payload = { data, savedAt: Date.now(), lastSyncedAt: getLastSyncedAt() }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)) } catch {}
  try {
    const ok = await sbSaveClients(payload)
    if (ok) setLastSyncedAt(Date.now())
    else notifySaveFailed('clients')
    return ok
  } catch (err) {
    console.warn('Supabase save failed:', err)
    notifySaveFailed('clients', { error: String(err) })
    return false
  }
}

export function resetClients() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = JSON.parse(JSON.stringify(BASE_DATA));
  sbSaveClients(fresh).catch(err => console.warn('Supabase reset failed:', err));
  return fresh;
}

// Call this on app startup to hydrate localStorage from Supabase
// Only applies cloud data if it is newer than what's already in localStorage
export async function syncFromSupabase() {
  try {
    const cloud = await sbLoadClients();
    if (!cloud) return null;

    // Support both wrapped { data, savedAt } and legacy plain array from Supabase
    const cloudClients = Array.isArray(cloud) ? cloud : cloud.data;
    const cloudSavedAt = Array.isArray(cloud) ? 0 : (cloud.savedAt || 0);

    if (!cloudClients || !Array.isArray(cloudClients) || cloudClients.length === 0) return null;

    // Check if local has real user data (not just BASE_DATA fallback)
    let localSavedAt = 0;
    let localHasRealData = false;
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const localParsed = JSON.parse(localRaw);
        localSavedAt = Array.isArray(localParsed) ? 0 : (localParsed.savedAt || 0);
        localHasRealData = localSavedAt > 0; // Only trust local if it has a real timestamp
      }
    } catch (e) {}

    // Whatever happens below, this session has now checked in with the
    // cloud as of right now — record that regardless of which side wins.
    setLastSyncedAt(Date.now())

    // If local has no real timestamp, always trust Supabase
    if (!localHasRealData) {
      const payload = { data: cloudClients, savedAt: cloudSavedAt || Date.now() };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
      return cloudClients;
    }

    // Both have timestamps — pick the newer one
    if (cloudSavedAt >= localSavedAt) {
      const payload = { data: cloudClients, savedAt: cloudSavedAt };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
      return cloudClients;
    }

    // Local is newer — push local up to Supabase
    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (localRaw) {
      const localParsed = JSON.parse(localRaw);
      const localClients = Array.isArray(localParsed) ? localParsed : localParsed.data;
      if (localClients) sbSaveClients({ data: localClients, savedAt: localSavedAt, lastSyncedAt: getLastSyncedAt() }).catch(() => {});
    }
    return null; // Keep using local data
  } catch (e) {
    console.warn('Supabase sync failed, using local data:', e);
  }
  return null;
}

export const LOAN_TYPES = ['Home Loan (OO)','Home Loan (Inv)','SMSF','Commercial Property','Lease Doc','Term','Asset Finance','Trade Finance','Business Loan','Invoice Finance','Other'];
export const BANKS = ['ANZ','CBA','NAB','WBC','MAC','HSL','BWS','CHLS','CHLAB','CHLA','TMB','SGB','RES','CHHR','TNT','GRNYT','WPC','864H','Selfco','Dynamoney','Other'];

// Rradar client contacts use a compact shape ({type:'Ind'|'Co'|..., first,
// middle, last, mobile, email, dob}); the CRM's own deal.Contacts use a
// richer, differently-shaped record. This is the one place that translates
// between them, used both when a new deal is created for an existing
// client and when an existing deal is linked to one afterwards — so a
// client's contact details land on the deal as a real, editable copy
// rather than the broker having to retype them.
const RRADAR_CONTACT_TYPE_MAP = { Ind: 'Individual', Co: 'Company', Tru: 'Trust', SMSF: 'SMSF', Part: 'Partnership' }
export function mapRradarContactToDealContact(c) {
  const type = RRADAR_CONTACT_TYPE_MAP[c.type] || 'Individual'
  const name = c.first
    ? [c.first, c.middle, c.last].filter(Boolean).join(' ')
    : (c.name || c.company || '')
  return {
    name, type,
    email: c.email || '',
    mobile: c.mobile || c.phone || '',
    homePhone: '', businessPhone: '',
    title: '', firstName: c.first || '', middleName: c.middle || '', lastName: c.last || '',
    dob: c.dob || '', maritalStatus: '', gender: '',
    abn: '',
    addresses: [], identification: [], relationships: [],
  }
}

// A discharged loan should never contribute to a client's current balance —
// it's history, not exposure. These previously summed every loan regardless
// of closed status, which is why "Balances" on the client page (and
// anywhere else these are used) included loans that had already been paid
// out/refinanced away.
export function totalBal(c) { return c.loans.filter(l => !l.closed).reduce((s, l) => s + (l.balance || 0), 0); }
export function totalAmt(c) { return c.loans.filter(l => !l.closed).reduce((s, l) => s + (l.amount || 0), 0); }
export function pwBal(c) { return c.loans.filter(l => !l.closed && !['Commercial Property','Lease Doc','Term'].includes(l.type)).reduce((s, l) => s + (l.balance || 0), 0); }
export function commBal(c) { return c.loans.filter(l => !l.closed && ['Commercial Property','Lease Doc','Term'].includes(l.type)).reduce((s, l) => s + (l.balance || 0), 0); }
export function fmt(n) { return n > 0 ? '$' + Math.round(n).toLocaleString() : '—'; }
export function ini(n) { return n.split(/[\s-]+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '??'; }
export function calcOpp(c) {
  const bal = totalBal(c), amt = totalAmt(c);
  const criteria = [
    { label: 'Business owner', score: 5, met: c.stream === 'Commercial' },
    { label: 'Investor', score: 5, met: c.loans.some(l => l.type && l.type.includes('Inv')) },
    { label: 'Loans older than 2 years', score: 5, met: c.days > 730 },
    { label: 'Upcoming maturity', score: 5, met: c.loans.some(l => l.fixed && l.fixed.length > 0) },
    { label: 'Upcoming IO term expiry', score: 5, met: c.loans.some(l => l.io && l.io.length > 0) },
    { label: 'Upcoming balloons', score: 5, met: c.loans.some(l => l.balloon && l.balloon.length > 0) },
    { label: 'Equity >$200k', score: 5, met: (amt - bal) > 200000 },
    { label: 'Loans not with RION Capital', score: 5, met: c.loanNotWithRion || false },
  ];
  return { criteria, total: criteria.filter(o => o.met).reduce((s, o) => s + o.score, 0) || c.score || 0 };
}

// The one true "current opportunity score" for a client — calcOpp()'s
// auto-detected criteria, with any manual per-criterion override
// (client.manualOpp, set on the Opportunity Score page) taking precedence.
// This is exactly what Client Dashboard and the Opportunity Score page
// already compute inline to show their score — centralised here so other
// screens (the Dashboard's Opportunity Radar panels) can show the same
// number instead of reading the stale client.score field, which is only
// ever written when someone opens that specific client's Opportunity
// Score page and clicks "Save score" — meaning it stays 0 for any client
// nobody has manually visited, even though the real, live score is
// already correct and visible everywhere else.
export function liveOppTotal(c) {
  const { criteria } = calcOpp(c);
  const manualOpp = c.manualOpp || {};
  return criteria.reduce((s, o) => s + (manualOpp[o.label] !== undefined ? manualOpp[o.label] : (o.met ? o.score : 0)), 0);
}
