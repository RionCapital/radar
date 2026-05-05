import React, { useState, useCallback } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { loadClients, saveClients } from './lib/data'
import Topbar from './components/Topbar'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import ClientList from './pages/ClientList'
import ClientDashboard from './pages/ClientDashboard'
import Toast from './components/Toast'

export default function App() {
  const [clients, setClients] = useState(() => loadClients())
  const [toast, setToast] = useState(null)
  const location = useLocation()
  const isHome = location.pathname === '/'

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
    setClients(prev => {
      const next = [...prev, newClient]
      saveClients(next)
      return next
    })
    showToast('Client added')
  }

  function handleImport(updates, stmtMap) {
    setClients(prev => {
      const next = prev.map(c => ({
        ...c,
        loans: c.loans.map(l => {
          const acc = String(l.acc || '').trim()
          const found = stmtMap[acc]
          if (found && Math.abs((found.bal || 0) - l.balance) > 1) {
            return { ...l, balance: found.bal }
          }
          return l
        })
      }))
      saveClients(next)
      return next
    })
    showToast('Balances updated')
  }

  return (
    <div style={{ minHeight: '100vh', background: isHome ? '#1e2d3f' : 'var(--bg)' }}>
      {!isHome && <Topbar />}
      <Toast message={toast} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/radar/dashboard" element={<Dashboard clients={clients} onAddClient={addClient} onImport={handleImport} />} />
        <Route path="/radar/clients" element={<ClientList clients={clients} onAddClient={addClient} />} />
        <Route path="/radar/clients/:name" element={<ClientDashboard clients={clients} updateClient={updateClient} />} />
      </Routes>
    </div>
  )
}
