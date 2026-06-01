import React, { useState, useCallback } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { loadClients, saveClients } from './lib/data'
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
import ClientCommission from './pages/ClientCommission'
import CommissionImportPage from './pages/CommissionImportPage'
import EmailBuilder from './pages/EmailBuilder'

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
  const [clients, setClients] = useState(() => loadClients())
  const [showBirthdays, setShowBirthdays] = useState(true)
  const [crmDeals, setCrmDeals] = useState(() => {
    try { const s = localStorage.getItem('rion-crm-deals'); if (s) return JSON.parse(s) } catch {}
    return null // CRM page loads its own data
  })
  function updateCrmDeals(updated) {
    setCrmDeals(updated)
    try { localStorage.setItem('rion-crm-deals', JSON.stringify(updated)) } catch {}
  } // show on load
  const [toast, setToast] = useState(null)
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

  function updateAllClients(updated) {
    setClients(updated)
    saveClients(updated)
  }

  function handleImport(updates, stmtMap, statementMonth) {
    const month = statementMonth || (() => {
      const d = new Date(); d.setMonth(d.getMonth()-1)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })()
    setClients(prev => {
      const next = prev.map(c => ({
        ...c,
        loans: c.loans.map(l => {
          const acc = String(l.acc || '').trim()
          if (!acc) return l
          const found = stmtMap[acc]
          if (!found) return l
          const newBal = found.bal ?? l.balance
          // Update loan name from statement if loan doesn't have one yet
          const newLname = l.lname || found.name || l.lname
          // Balance history
          const newBalHistory = [...(l.balanceHistory||[]).filter(h=>h.month!==month), { month, balance: newBal }]
            .sort((a,b) => a.month.localeCompare(b.month))
          // Commission history
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
      saveClients(next)
      return next
    })
    showToast(`Balances & commissions updated — ${month} recorded`)
  }

  return (
    <div style={{ minHeight:'100vh', background: isHome||isLogin ? '#3D5570' : 'var(--bg)' }}>
      {!isHome && !isLogin && !isStudio && !isCRM && !isSettings && <Topbar clients={clients} onOpenBirthdays={() => setShowBirthdays(true)} />}
      {showBirthdays && !isHome && !isLogin && !isStudio && !isCRM && !isSettings && <BirthdayNotifier clients={clients} onClose={() => setShowBirthdays(false)} />}
      <Toast message={toast} />
      <AppErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/radar/dashboard" element={<RequireAuth><Dashboard clients={clients} onImport={handleImport} onUpdateClients={updateAllClients} /></RequireAuth>} />
          <Route path="/radar/clients" element={<RequireAuth><ClientList clients={clients} onAddClient={addClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name" element={<RequireAuth><ClientDashboard clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/loan/:loanIdx" element={<RequireAuth><LoanAccount clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/crm/settings" element={<RequireAuth><AdminSettings /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><AdminSettings /></RequireAuth>} />
          <Route path="/crm/deal/:dealName" element={<RequireAuth><DealPage onUpdateDeals={updateCrmDeals} clients={clients} /></RequireAuth>} />
          <Route path="/crm/dashboard" element={<RequireAuth><CRMDashboard /></RequireAuth>} />
          <Route path="/crm" element={<RequireAuth><CRM clients={clients} onUpdateClients={updateAllClients} /></RequireAuth>} />
          <Route path="/radar/clients/:name/contacts" element={<RequireAuth><ContactPage clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/clients/:name/opportunity" element={<RequireAuth><OpportunityScore clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/import" element={<RequireAuth><CommissionImportPage clients={clients} onImport={handleImport} /></RequireAuth>} />
          <Route path="/radar/clients/:name/email" element={<RequireAuth><EmailBuilder clients={clients} updateClient={updateClient} /></RequireAuth>} />
          <Route path="/radar/studio" element={<RequireAuth><ProjectStudio /></RequireAuth>} />
        </Routes>
      </AppErrorBoundary>
    </div>
  )
}
