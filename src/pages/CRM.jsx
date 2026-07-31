import React, { useState, useMemo, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { loadDeals, saveDeals as libSaveDeals, syncDealsFromSupabase } from '../lib/deals'
import { loadSettings, calcUpfront, dealUpfrontCommission } from '../lib/settings'
import { fmt } from '../lib/data'
import CRMTopbar, { getBusinessDaysLeft, MONTH_NAMES } from '../components/CRMTopbar'
import NewOpportunityModal from '../components/NewOpportunityModal'
import { SettleModal, applySettlement } from '../components/SettleModal'

const STAGES = ['1. Discovery','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional','7. Settled','8. Withdrawn']
const FORECAST_STAGES = STAGES
const ACTIVE_STAGES = ['1. Discovery','2. Strategy','3. Pre-Lodged','4. Lodged','5. Conditional','6. Unconditional']

// Forecast groupings per spec: 1-3 = Pre-lodged, 4-6 = Lodged, 7 = Settled standalone
const DIVIDERS_AFTER = ['3. Pre-Lodged', '6. Unconditional']

const STAGE_COLORS = {
  '1. Discovery':          { bg:'#fee2e2', color:'#b91c1c', dot:'#ef4444' },
  '2. Strategy':      { bg:'#fee2e2', color:'#b91c1c', dot:'#ef4444' },
  '3. Pre-Lodged':    { bg:'#fee2e2', color:'#b91c1c', dot:'#ef4444' },
  '4. Lodged':        { bg:'#dbeafe', color:'#1d4ed8', dot:'#3b82f6' },
  '5. Conditional':   { bg:'#dbeafe', color:'#1d4ed8', dot:'#3b82f6' },
  '6. Unconditional': { bg:'#dbeafe', color:'#1d4ed8', dot:'#3b82f6' },
  '7. Settled':       { bg:'#dcfce7', color:'#15803d', dot:'#22c55e' },
  '8. Withdrawn':     { bg:'#f3f4f6', color:'#4b5563', dot:'#9ca3af' },
}

// Forecast uses the same colour scheme
const FORECAST_STAGE_COLORS = STAGE_COLORS

const BAND_COLORS = {
  past:    { row:'#fafafa',  header:'#e8e8e8', text:'#5a6370',  label:'Past' },
  current: { row:'#f0fdf4',  header:'#bbf7d0', text:'#166534',  label:'Current month' },
  month1:  { row:'#fff7ed',  header:'#fed7aa', text:'#9a3412',  label:'Month 1' },
  month2:  { row:'#eff6ff',  header:'#bfdbfe', text:'#1e40af',  label:'Month 2' },
  month3:  { row:'#f0f9ff',  header:'#bae6fd', text:'#0c4a6e',  label:'Month 3' },
  future:  { row:'#fafafa',  header:'#e5e7eb', text:'#374151',  label:'Future' },
}

function getMonthBand(monthStr) {
  if (!monthStr) return 'future'
  const today = new Date()
  const cur = new Date(today.getFullYear(), today.getMonth(), 1)
  const m = new Date(monthStr+'-01')
  const diff = (m.getFullYear()-cur.getFullYear())*12+(m.getMonth()-cur.getMonth())
  if (diff < 0) return 'past'
  if (diff === 0) return 'current'
  if (diff === 1) return 'month1'
  if (diff === 2) return 'month2'
  if (diff === 3) return 'month3'
  return 'future'
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(str) {
  if (!str) return '—'
  const [y,m] = str.split('-')
  return `${MONTHS_SHORT[parseInt(m)-1]}-${y.slice(2)}`
}
function fmtDateShort(str) {
  if (!str) return '—'
  const d = new Date(str)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2,'0')}-${MONTHS_SHORT[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}
function daysToDate(str) {
  if (!str) return null
  const target = new Date(str); target.setHours(0,0,0,0)
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((target - today) / 86400000)
}
// Inline stage dropdown
function StageDropdown({ deal, onChangeStage }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const portalRef = useRef(null)
  const sc = STAGE_COLORS[deal.Status] || STAGE_COLORS['1. Discovery']

  useEffect(() => {
    if (!open) return
    function handler(e) {
      // Must check both the trigger ref AND the portal node —
      // the portal is in document.body so ref.current.contains() misses it
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inPortal  = portalRef.current && portalRef.current.contains(e.target)
      if (!inTrigger && !inPortal) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen(e) {
    e.stopPropagation()
    if (!open) {
      const rect = ref.current.getBoundingClientRect()
      // flip upward if not enough space below
      const spaceBelow = window.innerHeight - rect.bottom
      const dropH = STAGES.length * 33
      const top = spaceBelow < dropH ? rect.top - dropH - 4 : rect.bottom + 4
      setPos({ top, left: rect.left })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <span onClick={handleOpen}
        style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:sc.bg, color:sc.color, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', userSelect:'none' }}>
        {deal.Status} ▾
      </span>
      {open && ReactDOM.createPortal(
        <div ref={portalRef} style={{ position:'fixed', top:pos.top, left:pos.left, background:'#fff', borderRadius:8, border:'1px solid #e8eaed', boxShadow:'0 4px 24px rgba(0,0,0,0.15)', zIndex:9999, minWidth:170, overflow:'hidden' }}>
          {STAGES.map(s => {
            const ssc = STAGE_COLORS[s]
            return (
              <div key={s} onClick={e => { e.stopPropagation(); onChangeStage(deal, s); setOpen(false) }}
                style={{ padding:'7px 12px', fontSize:11, cursor:'pointer', background: s === deal.Status ? '#fdf0f6' : '#fff', color:'#2A3545', display:'flex', alignItems:'center', gap:6 }}
                onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                onMouseOut={e=>e.currentTarget.style.background=s===deal.Status?'#fdf0f6':'#fff'}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:ssc.dot,flexShrink:0 }}/>
                {s}
                {s === deal.Status && <span style={{ marginLeft:'auto', color:'#EB99C2', fontSize:12 }}>✓</span>}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

// Month filter dropdown (Excel-style)
function MonthFilterDropdown({ allMonths, visibleMonths, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const allSelected = allMonths.every(m => visibleMonths.includes(m))

  function toggle(m) {
    if (visibleMonths.includes(m)) {
      if (visibleMonths.length > 1) onChange(visibleMonths.filter(v => v !== m))
    } else {
      onChange([...visibleMonths, m].sort().reverse())
    }
  }

  function toggleAll() {
    onChange(allSelected ? [visibleMonths[0]] : [...allMonths])
  }

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e8eaed', background:'#fff', fontSize:11, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
        Settlement month ▾
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'100%', marginTop:4, background:'#fff', borderRadius:8, border:'1px solid #e8eaed', boxShadow:'0 4px 20px rgba(0,0,0,0.14)', zIndex:999, minWidth:200, maxHeight:320, overflowY:'auto' }}>
          <div style={{ padding:'8px 12px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#2A3545' }}>Filter months</span>
            <button onClick={toggleAll} style={{ fontSize:10, color:'#EB99C2', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {allMonths.map(m => {
            const band = getMonthBand(m)
            const bc = BAND_COLORS[band]
            const checked = visibleMonths.includes(m)
            return (
              <div key={m} onClick={() => toggle(m)}
                style={{ padding:'6px 12px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', background:checked?'#fdf0f6':'#fff' }}
                onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                onMouseOut={e=>e.currentTarget.style.background=checked?'#fdf0f6':'#fff'}>
                <input type="checkbox" checked={checked} onChange={() => toggle(m)} style={{ accentColor:'#EB99C2', cursor:'pointer' }} onClick={e=>e.stopPropagation()}/>
                <span style={{ fontSize:11, color:bc.text, fontWeight:500 }}>{fmtMonth(m)}</span>
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8, background:bc.header, color:bc.text, marginLeft:'auto' }}>{bc.label}</span>
              </div>
            )
          })}
          <div style={{ padding:'8px 12px', borderTop:'1px solid #f0f0f0', display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => setOpen(false)} style={{ padding:'4px 12px', borderRadius:6, border:'none', background:'#EB99C2', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:600 }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ForecastPanel({ deals, settings }) {
  const today = new Date()
  const cur = new Date(today.getFullYear(), today.getMonth(), 1)
  const months = [0,1,2,3].map(i => {
    const d = new Date(cur.getFullYear(), cur.getMonth()+i, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const bands = ['current','month1','month2','month3']

  const stageRows = FORECAST_STAGES.map(stage => {
    const totals = months.map(m => deals.filter(d => d.Status===stage && d['Month of Settlement']?.startsWith(m)).reduce((s,d)=>s+(d.Amount||0),0))
    const beyond = deals.filter(d => d.Status===stage && d['Month of Settlement'] && !months.some(m=>d['Month of Settlement'].startsWith(m))).reduce((s,d)=>s+(d.Amount||0),0)
    return { stage, totals, beyond }
  })

  const colTotals = months.map((_,i) => stageRows.filter(r=>!['7. Settled','8. Withdrawn'].includes(r.stage)).reduce((s,r)=>s+r.totals[i],0))
  const beyondTotal = stageRows.filter(r=>!['7. Settled','8. Withdrawn'].includes(r.stage)).reduce((s,r)=>s+r.beyond,0)
  function calcColUpfront(colIdx) {
    return stageRows.filter(r=>!['7. Settled','8. Withdrawn'].includes(r.stage)).reduce((sum, r) => {
      const colDeals = deals.filter(d => d.Status===r.stage && d['Month of Settlement']?.startsWith(months[colIdx]))
      return sum + colDeals.reduce((s,d) => s + dealUpfrontCommission(d), 0)
    }, 0)
  }
  function calcBeyondUpfront() {
    return stageRows.filter(r=>!['7. Settled','8. Withdrawn'].includes(r.stage)).reduce((sum, r) => {
      const bDeals = deals.filter(d => d.Status===r.stage && d['Month of Settlement'] && !months.some(m=>d['Month of Settlement'].startsWith(m)))
      return sum + bDeals.reduce((s,d) => s + dealUpfrontCommission(d), 0)
    }, 0)
  }
  // Actual/Settled Upfront — the real counterpart to Potential upfront
  // above: same commission calculation (category rate, or a deal's
  // negotiated override if set), but for deals that have actually settled
  // in that month rather than ones still moving through the pipeline.
  function calcColActual(colIdx) {
    const settled = deals.filter(d => d.Status==='7. Settled' && d['Month of Settlement']?.startsWith(months[colIdx]))
    return settled.reduce((s,d) => s + dealUpfrontCommission(d), 0)
  }
  function calcBeyondActual() {
    const settled = deals.filter(d => d.Status==='7. Settled' && d['Month of Settlement'] && !months.some(m=>d['Month of Settlement'].startsWith(m)))
    return settled.reduce((s,d) => s + dealUpfrontCommission(d), 0)
  }
  const beyondActual = calcBeyondActual()

  const thStyle = (band) => ({ padding:'6px 12px', fontSize:10, fontWeight:600, background:BAND_COLORS[band].header, color:BAND_COLORS[band].text, textAlign:'right', whiteSpace:'nowrap' })

  return (
    <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', overflow:'hidden', marginBottom:10 }}>
      <div style={{ padding:'7px 14px', borderBottom:'0.5px solid #e8eaed', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:10, fontWeight:600, color:'#5a6370', textTransform:'uppercase', letterSpacing:'0.06em' }}>Forecast — pipeline by stage</div>
        <div style={{ fontSize:10, color:'#7A8090' }}>Upfront est. incl. negotiated rates</div>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, tableLayout:'fixed' }}>
        <colgroup>
          <col style={{ width:'22%' }}/><col style={{ width:'15.6%' }}/><col style={{ width:'15.6%' }}/><col style={{ width:'15.6%' }}/><col style={{ width:'15.6%' }}/><col style={{ width:'15.6%' }}/>
        </colgroup>
        <thead>
          <tr>
            <th style={{ padding:'6px 12px', fontSize:10, fontWeight:600, color:'#5a6370', textAlign:'left', background:'#f8f9fa' }}>Stage</th>
            {months.map((m,i) => <th key={m} style={thStyle(bands[i])}>{fmtMonth(m)}</th>)}
            <th style={{ padding:'6px 12px', fontSize:10, fontWeight:600, color:'#5a6370', textAlign:'right', background:'#f8f9fa' }}>&gt; 3 Months</th>
          </tr>
        </thead>
        <tbody>
          {stageRows.map(({ stage, totals, beyond }) => {
            const sc = FORECAST_STAGE_COLORS[stage] || FORECAST_STAGE_COLORS['8. Withdrawn']
            const addDivider = DIVIDERS_AFTER.includes(stage)
            return (
              <React.Fragment key={stage}>
                <tr style={{ borderTop:'0.5px solid #f0f0f0' }}>
                  <td style={{ padding:'5px 12px' }}>
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:sc.bg, color:sc.color, fontWeight:500 }}>{stage}</span>
                  </td>
                  {totals.map((t,i) => (
                    <td key={i} style={{ padding:'5px 12px', textAlign:'right', color:t>0?'#1a2535':'#c0c8d4', fontWeight:t>0?500:400, background:BAND_COLORS[bands[i]].row }}>
                      {t>0?fmt(t):'—'}
                    </td>
                  ))}
                  <td style={{ padding:'5px 12px', textAlign:'right', color:beyond>0?'#1a2535':'#c0c8d4' }}>{beyond>0?fmt(beyond):'—'}</td>
                </tr>
                {addDivider && <tr><td colSpan={6} style={{ padding:0, background:'#d1d5db', height:1 }}/></tr>}
              </React.Fragment>
            )
          })}
          <tr style={{ borderTop:'1.5px solid #e8eaed', background:'#f8f9fa' }}>
            <td style={{ padding:'6px 12px', fontSize:10, fontWeight:700, color:'#1a2535' }}>Total pipeline</td>
            {colTotals.map((t,i) => (
              <td key={i} style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'#1a2535', background:BAND_COLORS[bands[i]].header }}>
                {t>0?fmt(t):'—'}
              </td>
            ))}
            <td style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'#1a2535' }}>{beyondTotal>0?fmt(beyondTotal):'—'}</td>
          </tr>
          <tr style={{ background:'#f8f9fa' }}>
            <td style={{ padding:'4px 12px', fontSize:10, color:'#7A8090' }}>Potential upfront</td>
            {months.map((_,i) => (
              <td key={i} style={{ padding:'4px 12px', textAlign:'right', fontSize:10, color:'#EB99C2', fontWeight:500, background:BAND_COLORS[bands[i]].row }}>
                {colTotals[i]>0?'$'+calcColUpfront(i).toLocaleString():'—'}
              </td>
            ))}
            <td style={{ padding:'4px 12px', textAlign:'right', fontSize:10, color:'#EB99C2', fontWeight:500 }}>
              {beyondTotal>0?'$'+calcBeyondUpfront().toLocaleString():'—'}
            </td>
          </tr>
          <tr style={{ background:'#f8f9fa', borderBottom:'0.5px solid #e8eaed' }}>
            <td style={{ padding:'4px 12px 6px', fontSize:10, color:'#7A8090' }}>Actual/Settled upfront</td>
            {months.map((_,i) => {
              const actual = calcColActual(i)
              return (
                <td key={i} style={{ padding:'4px 12px 6px', textAlign:'right', fontSize:10, color:'#22c55e', fontWeight:600, background:BAND_COLORS[bands[i]].row }}>
                  {actual>0?'$'+actual.toLocaleString():'—'}
                </td>
              )
            })}
            <td style={{ padding:'4px 12px 6px', textAlign:'right', fontSize:10, color:'#22c55e', fontWeight:600 }}>
              {beyondActual>0?'$'+beyondActual.toLocaleString():'—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Inline-editable Finance/Settlement date cell
function InlineDateCell({ deal, onSave }) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(deal['Finance Due Date']?.slice(0,10) || '')
  const display = deal['Date Settled'] || deal['Finance Due Date'] || null

  if (editing) {
    return (
      <td style={{ padding:'4px 8px' }}>
        <input type="date" value={val} autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={() => { onSave(deal, val); setEditing(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(deal, val); setEditing(false) }
            if (e.key === 'Escape') setEditing(false)
          }}
          style={{ fontSize:10, border:'1.5px solid #EB99C2', borderRadius:5, padding:'3px 6px', fontFamily:'inherit', outline:'none' }} />
      </td>
    )
  }
  return (
    <td onClick={e=>{e.stopPropagation();setEditing(true)}}
      style={{ padding:'6px 10px', fontSize:10, color:'#2A3545', cursor:'pointer' }}
      title="Click to edit date"
      onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
      {fmtDateShort(display) || <span style={{color:'#EB99C2',fontWeight:500}}>+ Set date</span>}
    </td>
  )
}

export default function CRM({ clients, onUpdateClients }) {
  const navigate = useNavigate()
  const settings = useMemo(() => loadSettings(), [])
  const [deals, setDeals] = useState(() => loadDeals())

  // If the local cache was empty on load (e.g. cache just cleared), pull the
  // real deals down from Supabase instead of silently working from nothing.
  // This never overwrites a session that already has local data.
  useEffect(() => {
    syncDealsFromSupabase().then(cloud => {
      const base = cloud || deals
      // One-time rename: "1. Lead" was renamed to "1. Discovery" — migrate
      // any already-saved deals so old and new deals aren't split across
      // two different stage names that no longer match anything in the
      // current stage lists.
      if (base.some(d => d.Status === '1. Lead')) {
        const renamed = base.map(d => d.Status === '1. Lead' ? { ...d, Status: '1. Discovery' } : d)
        saveDeals(renamed)
      } else if (cloud) {
        setDeals(cloud)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [viewMode, setViewMode] = useState('list')
  const [showForecast, setShowForecast] = useState(true)
  const [showNewOpp, setShowNewOpp] = useState(false)
  const [settleModal, setSettleModal] = useState(null)
  const [showPastMonths, setShowPastMonths] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showWithdrawn, setShowWithdrawn] = useState(false)

  function saveDeals(d) { setDeals(d); libSaveDeals(d) }

  function updateFinanceDate(deal, newDate) {
    saveDeals(deals.map(d => d['Transaction Name'] === deal['Transaction Name']
      ? { ...d, 'Finance Due Date': newDate, 'Month of Settlement': newDate || d['Month of Settlement'] }
      : d
    ))
  }

  const allMonths = useMemo(() => {
    const ms = new Set()
    deals.forEach(d => { if(d['Month of Settlement']) ms.add(d['Month of Settlement'].slice(0,7)) })
    return [...ms].sort().reverse()
  }, [deals])

  const today = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

  // Default: current + next 3 months
  const defaultVisible = useMemo(() => allMonths.filter(m => {
    const band = getMonthBand(m)
    return ['current','month1','month2','month3'].includes(band)
  }), [allMonths])

  const [visibleMonths, setVisibleMonths] = useState(defaultVisible)

  // Sync when allMonths changes
  React.useEffect(() => { setVisibleMonths(defaultVisible) }, [allMonths.join(',')])

  const groupedDeals = useMemo(() => {
    const groups = {}
    const sortedMonths = [...visibleMonths].sort()
    sortedMonths.forEach(m => { groups[m] = [] })
    deals.forEach(d => {
      if (!showWithdrawn && d.Status === '8. Withdrawn') return
      const m = d['Month of Settlement']?.slice(0,7)
      if (m && groups[m] !== undefined) groups[m].push(d)
    })
    Object.keys(groups).forEach(m => { groups[m].sort((a,b)=>STAGES.indexOf(a.Status)-STAGES.indexOf(b.Status)) })
    return groups
  }, [deals, visibleMonths, showWithdrawn])

  const activeDeals = deals.filter(d => ACTIVE_STAGES.includes(d.Status))
  const totalPipeline = activeDeals.reduce((s,d)=>s+(d.Amount||0),0)

  // Search matches regardless of settlement month/stage — this is the fix
  // for deals that don't show up in the month-grouped List view because
  // their Month of Settlement is missing or wrong.
  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []
    return deals.filter(d => {
      if (!showWithdrawn && d.Status === '8. Withdrawn') return false
      return [
        d['Transaction Name'], d.Lender, d.Categories, d['Transaction Type'], d['Lead Source'],
        ...(d['_referrers']||[]).map(r=>r.name),
      ].some(v => v && String(v).toLowerCase().includes(q))
    })
  }, [deals, searchTerm, showWithdrawn])
  const thisMonthSettled = deals.filter(d=>d.Status==='7. Settled'&&d['Month of Settlement']?.startsWith(curMonth)).reduce((s,d)=>s+(d.Amount||0),0)
  const thisMonthUpfront = deals.filter(d=>d.Status==='7. Settled'&&d['Month of Settlement']?.startsWith(curMonth)).reduce((s,d)=>s+dealUpfrontCommission(d),0)

  function changeStage(deal, newStage) {
    // Settling must always go through the Settle modal (client link / loan
    // discharge) — never just flip the status directly, regardless of which
    // control triggered the change.
    if (newStage === '7. Settled') { handleSettle(deal); return }
    saveDeals(deals.map(d => d['Transaction Name']===deal['Transaction Name'] ? {...d, Status:newStage} : d))
  }

  function handleSettle(deal) { setSettleModal(deal) }

  function handleSettleConfirm({ deal, settlementDate, existingClient, createNew, dischargeLoans }) {
    const updatedDeals = deals.map(d => d['Transaction Name']===deal['Transaction Name'] ? {...d, Status:'7. Settled','Date Settled':settlementDate} : d)
    saveDeals(updatedDeals)
    if (onUpdateClients) {
      // Passing a function here (not a precomputed array) is deliberate —
      // it's what makes settling two deals back-to-back safe. See the
      // comment on applySettlement for why.
      onUpdateClients(prevClients => applySettlement(prevClients, { deal, settlementDate, existingClient, createNew, dischargeLoans }))
    }
    setSettleModal(null)
  }

  const thStyle = { padding:'7px 10px', fontSize:10, fontWeight:600, color:'#2A3545', textAlign:'left', background:'#f8f9fa', borderBottom:'1px solid #e8eaed', whiteSpace:'nowrap' }

  const bizDays = useMemo(() => getBusinessDaysLeft(), [])
  const bizUrgent = bizDays <= 5
  const bizMonth = MONTH_NAMES[new Date().getMonth()]

  return (
    <div>
      <CRMTopbar />
      <div style={{ padding:'16px 24px' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <h1 style={{ fontSize:18, fontWeight:700, color:'#1a2535', margin:0 }}>CRM — Pipeline</h1>
                <div style={{ display:'flex', alignItems:'center', gap:5, background:bizUrgent?'#fef2f2':'#f0f4f8', borderRadius:6, padding:'3px 10px', border:`1px solid ${bizUrgent?'#fecaca':'#d1dae6'}` }}>
                  <span style={{ fontSize:11, fontWeight:700, color:bizUrgent?'#b91c1c':'#3D4F6B' }}>{bizDays}</span>
                  <span style={{ fontSize:10, color:bizUrgent?'#b91c1c':'#5a6370', whiteSpace:'nowrap' }}>{bizMonth} biz days left</span>
                  {bizUrgent && <span style={{ fontSize:11 }}>⚡</span>}
                </div>
              </div>
              <div style={{ fontSize:11, color:'#5a6370', marginTop:2 }}>
                {activeDeals.length} active deals · {fmt(totalPipeline)} pipeline · ${calcUpfront(totalPipeline,'Residential').toLocaleString()} est. upfront
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input
              value={searchTerm}
              onChange={e=>setSearchTerm(e.target.value)}
              placeholder="🔍 Search deals, lender, referral…"
              style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #e8eaed', fontSize:11, width:220, fontFamily:'inherit' }}
            />
            <button onClick={()=>setShowWithdrawn(p=>!p)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #e8eaed', background:showWithdrawn?'#3D4F6B':'#fff', color:showWithdrawn?'#fff':'#5a6370', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
              {showWithdrawn?'✓ Withdrawn':'Show Withdrawn'}
            </button>
            <button onClick={()=>setShowForecast(p=>!p)} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #e8eaed', background:showForecast?'#3D4F6B':'#fff', color:showForecast?'#fff':'#5a6370', fontSize:11, cursor:'pointer' }}>
              {showForecast?'✓ Forecast':'Forecast'}
            </button>
            <div style={{ display:'flex', border:'1px solid #e8eaed', borderRadius:7, overflow:'hidden' }}>
              <button onClick={()=>setViewMode('list')} style={{ padding:'6px 12px', fontSize:11, border:'none', background:viewMode==='list'?'#3D4F6B':'#fff', color:viewMode==='list'?'#fff':'#5a6370', cursor:'pointer' }}>≡ List</button>
              <button onClick={()=>setViewMode('kanban')} style={{ padding:'6px 12px', fontSize:11, border:'none', background:viewMode==='kanban'?'#3D4F6B':'#fff', color:viewMode==='kanban'?'#fff':'#5a6370', cursor:'pointer' }}>⬜ Kanban</button>
            </div>
            <button onClick={() => setShowNewOpp(true)} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#3D4F6B', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              + New opportunity
            </button>
            <button style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#EB99C2', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              ↑ Import Mercury
            </button>
          </div>
        </div>

        {/* Forecast + stats side by side */}
        {showForecast && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:10, marginBottom:10, alignItems:'start' }}>
            <ForecastPanel deals={deals} settings={settings} />
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { label:'Active pipeline', val:fmt(totalPipeline), sub:`${activeDeals.length} deals` },
                { label:'Settled this month', val:fmt(thisMonthSettled), sub:fmtMonth(curMonth), color:'#22c55e' },
                { label:'Est. upfront this month', val:`$${thisMonthUpfront.toLocaleString()}`, sub:'incl. any negotiated rates', color:'#EB99C2' },
                { label:'Cond. + Uncond.', val:fmt(deals.filter(d=>['5. Conditional','6. Unconditional'].includes(d.Status)).reduce((s,d)=>s+(d.Amount||0),0)), sub:'Near settlement' },
              ].map((s,i) => (
                <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#7A8090', marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:14, fontWeight:600, color:s.color||'#1a2535' }}>{s.val}</div>
                  <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List view */}
        {!searchTerm && viewMode==='list' && (
          <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', overflow:'hidden' }}>
            {/* Filter bar */}
            <div style={{ padding:'8px 12px', borderBottom:'0.5px solid #e8eaed', display:'flex', alignItems:'center', gap:8, background:'#f9fafb' }}>
              <span style={{ fontSize:11, color:'#64748b' }}>Filter by settlement month:</span>
              <MonthFilterDropdown allMonths={allMonths} visibleMonths={visibleMonths} onChange={setVisibleMonths} />
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <colgroup>
                <col style={{width:14}}/><col style={{width:'10%'}}/><col style={{width:'15%'}}/>
                <col style={{width:'7%'}}/><col style={{width:'7%'}}/><col style={{width:'8%'}}/>
                <col style={{width:'7%'}}/><col style={{width:'8%'}}/><col style={{width:'8%'}}/>
                <col style={{width:70}}/><col style={{width:44}}/><col style={{width:'10%'}}/><col style={{width:76}}/>
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width:14 }}></th>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Deal name</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Category</th>
                  <th style={{ ...thStyle, textAlign:'right' }}>Amount</th>
                  <th style={thStyle}>Lender</th>
                  <th style={thStyle}>Referral</th>
                  <th style={{ ...thStyle }}>
                    <span>Sett. Month</span>
                  </th>
                  <th style={thStyle}>Sett. Date</th>
                  <th style={{ ...thStyle, textAlign:'center' }}>Days</th>
                  <th style={thStyle}>Notes</th>
                  <th style={{ ...thStyle }}></th>
                </tr>
              </thead>
              <tbody>
                {[...visibleMonths].sort().map(month => {
                  const monthDeals = groupedDeals[month]||[]
                  if (monthDeals.length===0) return null
                  const band = getMonthBand(month)
                  const bc = BAND_COLORS[band]
                  const activeTotal = monthDeals.filter(d=>ACTIVE_STAGES.includes(d.Status)).reduce((s,d)=>s+(d.Amount||0),0)
                  const total = monthDeals.reduce((s,d)=>s+(d.Amount||0),0)
                  const potUpfront = monthDeals.filter(d=>ACTIVE_STAGES.includes(d.Status)).reduce((s,d)=>s+dealUpfrontCommission(d),0)
                  return (
                    <React.Fragment key={month}>
                      <tr>
                        <td colSpan={12} style={{ background:bc.header, padding:'5px 10px', borderTop:'1px solid #e5e7eb' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:bc.text }}>{fmtMonth(month)}</span>
                              <span style={{ fontSize:10, color:bc.text, opacity:0.7 }}>{monthDeals.length} deals</span>
                              <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'rgba(0,0,0,0.08)', color:bc.text }}>{bc.label}</span>
                            </div>
                            <div style={{ display:'flex', gap:14, fontSize:10, color:bc.text }}>
                              <span>Active: <strong>{fmt(activeTotal)}</strong></span>
                              <span>Total incl. settled: <strong>{fmt(total)}</strong></span>
                              <span style={{ opacity:0.7 }}>Pot. upfront: <strong>${potUpfront.toLocaleString()}</strong></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {monthDeals.map((deal,i) => {
                        const sc = STAGE_COLORS[deal.Status]||STAGE_COLORS['1. Discovery']
                        const isSettled = deal.Status==='7. Settled'
                        const isWithdrawn = deal.Status==='8. Withdrawn'
                        const settleDateStr = deal['Date Settled']||deal['Finance Due Date']||null
                        const days = daysToDate(settleDateStr)
                        const daysColor = days === null ? '#9ca3af' : days < 0 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#2A3545'
                        return (
                          <tr key={i} style={{ background:bc.row, borderBottom:'0.5px solid #e8eaed' }}
                            onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                            onMouseOut={e=>e.currentTarget.style.background=bc.row}>
                            <td style={{ padding:'6px 8px', width:20 }}>
                              <div style={{ width:8, height:8, borderRadius:'50%', background:sc.dot }}/>
                            </td>
                            <td style={{ padding:'6px 10px' }}>
                              <StageDropdown deal={deal} onChangeStage={changeStage} />
                            </td>
                            <td style={{ padding:'6px 10px', fontSize:11, fontWeight:500, color:'#EB99C2', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}
                              onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}>
                              {deal['Transaction Name']}
                            </td>
                            <td style={{ padding:'6px 10px', fontSize:10, whiteSpace:'nowrap' }}>
                              {deal.Contacts?.[0]?.mobile ? (
                                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                                  <a href={`tel:${deal.Contacts[0].mobile}`} onClick={e=>e.stopPropagation()} style={{ color:'#3D4F6B', textDecoration:'none', fontWeight:500 }}>{deal.Contacts[0].mobile}</a>
                                  <a href={`sms:${deal.Contacts[0].mobile}`} onClick={e=>e.stopPropagation()} title="Send text" style={{ background:'#f0f0f0', borderRadius:10, padding:'1px 6px', fontSize:9, color:'#7A8090', textDecoration:'none' }}>💬</a>
                                </span>
                              ) : <span style={{ color:'#9ca3af' }}>—</span>}
                            </td>
                            <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal.Categories||deal['Transaction Type']||'—'}</td>
                            <td style={{ padding:'6px 10px', fontSize:11, fontWeight:500, color:'#EB99C2', textAlign:'right', whiteSpace:'nowrap' }}>{deal.Amount?fmt(deal.Amount):'—'}</td>
                            <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal.Lender||'—'}</td>
                            <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal['Lead Source']||'—'}</td>
                            <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545', fontWeight:500 }}>{fmtMonth(deal['Month of Settlement']?.slice(0,7))}</td>
                            <InlineDateCell deal={deal} onSave={updateFinanceDate} />
                            <td style={{ padding:'6px 10px', fontSize:10, fontWeight:600, color:daysColor, textAlign:'center', whiteSpace:'nowrap' }}>
                              {days === null ? '—' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                            </td>
                            <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{deal['Status Notes']||deal['Next Action']||'—'}</td>
                            <td style={{ padding:'6px 10px', textAlign:'right' }}>
                              {!isSettled && !isWithdrawn && (
                                <button onClick={e=>{e.stopPropagation();handleSettle(deal)}}
                                  style={{ fontSize:9, padding:'3px 8px', borderRadius:5, border:'none', background:'#22c55e', color:'#fff', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                                  Settle →
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Search results — flat, ignores month/stage grouping entirely so a
            deal with a wrong or missing settlement date still shows up */}
        {searchTerm && (
          <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', overflow:'hidden' }}>
            <div style={{ padding:'8px 12px', borderBottom:'0.5px solid #e8eaed', background:'#f9fafb', fontSize:11, color:'#64748b' }}>
              {searchResults.length} result{searchResults.length===1?'':'s'} for "{searchTerm}"
            </div>
            {searchResults.length === 0 ? (
              <div style={{ padding:'24px 12px', textAlign:'center', fontSize:11.5, color:'#9ca3af' }}>No deals match — check the spelling, or try just part of the name or lender.</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{width:14}}/><col style={{width:'12%'}}/><col style={{width:'18%'}}/>
                  <col style={{width:'10%'}}/><col style={{width:'8%'}}/><col style={{width:'10%'}}/>
                  <col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'10%'}}/>
                  <col style={{width:72}}/>
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width:14 }}></th>
                    <th style={thStyle}>Stage</th>
                    <th style={thStyle}>Deal name</th>
                    <th style={thStyle}>Category</th>
                    <th style={{ ...thStyle, textAlign:'right' }}>Amount</th>
                    <th style={thStyle}>Lender</th>
                    <th style={thStyle}>Referral</th>
                    <th style={thStyle}>Sett. Month</th>
                    <th style={thStyle}>Sett. Date</th>
                    <th style={{ ...thStyle }}></th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((deal,i) => {
                    const sc = STAGE_COLORS[deal.Status]||STAGE_COLORS['1. Discovery']
                    const isSettled = deal.Status==='7. Settled'
                    const isWithdrawn = deal.Status==='8. Withdrawn'
                    return (
                      <tr key={i} style={{ borderBottom:'0.5px solid #e8eaed' }}
                        onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                        onMouseOut={e=>e.currentTarget.style.background='#fff'}>
                        <td style={{ padding:'6px 8px', width:20 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:sc.dot }}/>
                        </td>
                        <td style={{ padding:'6px 10px' }}>
                          <StageDropdown deal={deal} onChangeStage={changeStage} />
                        </td>
                        <td style={{ padding:'6px 10px', fontSize:11, fontWeight:500, color:'#EB99C2', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}
                          onClick={() => navigate(`/crm/deal/${encodeURIComponent(deal['Transaction Name'])}`)}>
                          {deal['Transaction Name']}
                        </td>
                        <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal.Categories||deal['Transaction Type']||'—'}</td>
                        <td style={{ padding:'6px 10px', fontSize:11, fontWeight:500, color:'#EB99C2', textAlign:'right', whiteSpace:'nowrap' }}>{deal.Amount?fmt(deal.Amount):'—'}</td>
                        <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal.Lender||'—'}</td>
                        <td style={{ padding:'6px 10px', fontSize:10, color:'#2A3545' }}>{deal['Lead Source']||'—'}</td>
                        <td style={{ padding:'6px 10px', fontSize:10, color: deal['Month of Settlement'] ? '#2A3545' : '#ef4444', fontWeight:500 }}>{deal['Month of Settlement'] ? fmtMonth(deal['Month of Settlement'].slice(0,7)) : 'Not set'}</td>
                        <InlineDateCell deal={deal} onSave={updateFinanceDate} />
                        <td style={{ padding:'6px 10px', textAlign:'right' }}>
                          {!isSettled && !isWithdrawn && (
                            <button onClick={e=>{e.stopPropagation();handleSettle(deal)}}
                              style={{ fontSize:9, padding:'3px 8px', borderRadius:5, border:'none', background:'#22c55e', color:'#fff', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                              Settle →
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Kanban */}
        {!searchTerm && viewMode==='kanban' && (
          <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
            {[...ACTIVE_STAGES, '7. Settled', ...(showWithdrawn ? ['8. Withdrawn'] : [])].map(stage => {
              const stageDeals = deals.filter(d=>d.Status===stage)
              const sc = STAGE_COLORS[stage]
              const isSettled = stage === '7. Settled'
              return (
                <div key={stage}
                  style={{ minWidth:220, background:'#f8f9fa', borderRadius:8, border:`0.5px solid ${isSettled?'#bbf7d0':'#e8eaed'}`, overflow:'hidden', flexShrink:0 }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline='2px solid #EB99C2' }}
                  onDragLeave={e => { e.currentTarget.style.outline='none' }}
                  onDrop={e => {
                    e.preventDefault()
                    e.currentTarget.style.outline='none'
                    const txName = e.dataTransfer.getData('text/plain')
                    if (txName) {
                      const droppedDeal = deals.find(d => d['Transaction Name'] === txName)
                      if (droppedDeal && droppedDeal.Status !== stage) {
                        if (stage === '7. Settled') {
                          handleSettle(droppedDeal)
                        } else {
                          changeStage(droppedDeal, stage)
                        }
                      }
                    }
                  }}>
                  <div style={{ background:sc.bg, padding:'8px 12px', borderBottom:'0.5px solid #e8eaed' }}>
                    <div style={{ fontSize:10, fontWeight:600, color:sc.color }}>{stage}</div>
                    <div style={{ fontSize:11, fontWeight:500, color:sc.color, marginTop:1 }}>{fmt(stageDeals.reduce((s,d)=>s+(d.Amount||0),0))} · {stageDeals.length}</div>
                  </div>
                  <div style={{ padding:8, maxHeight:500, overflowY:'auto' }}>
                    {stageDeals.map((d,i) => (
                      <div key={i}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', d['Transaction Name']); e.currentTarget.style.opacity='0.5' }}
                        onDragEnd={e => { e.currentTarget.style.opacity='1' }}
                        onClick={()=>navigate(`/crm/deal/${encodeURIComponent(d['Transaction Name'])}`)}
                        style={{ background:'#fff', borderRadius:6, padding:'8px 10px', marginBottom:6, border:'0.5px solid #e8eaed', cursor:'grab', userSelect:'none' }}
                        onMouseOver={e=>e.currentTarget.style.borderColor='#EB99C2'}
                        onMouseOut={e=>e.currentTarget.style.borderColor='#e8eaed'}>
                        <div style={{ fontSize:11, fontWeight:500, color:'#1a2535', marginBottom:2 }}>{d['Transaction Name']}</div>
                        <div style={{ fontSize:10, color:'#EB99C2', fontWeight:500 }}>{d.Amount?fmt(d.Amount):'—'}</div>
                        <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>{fmtMonth(d['Month of Settlement']?.slice(0,7))} · {d.Lender||'—'}</div>
                      </div>
                    ))}
                    {stageDeals.length===0 && (
                      <div style={{ fontSize:10, color:'#9ca3af', textAlign:'center', padding:12, border:'2px dashed #e8eaed', borderRadius:6 }}>
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {settleModal && (
        <SettleModal deal={settleModal} clients={clients||[]} onConfirm={handleSettleConfirm} onCancel={()=>setSettleModal(null)} />
      )}
      {showNewOpp && (
        <NewOpportunityModal
          onClose={() => setShowNewOpp(false)}
          onCreated={(newDeal) => {
            setDeals(prev => {
              const updated = [...prev, newDeal]
              libSaveDeals(updated)
              return updated
            })
            navigate(`/crm/deal/${encodeURIComponent(newDeal['Transaction Name'])}`)
          }}
        />
      )}
    </div>
  )
}
