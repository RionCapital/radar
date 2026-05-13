import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { icon_crm, icon_radar, icon_marketing, icon_planner, icon_studio, logo_rion_notag } from '../lib/icons'

const BG = '#3D5570'

const APPS = [
  { name: 'Mercury',     url: 'https://login.connective.com.au/',          domain: 'login.connective.com.au' },
  { name: 'CoreLogic',   url: 'https://propertyhub.corelogic.asia/',       domain: 'propertyhub.corelogic.asia' },
  { name: 'Brokerpedia', url: 'https://brokerpedia.com.au/',                domain: 'brokerpedia.com.au' },
  { name: 'Quickli',     url: 'https://app.quickli.com.au/',                domain: 'app.quickli.com.au' },
  { name: 'ValEX',       url: 'https://valstatus.rpdata.com/',              domain: 'valstatus.rpdata.com' },
  { name: 'ABN Lookup',  url: 'https://abr.business.gov.au/',               domain: 'abr.business.gov.au' },
  { name: 'SFL Lookup',  url: 'https://superfundlookup.gov.au/',            domain: 'superfundlookup.gov.au' },
  { name: 'Equifax',     url: 'https://www.vedacheck.com/',                 domain: 'www.vedacheck.com' },
  { name: 'Tax Calc',    url: 'https://jaws.tips/stuff/taxcalc.html',       domain: 'jaws.tips' },
  { name: 'LinkedIn',    url: 'https://www.linkedin.com/',                  domain: 'linkedin.com' },
  { name: 'Facebook',    url: 'https://www.facebook.com/',                  domain: 'facebook.com' },
  { name: 'Instagram',   url: 'https://www.instagram.com/',                 domain: 'instagram.com' },
  { name: 'YouTube',     url: 'https://www.youtube.com/',                   domain: 'youtube.com' },
]

const TOOLS = [
  { id: 'crm',       label: 'CRM',       icon: icon_crm,       desc: 'Pipeline management',       path: null,               active: false },
  { id: 'radar',     label: 'Rradar',     icon: icon_radar,     desc: 'Relationship Management',   path: '/radar/dashboard', active: true  },
  { id: 'marketing', label: 'Marketing', icon: icon_marketing, desc: 'Client & referral lists',   path: null,               active: false },
  { id: 'planner',   label: 'Planner',   icon: icon_planner,   desc: 'Weekly & monthly organiser',path: null,               active: false },
  { id: 'studio',    label: 'Project Studio', icon: icon_studio,  desc: 'Projects & milestones',     path: '/radar/studio',    active: true  },
]

export default function Home() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const auth = JSON.parse(sessionStorage.getItem('rion-auth') || 'null')

  useEffect(() => {
    if (!auth) { navigate('/login'); return }
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  if (!auth) return null

  return (
    <div style={{ minHeight:'100vh', background:'#ffffff', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <header style={{ background:'#3D5570', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 48px', opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(-10px)', transition:'all 0.5s ease' }}>
        <img src={logo_rion_notag} alt="RION Capital" style={{ height:52, width:'auto', objectFit:'contain', cursor:'pointer' }} onClick={()=>navigate('/')}/>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{fontSize:11,color:'rgba(187,198,218,0.7)'}}>Welcome, {auth.name}</div>
          <button onClick={()=>{sessionStorage.removeItem('rion-auth');navigate('/login')}} style={{fontSize:11,padding:'5px 12px',borderRadius:6,border:'0.5px solid rgba(187,198,218,0.2)',background:'transparent',color:'rgba(187,198,218,0.7)',cursor:'pointer'}}>Sign out</button>
        </div>
      </header>

      <main style={{ flex:1, padding:'40px 48px 32px' }}>
        {/* Tools */}
        <div style={{ opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(20px)', transition:'all 0.6s ease 0.1s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
            <span style={{ fontSize:11, fontWeight:500, color:'#6b7a8d', textTransform:'uppercase', letterSpacing:'0.12em' }}>Tools</span>
            <div style={{ flex:1, height:'0.5px', background:'linear-gradient(to right, #EB99C2, transparent)' }}/>
          </div>
          <div style={{ display:'flex', gap:20, marginBottom:44 }}>
            {TOOLS.map((tool, i) => <ToolCard key={tool.id} tool={tool} index={i} visible={visible} navigate={navigate}/>)}
          </div>
        </div>

        {/* Apps */}
        <div style={{ opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(20px)', transition:'all 0.6s ease 0.3s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
            <span style={{ fontSize:11, fontWeight:500, color:'#6b7a8d', textTransform:'uppercase', letterSpacing:'0.12em' }}>Apps</span>
            <div style={{ flex:1, height:'0.5px', background:'linear-gradient(to right, #EB99C2, transparent)' }}/>
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {APPS.map((app, i) => <AppCard key={app.name} app={app} index={i} visible={visible}/>)}
          </div>
        </div>
      </main>

      <footer style={{ padding:'14px 48px', borderTop:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', opacity:visible?0.5:0, transition:'opacity 0.8s ease 0.5s' }}>
        <span style={{ fontSize:10, color:'var(--text-secondary)', letterSpacing:'0.06em' }}>RION Capital — Internal Platform</span>
        <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>{new Date().getFullYear()}</span>
      </footer>

      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  )
}

function ToolCard({ tool, index, visible, navigate }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onClick={() => tool.active && navigate(tool.path)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width:160, height:175, background:'#3D5570', border: hovered&&tool.active?'1px solid #EB99C2':'1px solid #4a637d', borderRadius:14, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, cursor:tool.active?'pointer':'not-allowed', transition:'all 0.25s ease', transform:hovered&&tool.active?'translateY(-4px)':'translateY(0)', boxShadow:hovered&&tool.active?'0 8px 24px rgba(42,61,84,0.3)':'none', opacity:visible?1:0, animation:visible?`fadeUp 0.5s ease ${0.15+index*0.08}s both`:'none', position:'relative' }}>
      {!tool.active && (
        <div style={{ position:'absolute', top:10, right:10, background:'rgba(61,85,112,0.9)', borderRadius:20, padding:'2px 7px', fontSize:9, color:'rgba(187,198,218,0.45)', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:3, border:'0.5px solid rgba(187,198,218,0.1)' }}>
          <svg width="8" height="9" viewBox="0 0 8 9" fill="none"><rect x="1" y="4" width="6" height="5" rx="1" stroke="rgba(187,198,218,0.4)" strokeWidth="1"/><path d="M2.5 4V3a1.5 1.5 0 013 0v1" stroke="rgba(187,198,218,0.4)" strokeWidth="1"/></svg>
          Soon
        </div>
      )}
      <div style={{ width:68, height:68, filter:tool.active?(hovered?'brightness(1.1)':'brightness(1)'):'brightness(0.3) saturate(0)', transition:'filter 0.25s ease' }}>
        <img src={tool.icon} alt={tool.label} style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
      </div>
      <div style={{ textAlign:'center', width:'100%' }}>
        <div style={{ fontSize:13, fontWeight:500, color:tool.active?(hovered?'#EB99C2':'#fff'):'rgba(187,198,218,0.3)', transition:'color 0.25s ease', letterSpacing:'0.02em' }}>
          {tool.label === 'Rradar'
            ? <><span style={{ color: tool.active ? '#EB99C2' : 'rgba(235,153,194,0.3)', fontWeight:700 }}>R</span><span style={{ color: tool.active?(hovered?'#EB99C2':'#fff'):'rgba(187,198,218,0.3)', fontWeight:300 }}>radar</span></>
            : tool.label}
        </div>
        <div style={{ fontSize:10, marginTop:3, color:tool.active?'rgba(187,198,218,0.6)':'rgba(187,198,218,0.2)', letterSpacing:'0.03em' }}>{tool.desc}</div>
      </div>
    </div>
  )
}

function AppCard({ app, index, visible }) {
  const [hovered, setHovered] = useState(false)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${app.domain}&sz=32`
  return (
    <a href={app.url} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, width:80, height:80, background:'#3D5570', border:hovered?'1px solid #DA408D':'1px solid rgba(187,198,218,0.2)', borderRadius:12, textDecoration:'none', transition:'all 0.2s ease', transform:hovered?'translateY(-3px)':'translateY(0)', boxShadow:hovered?'0 8px 20px rgba(42,61,84,0.4)':'none', opacity:visible?1:0, animation:visible?`fadeUp 0.5s ease ${0.3+index*0.05}s both`:'none', cursor:'pointer' }}>
      <img src={faviconUrl} alt={app.name} width={28} height={28} style={{ borderRadius:6, objectFit:'contain' }}
        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
      <div style={{ display:'none', width:28, height:28, borderRadius:6, background:'rgba(235,153,194,0.2)', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#EB99C2' }}>
        {app.name[0]}
      </div>
      <span style={{ fontSize:9, fontWeight:500, color:hovered?'#EB99C2':'rgba(187,198,218,0.75)', textAlign:'center', lineHeight:1.2, letterSpacing:'0.02em', maxWidth:70 }}>{app.name}</span>
    </a>
  )
}
