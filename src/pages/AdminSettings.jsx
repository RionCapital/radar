import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings, syncSettingsFromSupabase, DEFAULT_SETTINGS, getCurrentUser } from '../lib/settings'
import { icon_crm, icon_radar, icon_marketing, icon_planner, icon_studio } from '../lib/icons'

const inp = { border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', fontFamily:'inherit' }
const Card = ({ children, style }) => <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'16px 18px', ...style }}>{children}</div>
const CardTitle = ({ children }) => <div style={{ fontSize:11, fontWeight:600, color:'#5a6370', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>{children}</div>

const BLANK_USER = { id:'', name:'', email:'', password:'', phone:'', role:'broker', active:true }

// Left-hand menu — mirrors the tool tiles on the Home screen (same order,
// same icons) so Settings feels like one more section of the app rather
// than a bolted-on admin page. "Other" and "General" sit below a divider
// since they aren't tools themselves — General holds settings that apply
// across the whole platform (commission rates, business details, team,
// backups), Other is a catch-all for anything that doesn't fit a specific
// tool yet.
const MENU_TOOLS = [
  { id:'crm',       label:'CRM',            icon: icon_crm },
  { id:'radar',     label:'Rradar',         icon: icon_radar },
  { id:'marketing', label:'Marketing',      icon: icon_marketing },
  { id:'planner',   label:'Planner',        icon: icon_planner },
  { id:'studio',    label:'Project Studio', icon: icon_studio },
]
const MENU_SYSTEM = [
  { id:'other',   label:'Other' },
  { id:'general', label:'General' },
]

// A section with no settings yet still gets its own row in the menu (so the
// structure is visible ahead of time) but shows a simple placeholder instead
// of an empty tab bar.
const PLACEHOLDER_SECTIONS = new Set(['crm', 'radar', 'marketing', 'studio', 'other'])

export default function AdminSettings({ clients, onUpdateClients }) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const isAdmin = currentUser?.role === 'admin'
  const [settings, setSettings] = useState(() => loadSettings())
  const [bulkBrokerId, setBulkBrokerId] = useState('')
  const [bulkDone, setBulkDone] = useState('')

  // syncSettingsFromSupabase() already existed in lib/settings.js but was
  // never actually called anywhere — meaning a cleared cache would silently
  // fall back to DEFAULT_SETTINGS (including the default commission rates
  // and the default login password) until the next manual save overwrote
  // the real settings in Supabase with those defaults.
  useEffect(() => {
    syncSettingsFromSupabase().then(cloud => {
      if (cloud) setSettings(cloud)
    })
  }, [])
  const [saved, setSaved] = useState(false)
  const [section, setSection] = useState('general')
  const [tab, setTab] = useState('commissions')
  const [editUser, setEditUser] = useState(null) // null | user object
  const [newUser, setNewUser] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState(null) // null | 'confirm' | 'success' | 'error'
  const [restoreFile, setRestoreFile]     = useState(null)
  const [backupDone,  setBackupDone]      = useState(false)

  function setRate(category, field, value) {
    setSettings(s => ({ ...s, commissionRates: { ...s.commissionRates, [category]: { ...s.commissionRates[category], [field]: parseFloat(value)||0 } } }))
  }
  function setField(key, value) { setSettings(s => ({ ...s, [key]: value })) }
  function setCompanyField(key, value) { setSettings(s => ({ ...s, companyDetails: { ...(s.companyDetails||{}), [key]: value } })) }

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

  // Bulk broker assignment — lets an admin appoint a broker to the whole
  // back book at once (e.g. when a new broker joins), or just to clients
  // nobody's claimed yet, rather than having to open every client
  // individually. Client Dashboard still has the per-client picker for
  // one-off reassignments later.
  const unassignedClients = (clients || []).filter(c => !c.brokerId)
  function bulkAssignBroker(onlyUnassigned) {
    if (!bulkBrokerId) { alert('Select a broker first.'); return }
    if (!onUpdateClients || !clients) return
    const broker = (settings.users || []).find(u => u.id === bulkBrokerId)
    if (!broker) return
    const targetCount = onlyUnassigned ? unassignedClients.length : clients.length
    if (targetCount === 0) { alert(onlyUnassigned ? 'Every client already has a broker assigned.' : 'No clients to assign.'); return }
    if (!onlyUnassigned && !window.confirm(`Assign ${broker.name} to ALL ${clients.length} clients? This overwrites any existing broker assignments.`)) return
    onUpdateClients(prev => prev.map(c => (onlyUnassigned ? !c.brokerId : true) ? { ...c, brokerId: bulkBrokerId } : c))
    setBulkDone(`${broker.name} assigned to ${targetCount} client${targetCount!==1?'s':''}.`)
    setTimeout(() => setBulkDone(''), 4000)
  }

  // Which top tabs show depends on which menu section is selected. General
  // carries everything that used to be the whole page (Commission Rates,
  // Business Details, Team Members, Data Management); Planner keeps just
  // its Targets tab; every other section is a placeholder until it has its
  // own settings to show.
  const TABS_BY_SECTION = {
    general: [
      { id:'commissions', label:'Commission Rates' },
      { id:'business', label:'Business Details' },
      ...(isAdmin ? [{ id:'team', label:'Team Members' }] : []),
      { id:'data', label:'Data Management' },
    ],
    planner: [
      { id:'plannerTargets', label:'Planner Targets' },
    ],
  }
  const TABS = TABS_BY_SECTION[section] || []

  // Switching sections should land on that section's first tab rather than
  // keeping whatever tab id happened to be selected before (which usually
  // won't exist in the new section).
  function selectSection(id) {
    setSection(id)
    const firstTab = (TABS_BY_SECTION[id] || [])[0]
    setTab(firstTab ? firstTab.id : null)
  }

  // ── Data backup / restore ──────────────────────────────────────────────────
  const BACKUP_KEYS = [
    'rion-radar-clients-v12',
    'rion-crm-deals',
    'rion-marketing-referrers',
    'rion-marketing-clients',
    'rion-marketing-lenders',
    'rion-marketing-others',
    'rion-radar-ticked',
    'rion-comm-seed-version',
    'rion-marketing-referrers-version',
    'rion-settings',
  ]

  function exportBackup() {
    const backup = { version: '1', exportedAt: new Date().toISOString(), data: {} }
    BACKUP_KEYS.forEach(k => {
      const v = localStorage.getItem(k)
      if (v) backup.data[k] = v
    })
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date().toLocaleDateString('en-AU', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,'-')
    a.href = url
    a.download = `rradar-backup-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBackupDone(true)
    setTimeout(() => setBackupDone(false), 3000)
  }

  function handleRestoreFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setRestoreFile(file)
    setRestoreStatus('confirm')
  }

  function confirmRestore() {
    if (!restoreFile) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result)
        if (!backup.data) throw new Error('Invalid backup file')
        Object.entries(backup.data).forEach(([k, v]) => localStorage.setItem(k, v))
        setRestoreStatus('success')
        setTimeout(() => { setRestoreStatus(null); window.location.reload() }, 2000)
      } catch {
        setRestoreStatus('error')
        setTimeout(() => setRestoreStatus(null), 3000)
      }
    }
    reader.readAsText(restoreFile)
  }

  const sectionLabel = [...MENU_TOOLS, ...MENU_SYSTEM].find(m => m.id === section)?.label || ''

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'#3D5570', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <img src="/rion_logo_notag.png" alt="Rion Capital" style={{ height:38, width:'auto', mixBlendMode:'lighten', cursor:'pointer' }} onClick={() => navigate('/')}/>
          <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.9)', letterSpacing:'0.02em' }}>Settings</span>
        </div>
        <button onClick={() => navigate('/')} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'5px 12px', color:'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer' }}>⌂ Home</button>
      </div>

      <div style={{ display:'flex', flex:1, minHeight:0 }}>
        {/* Left-hand menu */}
        <div style={{ width:212, flexShrink:0, background:'#fff', borderRight:'0.5px solid #e8eaed', padding:'20px 12px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#9aa3b2', textTransform:'uppercase', letterSpacing:'0.08em', padding:'0 10px', marginBottom:6 }}>Tools</div>
          {MENU_TOOLS.map(m => (
            <MenuItem key={m.id} item={m} active={section===m.id} onClick={() => selectSection(m.id)} />
          ))}
          <div style={{ height:1, background:'#e8eaed', margin:'14px 8px' }} />
          <div style={{ fontSize:10, fontWeight:600, color:'#9aa3b2', textTransform:'uppercase', letterSpacing:'0.08em', padding:'0 10px', marginBottom:6 }}>System</div>
          {MENU_SYSTEM.map(m => (
            <MenuItem key={m.id} item={m} active={section===m.id} onClick={() => selectSection(m.id)} />
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex:1, minWidth:0, overflowY:'auto', padding:'20px 32px 40px' }}>
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

          {/* Tabs — only sections with settings have any */}
          {TABS.length > 0 && (
            <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'1px solid #e8eaed' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'8px 16px', fontSize:12, fontWeight:tab===t.id?700:400, color:tab===t.id?'#3D4F6B':'#7A8090', background:'none', border:'none', borderBottom:tab===t.id?'2px solid #EB99C2':'2px solid transparent', cursor:'pointer', marginBottom:-1 }}>{t.label}</button>
              ))}
            </div>
          )}

          {PLACEHOLDER_SECTIONS.has(section) && (
            <SectionPlaceholder label={sectionLabel} />
          )}

          {/* Commission Rates */}
          {section==='general' && tab==='commissions' && (
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
          {section==='general' && tab==='business' && (
            <>
            <Card style={{ marginBottom:16 }}>
              <CardTitle>Company details</CardTitle>
              <div style={{ fontSize:11, color:'#7A8090', marginBottom:12 }}>Feeds generated documents — tax invoices for Direct Income, and anywhere else the company's own identity needs to appear. Write over any of this at any time; it won't change invoices from months that have already been closed off.</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Full company name</div>
                  <input style={inp} value={settings.companyDetails?.fullCompanyName||''} onChange={e => setCompanyField('fullCompanyName', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Trading name</div>
                  <input style={inp} value={settings.companyDetails?.tradingName||''} onChange={e => setCompanyField('tradingName', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>ABN</div>
                  <input style={inp} value={settings.companyDetails?.abn||''} onChange={e => setCompanyField('abn', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>ACN</div>
                  <input style={inp} value={settings.companyDetails?.acn||''} onChange={e => setCompanyField('acn', e.target.value)} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Address</div>
                  <input style={inp} value={settings.companyDetails?.address||''} onChange={e => setCompanyField('address', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Phone number</div>
                  <input style={inp} value={settings.companyDetails?.phone||''} onChange={e => setCompanyField('phone', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>General email</div>
                  <input style={inp} type="email" value={settings.companyDetails?.email||''} onChange={e => setCompanyField('email', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Bank name</div>
                  <input style={inp} value={settings.companyDetails?.bankName||''} onChange={e => setCompanyField('bankName', e.target.value)} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>BSB</div>
                    <input style={inp} value={settings.companyDetails?.bsb||''} onChange={e => setCompanyField('bsb', e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Account number</div>
                    <input style={inp} value={settings.companyDetails?.accountNumber||''} onChange={e => setCompanyField('accountNumber', e.target.value)} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Starting invoice number</div>
                  <input style={inp} type="number" value={settings.companyDetails?.startingInvoiceNumber ?? 1150} onChange={e => setCompanyField('startingInvoiceNumber', Number(e.target.value))} />
                </div>
              </div>
              <div style={{ marginTop:12, padding:'10px 12px', background:'#fef9c3', borderRadius:7, fontSize:11, color:'#78350f' }}>
                💡 Starting invoice number only applies the first time an invoice is generated — changing it afterward won't renumber invoices already created. Once a month is closed off in Direct Income, its invoices are locked and won't change even if these details are edited later.
              </div>
            </Card>

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
            </>
          )}

          {/* Planner Targets */}
          {section==='planner' && tab==='plannerTargets' && (
            <Card style={{ marginBottom:16 }}>
              <CardTitle>Default weekly targets — Planner</CardTitle>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Lodgements target (no. of loans)</div>
                  <input style={inp} type="number" value={settings.plannerTargets?.lodgementCount ?? 4}
                    onChange={e => setSettings(s => ({ ...s, plannerTargets: { ...s.plannerTargets, lodgementCount: Number(e.target.value) } }))} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Settlements target (no. of loans)</div>
                  <input style={inp} type="number" value={settings.plannerTargets?.settlementCount ?? 3}
                    onChange={e => setSettings(s => ({ ...s, plannerTargets: { ...s.plannerTargets, settlementCount: Number(e.target.value) } }))} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:500, color:'#7A8090', marginBottom:4 }}>Settlements target ($)</div>
                  <input style={inp} type="number" value={settings.plannerTargets?.settlementDollar ?? 1000000}
                    onChange={e => setSettings(s => ({ ...s, plannerTargets: { ...s.plannerTargets, settlementDollar: Number(e.target.value) } }))} />
                </div>
              </div>
              <div style={{ marginTop:12, padding:'10px 12px', background:'#fef9c3', borderRadius:7, fontSize:11, color:'#78350f' }}>
                💡 These are the defaults applied to every new week in the Planner. Any individual week can still be overridden on the This Week tab — changing these here only affects weeks that haven't started yet.
              </div>
            </Card>
          )}

          {/* Team Members — admin only */}
          {section==='general' && tab==='team' && isAdmin && (
            <>
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

            <Card style={{ marginTop:16 }}>
              <CardTitle>Client broker assignments</CardTitle>
              <div style={{ fontSize:11, color:'#7A8090', marginBottom:12, lineHeight:1.5 }}>
                Every email sent from a client's page (Annual Review, fixed/IO expiry alerts, maturity notices, property review outcomes) uses the broker assigned to that client — falling back to the default broker above until one's assigned. Assign here in bulk, or per-client from that client's dashboard.
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <select style={{ ...inp, width:220 }} value={bulkBrokerId} onChange={e => setBulkBrokerId(e.target.value)}>
                  <option value="">Select a broker...</option>
                  {(settings.users||[]).filter(u => u.active!==false).map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.role==='admin' ? ' (Admin)' : ''}</option>
                  ))}
                </select>
                <button onClick={() => bulkAssignBroker(true)}
                  style={{ fontSize:12, padding:'7px 14px', borderRadius:7, border:`1px solid #3D4F6B`, background:'#fff', color:'#3D4F6B', fontWeight:600, cursor:'pointer' }}>
                  Assign to unassigned clients ({unassignedClients.length})
                </button>
                <button onClick={() => bulkAssignBroker(false)}
                  style={{ fontSize:12, padding:'7px 14px', borderRadius:7, border:'none', background:'#3D4F6B', color:'#fff', fontWeight:600, cursor:'pointer' }}>
                  Assign to ALL clients ({(clients||[]).length})
                </button>
                {bulkDone && <span style={{ fontSize:11, color:'#22c55e', fontWeight:600 }}>✓ {bulkDone}</span>}
              </div>
            </Card>
            </>
          )}

          {/* ── Data Management ── */}
          {section==='general' && tab==='data' && (
            <Card>
              <div style={{ fontSize:13, fontWeight:700, color:'#3D4F6B', marginBottom:4 }}>Data Management</div>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:16, lineHeight:1.6 }}>
                Export a full backup of all Rradar data (clients, CRM deals, referrers, commission history, settings).
                Store the file somewhere safe — Google Drive, email to yourself, USB. Restore it any time to recover your data.
              </div>

              <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                {/* Export */}
                <button onClick={exportBackup}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px',
                    borderRadius:8, border:'none', background:'#3D4F6B', color:'#fff',
                    fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Montserrat,sans-serif' }}>
                  ⬇ Export Backup
                </button>
                {backupDone && (
                  <span style={{ fontSize:12, color:'#27ae60', fontWeight:600, fontFamily:'Montserrat,sans-serif' }}>
                    ✓ Backup downloaded!
                  </span>
                )}

                {/* Restore */}
                <label style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px',
                  borderRadius:8, border:'1px solid #e2e8f0', background:'#fff',
                  fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Montserrat,sans-serif', color:'#3D4F6B' }}>
                  ⬆ Restore from Backup
                  <input type="file" accept=".json" onChange={handleRestoreFile}
                    style={{ display:'none' }} />
                </label>
              </div>

              {/* Confirm restore */}
              {restoreStatus === 'confirm' && (
                <div style={{ marginTop:14, padding:'14px 16px', background:'#FEF3C7',
                  borderRadius:8, border:'1px solid #F59E0B' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:6 }}>
                    ⚠ Restore will overwrite all current data
                  </div>
                  <div style={{ fontSize:12, color:'#78350F', marginBottom:12 }}>
                    File: <strong>{restoreFile?.name}</strong><br/>
                    This will replace all clients, deals, referrers, and settings with the backup. The page will reload.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={confirmRestore}
                      style={{ padding:'8px 16px', borderRadius:7, border:'none',
                        background:'#D97706', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      Yes, restore now
                    </button>
                    <button onClick={() => { setRestoreStatus(null); setRestoreFile(null) }}
                      style={{ padding:'8px 16px', borderRadius:7, border:'1px solid #e2e8f0',
                        background:'#fff', fontSize:12, cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {restoreStatus === 'success' && (
                <div style={{ marginTop:14, padding:'12px 16px', background:'#DCFCE7',
                  borderRadius:8, border:'1px solid #86EFAC', fontSize:13, color:'#166534', fontWeight:600 }}>
                  ✓ Data restored successfully — reloading…
                </div>
              )}

              {restoreStatus === 'error' && (
                <div style={{ marginTop:14, padding:'12px 16px', background:'#FEE2E2',
                  borderRadius:8, border:'1px solid #FECACA', fontSize:13, color:'#991B1B', fontWeight:600 }}>
                  ✗ Invalid backup file — please check the file and try again.
                </div>
              )}

              <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #f1f5f9',
                fontSize:11, color:'#94a3b8', fontFamily:'Montserrat,sans-serif' }}>
                💡 Tip: Export a backup before every major update, and store it in Google Drive or email it to yourself.
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}

function MenuItem({ item, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
      padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer',
      background: active ? '#fdf0f6' : 'transparent',
      color: active ? '#DA408D' : '#2A3545',
      fontSize:12.5, fontWeight: active ? 700 : 500,
    }}>
      {item.icon
        ? <img src={item.icon} alt="" style={{ width:18, height:18, objectFit:'contain', filter: active ? 'none' : 'grayscale(0.4) opacity(0.8)' }} />
        : <span style={{ width:18, height:18, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, opacity: active ? 1 : 0.6 }}>
            {item.id === 'general' ? '⚙' : '•'}
          </span>
      }
      <span>{item.label}</span>
    </button>
  )
}

function SectionPlaceholder({ label }) {
  return (
    <div style={{ background:'#fff', borderRadius:8, border:'0.5px dashed #d8dde3', padding:'56px 24px', textAlign:'center' }}>
      <div style={{ fontSize:28, marginBottom:12, opacity:0.6 }}>🛠️</div>
      <div style={{ fontSize:13.5, fontWeight:700, color:'#3D4F6B', marginBottom:6 }}>No settings here yet</div>
      <div style={{ fontSize:11.5, color:'#7A8090' }}>{label} settings will appear here once they're added.</div>
    </div>
  )
}
