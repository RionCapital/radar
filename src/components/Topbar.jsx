import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { logo_rion } from '../lib/icons'
import s from './Topbar.module.css'

export default function Topbar() {
  const navigate = useNavigate()
  return (
    <header className={s.bar}>
      <div className={s.logo} onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <img src={logo_rion} alt="RION Capital" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        <div style={{ marginLeft: 8, borderLeft: '0.5px solid rgba(187,198,218,0.3)', paddingLeft: 12 }}>
          <div className={s.name}>RION Radar</div>
          <div className={s.sub}>Back book relationship management</div>
        </div>
      </div>
      <nav className={s.nav}>
        <NavLink to="/radar/dashboard" className={({ isActive }) => isActive ? `${s.link} ${s.active}` : s.link}>Dashboard</NavLink>
        <NavLink to="/radar/clients" className={({ isActive }) => isActive ? `${s.link} ${s.active}` : s.link}>Clients</NavLink>
        <button onClick={() => navigate('/')} className={s.link} style={{ border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.08)' }}>⌂ Home</button>
      </nav>
    </header>
  )
}
