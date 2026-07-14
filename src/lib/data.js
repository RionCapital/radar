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
    { label: 'Loans older than 2 years', score: 0, met: c.days > 730 },
    { label: 'Upcoming maturity', score: 5, met: c.loans.some(l => l.fixed && l.fixed.length > 0) },
    { label: 'Upcoming IO term expiry', score: 5, met: c.loans.some(l => l.io && l.io.length > 0) },
    { label: 'Upcoming balloons', score: 5, met: c.loans.some(l => l.balloon && l.balloon.length > 0) },
    { label: 'Equity >$200k', score: 5, met: (amt - bal) > 200000 },
    { label: 'Loans not with RION Capital', score: 5, met: c.loanNotWithRion || false },
  ];
  return { criteria, total: criteria.filter(o => o.met).reduce((s, o) => s + o.score, 0) || c.score || 0 };
}
