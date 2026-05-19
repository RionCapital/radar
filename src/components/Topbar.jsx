import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import styles from './Topbar.module.css'

export default function Topbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className={styles.bar}>
      {/* Logo + Nav left group */}
      <div style={{ display:'flex', alignItems:'center', gap:24 }}>
      <div className={styles.logo} onClick={() => navigate('/')} title="Home" style={{ cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
        <div style={{ lineHeight:1, display:'flex', alignItems:'baseline' }}>
          <span style={{ fontFamily:"'Montserrat',sans-serif", fontWeight:700, fontSize:28, color:'#EB99C2', letterSpacing:'-0.5px' }}>R</span>
          <span style={{ fontFamily:"'Montserrat',sans-serif", fontWeight:300, fontSize:28, color:'#fff', letterSpacing:'0.5px' }}>radar</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:0, marginTop:2 }}>
          <div style={{ width:38, height:'0.5px', background:'rgba(235,153,194,0.35)' }}/>
          <div style={{ width:4, height:4, borderRadius:'50%', background:'#EB99C2', opacity:0.65, margin:'0 4px', flexShrink:0 }}/>
          <div style={{ width:38, height:'0.5px', background:'rgba(235,153,194,0.35)' }}/>
        </div>
        <div style={{ fontFamily:"'Montserrat',sans-serif", fontSize:7.5, color:'rgba(187,198,218,0.45)', letterSpacing:'0.06em', marginTop:1, whiteSpace:'nowrap' }}>
          Powered by <span style={{ color:'#EB99C2', fontWeight:600 }}>Rion Capital</span>
        </div>
      </div>
      {/* Nav buttons — left of bar */}
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
      </nav>
      </div>

      {/* Home btn — stays right */}
      <button className={styles.homeBtn} onClick={() => navigate('/')}>
        ⌂ Home
      </button>
    </div>
  )
}
