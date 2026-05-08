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
      minHeight:'100vh', background:'#ffffff',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'DM Sans',system-ui,sans-serif",
    }}>
      <div style={{
        background:'#3D5570',
        border:'none', borderRadius:16,
        padding:'40px 44px', width:400,
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:32}}>
          <img src={logo_rion_login} alt="RION Capital" style={{height:56, objectFit:'contain'}}/>
          <div style={{fontSize:12, color:'rgba(187,198,218,0.5)', marginTop:10, letterSpacing:'0.08em', textTransform:'uppercase'}}>
            Welcome to RION Capital Live
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11, color:'rgba(187,198,218,0.6)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6}}>
              Email address
            </label>
            <input
              type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}}
              placeholder="your@email.com" required
              style={{
                width:'100%', padding:'10px 14px', borderRadius:8, fontSize:13,
                border: error ? '1px solid rgba(220,80,80,0.6)' : '1px solid rgba(187,198,218,0.3)',
                background:'rgba(255,255,255,0.1)', color:'#fff',
                outline:'none', transition:'border 0.15s',
              }}
              onFocus={e=>e.target.style.border='1px solid rgba(235,153,194,0.6)'}
              onBlur={e=>e.target.style.border=error?'1px solid rgba(220,80,80,0.6)':'1px solid rgba(187,198,218,0.2)'}
            />
          </div>
          <div style={{marginBottom:24}}>
            <label style={{fontSize:11, color:'rgba(187,198,218,0.6)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6}}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}}
              placeholder="••••••••" required
              style={{
                width:'100%', padding:'10px 14px', borderRadius:8, fontSize:13,
                border: error ? '1px solid rgba(220,80,80,0.6)' : '1px solid rgba(187,198,218,0.3)',
                background:'rgba(255,255,255,0.1)', color:'#fff',
                outline:'none', transition:'border 0.15s',
              }}
              onFocus={e=>e.target.style.border='1px solid rgba(235,153,194,0.6)'}
              onBlur={e=>e.target.style.border=error?'1px solid rgba(220,80,80,0.6)':'1px solid rgba(187,198,218,0.2)'}
            />
          </div>

          {error && (
            <div style={{fontSize:11, color:'#fca5a5', marginBottom:16, padding:'8px 12px', background:'rgba(220,80,80,0.15)', borderRadius:6, border:'0.5px solid rgba(220,80,80,0.3)'}}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'11px', borderRadius:8, border:'none',
            background: loading ? 'rgba(235,153,194,0.5)' : '#EB99C2',
            color: '#2A3D54', fontWeight:600, fontSize:13, cursor: loading ? 'default' : 'pointer',
            transition:'all 0.2s', letterSpacing:'0.02em',
          }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{textAlign:'center', marginTop:20, fontSize:11, color:'rgba(187,198,218,0.3)'}}>
          RION Capital — Internal Platform
        </div>
      </div>
    </div>
  )
}
