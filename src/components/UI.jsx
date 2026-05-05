import React from 'react'

export function DayBadge({ days }) {
  if (!days || days === 0) return <span style={badge('#f0f3f7','#6b7a8d')}>new</span>
  if (days > 365) return <span style={badge('#fde8e8','#c0392b')}>{days}d</span>
  if (days > 180) return <span style={badge('#fef3e2','#b7770d')}>{days}d</span>
  return <span style={badge('#e8f5e9','#2e7d32')}>{days}d</span>
}

export function StreamTag({ stream }) {
  const isComm = stream === 'Commercial'
  return (
    <span style={badge(isComm ? '#eef1f5' : '#fce8f3', isComm ? '#2A3D54' : '#993556')}>
      {stream === 'Private Wealth' ? 'PW' : stream === 'Commercial' ? 'Comm' : '—'}
    </span>
  )
}

export function Pill({ label, variant = 'default' }) {
  const variants = {
    default: ['#f0f3f7','#6b7a8d'],
    pi: ['#eef1f5','#2A3D54'],
    io: ['#fef3e2','#b7770d'],
    pw: ['#fce8f3','#993556'],
    comm: ['#eef1f5','#2A3D54'],
    flag: ['#fde8e8','#c0392b'],
    ok: ['#e8f5e9','#2e7d32'],
    score: ['#fce8f3','#DA408D'],
  }
  const [bg, color] = variants[variant] || variants.default
  return <span style={badge(bg, color)}>{label}</span>
}

function badge(bg, color) {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 7px', borderRadius: 20,
    fontSize: 9, fontWeight: 500,
    background: bg, color,
    whiteSpace: 'nowrap', flexShrink: 0,
  }
}

export function Panel({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 10,
      border: '0.5px solid var(--border)', padding: 14,
      ...style
    }}>
      {children}
    </div>
  )
}

export function PanelTitle({ children, action }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: 10, paddingBottom: 8,
      borderBottom: '0.5px solid var(--border-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span>{children}</span>
      {action}
    </div>
  )
}

export function StatCard({ label, value, accent = 'var(--pk)' }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 8,
      border: '0.5px solid var(--border)',
      borderTop: `3px solid ${accent}`,
      padding: '11px 13px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

export function EditBtn({ onClick, label = 'Edit' }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 6,
      border: '0.5px solid var(--pk)', background: 'transparent',
      color: 'var(--pk)', cursor: 'pointer',
    }}
    onMouseOver={e => { e.target.style.background = 'var(--pk)'; e.target.style.color = '#fff'; }}
    onMouseOut={e => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--pk)'; }}
    >{label}</button>
  )
}

export function SaveBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 6,
      border: '0.5px solid #27ae60', background: '#27ae60',
      color: '#fff', cursor: 'pointer',
    }}>Save</button>
  )
}

export function CancelBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 6,
      border: '0.5px solid var(--border)', background: 'transparent',
      color: 'var(--text-secondary)', cursor: 'pointer',
    }}>Cancel</button>
  )
}

export function ActionBtn({ onClick, label, variant = 'pink' }) {
  const styles = {
    pink: { border: '1.5px solid var(--pk)', color: 'var(--pk)', hoverBg: 'var(--pk)', hoverColor: '#fff' },
    blue: { border: '1.5px solid var(--bl)', color: 'var(--bl)', hoverBg: 'var(--bl)', hoverColor: '#fff' },
    filled: { border: '1.5px solid var(--pk)', color: '#fff', background: 'var(--pk)' },
  }
  const st = styles[variant] || styles.pink
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8,
      border: st.border, background: st.background || 'transparent',
      color: st.color, fontWeight: 500, fontSize: 12, cursor: 'pointer',
    }}>{label}</button>
  )
}

export function FieldGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  )
}

export function ClientRow({ client, onClick }) {
  const { name, stream, days, score, loans } = client
  const bal = loans.reduce((s, l) => s + (l.balance || 0), 0)
  const initials = name.split(/[\s-]+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '??'
  const isComm = stream === 'Commercial'
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', padding: '8px 6px',
      borderBottom: '0.5px solid var(--border-light)', gap: 8,
      cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s',
    }}
    onMouseOver={e => e.currentTarget.style.background = '#fce8f3'}
    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 500,
        background: isComm ? '#eef1f5' : '#fce8f3',
        color: isComm ? '#2A3D54' : '#DA408D',
      }}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {stream} · {loans.length} account{loans.length !== 1 ? 's' : ''} · {bal > 0 ? '$' + Math.round(bal).toLocaleString() : 'No loans yet'}
        </div>
      </div>
      <StreamTag stream={stream} />
      {score > 0 && <Pill label={`★ ${score}`} variant="score" />}
      <DayBadge days={days} />
    </div>
  )
}
