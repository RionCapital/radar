import React, { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const NSW_HOLIDAYS = new Set([
  '2025-01-01','2025-01-27','2025-04-18','2025-04-19','2025-04-20','2025-04-21','2025-04-25',
  '2025-06-09','2025-08-04','2025-10-06','2025-12-25','2025-12-26',
  '2026-01-01','2026-01-26','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25',
  '2026-06-08','2026-08-03','2026-10-05','2026-12-25','2026-12-28',
])

function isBusinessDay(date) {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return !NSW_HOLIDAYS.has(date.toISOString().slice(0,10))
}

export function getBusinessDaysLeft() {
  const today = new Date(); today.setHours(0,0,0,0)
  const lastDay = new Date(today.getFullYear(), today.getMonth()+1, 0); lastDay.setHours(0,0,0,0)
  let count = 0
  const cur = new Date(today)
  while (cur <= lastDay) { if (isBusinessDay(cur)) count++; cur.setDate(cur.getDate()+1) }
  return count
}

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function RionLogo({ onClick }) {
  return (
    <div onClick={onClick} style={{ cursor:'pointer', display:'flex', alignItems:'center' }}>
      <img
        src="/rion_logo_notag.png"
        alt="Rion Capital"
        style={{ height:38, width:'auto', display:'block', mixBlendMode:'lighten' }}
      />
    </div>
  )
}

export default function CRMTopbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (path) => path === '/crm' ? location.pathname === '/crm' : location.pathname.startsWith(path)

  const navBtn = (label, path) => (
    <button onClick={() => navigate(path)} style={{
      padding:'6px 16px', fontSize:13, fontWeight:500, border:'none',
      background:'transparent', cursor:'pointer',
      borderBottom: isActive(path) ? '2px solid #EB99C2' : '2px solid transparent',
      color: isActive(path) ? '#EB99C2' : 'rgba(255,255,255,0.65)',
      marginBottom:'-1px', whiteSpace:'nowrap'
    }}>
      {label}
    </button>
  )

  return (
    <div style={{
      background:'#3D5570', borderBottom:'1px solid rgba(255,255,255,0.08)',
      padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between',
      height:56, flexShrink:0
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:24 }}>
        <RionLogo onClick={() => navigate('/')} />
        <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.12em', border:'1px solid rgba(255,255,255,0.12)', borderRadius:4, padding:'2px 6px' }}>CRM</span>
        <nav style={{ display:'flex', alignItems:'center' }}>
          {navBtn('Pipeline', '/crm')}
          {navBtn('Sales Dashboard', '/crm/dashboard')}
        </nav>
      </div>
      <button onClick={() => navigate('/')} style={{
        background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:7,
        padding:'5px 12px', color:'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer', whiteSpace:'nowrap'
      }}>⌂ Home</button>
    </div>
  )
}
