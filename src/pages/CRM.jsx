import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PIPELINE_DATA } from '../lib/pipelineData'
import { fmt } from '../lib/data'

const STAGES = [
  '1. Lead', '2. Strategy', '3. Pre-Lodged', '4. Lodged',
  '5. Conditional', '6. Unconditional', '7. Settled', '8. Withdrawn'
]

const ACTIVE_STAGES = ['1. Lead', '2. Strategy', '3. Pre-Lodged', '4. Lodged', '5. Conditional', '6. Unconditional']
const STAGE_COLORS = {
  '1. Lead': { bg: '#eef4fb', color: '#185fa5', dot: '#3b82f6' },
  '2. Strategy': { bg: '#eef4fb', color: '#185fa5', dot: '#3b82f6' },
  '3. Pre-Lodged': { bg: '#fdf0f6', color: '#9b2c6e', dot: '#EB99C2' },
  '4. Lodged': { bg: '#fdf0f6', color: '#9b2c6e', dot: '#EB99C2' },
  '5. Conditional': { bg: '#fff8e8', color: '#92600a', dot: '#f59e0b' },
  '6. Unconditional': { bg: '#eaf6ef', color: '#1a7a45', dot: '#22c55e' },
  '7. Settled': { bg: '#eaf6ef', color: '#1a7a45', dot: '#22c55e' },
  '8. Withdrawn': { bg: '#f5f5f5', color: '#7A8090', dot: '#9ca3af' },
}

// Month colour bands: current=green, +1=orange, +2=blue, +3=light blue, past=grey
function getMonthBand(monthStr) {
  if (!monthStr) return 'future'
  const today = new Date()
  const cur = new Date(today.getFullYear(), today.getMonth(), 1)
  const m = new Date(monthStr + '-01')
  const diff = (m.getFullYear() - cur.getFullYear()) * 12 + (m.getMonth() - cur.getMonth())
  if (diff < 0) return 'past'
  if (diff === 0) return 'current'
  if (diff === 1) return 'month1'
  if (diff === 2) return 'month2'
  if (diff === 3) return 'month3'
  return 'future'
}

const BAND_COLORS = {
  past:    { row: '#f9f9f9',    header: '#e8e8e8',    text: '#7A8090',  label: 'Past' },
  current: { row: '#f0fdf4',    header: '#bbf7d0',    text: '#166534',  label: 'Current month' },
  month1:  { row: '#fff7ed',    header: '#fed7aa',    text: '#9a3412',  label: 'Month 1' },
  month2:  { row: '#eff6ff',    header: '#bfdbfe',    text: '#1e40af',  label: 'Month 2' },
  month3:  { row: '#f0f9ff',    header: '#bae6fd',    text: '#0c4a6e',  label: 'Month 3' },
  future:  { row: '#fafafa',    header: '#e5e7eb',    text: '#374151',  label: 'Future' },
}

function fmtMonth(monthStr) {
  if (!monthStr) return '—'
  const d = new Date(monthStr + '-01')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

function getConnectionName(dealName) {
  if (!dealName) return ''
  const match = dealName.match(/^([A-Za-z&\s]+?)[\s(]/)
  return match ? match[1].trim() : dealName.split(' ')[0]
}

function DealRow({ deal, band, onSettle, onSelect, selected }) {
  const sc = STAGE_COLORS[deal.Status] || STAGE_COLORS['1. Lead']
  const bc = BAND_COLORS[band]
  const amt = deal.Amount ? fmt(deal.Amount) : '—'
  const isSettled = deal.Status === '7. Settled'
  const isWithdrawn = deal.Status === '8. Withdrawn'

  return (
    <tr
      style={{ background: selected ? '#fdf0f6' : bc.row, cursor: 'pointer', transition: 'background 0.1s' }}
      onClick={() => onSelect(deal)}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = '#fdf0f6' }}
      onMouseOut={e => { if (!selected) e.currentTarget.style.background = bc.row }}>
      <td style={{ padding: '6px 8px', width: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot }} />
      </td>
      <td style={{ padding: '6px 10px' }}>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {deal.Status}
        </span>
      </td>
      <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 500, color: '#2A3545', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {deal['Transaction Name']}
      </td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: '#7A8090' }}>{deal.Categories || deal['Transaction Type'] || '—'}</td>
      <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 500, color: '#EB99C2', textAlign: 'right', whiteSpace: 'nowrap' }}>{amt}</td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: '#7A8090' }}>{deal.Lender || '—'}</td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: '#7A8090' }}>{deal['Lead Source'] || '—'}</td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: '#7A8090' }}>{deal['Date Settled'] ? deal['Date Settled'].slice(0,10) : (deal['Finance Due Date'] ? deal['Finance Due Date'].slice(0,10) : '—')}</td>
      <td style={{ padding: '6px 10px', fontSize: 10, color: '#7A8090', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal['Status Notes'] || deal['Next Action'] || '—'}</td>
      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
        {!isSettled && !isWithdrawn && (
          <button onClick={e => { e.stopPropagation(); onSettle(deal) }}
            style={{ fontSize: 9, padding: '3px 8px', borderRadius: 5, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Settle →
          </button>
        )}
      </td>
    </tr>
  )
}

function MonthGroup({ month, deals, band, onSettle, onSelect, selectedDeal }) {
  const bc = BAND_COLORS[band]
  const total = deals.reduce((s, d) => s + (d.Amount || 0), 0)
  const activeDeal = deals.filter(d => !['7. Settled','8. Withdrawn'].includes(d.Status))
  const activeTotal = activeDeal.reduce((s,d) => s + (d.Amount||0), 0)

  return (
    <>
      <tr>
        <td colSpan={10} style={{ background: bc.header, padding: '5px 10px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: bc.text }}>{fmtMonth(month)}</span>
              <span style={{ fontSize: 10, color: bc.text, opacity: 0.7 }}>{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.08)', color: bc.text }}>{bc.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: bc.text }}>
              <span>Active: <strong>{fmt(activeTotal)}</strong></span>
              <span>Total incl. settled: <strong>{fmt(total)}</strong></span>
              <span style={{ opacity: 0.7 }}>Pot. upfront: <strong>${Math.round(activeTotal * 0.0066).toLocaleString()}</strong></span>
            </div>
          </div>
        </td>
      </tr>
      {deals.map((deal, i) => (
        <DealRow key={i} deal={deal} band={band} onSettle={onSettle} onSelect={onSelect} selected={selectedDeal?.['Transaction Name'] === deal['Transaction Name']} />
      ))}
    </>
  )
}

function ForecastPanel({ deals }) {
  const today = new Date()
  const cur = new Date(today.getFullYear(), today.getMonth(), 1)
  const months = [0,1,2,3].map(i => {
    const d = new Date(cur.getFullYear(), cur.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })

  const stageRows = ACTIVE_STAGES.map(stage => {
    const totals = months.map(m => {
      return deals.filter(d => d.Status === stage && d['Month of Settlement'] && d['Month of Settlement'].startsWith(m))
                  .reduce((s,d) => s + (d.Amount||0), 0)
    })
    const beyond = deals.filter(d => d.Status === stage && d['Month of Settlement'] && !months.some(m => d['Month of Settlement'].startsWith(m)))
                       .reduce((s,d) => s + (d.Amount||0), 0)
    return { stage, totals, beyond }
  })

  const colTotals = months.map((_,i) => stageRows.reduce((s,r) => s + r.totals[i], 0))
  const beyondTotal = stageRows.reduce((s,r) => s + r.beyond, 0)
  const bands = ['current','month1','month2','month3']

  const thStyle = (band) => ({
    padding: '6px 12px', fontSize: 10, fontWeight: 600,
    background: BAND_COLORS[band].header, color: BAND_COLORS[band].text,
    textAlign: 'right', whiteSpace: 'nowrap'
  })

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '0.5px solid #e8eaed', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '8px 14px', borderBottom: '0.5px solid #e8eaed', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#7A8090', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forecast — pipeline by stage</div>
        <div style={{ fontSize: 10, color: '#7A8090' }}>Upfront est. @ 0.66%</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, color: '#7A8090', textAlign: 'left', background: '#f8f9fa' }}>Stage</th>
            {months.map((m,i) => <th key={m} style={thStyle(bands[i])}>{fmtMonth(m)}</th>)}
            <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, color: '#7A8090', textAlign: 'right', background: '#f8f9fa' }}>&gt; 3 Months</th>
          </tr>
        </thead>
        <tbody>
          {stageRows.map(({ stage, totals, beyond }) => {
            const sc = STAGE_COLORS[stage]
            const hasAny = totals.some(t => t > 0) || beyond > 0
            if (!hasAny) return null
            return (
              <tr key={stage} style={{ borderTop: '0.5px solid #f0f0f0' }}>
                <td style={{ padding: '5px 12px' }}>
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>{stage}</span>
                </td>
                {totals.map((t, i) => (
                  <td key={i} style={{ padding: '5px 12px', textAlign: 'right', color: t > 0 ? '#2A3545' : '#d1d5db', fontWeight: t > 0 ? 500 : 400, background: BAND_COLORS[bands[i]].row }}>
                    {t > 0 ? fmt(t) : '—'}
                  </td>
                ))}
                <td style={{ padding: '5px 12px', textAlign: 'right', color: beyond > 0 ? '#2A3545' : '#d1d5db' }}>
                  {beyond > 0 ? fmt(beyond) : '—'}
                </td>
              </tr>
            )
          })}
          {/* Totals row */}
          <tr style={{ borderTop: '1.5px solid #e8eaed', background: '#f8f9fa' }}>
            <td style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#2A3545' }}>Total pipeline</td>
            {colTotals.map((t, i) => (
              <td key={i} style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#2A3545', background: BAND_COLORS[bands[i]].header }}>
                {fmt(t)}
              </td>
            ))}
            <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#2A3545' }}>{fmt(beyondTotal)}</td>
          </tr>
          {/* Upfront row */}
          <tr style={{ background: '#f8f9fa' }}>
            <td style={{ padding: '5px 12px', fontSize: 10, color: '#7A8090' }}>Potential upfront</td>
            {colTotals.map((t, i) => (
              <td key={i} style={{ padding: '5px 12px', textAlign: 'right', fontSize: 10, color: '#EB99C2', fontWeight: 500, background: BAND_COLORS[bands[i]].row }}>
                ${Math.round(t * 0.0066).toLocaleString()}
              </td>
            ))}
            <td style={{ padding: '5px 12px', textAlign: 'right', fontSize: 10, color: '#EB99C2', fontWeight: 500 }}>
              ${Math.round(beyondTotal * 0.0066).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SettleModal({ deal, clients, onConfirm, onCancel }) {
  const connName = getConnectionName(deal['Transaction Name'])
  const existingClient = clients.find(c => c.name.toLowerCase().includes(connName.toLowerCase()) || connName.toLowerCase().includes(c.name.toLowerCase()))
  const [createNew, setCreateNew] = useState(!existingClient)
  const [selectedClient, setSelectedClient] = useState(existingClient?.name || '')
  const [dischargeLoans, setDischargeLoans] = useState([])
  const [settlementDate, setSettlementDate] = useState(deal['Date Settled'] || new Date().toISOString().slice(0,10))

  const clientLoans = existingClient ? existingClient.loans.filter(l => !l.closed) : []
  const isRefi = deal['Transaction Type']?.toLowerCase().includes('refi') || deal['Transaction Type']?.toLowerCase().includes('refinance')

  function toggleDischarge(acc) {
    setDischargeLoans(prev => prev.includes(acc) ? prev.filter(a => a !== acc) : [...prev, acc])
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'24px 28px', width:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#1a2535', marginBottom:4 }}>Settle deal → Rradar</div>
        <div style={{ fontSize:12, color:'#7A8090', marginBottom:20 }}>{deal['Transaction Name']} · {deal.Amount ? fmt(deal.Amount) : '—'}</div>

        {/* Settlement date */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'#2A3545', marginBottom:4 }}>Settlement date</div>
          <input type="date" value={settlementDate} onChange={e=>setSettlementDate(e.target.value)}
            style={{ border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }} />
        </div>

        {/* Client linking */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'#2A3545', marginBottom:8 }}>Link to Rradar client</div>
          {existingClient ? (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setCreateNew(false)} style={{ flex:1, padding:'8px', borderRadius:7, border:`2px solid ${!createNew?'#EB99C2':'#e8eaed'}`, background:!createNew?'#fdf0f6':'#fff', fontSize:12, cursor:'pointer', fontWeight:500, color:!createNew?'#EB99C2':'#7A8090' }}>
                Link to existing: {existingClient.name}
              </button>
              <button onClick={()=>setCreateNew(true)} style={{ flex:1, padding:'8px', borderRadius:7, border:`2px solid ${createNew?'#EB99C2':'#e8eaed'}`, background:createNew?'#fdf0f6':'#fff', fontSize:12, cursor:'pointer', fontWeight:500, color:createNew?'#EB99C2':'#7A8090' }}>
                Create new client
              </button>
            </div>
          ) : (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:7, padding:'10px 12px', fontSize:12, color:'#166534' }}>
              ✓ New client — will be created in Rradar on settlement
            </div>
          )}
        </div>

        {/* Discharge loans (refinances) */}
        {existingClient && !createNew && clientLoans.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'#2A3545', marginBottom:4 }}>
              {isRefi ? 'Select loans being discharged (refinance)' : 'Discharge existing loans? (optional)'}
            </div>
            <div style={{ border:'1px solid #e8eaed', borderRadius:7, overflow:'hidden' }}>
              {clientLoans.map((l, i) => (
                <div key={i} onClick={()=>toggleDischarge(l.acc)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:i<clientLoans.length-1?'0.5px solid #f0f0f0':'none', cursor:'pointer', background:dischargeLoans.includes(l.acc)?'#fde8e8':'#fff' }}>
                  <input type="checkbox" checked={dischargeLoans.includes(l.acc)} onChange={()=>toggleDischarge(l.acc)} style={{ accentColor:'#e74c3c' }} onClick={e=>e.stopPropagation()} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:500 }}>{l.lname || l.acc}</div>
                    <div style={{ fontSize:10, color:'#7A8090' }}>{l.acc} · {l.balance ? fmt(l.balance) : '—'}</div>
                  </div>
                  {dischargeLoans.includes(l.acc) && <span style={{ fontSize:10, color:'#e74c3c', fontWeight:500 }}>Discharge</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onCancel} style={{ padding:'8px 18px', borderRadius:7, border:'1px solid #e8eaed', background:'#fff', color:'#4a5568', fontSize:12, cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>onConfirm({ deal, settlementDate, existingClient: createNew ? null : existingClient, createNew, dischargeLoans })}
            style={{ padding:'8px 20px', borderRadius:7, border:'none', background:'#22c55e', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ✓ Confirm settlement
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CRM({ clients, onUpdateClients }) {
  const navigate = useNavigate()
  // Nav tabs
  const CRMNav = () => (
    <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'1px solid #e8eaed', paddingBottom:0 }}>
      {[['Pipeline','/crm'],['Sales Dashboard','/crm/dashboard']].map(([label,path]) => (
        <button key={path} onClick={()=>navigate(path)} style={{ padding:'8px 18px', fontSize:12, fontWeight:500, border:'none', background:'transparent', cursor:'pointer', borderBottom: window.location.pathname===path?'2px solid #EB99C2':'2px solid transparent', color:window.location.pathname===path?'#EB99C2':'#7A8090', marginBottom:'-1px' }}>
          {label}
        </button>
      ))}
    </div>
  )
  const [deals, setDeals] = useState(() => {
    try {
      const saved = localStorage.getItem('rion-crm-deals')
      if (saved) return JSON.parse(saved)
    } catch {}
    return PIPELINE_DATA
  })
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [showForecast, setShowForecast] = useState(true)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [settleModal, setSettleModal] = useState(null)
  const [showPastMonths, setShowPastMonths] = useState(false)
  const [selectedMonths, setSelectedMonths] = useState([]) // extra past months to show

  function saveDeals(d) {
    setDeals(d)
    try { localStorage.setItem('rion-crm-deals', JSON.stringify(d)) } catch {}
  }

  // Get all unique months
  const allMonths = useMemo(() => {
    const ms = new Set()
    deals.forEach(d => {
      if (d['Month of Settlement']) ms.add(d['Month of Settlement'].slice(0,7))
    })
    return [...ms].sort()
  }, [deals])

  const today = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

  // Determine which months to show
  const visibleMonths = useMemo(() => {
    return allMonths.filter(m => {
      const band = getMonthBand(m)
      if (band === 'past') return showPastMonths || selectedMonths.includes(m)
      if (band === 'future' && m > curMonth.slice(0,7).replace(/(\d{4})-(\d{2})/, (_, y, mo) => `${y}-${String(parseInt(mo)+3).padStart(2,'0')}`)) return false
      return true
    })
  }, [allMonths, showPastMonths, selectedMonths, curMonth])

  // Group deals by month then sort by stage within each month
  const groupedDeals = useMemo(() => {
    const groups = {}
    visibleMonths.forEach(m => { groups[m] = [] })
    deals.forEach(d => {
      const m = d['Month of Settlement']?.slice(0,7)
      if (m && groups[m] !== undefined) {
        groups[m].push(d)
      }
    })
    // Sort each group by stage order
    Object.keys(groups).forEach(m => {
      groups[m].sort((a,b) => STAGES.indexOf(a.Status) - STAGES.indexOf(b.Status))
    })
    return groups
  }, [deals, visibleMonths])

  const pastMonths = allMonths.filter(m => getMonthBand(m) === 'past')

  // Summary stats
  const activeDeals = deals.filter(d => ACTIVE_STAGES.includes(d.Status))
  const totalPipeline = activeDeals.reduce((s,d) => s+(d.Amount||0), 0)
  const thisMonthSettled = deals.filter(d => d.Status === '7. Settled' && d['Month of Settlement']?.startsWith(curMonth)).reduce((s,d) => s+(d.Amount||0), 0)

  function handleSettle(deal) {
    setSettleModal(deal)
  }

  function handleSettleConfirm({ deal, settlementDate, existingClient, createNew, dischargeLoans }) {
    // 1. Update deal status to settled
    const updatedDeals = deals.map(d => d['Transaction Name'] === deal['Transaction Name']
      ? { ...d, Status: '7. Settled', 'Date Settled': settlementDate }
      : d)
    saveDeals(updatedDeals)

    // 2. Update Rradar clients
    if (onUpdateClients && clients) {
      let updatedClients = [...clients]

      if (existingClient && !createNew) {
        // Update existing client — discharge selected loans, add new loan
        updatedClients = updatedClients.map(c => {
          if (c.name !== existingClient.name) return c
          const loans = c.loans.map(l => dischargeLoans.includes(l.acc) ? { ...l, closed: true, dischargedDate: settlementDate, dischargedReason: 'Refinanced via Rion Capital' } : l)
          const newLoan = {
            acc: deal['Internal Reference'] || `CRM-${Date.now()}`,
            lname: deal['Full Name(s)'] || deal['Transaction Name'],
            type: deal.Categories || deal['Transaction Type'] || 'Home Loan',
            bank: deal.Lender || '',
            security: '',
            crossed: '',
            amount: deal.Amount || 0,
            balance: deal.Amount || 0,
            rate: 0,
            rateType: 'Var',
            rpmt: 'P&I',
            settled: settlementDate,
            maturity: '',
            fixed: '',
            io: '',
            balloon: 0,
            closed: false,
            actionNotes: [`✓ Settled via CRM — ${settlementDate}`]
          }
          return { ...c, loans: [...loans, newLoan] }
        })
      } else if (createNew) {
        // Create new client
        const newClient = {
          name: getConnectionName(deal['Transaction Name']),
          connNo: clients.length + 1071,
          stream: 'Private Wealth',
          days: 0,
          score: 0,
          lastReviewDate: settlementDate,
          manualOpp: {},
          oppNotes: '',
          contacts: [{
            type: deal['Full Name(s)'] ? 'Ind' : 'Co',
            first: deal['First Name(s)'] || '',
            middle: '',
            last: deal['Last Name(s)'] || '',
            email: deal['Emails(s)'] || '',
            mobile: deal.Mobile || '',
            dob: '',
            homeAddress: deal['Home Address'] || ''
          }],
          securities: [],
          loans: [{
            acc: deal['Internal Reference'] || `CRM-${Date.now()}`,
            lname: deal['Full Name(s)'] || deal['Transaction Name'],
            type: deal.Categories || deal['Transaction Type'] || 'Home Loan',
            bank: deal.Lender || '',
            security: '',
            crossed: '',
            amount: deal.Amount || 0,
            balance: deal.Amount || 0,
            rate: 0,
            rateType: 'Var',
            rpmt: 'P&I',
            settled: settlementDate,
            maturity: '',
            fixed: '',
            io: '',
            balloon: 0,
            closed: false,
            actionNotes: [`✓ Settled via CRM — ${settlementDate}`]
          }]
        }
        updatedClients = [...updatedClients, newClient]
      }

      onUpdateClients(updatedClients)
    }

    setSettleModal(null)
    setSelectedDeal(null)
  }

  const thStyle = { padding:'7px 10px', fontSize:10, fontWeight:600, color:'#7A8090', textAlign:'left', background:'#f8f9fa', borderBottom:'1px solid #e8eaed', whiteSpace:'nowrap' }

  return (
    <div style={{ padding:'16px 24px' }}>

      <CRMNav />
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:700, color:'#2A3545', margin:0 }}>CRM — Pipeline</h1>
          <div style={{ fontSize:11, color:'#7A8090', marginTop:2 }}>
            {activeDeals.length} active deals · {fmt(totalPipeline)} pipeline · ${Math.round(totalPipeline*0.0066).toLocaleString()} est. upfront
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* Past months toggle */}
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowPastMonths(p=>!p)}
              style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #e8eaed', background: showPastMonths?'#3D4F6B':'#fff', color:showPastMonths?'#fff':'#7A8090', fontSize:11, cursor:'pointer' }}>
              {showPastMonths ? '✓ Showing all months' : 'Show past months'}
            </button>
          </div>
          {/* Forecast toggle */}
          <button onClick={()=>setShowForecast(p=>!p)}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #e8eaed', background:showForecast?'#3D4F6B':'#fff', color:showForecast?'#fff':'#7A8090', fontSize:11, cursor:'pointer' }}>
            {showForecast ? '✓ Forecast' : 'Forecast'}
          </button>
          {/* View toggle */}
          <div style={{ display:'flex', border:'1px solid #e8eaed', borderRadius:7, overflow:'hidden' }}>
            <button onClick={()=>setViewMode('list')} style={{ padding:'6px 12px', fontSize:11, border:'none', background:viewMode==='list'?'#3D4F6B':'#fff', color:viewMode==='list'?'#fff':'#7A8090', cursor:'pointer' }}>≡ List</button>
            <button onClick={()=>setViewMode('kanban')} style={{ padding:'6px 12px', fontSize:11, border:'none', background:viewMode==='kanban'?'#3D4F6B':'#fff', color:viewMode==='kanban'?'#fff':'#7A8090', cursor:'pointer' }}>⬜ Kanban</button>
          </div>
          {/* Import */}
          <button onClick={()=>navigate('/crm/import')}
            style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#EB99C2', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            ↑ Import Mercury
          </button>
        </div>
      </div>

      {/* Forecast panel */}
      {showForecast && <ForecastPanel deals={deals} />}

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
        {[
          { label:'Active pipeline', val: fmt(totalPipeline), sub: `${activeDeals.length} deals` },
          { label:'Settled this month', val: fmt(thisMonthSettled), sub: 'May 2026', color:'#22c55e' },
          { label:'Est. upfront this month', val: `$${Math.round(thisMonthSettled*0.0066).toLocaleString()}`, sub: '@ 0.66%', color:'#EB99C2' },
          { label:'Conditional + Unconditional', val: fmt(deals.filter(d=>['5. Conditional','6. Unconditional'].includes(d.Status)).reduce((s,d)=>s+(d.Amount||0),0)), sub: 'Near settlement' },
        ].map((s,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'10px 14px' }}>
            <div style={{ fontSize:10, color:'#7A8090', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:16, fontWeight:600, color:s.color||'#2A3545' }}>{s.val}</div>
            <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Main table */}
      {viewMode === 'list' && (
        <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width:20 }}></th>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}>Deal name</th>
                <th style={thStyle}>Category</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Amount</th>
                <th style={thStyle}>Lender</th>
                <th style={thStyle}>Referral</th>
                <th style={thStyle}>Settlement / Finance</th>
                <th style={thStyle}>Next action / Notes</th>
                <th style={{ ...thStyle, width:80 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleMonths.map(month => {
                const monthDeals = groupedDeals[month] || []
                if (monthDeals.length === 0) return null
                const band = getMonthBand(month)
                return (
                  <MonthGroup
                    key={month}
                    month={month}
                    deals={monthDeals}
                    band={band}
                    onSettle={handleSettle}
                    onSelect={setSelectedDeal}
                    selectedDeal={selectedDeal}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
          {ACTIVE_STAGES.map(stage => {
            const stageDeals = deals.filter(d => d.Status === stage)
            const sc = STAGE_COLORS[stage]
            return (
              <div key={stage} style={{ minWidth:220, background:'#f8f9fa', borderRadius:8, border:'0.5px solid #e8eaed', overflow:'hidden', flexShrink:0 }}>
                <div style={{ background:sc.bg, padding:'8px 12px', borderBottom:'0.5px solid #e8eaed' }}>
                  <div style={{ fontSize:10, fontWeight:600, color:sc.color }}>{stage}</div>
                  <div style={{ fontSize:11, fontWeight:500, color:sc.color, marginTop:1 }}>{fmt(stageDeals.reduce((s,d)=>s+(d.Amount||0),0))} · {stageDeals.length} deals</div>
                </div>
                <div style={{ padding:8, maxHeight:500, overflowY:'auto' }}>
                  {stageDeals.map((d,i) => (
                    <div key={i} onClick={()=>setSelectedDeal(d)}
                      style={{ background:'#fff', borderRadius:6, padding:'8px 10px', marginBottom:6, border:'0.5px solid #e8eaed', cursor:'pointer' }}
                      onMouseOver={e=>e.currentTarget.style.borderColor='#EB99C2'}
                      onMouseOut={e=>e.currentTarget.style.borderColor='#e8eaed'}>
                      <div style={{ fontSize:11, fontWeight:500, color:'#2A3545', marginBottom:2 }}>{d['Transaction Name']}</div>
                      <div style={{ fontSize:10, color:'#EB99C2', fontWeight:500 }}>{d.Amount ? fmt(d.Amount) : '—'}</div>
                      <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>{fmtMonth(d['Month of Settlement']?.slice(0,7))} · {d.Lender||'—'}</div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && <div style={{ fontSize:10, color:'#9ca3af', textAlign:'center', padding:12 }}>Empty</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Settle modal */}
      {settleModal && (
        <SettleModal
          deal={settleModal}
          clients={clients || []}
          onConfirm={handleSettleConfirm}
          onCancel={() => setSettleModal(null)}
        />
      )}
    </div>
  )
}
