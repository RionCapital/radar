import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings'

const inp = { border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }
const Card = ({ children, style }) => <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'16px 18px', ...style }}>{children}</div>
const CardTitle = ({ children }) => <div style={{ fontSize:11, fontWeight:600, color:'#5a6370', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>{children}</div>

export default function AdminSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(() => loadSettings())
  const [saved, setSaved] = useState(false)

  function setRate(category, field, value) {
    setSettings(s => ({
      ...s,
      commissionRates: {
        ...s.commissionRates,
        [category]: { ...s.commissionRates[category], [field]: parseFloat(value) || 0 }
      }
    }))
  }

  function setField(key, value) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function handleReset() {
    if (window.confirm('Reset all settings to defaults?')) {
      setSettings(DEFAULT_SETTINGS)
      saveSettings(DEFAULT_SETTINGS)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div>
      {/* Standalone settings topbar — no CRM or Rradar nav */}
      <div style={{ background:'#3D5570', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <img src="/rion_logo_notag.png" alt="Rion Capital" style={{ height:38, width:'auto', mixBlendMode:'lighten', cursor:'pointer' }} onClick={() => navigate('/')}/>
          <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.9)', letterSpacing:'0.02em' }}>Settings</span>
        </div>
        <button onClick={() => navigate('/')} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'5px 12px', color:'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer' }}>⌂ Home</button>
      </div>

      <div style={{ padding:'16px 24px', maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:700, color:'#2A3545', margin:0 }}>Admin — Settings</h1>
            <div style={{ fontSize:11, color:'#7A8090', marginTop:2 }}>Configure commission rates and business settings</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {saved && <span style={{ fontSize:11, color:'#22c55e', padding:'6px 12px', background:'#f0fdf4', borderRadius:7, border:'1px solid #bbf7d0' }}>✓ Saved</span>}
            <button onClick={handleReset} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e8eaed', background:'#fff', color:'#7A8090', fontSize:12, cursor:'pointer' }}>Reset defaults</button>
            <button onClick={handleSave} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#EB99C2', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Save changes</button>
          </div>
        </div>

        {/* Commission rates */}
        <Card style={{ marginBottom:16 }}>
          <CardTitle>Commission rates by loan type</CardTitle>
          <div style={{ fontSize:11, color:'#7A8090', marginBottom:14, lineHeight:1.5 }}>
            Upfront rates are applied as a percentage of the loan amount. Trail rates are for reference only at this stage.
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e8eaed', background:'#f8f9fa' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:11 }}>Loan type</th>
                <th style={{ padding:'8px 12px', textAlign:'center', color:'#7A8090', fontWeight:600, fontSize:11 }}>Upfront rate (%)</th>
                <th style={{ padding:'8px 12px', textAlign:'center', color:'#7A8090', fontWeight:600, fontSize:11 }}>Trail rate (%)</th>
                <th style={{ padding:'8px 12px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:11 }}>Example — $500k loan</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(settings.commissionRates).map(([cat, rates]) => (
                <tr key={cat} style={{ borderBottom:'0.5px solid #f0f0f0' }}>
                  <td style={{ padding:'8px 12px', fontWeight:500, color:'#2A3545' }}>{rates.label}</td>
                  <td style={{ padding:'8px 12px', textAlign:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                      <input
                        type="number" step="0.01" min="0" max="10"
                        value={rates.upfront}
                        onChange={e => setRate(cat, 'upfront', e.target.value)}
                        style={{ ...inp, width:70, textAlign:'center' }}
                      />
                      <span style={{ fontSize:11, color:'#7A8090' }}>%</span>
                    </div>
                  </td>
                  <td style={{ padding:'8px 12px', textAlign:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                      <input
                        type="number" step="0.01" min="0" max="5"
                        value={rates.trail}
                        onChange={e => setRate(cat, 'trail', e.target.value)}
                        style={{ ...inp, width:70, textAlign:'center' }}
                      />
                      <span style={{ fontSize:11, color:'#7A8090' }}>%</span>
                    </div>
                  </td>
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#22c55e', fontWeight:500 }}>
                    ${Math.round(500000 * rates.upfront / 100).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:12, padding:'10px 12px', background:'#fdf0f6', borderRadius:7, fontSize:11, color:'#9b2c6e', lineHeight:1.5 }}>
            💡 Changes apply immediately to all forecast calculations in the CRM pipeline. Historical commission imports use the rates recorded at time of settlement.
          </div>
        </Card>

        {/* Business settings */}
        <Card style={{ marginBottom:16 }}>
          <CardTitle>Business details</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Broker name</div>
              <input style={inp} value={settings.brokerName} onChange={e => setField('brokerName', e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Broker email</div>
              <input style={inp} type="email" value={settings.brokerEmail} onChange={e => setField('brokerEmail', e.target.value)} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Business name</div>
              <input style={inp} value={settings.businessName} onChange={e => setField('businessName', e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Future settings placeholder */}
        <Card style={{ opacity:0.6 }}>
          <CardTitle>Coming soon</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {['Lender integrations','Mercury API sync','Notification preferences','Email template settings','User management','Data export'].map(s => (
              <div key={s} style={{ padding:'10px 12px', background:'#f8f9fa', borderRadius:7, fontSize:11, color:'#9ca3af', display:'flex', alignItems:'center', gap:6 }}>
                <span>🔒</span> {s}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
