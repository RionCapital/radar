// Commission statement history — a log of every statement import that's been
// applied, what it contained, and enough "before" detail to take it back out
// again. Without this, an import is a one-way door: there's no record of what
// was loaded, and a statement imported by mistake (wrong month, wrong file,
// rows allocated to the wrong client) can only be unpicked by hand.
//
// Reuses the existing 'marketing' Supabase table rather than needing a new
// table created manually — see directIncome.js's ROW_ID note for the running
// allocation (1 = referrers/lenders/clientOv, 2 = Project Studio, 3 =
// acknowledgement flags, 4 = Planner, 5 = Direct Income, 6 = connection
// number sequence). This is 7, previously unused.
import { sbLoadMarketing, sbSaveMarketing } from './supabase'

const ROW_ID = 7
const STORAGE_KEY = 'rion-statement-history'
// Keeping every import forever would eventually outgrow the row; 60 covers
// five years of monthly statements, well past anything worth undoing.
const MAX_RECORDS = 60

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    const parsed = s ? JSON.parse(s) : null
    return Array.isArray(parsed?.records) ? parsed : { records: [] }
  } catch {
    return { records: [] }
  }
}
function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function loadStatementHistoryLocal() {
  return loadState().records
}

export function saveStatementHistory(records) {
  const trimmed = [...records].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || '')).slice(0, MAX_RECORDS)
  const state = { records: trimmed }
  saveState(state)
  return sbSaveMarketing(state, ROW_ID).catch(() => false)
}

export async function syncStatementHistoryFromSupabase() {
  try {
    const cloud = await sbLoadMarketing(ROW_ID)
    if (cloud && Array.isArray(cloud.records)) {
      saveState({ records: cloud.records })
      return cloud.records
    }
  } catch {}
  return null
}

export function mkStatementId() {
  return `stmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Everything needed to describe an import and, later, reverse it. Built from
// the clients array as it stood BEFORE the import was applied, so the "before"
// balances are the real ones.
export function buildStatementRecord({ clients, stmtMap, month, allocations, fileName, counts, user }) {
  const touched = []
  ;(clients || []).forEach(c => {
    ;(c.loans || []).forEach((l, idx) => {
      const acc = String(l.acc || '').trim()
      if (acc && stmtMap[acc]) touched.push({ client: c.name, acc, balance: Number(l.balance) || 0 })
    })
  })

  const createdLoans = []
  const dischargedLoans = []
  const mergedLoans = []
  ;(allocations || []).forEach(a => {
    const client = (clients || []).find(c => c.name === a.clientName)
    if (a.mode === 'new') {
      createdLoans.push({ client: a.clientName, acc: String(a.newLoan?.acc || '').trim() })
    } else if (typeof a.mode === 'number') {
      const old = client?.loans?.[a.mode]
      createdLoans.push({ client: a.clientName, acc: String(a.newLoan?.acc || '').trim() })
      if (old) dischargedLoans.push({ client: a.clientName, acc: String(old.acc || '').trim() })
    } else if (typeof a.mode === 'string' && a.mode.startsWith('merge-')) {
      const idx = parseInt(a.mode.slice('merge-'.length), 10)
      const target = client?.loans?.[idx]
      if (target) {
        mergedLoans.push({
          client: a.clientName, accAfter: String(a.newLoan?.acc || '').trim(),
          accBefore: String(target.acc || '').trim(),
          balanceBefore: Number(target.balance) || 0, amountBefore: Number(target.amount) || 0,
        })
      }
    }
  })

  // Statement totals, straight off the rows that were actually applied.
  const applied = Object.keys(stmtMap || {})
  const totals = applied.reduce((acc, k) => {
    const r = stmtMap[k] || {}
    acc.trail += Number(r.trailComm) || 0
    acc.upfront += Number(r.upfrontComm) || 0
    acc.gst += Number(r.gst) || 0
    acc.totalPaid += Number(r.totalPaid) || 0
    return acc
  }, { trail: 0, upfront: 0, gst: 0, totalPaid: 0 })

  return {
    id: mkStatementId(), fileName: fileName || '', month, appliedAt: new Date().toISOString(),
    appliedBy: user || '', accounts: applied.length,
    totals: {
      trail: Math.round(totals.trail * 100) / 100,
      upfront: Math.round(totals.upfront * 100) / 100,
      gst: Math.round(totals.gst * 100) / 100,
      totalPaid: Math.round(totals.totalPaid * 100) / 100,
    },
    counts: counts || {},
    undo: { prevBalances: touched, createdLoans, dischargedLoans, mergedLoans },
  }
}

// Reverses an applied import: strips that month's commission and balance
// entries from every loan, puts the pre-import balances back, removes loans
// the import created, reopens loans it discharged, and restores account
// numbers it merged. Pure — returns the new clients array.
//
// One deliberate limitation: only the entries for THIS statement's month are
// removed. Re-importing the same month twice then undoing once leaves the
// month with no commission rather than the earlier version, because a month
// only ever holds one set of figures — there's nothing older to fall back to.
export function undoStatementImport(clients, record) {
  if (!record) return clients
  const month = record.month
  const { prevBalances = [], createdLoans = [], dischargedLoans = [], mergedLoans = [] } = record.undo || {}
  const balByKey = new Map(prevBalances.map(p => [`${p.client}|${p.acc}`, p.balance]))
  const createdByClient = createdLoans.reduce((m, c) => { (m[c.client] = m[c.client] || new Set()).add(c.acc); return m }, {})
  const dischargedByClient = dischargedLoans.reduce((m, c) => { (m[c.client] = m[c.client] || new Set()).add(c.acc); return m }, {})
  const mergedByClient = mergedLoans.reduce((m, c) => { (m[c.client] = m[c.client] || []).push(c); return m }, {})

  return (clients || []).map(c => {
    const created = createdByClient[c.name]
    const discharged = dischargedByClient[c.name]
    const merges = mergedByClient[c.name] || []
    let loans = (c.loans || [])
      // Loans this import created go entirely.
      .filter(l => !(created && created.has(String(l.acc || '').trim())))
      .map(l => {
        const acc = String(l.acc || '').trim()
        const merge = merges.find(m => m.accAfter && m.accAfter === acc)
        let next = { ...l }
        // Undo a merge: put the account number, balance and limit back.
        if (merge) {
          next.acc = merge.accBefore
          next.balance = merge.balanceBefore
          next.amount = merge.amountBefore
        }
        // Reopen anything this import discharged.
        if (discharged && discharged.has(merge ? merge.accBefore : acc)) {
          next.closed = false
          delete next.closedDate
        }
        const key = `${c.name}|${merge ? merge.accBefore : acc}`
        if (balByKey.has(key)) next.balance = balByKey.get(key)
        next.commissionHistory = (next.commissionHistory || []).filter(h => h.month !== month)
        next.balanceHistory = (next.balanceHistory || []).filter(h => h.month !== month)
        return next
      })
    return { ...c, loans }
  })
}
