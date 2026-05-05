import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { icon_lead, icon_team, icon_network, icon_notebook, logo_rion } from '../lib/icons'

const APPS = [
  { name: 'Mercury',    url: 'https://mercury.connective.com.au', color: '#4A90D9' },
  { name: 'CoreLogic',  url: 'https://www.corelogic.com.au',      color: '#E8A020' },
  { name: 'Brokerpedia',url: 'https://brokerpedia.com.au',         color: '#27ae60' },
  { name: 'Quickli',    url: 'https://www.quickli.com.au',         color: '#8B5CF6' },
  { name: 'MyCRM',      url: 'https://mycrm.com.au',               color: '#DA408D' },
  { name: 'XPLAN',      url: 'https://iress.com',                  color: '#2A3D54' },
]

const TOOLS = [
  { id: 'crm',       label: 'CRM',       icon: icon_lead,     desc: 'Pipeline management',       path: null,              active: false },
  { id: 'radar',     label: 'Radar',     icon: icon_team,     desc: 'Back book & dashboard',     path: '/radar/dashboard',active: true  },
  { id: 'marketing', label: 'Marketing', icon: icon_network,  desc: 'Client & referral lists',   path: null,              active: false },
  { id: 'planner',   label: 'Planner',   icon: icon_notebook, desc: 'Weekly & monthly organiser',path: null,              active: false },
]

const BG = '#1e2d3f'

export default function Home() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(218,64,141,0.06) 0%, transparent 60%)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 48px',
        borderBottom: '0.5px solid rgba(187,198,218,0.15)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'all 0.5s ease',
      }}>
        {/* RION Capital Logo */}
        <img
          src={logo_rion}
          alt="RION Capital"
          style={{ height: 52, width: 'auto', objectFit: 'contain' }}
        />
        <div style={{ fontSize: 11, color: 'rgba(187,198,218,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Internal Platform
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: '48px 48px 32px' }}>

        {/* TOOLS */}
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(187,198,218,0.6)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Tools</span>
            <div style={{ flex: 1, height: '0.5px', background: 'linear-gradient(to right, #DA408D, transparent)' }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 56 }}>
            {TOOLS.map((tool, i) => <ToolCard key={tool.id} tool={tool} index={i} visible={visible} navigate={navigate} />)}
          </div>
        </div>

        {/* APPS */}
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(187,198,218,0.6)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Apps</span>
            <div style={{ flex: 1, height: '0.5px', background: 'linear-gradient(to right, #DA408D, transparent)' }} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {APPS.map((app, i) => <AppCard key={app.name} app={app} index={i} visible={visible} />)}
          </div>
        </div>
      </main>

      <footer style={{
        padding: '16px 48px',
        borderTop: '0.5px solid rgba(187,198,218,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        opacity: visible ? 0.5 : 0, transition: 'opacity 0.8s ease 0.5s',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(187,198,218,0.5)', letterSpacing: '0.06em' }}>RION Capital — Internal Platform</span>
        <span style={{ fontSize: 10, color: 'rgba(187,198,218,0.3)' }}>{new Date().getFullYear()}</span>
      </footer>

      <style>{`
        @keyframes pulse { from { opacity: 0.6; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

function ToolCard({ tool, index, visible, navigate }) {
  const [hovered, setHovered] = useState(false)

  function handleClick() {
    if (!tool.active) return
    navigate(tool.path)
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 160, height: 180,
        // Tile background exactly matches the page background
        background: hovered && tool.active ? 'rgba(218,64,141,0.08)' : BG,
        border: hovered && tool.active
          ? '1px solid rgba(218,64,141,0.5)'
          : '1px solid rgba(187,198,218,0.15)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
        cursor: tool.active ? 'pointer' : 'not-allowed',
        transition: 'all 0.25s ease',
        transform: hovered && tool.active ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered && tool.active ? '0 12px 32px rgba(218,64,141,0.12)' : 'none',
        opacity: visible ? 1 : 0,
        animation: visible ? `fadeUp 0.5s ease ${0.15 + index * 0.08}s both` : 'none',
        position: 'relative',
      }}
    >
      {/* Lock badge */}
      {!tool.active && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(30,45,63,0.9)',
          borderRadius: 20, padding: '2px 7px',
          fontSize: 9, color: 'rgba(187,198,218,0.4)',
          letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 3,
          border: '0.5px solid rgba(187,198,218,0.1)',
        }}>
          <svg width="8" height="9" viewBox="0 0 8 9" fill="none">
            <rect x="1" y="4" width="6" height="5" rx="1" stroke="rgba(187,198,218,0.4)" strokeWidth="1"/>
            <path d="M2.5 4V3a1.5 1.5 0 013 0v1" stroke="rgba(187,198,218,0.4)" strokeWidth="1"/>
          </svg>
          Soon
        </div>
      )}

      {/* Icon — no background, clean on dark */}
      <div style={{
        width: 72, height: 72,
        filter: tool.active
          ? (hovered ? 'brightness(1.15)' : 'brightness(1)')
          : 'brightness(0.25) saturate(0)',
        transition: 'filter 0.25s ease',
      }}>
        <img src={tool.icon} alt={tool.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>

      {/* Label */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: tool.active ? (hovered ? '#DA408D' : 'rgba(255,255,255,0.9)') : 'rgba(187,198,218,0.25)',
          transition: 'color 0.25s ease', letterSpacing: '0.02em',
        }}>{tool.label}</div>
        <div style={{
          fontSize: 10, marginTop: 3,
          color: tool.active ? 'rgba(187,198,218,0.4)' : 'rgba(187,198,218,0.15)',
          letterSpacing: '0.03em',
        }}>{tool.desc}</div>
      </div>
    </div>
  )
}

function AppCard({ app, index, visible }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={app.url} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px',
        background: hovered ? 'rgba(255,255,255,0.05)' : BG,
        border: hovered ? `1px solid ${app.color}55` : '1px solid rgba(187,198,218,0.15)',
        borderRadius: 10,
        textDecoration: 'none',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        opacity: visible ? 1 : 0,
        animation: visible ? `fadeUp 0.5s ease ${0.3 + index * 0.06}s both` : 'none',
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: app.color,
        boxShadow: hovered ? `0 0 8px ${app.color}` : 'none',
        transition: 'box-shadow 0.2s ease', flexShrink: 0,
      }} />
      <span style={{
        fontSize: 12, fontWeight: 500,
        color: hovered ? '#fff' : 'rgba(187,198,218,0.7)',
        transition: 'color 0.2s ease', whiteSpace: 'nowrap', letterSpacing: '0.02em',
      }}>{app.name}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{ opacity: hovered ? 0.5 : 0, transition: 'opacity 0.2s ease', marginLeft: 2 }}>
        <path d="M2 8L8 2M8 2H4M8 2v4" stroke="rgba(187,198,218,0.8)" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    </a>
  )
}
