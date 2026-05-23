import React, { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// NSW Public Holidays 2025-2026
const NSW_HOLIDAYS = new Set([
  '2025-01-01','2025-01-27','2025-04-18','2025-04-19','2025-04-20','2025-04-21','2025-04-25',
  '2025-06-09','2025-08-04','2025-10-06','2025-12-25','2025-12-26',
  '2026-01-01','2026-01-26','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25',
  '2026-06-08','2026-08-03','2026-10-05','2026-12-25','2026-12-28',
])

function isBusinessDay(date) {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  const key = date.toISOString().slice(0, 10)
  return !NSW_HOLIDAYS.has(key)
}

function getBusinessDaysLeft() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  lastDay.setHours(0, 0, 0, 0)
  let count = 0
  const cur = new Date(today)
  // Include today if it's a business day
  while (cur <= lastDay) {
    if (isBusinessDay(cur)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function getMonthName() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return months[new Date().getMonth()]
}

export default function CRMTopbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (path) => location.pathname === path || (path !== '/crm' && location.pathname.startsWith(path))
  const bizDays = useMemo(() => getBusinessDaysLeft(), [])
  const month = getMonthName()
  const urgent = bizDays <= 5

  const navBtn = (label, path) => (
    <button onClick={() => navigate(path)} style={{
      padding: '6px 16px', fontSize: 13, fontWeight: 500, border: 'none',
      background: 'transparent', cursor: 'pointer',
      borderBottom: isActive(path) ? '2px solid #EB99C2' : '2px solid transparent',
      color: isActive(path) ? '#EB99C2' : 'rgba(255,255,255,0.65)',
      marginBottom: '-1px',
    }}>
      {label}
    </button>
  )

  return (
    <div style={{
      background: '#2A3545', borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 56, flexShrink: 0
    }}>
      {/* Logo + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
          <div style={{ lineHeight: 1, display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 24, color: '#EB99C2', letterSpacing: '-0.5px' }}>R</span>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 300, fontSize: 24, color: '#fff', letterSpacing: '0.5px' }}>ion</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 1 }}>
            <div style={{ width: 28, height: '0.5px', background: 'rgba(235,153,194,0.35)' }}/>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#EB99C2', opacity: 0.65, margin: '0 4px', flexShrink: 0 }}/>
            <div style={{ width: 28, height: '0.5px', background: 'rgba(235,153,194,0.35)' }}/>
          </div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 6.5, color: 'rgba(187,198,218,0.45)', letterSpacing: '0.06em', marginTop: 1, whiteSpace: 'nowrap' }}>
            Powered by <span style={{ color: '#EB99C2', fontWeight: 600 }}>Rion Capital</span>
          </div>
        </div>

        {/* CRM badge */}
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, padding: '2px 7px' }}>CRM</span>

        <nav style={{ display: 'flex', alignItems: 'center' }}>
          {navBtn('Pipeline', '/crm')}
          {navBtn('Sales Dashboard', '/crm/dashboard')}
        </nav>
      </div>

      {/* Right — biz days + home */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: urgent ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: urgent ? '#fca5a5' : 'rgba(187,198,218,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{month} business days left</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: urgent ? '#ef4444' : '#fff', lineHeight: 1.1 }}>{bizDays}</div>
          </div>
          <span style={{ fontSize: 18, opacity: 0.8 }}>{urgent ? '⚡' : '📅'}</span>
        </div>
        <button onClick={() => navigate('/')} style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7,
          padding: '5px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer'
        }}>⌂ Home</button>
      </div>
    </div>
  )
}
