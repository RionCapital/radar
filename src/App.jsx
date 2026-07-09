import React, { useState, useCallback, useEffect } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { loadClients, saveClients, syncFromSupabase } from './lib/data'
import { syncSettingsFromSupabase } from './lib/settings'
import { sbSaveDeals, sbSaveClients, sbSaveSettings } from './lib/supabase'
import { COMMISSION_HISTORY_BY_ACC, COMMISSION_SEED_VERSION } from './lib/commissionSeed'
import Topbar from './components/Topbar'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import ClientList from './pages/ClientList'
import ClientDashboard from './pages/ClientDashboard'
import LoanAccount from './pages/LoanAccount'
import ContactPage from './pages/ContactPage'
import CRM from './pages/CRM'
import CRMDashboard from './pages/CRMDashboard'
import DealPage from './pages/DealPage'
import AdminSettings from './pages/AdminSettings'
import BirthdayNotifier from './components/BirthdayNotifier'
import CRMTopbar from './components/CRMTopbar'
import OpportunityScore from './pages/OpportunityScore'
import ProjectStudio from './pages/ProjectStudio'
import Toast from './components/Toast'
import SaveFailedBanner from './components/SaveFailedBanner'
import { SAVE_FAILED_EVENT } from './lib/saveStatus'
import ClientCommission from './pages/ClientCommission'
import AddClient from './pages/AddClient'
import CommissionImportPage from './pages/CommissionImportPage'
import SecurityReviewEmail from './pages/SecurityReviewEmail'
import EmailBuilder from './pages/EmailBuilder'
import Marketing from './pages/Marketing'

// Top-level error boundary — prevents one broken page crashing the whole app
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { this.setState({ info }) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px 32px', maxWidth: 600, margin: '60px auto', background: '#fff', borderRadius: 12, border: '1px solid #fecaca', fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{this.state.error?.message}</div>
          <button onClick={() => { this.setState({ error: null, info: null }) }}
            style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3D4F6B', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function RequireAuth({ children }) {
  const auth = sessionStorage.getItem('rion-auth')
  return auth ? children : <Navigate to="/login" replace />
}

export default function App() {
  // NOTE: We deliberately do NOT run the one-time migration / commission-seed logic here.
  // Doing so against loadClients()'s BASE_DATA fallback (which happens on any fresh
  // cache-clear, before Supabase has had a chance to sync) was the cause of edits
  // reverting: the seed would build its result from the stale hardcoded BASE_DATA
  // snapshot and push it to Supabase, overwriting real edits. That logic now runs
  // in the startupSync effect below, AFTER cloud sync has resolved to real data.
  const [clients, setClients] = useState(() => loadClients())
  const [showBirthdays, setShowBirthdays] = useState(true)
  const [crmDeals, setCrmDeals] = useState(() => {
    try { const s = localStorage.getItem('rion-crm-deals'); if (s) return JSON.parse(s) } catch {}
    return null // CRM page loads its own data
  })
  function updateCrmDeals(updated) {
    setCrmDeals(updated)
    try { localStorage.setItem('rion-crm-deals', JSON.stringify(updated)) } catch {}
    sbSaveDeals(updated).catch(() => {})
  } // show on load

  // ─── Supabase startup sync ───────────────────────────────────────────────
  useEffect(() => {
    async function startupSync() {
      // 1. Sync clients — check local timestamp first
      const localRaw = localStorage.getItem('rion-radar-clients-v13')
      let localSavedAt = 0
      let localClients = null
      if (localRaw) {
        try {
          const parsed = JSON.parse(localRaw)
          localSavedAt = Array.isArray(parsed) ? 0 : (parsed.savedAt || 0)
          localClients = Array.isArray(parsed) ? parsed : parsed.data
        } catch {}
      }

      if (localSavedAt > 0 && localClients) {
        // Local has real user data — let syncFromSupabase compare timestamps
        const cloudClients = await syncFromSupabase()
        if (cloudClients) {
          setClients(cloudClients)
        }
        // If cloudClients is null, local was newer — already pushed by syncFromSupabase
      } else {
        // Local is empty (cache cleared) — always trust Supabase
        const cloudClients = await syncFromSupabase()
        if (cloudClients) {
          setClients(cloudClients)
        }
        // Do NOT push BASE_DATA to Supabase
      }

      // 1.5. One-time migration + commission-history seed — now safe to run because
      // `clients` state has already been settled to real data (from cloud sync above,
      // or from a genuine local cache). This NEVER touches BASE_DATA.
      setClients(prev => {
        let needsSave = false
        const fixed = prev.map(c => ({
          ...c,
          loans: c.loans.map(l => {
            // Only '2026-30' is fixed here — that was a genuinely invalid month key
            // from an old filename-parsing bug. '2026-05' used to be lumped in with
            // it as "also invalid", back when no real May 2026 data existed yet —
            // but May 2026 is now a real, current month, and this line was silently
            // rewriting every legitimate May commission entry back to April on every
            // single page load. That's the actual cause of the April/May mix-up —
            // not the import, and not a sync race — so '2026-05' must never appear
            // in this condition again.
            const fixHistory = (arr) => (arr || []).map(h => {
              if (h.month === '2026-30') { needsSave = true; return { ...h, month: '2026-04' } }
              return h
            })
            return { ...l, balanceHistory: fixHistory(l.balanceHistory), commissionHistory: fixHistory(l.commissionHistory) }
          })
        }))

        const seeded = localStorage.getItem('rion-comm-seed-version')
        if (seeded !== COMMISSION_SEED_VERSION) {
          const withComm = (needsSave ? fixed : prev).map(c => ({
            ...c,
            loans: c.loans.map(l => {
              const acc = String(l.acc || '').trim()
              if (!acc) return l
              const history = COMMISSION_HISTORY_BY_ACC[acc]
              if (!history || history.length === 0) return l
              // Merge: keep any manually imported entries, add historic ones for months not yet present
              const existingMonths = new Set((l.commissionHistory || []).map(h => h.month))
              const existingBalMonths = new Set((l.balanceHistory || []).map(h => h.month))
              const newCommEntries = history
                .filter(h => !existingMonths.has(h.month))
                .map(h => ({ month: h.month, trailComm: h.trailComm, upfrontComm: h.upfrontComm, gst: h.gst, totalPaid: h.totalPaid }))
              const newBalEntries = history
                .filter(h => !existingBalMonths.has(h.month) && h.balance > 0)
                .map(h => ({ month: h.month, balance: h.balance }))
              if (newCommEntries.length === 0 && newBalEntries.length === 0) return l
              const commHistory = [...(l.commissionHistory || []), ...newCommEntries]
                .sort((a, b) => a.month.localeCompare(b.month))
              const balHistory = [...(l.balanceHistory || []), ...newBalEntries]
                .sort((a, b) => a.month.localeCompare(b.month))
              return { ...l, commissionHistory: commHistory, balanceHistory: balHistory }
            })
          }))
          saveClients(withComm)
          localStorage.setItem('rion-comm-seed-version', COMMISSION_SEED_VERSION)
          return withComm
        }

        if (needsSave) { saveClients(fixed); return fixed }
        return prev
      })

      // 2. Push local deals up to Supabase
      try {
        const localDeals = localStorage.getItem('rion-crm-deals')
        if (localDeals) {
          const parsed = JSON.parse(localDeals)
          if (parsed && Array.isArray(parsed)) {
            sbSaveDeals(parsed).catch(e => console.warn('deals push failed:', e))
          }
        }
      } catch (e) { console.warn('deals read failed:', e) }

      // 3. Push settings up to Supabase
      try {
        const localSettings = localStorage.getItem('rion-settings-v1')
        if (localSettings) {
          const parsed = JSON.parse(localSettings)
          if (parsed && typeof parsed === 'object') {
            sbSaveSettings(parsed).catch(e => console.warn('settings push failed:', e))
          }
        }
      } catch (e) { console.warn('settings read failed:', e) }

      // (Removed: a step here used to pull from a legacy 'referrers' Supabase
      // table into a 'rion-marketing-referrers-v3' localStorage key that
      // nothing in the app actually reads. Marketing.jsx and ReferrerPicker
      // both read/write the current 'marketing' table via 'rion-marketing-referrers'.)
    }
    startupSync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

  const [toast, setToast] = useState(null)
  const [saveFailure, setSaveFailure] = useState(null)

  useEffect(() => {
    function handleSaveFailed(e) { setSaveFailure(e.detail) }
    window.addEventListener(SAVE_FAILED_EVENT, handleSaveFailed)
    return () => window.removeEventListener(SAVE_FAILED_EVENT, handleSaveFailed)
  }, [])
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isLogin = location.pathname === '/login'
  const isStudio = location.pathname === '/radar/studio'
  const isCRM = location.pathname.startsWith('/crm')
  const isSettings = location.pathname === '/settings' || location.pathname === '/crm/settings'

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const updateClient = useCallback((name, updater) => {
    setClients(prev => {
      const next = prev.map(c => c.name === name ? updater(c) : c)
      saveClients(next)
      return next
    })
    showToast('Saved')
  }, [])

  function addClient(newClient) {
    setClients(prev => { const next = [...prev, newClient]; saveClients(next); return next })
    showToast('Client added')
  }

  function updateAllClients(updaterOrArray) {
    setClients(prev => {
      const next = typeof updaterOrArray === 'function' ? updaterOrArray(prev) : updaterOrArray
      saveClients(next)
      return next
    })
  }

  function handleImport(updates, stmtMap, statementMonth, allocations = []) {
    // Sanitise month — catch bad keys like '2026-30' from the old filename bug
    const month = (() => {
      const raw = statementMonth || ''
      const [y, m] = raw.split('-')
      if (y && m && parseInt(m) >= 1 && parseInt(m) <= 12) return raw
      // Fallback: one month before today
      const d = new Date(); d.setMonth(d.getMonth()-1)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })()
    setClients(prev => {
      let next = prev.map(c => ({
        ...c,
        loans: c.loans.map(l => {
          const acc = String(l.acc || '').trim()
          if (!acc) return l
          const found = stmtMap[acc]
          if (!found) return l
          const newBal = found.bal ?? l.balance
          const newLname = l.lname || found.name || l.lname
          const newBalHistory = [...(l.balanceHistory||[]).filter(h=>h.month!==month), { month, balance: newBal }]
            .sort((a,b) => a.month.localeCompare(b.month))
          const commEntry = {
            month,
            trailComm:   found.trailComm   || 0,
            upfrontComm: found.upfrontComm || 0,
            gst:         found.gst         || 0,
            totalPaid:   found.totalPaid   || 0,
          }
          const newCommHistory = [...(l.commissionHistory||[]).filter(h=>h.month!==month), commEntry]
            .sort((a,b) => a.month.localeCompare(b.month))
          return { ...l, lname: newLname, balance: newBal, balanceHistory: newBalHistory, commissionHistory: newCommHistory }
        })
      }))

      // Process new loan allocations from unmatched accounts
      allocations.forEach(({ clientName, mode, newLoan }) => {
        next = next.map(c => {
          if (c.name !== clientName) return c
          let loans = [...c.loans]
          if (mode === 'new') {
            loans = [...loans, newLoan]
          } else if (typeof mode === 'number') {
            // Discharge the replaced loan, add new one
            loans = loans.map((l, i) => i === mode
              ? { ...l, closed: true, closedDate: new Date().toISOString().slice(0, 10) }
              : l
            )
            loans = [...loans, newLoan]
          }
          return { ...c, loans }
        })
      })

      saveClients(next)
      return next
    })
    const totalUpdated = updates.length + allocations.length
    showToast(`Import applied — ${totalUpdated} accounts updated for ${month}`)
  }

  return (
    <div style={{ minHeight:'100vh', background: isHome||isLogin ? '#3D5570' : 'var(--bg)' }}>
      {!isHome && !isLogin && !isStudio && !isCRM && !isSettings && <Topbar clients={clients} onOpenBirthdays={() => setShowBirthdays(true)} />}
      {showBirthdays && !isHome && !isLogin && !isStudio && !isCRM && !isSettings && <BirthdayNotifier clients={clients} onClose={() => setShowBirthdays(false)} />}
      <Toast message={toast} />
      <SaveFailedBanner failure={saveFailure} onDismiss={()=>setSaveFailure(null)} />
      <AppErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/radar/dashboard" element={<RequireAuth><Dashboard clients={clients} onImport={handleImport} onUpdateClients={updateAllClients} /></RequireAuth>} />
          <Route path="/radar/clients" element={<RequireAuth><ClientList clients={clients} onAddClient={addClient} /></RequireAuth>} />
          <Route path="/radar/clients/add" element={<RequireAuth><AddClient clients={clients} onSave={addClient} onClose={() => window.history.back()} /></RequireAuth>} />
          <Route path="/radar/clients/:name" element={<RequireAuth><ClientDashboard clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/loan/:loanIdx" element={<RequireAuth><LoanAccount clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/crm/settings" element={<RequireAuth><AdminSettings /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><AdminSettings /></RequireAuth>} />
          <Route path="/crm/deal/:dealName" element={<RequireAuth><DealPage onUpdateDeals={updateCrmDeals} clients={clients} onUpdateClients={updateAllClients} /></RequireAuth>} />
          <Route path="/crm/dashboard" element={<RequireAuth><CRMDashboard /></RequireAuth>} />
          <Route path="/crm" element={<RequireAuth><CRM clients={clients} onUpdateClients={updateAllClients} /></RequireAuth>} />
          <Route path="/radar/clients/:name/opportunity" element={<RequireAuth><OpportunityScore clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/import" element={<RequireAuth><CommissionImportPage clients={clients} onImport={handleImport} /></RequireAuth>} />
          <Route path="/radar/clients/:name/contacts" element={<RequireAuth><ContactPage clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/commission" element={<RequireAuth><ClientCommission clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/security-review/:secIdx" element={<RequireAuth><SecurityReviewEmail clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/email" element={<RequireAuth><EmailBuilder clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/marketing" element={<RequireAuth><Marketing /></RequireAuth>} />
          <Route path="/radar/studio" element={<RequireAuth><ProjectStudio /></RequireAuth>} />
        </Routes>
      </AppErrorBoundary>
    </div>
  )
}
