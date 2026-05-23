import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function CRMTopbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  const navBtn = (label, path) => (
    <button onClick={() => navigate(path)} style={{
      padding: '6px 16px', fontSize: 13, fontWeight: 500, border: 'none',
      background: 'transparent', cursor: 'pointer',
      borderBottom: isActive(path) ? '2px solid #EB99C2' : '2px solid transparent',
      color: isActive(path) ? '#EB99C2' : 'rgba(255,255,255,0.65)',
      marginBottom: '-1px', transition: 'color 0.15s'
    }}
    onMouseOver={e => { if (!isActive(path)) e.currentTarget.style.color = '#fff' }}
    onMouseOut={e => { if (!isActive(path)) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}>
      {label}
    </button>
  )

  return (
    <div style={{
      background: '#2A3545', borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 52, flexShrink: 0
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 20, color: '#EB99C2' }}>R</span>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 300, fontSize: 20, color: '#fff' }}>ion</span>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.5)', marginLeft: 6, letterSpacing: '0.05em' }}>CRM</span>
          </div>
          <div style={{ fontSize: 7, color: 'rgba(235,153,194,0.5)', letterSpacing: '0.06em', marginTop: 1 }}>
            Powered by <span style={{ color: '#EB99C2' }}>Rion Capital</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', borderBottom: 'none' }}>
          {navBtn('Pipeline', '/crm')}
          {navBtn('Sales Dashboard', '/crm/dashboard')}
        </nav>
      </div>

      {/* Right — Home link */}
      <button onClick={() => navigate('/')} style={{
        background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7,
        padding: '5px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 12,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
      }}
      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
      onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
        ⌂ Home
      </button>
    </div>
  )
}
