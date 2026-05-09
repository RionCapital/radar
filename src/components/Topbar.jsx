import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logo_rion } from '../lib/icons'
import styles from './Topbar.module.css'

export default function Topbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className={styles.bar}>
      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate('/')} title="Home">
        <img src={logo_rion} alt="RION Capital" style={{ height: 44, width: 'auto', objectFit: 'contain', cursor: 'pointer' }} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <button
          className={`${styles.navBtn} ${isActive('/radar/dashboard') ? styles.active : ''}`}
          onClick={() => navigate('/radar/dashboard')}>
          Dashboard
        </button>
        <button
          className={`${styles.navBtn} ${isActive('/radar/clients') ? styles.active : ''}`}
          onClick={() => navigate('/radar/clients')}>
          Clients
        </button>
        <button className={styles.homeBtn} onClick={() => navigate('/')}>
          ⌂ Home
        </button>
      </nav>
    </div>
  )
}
