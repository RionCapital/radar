import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings, DEFAULT_SETTINGS, getCurrentUser } from '../lib/settings'

const inp = { border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }
const Card = ({ children, style }) => <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'16px 18px', ...style }}>{children}</div>
const CardTitle = ({ children }) => <div style={{ fontSize:11, fontWeight:600, color:'#5a6370', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>{children}</div>

const BLANK_USER = { id:'', name:'', email:'', password:'', phone:'', role:'broker', active:true }

export default function AdminSettings() {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const isAdmin = currentUser?.role === 'admin'
  const [settings, setSettings] = useState(() => loadSettings())
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState('commissions')
  const [editUser, setEditUser] = useState(null) // null | user object
  const [newUser, setNewUser] = useState(false)

  function setRate(category, field, value) {
    setSettings(s => ({ ...s, commissionRates: { ...s.commissionRates, [category]: { ...s.commissionRates[category], [field]: parseFloat(value)||0 } } }))
  }
  function setField(key, value) { setSettings(s => ({ ...s, [key]: value })) }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }
  function handleReset() {
    if (window.confirm('Reset all settings to defaults?')) {
      setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
  }

  // User management
  function saveUser(u) {
    const users = settings.users || []
    if (u.id) {
      setSettings(s => ({ ...s, users: users.map(x => x.id === u.id ? u : x) }))
    } else {
      const newU = { ...u, id: Date.now().toString() }
      setSettings(s => ({ ...s, users: [...users, newU] }))
    }
    setEditUser(null); setNewUser(false)
  }
  function toggleUserActive(id) {
    setSettings(s => ({ ...s, users: (s.users||[]).map(u => u.id===id ? {...u,active:!u.active} : u) }))
  }
  function deleteUser(id) {
    if (window.confirm('Remove this user?')) {
      setSettings(s => ({ ...s, users: (s.users||[]).filter(u => u.id!==id) }))
    }
  }

  const TABS = [
    { id:'commissions', label:'Commission Rates' },
    { id:'business', label:'Business Details' },
    ...(isAdmin ? [{ id:'team', label:'Team Members' }] : []),
  ]

  return (
    <div>
      <div style={{ background:'#3D5570', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <img src="/rion_logo_notag.png" alt="Rion Capital" style={{ height:38, width:'auto', mixBlendMode:'lighten', cursor:'pointer' }} onClick={() => navigate('/')}/>
          <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.9)', letterSpacing:'0.02em' }}>Settings</span>
        </div>
        <button onClick={() => navigate('/')} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'5px 12px', color:'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer' }}>⌂ Home</button>
      </div>

      <div style={{ padding:'16px 24px', maxWidth:860, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:700, color:'#2A3545', margin:0 }}>Admin — Settings</h1>
            <div style={{ fontSize:11, color:'#7A8090', marginTop:2 }}>Logged in as {currentUser?.name} ({currentUser?.role})</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {saved && <span style={{ fontSize:11, color:'#22c55e', padding:'6px 12px', background:'#f0fdf4', borderRadius:7, border:'1px solid #bbf7d0' }}>✓ Saved</span>}
            <button onClick={handleReset} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e8eaed', background:'#fff', color:'#7A8090', fontSize:12, cursor:'pointer' }}>Reset defaults</button>
            <button onClick={handleSave} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#EB99C2', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Save changes</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'1px solid #e8eaed' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'8px 16px', fontSize:12, fontWeight:tab===t.id?700:400, color:tab===t.id?'#3D4F6B':'#7A8090', background:'none', border:'none', borderBottom:tab===t.id?'2px solid #EB99C2':'2px solid transparent', cursor:'pointer', marginBottom:-1 }}>{t.label}</button>
          ))}
        </div>

        {/* Commission Rates */}
        {tab==='commissions' && (
          <Card style={{ marginBottom:16 }}>
            <CardTitle>Commission rates by loan type</CardTitle>
            <div style={{ fontSize:11, color:'#7A8090', marginBottom:14, lineHeight:1.5 }}>
              Upfront rates are applied as a percentage of the loan amount.
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #e8eaed', background:'#f8f9fa' }}>
                  <th style={{ padding:'8px 12px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:11 }}>Loan type</th>
                  <th style={{ padding:'8px 12px', textAlign:'center', color:'#7A8090', fontWeight:600, fontSize:11 }}>Upfront (%)</th>
                  <th style={{ padding:'8px 12px', textAlign:'center', color:'#7A8090', fontWeight:600, fontSize:11 }}>Trail (%)</th>
                  <th style={{ padding:'8px 12px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:11 }}>Example — $500k</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(settings.commissionRates).map(([cat, rates]) => (
                  <tr key={cat} style={{ borderBottom:'0.5px solid #f0f0f0' }}>
                    <td style={{ padding:'8px 12px', fontWeight:500, color:'#2A3545' }}>{rates.label}</td>
                    <td style={{ padding:'8px 12px', textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                        <input type="number" step="0.01" min="0" max="10" value={rates.upfront} onChange={e => setRate(cat,'upfront',e.target.value)} style={{ ...inp, width:70, textAlign:'center' }} />
                        <span style={{ fontSize:11, color:'#7A8090' }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                        <input type="number" step="0.01" min="0" max="5" value={rates.trail} onChange={e => setRate(cat,'trail',e.target.value)} style={{ ...inp, width:70, textAlign:'center' }} />
                        <span style={{ fontSize:11, color:'#7A8090' }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'#22c55e', fontWeight:500 }}>${Math.round(500000*rates.upfront/100).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Business Details */}
        {tab==='business' && (
          <Card style={{ marginBottom:16 }}>
            <CardTitle>Business &amp; broker details</CardTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Default broker name</div>
                <input style={inp} value={settings.brokerName||''} onChange={e => setField('brokerName', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Default broker email</div>
                <input style={inp} type="email" value={settings.brokerEmail||''} onChange={e => setField('brokerEmail', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Default broker phone</div>
                <input style={inp} value={settings.brokerPhone||''} onChange={e => setField('brokerPhone', e.target.value)} placeholder="0400 000 000" />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Business name</div>
                <input style={inp} value={settings.businessName||''} onChange={e => setField('businessName', e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop:12, padding:'10px 12px', background:'#fef9c3', borderRadius:7, fontSize:11, color:'#78350f' }}>
              💡 These details pre-populate email templates. Individual broker profiles are set in Team Members.
            </div>
          </Card>
        )}

        {/* Team Members — admin only */}
        {tab==='team' && isAdmin && (
          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <CardTitle style={{ margin:0 }}>Team Members</CardTitle>
              <button onClick={() => { setNewUser(true); setEditUser({...BLANK_USER}) }}
                style={{ fontSize:11, padding:'5px 14px', borderRadius:7, border:'none', background:'#3D4F6B', color:'#fff', cursor:'pointer', fontWeight:600 }}>
                + Add member
              </button>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #e8eaed', background:'#f8f9fa' }}>
                  {['Name','Email','Phone','Role','Status',''].map(h => (
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, color:'#7A8090', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(settings.users||[]).map(u => (
                  <tr key={u.id} style={{ borderBottom:'0.5px solid #f1f5f9', opacity: u.active===false ? 0.5 : 1 }}>
                    <td style={{ padding:'8px 10px', fontWeight:500, color:'#2A3545' }}>{u.name}</td>
                    <td style={{ padding:'8px 10px', color:'#64748b' }}>{u.email}</td>
                    <td style={{ padding:'8px 10px', color:'#64748b' }}>{u.phone||'—'}</td>
                    <td style={{ padding:'8px 10px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:600, background:u.role==='admin'?'#fef3c7':'#eff6ff', color:u.role==='admin'?'#92400e':'#1e40af' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      <button onClick={() => toggleUserActive(u.id)}
                        style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:600, border:'none', cursor:'pointer', background:u.active!==false?'#dcfce7':'#fee2e2', color:u.active!==false?'#166534':'#991b1b' }}>
                        {u.active!==false ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => { setEditUser({...u}); setNewUser(false) }}
                          style={{ fontSize:10, padding:'3px 8px', borderRadius:5, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', color:'#334155' }}>Edit</button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => deleteUser(u.id)}
                            style={{ fontSize:10, padding:'3px 8px', borderRadius:5, border:'1px solid #fecaca', background:'#fff', cursor:'pointer', color:'#dc2626' }}>Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Edit / Add user modal */}
            {editUser && (
              <div style={{ marginTop:16, padding:'16px', background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#3D4F6B', marginBottom:12 }}>{newUser ? 'Add New Team Member' : `Edit — ${editUser.name}`}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>Full name</div>
                    <input style={inp} value={editUser.name||''} onChange={e => setEditUser(u => ({...u, name:e.target.value}))} placeholder="Full name" />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>Email (login)</div>
                    <input style={inp} type="email" value={editUser.email||''} onChange={e => setEditUser(u => ({...u, email:e.target.value}))} placeholder="email@rion-capital.com" />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>Password</div>
                    <input style={inp} type="password" value={editUser.password||''} onChange={e => setEditUser(u => ({...u, password:e.target.value}))} placeholder={newUser ? 'Set password' : 'Leave blank to keep current'} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>Phone</div>
                    <input style={inp} value={editUser.phone||''} onChange={e => setEditUser(u => ({...u, phone:e.target.value}))} placeholder="0400 000 000" />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>Role</div>
                    <select style={inp} value={editUser.role||'broker'} onChange={e => setEditUser(u => ({...u, role:e.target.value}))}>
                      <option value="broker">Broker</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
                    <button onClick={() => saveUser(editUser)}
                      style={{ flex:1, padding:'7px', borderRadius:7, border:'none', background:'#3D4F6B', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      {newUser ? 'Add Member' : 'Save Changes'}
                    </button>
                    <button onClick={() => { setEditUser(null); setNewUser(false) }}
                      style={{ padding:'7px 12px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', fontSize:12, cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

