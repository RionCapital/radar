import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sbLoadMarketing } from '../lib/supabase'

const NAVY  = '#3D4F6B'
const PINK  = '#EB99C2'
const SLATE = '#7A8090'

const TIER_COLOURS = {
  gold:       '#D4A017',
  silver:     '#9CA3AF',
  bronze:     '#CD7F32',
  contenders: '#EB99C2',
}
const TIER_LABELS = { gold:'Gold', silver:'Silver', bronze:'Bronze', contenders:'Contenders' }

function loadReferrers() {
  try {
    const s = localStorage.getItem('rion-marketing-referrers')
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function TierDot({ tier }) {
  const col = TIER_COLOURS[tier] || SLATE
  return (
    <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
      background:col, flexShrink:0, marginRight:4 }} />
  )
}

// ─── Compact pill showing an attached referrer ────────────────────────────────
function ReferrerPill({ name, tier, onRemove }) {
  const col = TIER_COLOURS[tier] || SLATE

  function handleNavigate(e) {
    // Only navigate if not clicking the remove button
    if (e.target.closest('button')) return
    // Store referrer name to highlight on Marketing page, then navigate
    sessionStorage.setItem('rion-marketing-open-referrer', name)
    // Use window.location to avoid needing useNavigate inside this component
    window.location.href = '/marketing?section=referrers&open=' + encodeURIComponent(name)
  }

  return (
    <div onClick={handleNavigate}
      style={{ display:'inline-flex', alignItems:'center', gap:5,
        padding:'3px 10px 3px 8px', borderRadius:20,
        background:col+'18', border:`1px solid ${col}44`,
        fontFamily:'Montserrat,sans-serif', fontSize:12,
        cursor:'pointer', transition:'opacity 0.15s' }}
      title={`Open ${name} in Marketing`}
      onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity='1'}>
      <TierDot tier={tier} />
      <span style={{ color:NAVY, fontWeight:600 }}>{name}</span>
      {tier && <span style={{ color:col, fontSize:10, fontWeight:700 }}>{TIER_LABELS[tier]}</span>}
      <span style={{ color:SLATE, fontSize:10, marginLeft:2 }}>↗</span>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }}
          style={{ border:'none', background:'none', cursor:'pointer',
            color:'#CBD5E1', fontSize:13, lineHeight:1, padding:'0 0 0 2px',
            display:'flex', alignItems:'center' }}>
          ×
        </button>
      )}
    </div>
  )
}

// ─── Main picker component ────────────────────────────────────────────────────
// Props:
//   attached      — array of { name, tier } objects currently attached
//   onAttach(r)   — callback when a referrer is selected
//   onDetach(name)— callback when a referrer is removed
//   compact       — if true, shows as a small inline widget (for DealPage)
//   label         — section heading text
export default function ReferrerPicker({ attached = [], onAttach, onDetach, compact = false, label = 'Referral Partner' }) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const [referrers, setReferrers] = useState(() => loadReferrers())
  const [loadingCloud, setLoadingCloud] = useState(false)

  // Whenever the picker is opened, refresh from whatever's in localStorage right now
  // (in case Marketing page updated it), AND — this is the actual fix — if that
  // local cache is empty, fetch straight from Supabase ourselves instead of
  // silently telling the user "no referrers" just because they opened a client
  // page before ever visiting Marketing in this browser session.
  useEffect(() => {
    if (!open) return
    const local = loadReferrers()
    setReferrers(local)
    if (local.length === 0) {
      setLoadingCloud(true)
      sbLoadMarketing().then(cloud => {
        if (cloud?.referrers?.length) {
          try { localStorage.setItem('rion-marketing-referrers', JSON.stringify(cloud.referrers)) } catch {}
          setReferrers(cloud.referrers)
        }
      }).catch(() => {}).finally(() => setLoadingCloud(false))
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return referrers.slice(0, 12)
    const q = search.toLowerCase()
    return referrers.filter(r =>
      (r.name  || '').toLowerCase().includes(q) ||
      (r.company || '').toLowerCase().includes(q) ||
      (r.type  || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [referrers, search])

  const attachedNames = new Set(attached.map(a => a.name))

  function handleSelect(r) {
    if (attachedNames.has(r.name)) return
    onAttach({ name: r.name, tier: r.tier || 'contenders', type: r.type || '', company: r.company || '' })
    setSearch('')
    setOpen(false)
  }

  const containerStyle = compact
    ? { marginTop: 10 }
    : { marginTop: 16, paddingTop: 16, borderTop: '0.5px solid var(--border-light, #e8eaed)' }

  const headStyle = {
    fontSize: compact ? 10 : 11,
    fontWeight: 600,
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: 'Montserrat,sans-serif',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  return (
    <div style={containerStyle}>
      <div style={headStyle}>
        <span>{label}</span>
        <button onClick={() => setOpen(v => !v)}
          style={{ fontSize:10, padding:'2px 8px', borderRadius:6,
            border:`1px solid ${open ? NAVY : '#DDE3EC'}`,
            background: open ? NAVY : '#fff',
            color: open ? '#fff' : NAVY,
            cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>
          {open ? '✕ Close' : '+ Attach'}
        </button>
      </div>

      {/* Attached pills */}
      {attached.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom: open ? 10 : 0 }}>
          {attached.map(a => (
            <ReferrerPill key={a.name} name={a.name} tier={a.tier}
              onRemove={onDetach ? () => onDetach(a.name) : null} />
          ))}
        </div>
      )}

      {attached.length === 0 && !open && (
        <div style={{ fontSize:12, color:'#94a3b8', fontFamily:'Montserrat,sans-serif',
          fontStyle:'italic', marginBottom:4 }}>
          None attached — click Attach to link a referral partner
        </div>
      )}

      {/* Search & select dropdown */}
      {open && (
        <div style={{ border:'1px solid #DDE3EC', borderRadius:10,
          background:'#fff', overflow:'hidden',
          boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid #DDE3EC' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company or type…"
              style={{ width:'100%', padding:'7px 10px', borderRadius:7,
                border:'1px solid #DDE3EC', fontSize:12,
                fontFamily:'Montserrat,sans-serif', outline:'none',
                boxSizing:'border-box' }}
            />
          </div>
          <div style={{ maxHeight:220, overflowY:'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding:'14px', fontSize:12, color:'#94a3b8',
                fontFamily:'Montserrat,sans-serif', textAlign:'center' }}>
                {loadingCloud
                  ? 'Loading referral partners…'
                  : referrers.length === 0
                    ? 'No referrers found — add them in Marketing first'
                    : 'No matches found'}
              </div>
            )}
            {filtered.map((r, i) => {
              const already = attachedNames.has(r.name)
              const tierCol = TIER_COLOURS[r.tier] || SLATE
              return (
                <div key={r.id || i}
                  onClick={() => !already && handleSelect(r)}
                  style={{ display:'flex', alignItems:'center', gap:10,
                    padding:'9px 12px',
                    borderBottom: i < filtered.length-1 ? '1px solid #F0F4FA' : 'none',
                    cursor: already ? 'default' : 'pointer',
                    background: already ? '#F9FAFB' : '#fff',
                    opacity: already ? 0.55 : 1 }}
                  onMouseEnter={e => { if (!already) e.currentTarget.style.background = '#F4F6FA' }}
                  onMouseLeave={e => { if (!already) e.currentTarget.style.background = '#fff' }}>
                  {/* Avatar */}
                  <div style={{ width:30, height:30, borderRadius:'50%',
                    background: tierCol+'22', border:`1px solid ${tierCol}44`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700, color:tierCol, flexShrink:0,
                    fontFamily:'Montserrat,sans-serif' }}>
                    {(r.name||'?').slice(0,1).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:NAVY,
                      fontFamily:'Montserrat,sans-serif',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.name}
                      {already && <span style={{ marginLeft:6, fontSize:10, color:'#94a3b8' }}>already attached</span>}
                    </div>
                    <div style={{ fontSize:11, color:SLATE, fontFamily:'Montserrat,sans-serif' }}>
                      {[r.type, r.company].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {r.tier && (
                    <span style={{ fontSize:10, fontWeight:700, color:tierCol,
                      background:tierCol+'18', padding:'2px 7px', borderRadius:10,
                      fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                      {TIER_LABELS[r.tier] || r.tier}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {referrers.length > 12 && !search && (
            <div style={{ padding:'6px 12px', fontSize:10, color:'#94a3b8',
              fontFamily:'Montserrat,sans-serif', borderTop:'1px solid #F0F4FA',
              textAlign:'center' }}>
              Showing 12 of {referrers.length} — type to search
            </div>
          )}
        </div>
      )}
    </div>
  )
}
