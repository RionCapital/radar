import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logo_rion_login } from '../lib/icons'

const USERS = [
  { email: 'cameron@rion-capital.com', password: 'RionDash2', name: 'Cameron Finlayson' },
]

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTimeout(() => {
      const user = USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
      if (user) {
        sessionStorage.setItem('rion-auth', JSON.stringify({ email: user.email, name: user.name }))
        navigate('/')
      } else {
        setError('Invalid email or password. Please try again.')
        setLoading(false)
      }
    }, 600)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#3D5570',
        borderRadius: 16,
        padding: '40px 44px',
        width: 420,
        boxShadow: '0 20px 60px rgba(42,61,84,0.25)',
      }}>
        {/* Official logo — dark bg version blends perfectly */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={logo_rion_login} alt="RION Capital" style={{ width: '80%', maxWidth: 280, objectFit: 'contain' }} />
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, color: 'rgba(187,198,218,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Email address
            </label>
            <input
              type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="your@email.com" required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 12,
                border: error ? '1px solid rgba(218,64,141,0.6)' : '1px solid rgba(187,198,218,0.25)',
                background: 'rgba(255,255,255,0.08)', color: '#fff', outline: 'none',
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
              onFocus={e => e.target.style.border = '1px solid rgba(235,153,194,0.7)'}
              onBlur={e => e.target.style.border = error ? '1px solid rgba(218,64,141,0.6)' : '1px solid rgba(187,198,218,0.25)'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, color: 'rgba(187,198,218,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="••••••••" required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 12,
                border: error ? '1px solid rgba(218,64,141,0.6)' : '1px solid rgba(187,198,218,0.25)',
                background: 'rgba(255,255,255,0.08)', color: '#fff', outline: 'none',
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
              onFocus={e => e.target.style.border = '1px solid rgba(235,153,194,0.7)'}
              onBlur={e => e.target.style.border = error ? '1px solid rgba(218,64,141,0.6)' : '1px solid rgba(187,198,218,0.25)'}
            />
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#EB99C2', marginBottom: 16, padding: '8px 12px', background: 'rgba(218,64,141,0.15)', borderRadius: 6, border: '0.5px solid rgba(218,64,141,0.3)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: loading ? '#DA408D' : '#EB99C2',
            color: '#2A3D54', fontWeight: 700, fontSize: 13, cursor: loading ? 'default' : 'pointer',
            fontFamily: "'Montserrat', system-ui, sans-serif",
            letterSpacing: '0.05em', transition: 'background 0.15s',
          }}
          onMouseDown={e => e.currentTarget.style.background='#DA408D'}
          onMouseUp={e => e.currentTarget.style.background='#EB99C2'}
          onMouseLeave={e => e.currentTarget.style.background='#EB99C2'}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

      
      </div>
    </div>
  )
}
