import React from 'react'
import { NavLink } from 'react-router-dom'
import s from './Topbar.module.css'

export default function Topbar() {
  return (
    <header className={s.bar}>
      <div className={s.logo}>
        <div className={s.icon}>RC</div>
        <div>
          <div className={s.name}>RION Radar</div>
          <div className={s.sub}>Back book relationship management</div>
        </div>
      </div>
      <nav className={s.nav}>
        <NavLink to="/" end className={({ isActive }) => isActive ? `${s.link} ${s.active}` : s.link}>Dashboard</NavLink>
        <NavLink to="/clients" className={({ isActive }) => isActive ? `${s.link} ${s.active}` : s.link}>Clients</NavLink>
      </nav>
    </header>
  )
}
