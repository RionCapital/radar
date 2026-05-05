import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { totalBal, fmt } from '../lib/data'
import { fmtDate } from '../lib/dateUtils'
import { Panel, PanelTitle, DayBadge } from '../components/UI'
import CommissionImport from './CommissionImport'
import AddClient from './AddClient'

const COMMISSION = [
  { month:'Mar 25', trail:4509.09,  upfront:18295.28, total:22804.37, balance:29164475 },
  { month:'Apr 25', trail:4541.24,  upfront:9223.03,  total:13764.27, balance:30452525 },
  { month:'May 25', trail:4766.64,  upfront:5999.51,  total:10766.15, balance:31257259 },
  { month:'Jun 25', trail:4769.86,  upfront:15911.98, total:20681.84, balance:33048895 },
  { month:'Jul 25', trail:5059.35,  upfront:0,        total:5059.35,  balance:32726637 },
  { month:'Aug 25', trail:4986.57,  upfront:5777.73,  total:10764.30, balance:32411979 },
  { month:'Sep 25', trail:4998.56,  upfront:31299.46, total:36298.01, balance:36480528 },
  { month:'Oct 25', trail:5401.37,  upfront:4402.19,  total:9803.56,  balance:35568550 },
  { month:'Nov 25', trail:5005.50,  upfront:14214.92, total:19220.42, balance:35226679 },
  { month:'Dec 25', trail:5421.49,  upfront:4673.18,  total:10094.67, balance:34376508 },
  { month:'Jan 26', trail:5639.74,  upfront:0,        total:135.92,   balance:34582950 },
  { month:'Feb 26', trail:5054.41,  upfront:9212.09,  total:14266.50, balance:34734174 },
  { month:'Mar 26', trail:5616.36,  upfront:13322.25, total:18938.61, balance:41224085 },
]

const RADAR_FIXED_IO = [
  { conn:'Ricciulli', client:'RICCIULLI GUEVARA PROPERTY Pty Ltd', acc:'734136417', balance:229600, days:137, score:0 },
  { conn:'Ricciulli', client:'RICCIULLI R A — Raymond & Jessica', acc:'746989193', balance:515950, days:137, score:0 },
  { conn:'Ricciulli', client:'RJSO Pty Ltd atf RJSO Trust', acc:'200021390438', balance:360000, days:137, score:0 },
  { conn:'Russell',   client:'MARTIN RUSSELL', acc:'568038183', balance:396133, days:1, score:15 },
]

const RADAR_BALLOONS = [
  { conn:'Quartiero', client:'Hydro Solutions NSW Pty Ltd', acc:'—', balance:74489, days:1079, score:0 },
  { conn:'Smith',     client:'Command Plumbing Services Pty Ltd', acc:'—', balance:28620, days:978, score:0 },
  { conn:'Borg',      client:'JMB Plumbing', acc:'—', balance:77241, days:1056, score:0 },
  { conn:'Synergy IT',client:'Synergy IT Group Pty Ltd', acc:'—', balance:83094, days:67, score:0 },
]

function BarChart({ data, keys, colors, title, formatY }) {
  const maxVal = Math.max(...data.map(d => keys.reduce((s,k)=>s+(d[k]||0),0))) * 1.1 || 1
  const h = 130, barW = Math.max(12, Math.floor(420/data.length)-3)
  return (
    <div style={{flex:1}}>
      <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)',textAlign:'center',marginBottom:6}}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${data.length*(barW+3)+42} ${h+36}`} style={{overflow:'visible',display:'block'}}>
        {[0,0.25,0.5,0.75,1].map(p=>(
          <g key={p}>
            <line x1={38} x2={data.length*(barW+3)+38} y1={h-p*h} y2={h-p*h} stroke="var(--border-light)" strokeWidth={0.5}/>
            <text x={34} y={h-p*h+3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">{formatY?formatY(maxVal*p):Math.round(maxVal*p/1000)+'k'}</text>
          </g>
        ))}
        {data.map((d,i)=>{
          const x=40+i*(barW+3); let yOff=h
          return <g key={i}>
            {keys.map((k,ki)=>{
              const val=d[k]||0, bh=(val/maxVal)*h
              yOff-=bh
              return <rect key={ki} x={x} y={yOff} width={barW} height={bh} fill={colors[ki]} rx={1.5}><title>{`${d.month}: $${val.toLocaleString()}`}</title></rect>
            })}
            <text x={x+barW/2} y={h+14} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">{d.month}</text>
          </g>
        })}
      </svg>
      <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:2}}>
        {keys.map((k,i)=>(
          <div key={k} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--text-secondary)'}}>
            <div style={{width:10,height:10,borderRadius:2,background:colors[i]}}/>
            {k==='trail'?'Trail':k==='upfront'?'Upfront':k==='private'?'Private Wealth':'Commercial'}
          </div>
        ))}
      </div>
    </div>
  )
}

function RadarTable({ title, rows, navigate }) {
  const th = { padding:'6px 8px', textAlign:'left', fontSize:10, color:'var(--text-secondary)', fontWeight:500, borderBottom:'0.5px solid var(--border)', whiteSpace:'nowrap', background:'var(--bg)' }
  const td = (extra={}) => ({ padding:'6px 8px', borderBottom:'0.5px solid var(--border-light)', verticalAlign:'middle', fontSize:11, ...extra })
  return (
    <div style={{border:'0.5px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
      <div style={{background:'#2A3D54',padding:'8px 12px',fontSize:10,fontWeight:500,color:'#fff',textTransform:'uppercase',letterSpacing:'0.05em'}}>{title}</div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead><tr>
            {['Connection','Client','Account No.','Balance','Days Since Review','Opp. Score','Pipeline'].map(h=>(
              <th key={h} style={{...th,textAlign:['Balance','Days Since Review','Opp. Score'].includes(h)?'right':'left'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length>0 ? rows.map((r,i)=>(
              <tr key={i} style={{cursor:'pointer'}}
                onMouseOver={e=>e.currentTarget.style.background='#fce8f3'}
                onMouseOut={e=>e.currentTarget.style.background='transparent'}
                onClick={()=>navigate(`/radar/clients/${encodeURIComponent(r.conn)}`)}>
                <td style={td({fontWeight:500,color:'var(--pk)'})}>{r.conn}</td>
                <td style={{...td(),maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.client}</td>
                <td style={{...td(),fontFamily:'DM Mono,monospace',fontSize:10,color:'var(--text-secondary)'}}>{r.acc}</td>
                <td style={td({textAlign:'right',fontWeight:500})}>{fmt(r.balance)}</td>
                <td style={{...td(),textAlign:'right'}}><DayBadge days={r.days}/></td>
                <td style={td({textAlign:'right'})}>{r.score>0?<span style={{background:'#fce8f3',color:'var(--pk)',padding:'2px 7px',borderRadius:20,fontSize:9,fontWeight:500}}>{r.score}</span>:'—'}</td>
                <td style={td({color:'var(--text-tertiary)'})}> — </td>
              </tr>
            )) : <tr><td colSpan={7} style={td({textAlign:'center',color:'var(--text-tertiary)',padding:14})}>No items</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Dashboard({ clients, onAddClient, onImport }) {
  const navigate = useNavigate()
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const latest = COMMISSION[COMMISSION.length-1]
  const allLoans = clients.flatMap(c=>c.loans)
  const portfolio = allLoans.reduce((s,l)=>s+(l.balance||0),0)
  const pwTotal = clients.filter(c=>c.stream==='Private Wealth').flatMap(c=>c.loans).reduce((s,l)=>s+(l.balance||0),0)
  const commTotal = clients.filter(c=>c.stream==='Commercial').flatMap(c=>c.loans).reduce((s,l)=>s+(l.balance||0),0)
  const overdue = clients.filter(c=>c.days>=365).length
  const triggers = clients.filter(c=>c.loans.some(l=>l.io||l.fixed||l.balloon)).length

  // YTD — sum all 2026 months
  const ytd = COMMISSION.filter(m=>m.month.includes('26')).reduce((s,m)=>s+m.total,0)

  const annualRows = clients
    .filter(c=>c.days>=180&&c.loans.length>0)
    .sort((a,b)=>b.days-a.days)
    .slice(0,8)
    .flatMap(c=>c.loans.slice(0,1).map(l=>({conn:c.name,client:l.lname,acc:l.acc||'—',balance:l.balance,days:c.days,score:c.score})))

  const pwRatio = pwTotal/(pwTotal+commTotal||1)
  const balData = COMMISSION.map(d=>({
    month:d.month,
    private:Math.round(d.balance*pwRatio),
    commercial:Math.round(d.balance*(1-pwRatio)),
  }))

  const stat = (label, value, color, bg) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'0.5px solid var(--border-light)'}}>
      <span style={{fontSize:11,color:'var(--text-secondary)'}}>{label}</span>
      <span style={{fontSize:12,fontWeight:500,color:color||'var(--text-primary)',background:bg||'transparent',padding:bg?'1px 8px':'0',borderRadius:6}}>{value}</span>
    </div>
  )

  return (
    <div style={{padding:'16px 24px'}}>

      {/* TOP SECTION */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 240px',gap:14,marginBottom:16,alignItems:'start'}}>

        {/* Portfolio balance chart */}
        <Panel style={{display:'flex',flexDirection:'column'}}>
          <BarChart data={balData} keys={['private','commercial']} colors={['#2A3D54','#DA408D']} title="Portfolio Balances" formatY={v=>v>=1000000?`$${(v/1000000).toFixed(1)}m`:`$${Math.round(v/1000)}k`} />
        </Panel>

        {/* Income chart */}
        <Panel style={{display:'flex',flexDirection:'column'}}>
          <BarChart data={COMMISSION} keys={['trail','upfront']} colors={['#2A3D54','#DA408D']} title="Commission Income" formatY={v=>`$${Math.round(v/1000)}k`} />
        </Panel>

        {/* Stats panel — two columns */}
        <Panel style={{padding:'14px 16px'}}>
          <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Portfolio Summary</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
            <div>
              {stat('Month', latest.month)}
              {stat('Private Wealth', `$${(pwTotal/1e6).toFixed(1)}m`, '#2A3D54')}
              {stat('Commercial', `$${(commTotal/1e6).toFixed(1)}m`, 'var(--pk)')}
              {stat('Total Balances', `$${(portfolio/1e6).toFixed(1)}m`)}
            </div>
            <div>
              {stat('Connections', clients.length)}
              {stat('Accounts', allLoans.length)}
              {stat('Needs Attention', overdue, '#e8a020')}
              {stat('Active Triggers', triggers, 'var(--pk)')}
            </div>
          </div>
          <div style={{borderTop:'0.5px solid var(--border-light)',marginTop:8,paddingTop:8}}>
            <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Income</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
              <div>
                {stat('Trail', `$${latest.trail.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`)}
                {stat('Upfront', `$${latest.upfront.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`)}
              </div>
              <div>
                {stat('This month', `$${latest.total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, '#27ae60')}
                {stat('YTD', `$${Math.round(ytd).toLocaleString()}`, '#27ae60')}
              </div>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{display:'flex',gap:6,marginTop:12,flexWrap:'wrap'}}>
            <button onClick={()=>setShowImport(true)} style={{flex:1,padding:'7px 10px',borderRadius:7,border:'1.5px solid var(--pk)',background:'transparent',color:'var(--pk)',fontWeight:500,fontSize:11,cursor:'pointer'}}
              onMouseOver={e=>{e.target.style.background='var(--pk)';e.target.style.color='#fff'}}
              onMouseOut={e=>{e.target.style.background='transparent';e.target.style.color='var(--pk)'}}>
              ↑ Import statement
            </button>
            <button onClick={()=>setShowAdd(true)} style={{flex:1,padding:'7px 10px',borderRadius:7,border:'1.5px solid #2A3D54',background:'transparent',color:'#2A3D54',fontWeight:500,fontSize:11,cursor:'pointer'}}
              onMouseOver={e=>{e.target.style.background='#2A3D54';e.target.style.color='#fff'}}
              onMouseOut={e=>{e.target.style.background='transparent';e.target.style.color='#2A3D54'}}>
              + Add client
            </button>
          </div>
        </Panel>
      </div>

      {/* OPPORTUNITY RADAR */}
      <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:3,height:14,background:'var(--pk)',borderRadius:2}}/>
        Opportunity Radar
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <RadarTable title="Annual Reviews (A)" rows={annualRows.slice(0,6)} navigate={navigate}/>
        <RadarTable title="IO Term Review (C)" rows={RADAR_FIXED_IO} navigate={navigate}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <RadarTable title="Fixed Term & Maturities Review (B)" rows={[]} navigate={navigate}/>
        <RadarTable title="Asset Finance Balloons (D)" rows={RADAR_BALLOONS} navigate={navigate}/>
      </div>

      {/* Modals */}
      {showImport && <CommissionImport clients={clients} onImport={(updates,map)=>{onImport&&onImport(updates,map);setShowImport(false)}} onClose={()=>setShowImport(false)}/>}
      {showAdd && <AddClient clients={clients} onSave={(c)=>{onAddClient&&onAddClient(c);setShowAdd(false)}} onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
