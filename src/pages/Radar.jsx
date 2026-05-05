import React from 'react'
import { useNavigate } from 'react-router-dom'
import { totalBal, fmt } from '../lib/data'
import { Panel, PanelTitle, DayBadge } from '../components/UI'

const FIXED_IO = [
  { name: 'Ricciulli — ANZ IO', detail: '$229k · IO term expiry imminent', urgency: 'urgent' },
  { name: 'Ricciulli — NAB IO', detail: '$516k · IO expiry upcoming', urgency: 'warn' },
  { name: 'Ricciulli — CBA maturity', detail: '$798k · Fixed maturity 2030', urgency: 'ok' },
  { name: 'Russell — Fixed rate expiry', detail: '$396k · CBA flagged', urgency: 'warn' },
  { name: 'Craig — Reviewed 2022', detail: '$536k · 1,419 days overdue', urgency: 'urgent' },
]

const BALLOONS = [
  { name: 'Quartiero — Hydro Solutions', detail: '$74k balloon — past term date', urgency: 'urgent' },
  { name: 'Smith — Command Plumbing', detail: '$28k balloon due 2028', urgency: 'warn' },
  { name: 'Borg — JMB Plumbing', detail: '$77k balloon approaching 2027', urgency: 'warn' },
  { name: 'Synergy IT — Selfco', detail: '$83k asset finance 2031', urgency: 'ok' },
]

const urgencyColors = {
  urgent: { bg: '#fde8e8', color: '#c0392b', label: 'urgent' },
  warn: { bg: '#fef3e2', color: '#b7770d', label: 'due' },
  ok: { bg: '#e8f5e9', color: '#2e7d32', label: 'future' },
}

function RadarRow({ name, detail, urgency, onClick }) {
  const u = urgencyColors[urgency] || urgencyColors.ok
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid var(--border-light)', cursor: onClick ? 'pointer' : 'default' }}
      onMouseOver={e => onClick && (e.currentTarget.querySelector('.rr-name').style.color = 'var(--pk)')}
      onMouseOut={e => onClick && (e.currentTarget.querySelector('.rr-name').style.color = 'var(--text-primary)')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rr-name" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', transition: 'color 0.1s' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{detail}</div>
      </div>
      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 9, fontWeight: 500, background: u.bg, color: u.color, whiteSpace: 'nowrap' }}>{u.label}</span>
    </div>
  )
}

export default function Radar({ clients }) {
  const navigate = useNavigate()
  const annual = [...clients].filter(c => c.days >= 180 && c.loans.length > 0).sort((a, b) => b.days - a.days)
  const longTerm = [...clients].filter(c => c.days >= 1000 && c.loans.length > 0).sort((a, b) => b.days - a.days)

  return (
    <div style={{ padding: '18px 24px' }}>
      <Panel>
        <PanelTitle>Opportunity radar — review categories</PanelTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 7, borderBottom: '0.5px solid var(--border-light)' }}>
              Annual reviews (A) — 180+ days
            </div>
            {annual.slice(0, 8).map(c => (
              <div key={c.name} onClick={() => navigate(`/clients/${encodeURIComponent(c.name)}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid var(--border-light)', cursor: 'pointer' }}
                onMouseOver={e => e.currentTarget.querySelector('.rn').style.color = 'var(--pk)'}
                onMouseOut={e => e.currentTarget.querySelector('.rn').style.color = 'var(--text-primary)'}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: c.stream === 'Commercial' ? '#eef1f5' : '#fce8f3', color: c.stream === 'Commercial' ? '#2A3D54' : 'var(--pk)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 500, flexShrink: 0 }}>
                  {c.name.split(/[\s-]+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rn" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', transition: 'color 0.1s' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmt(totalBal(c))} · {c.loans.length} account{c.loans.length !== 1 ? 's' : ''}</div>
                </div>
                <DayBadge days={c.days} />
              </div>
            ))}
          </div>

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 7, borderBottom: '0.5px solid var(--border-light)' }}>
              IO / fixed term expiries (B/C)
            </div>
            {FIXED_IO.map((r, i) => <RadarRow key={i} {...r} onClick={() => navigate(`/clients/Ricciulli`)} />)}
          </div>

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 7, borderBottom: '0.5px solid var(--border-light)' }}>
              Asset finance balloons (D)
            </div>
            {BALLOONS.map((r, i) => <RadarRow key={i} {...r} />)}
          </div>

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 7, borderBottom: '0.5px solid var(--border-light)' }}>
              Long-term no contact — 1,000+ days
            </div>
            {longTerm.map(c => (
              <div key={c.name} onClick={() => navigate(`/clients/${encodeURIComponent(c.name)}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid var(--border-light)', cursor: 'pointer' }}
                onMouseOver={e => e.currentTarget.querySelector('.rn2').style.color = 'var(--pk)'}
                onMouseOut={e => e.currentTarget.querySelector('.rn2').style.color = 'var(--text-primary)'}>
                <div style={{ flex: 1 }}>
                  <div className="rn2" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', transition: 'color 0.1s' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmt(totalBal(c))}</div>
                </div>
                <DayBadge days={c.days} />
              </div>
            ))}
          </div>

        </div>
      </Panel>
    </div>
  )
}
