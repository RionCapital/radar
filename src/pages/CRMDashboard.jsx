import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PIPELINE_DATA } from '../lib/pipelineData'
import { fmt } from '../lib/data'
import CRMTopbar from '../components/CRMTopbar'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getFY(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const y = d.getFullYear(), mo = d.getMonth() + 1
  return mo >= 7 ? `FY${String(y).slice(2)}/${String(y+1).slice(2)}` : `FY${String(y-1).slice(2)}/${String(y).slice(2)}`
}

function cleanCat(d) {
  const cat = (d.Categories || d['Transaction Type'] || '').split(';')[0].trim()
  const tn = (d['Transaction Name'] || '').toLowerCase()
  if (cat === 'Asset Finance' || tn.includes('asset') || tn.includes('excavator')) return 'Asset Finance'
  if (cat === 'SMSF' || tn.includes('smsf')) return 'SMSF'
  if (cat === 'Invoice Finance' || tn.includes('invoice') || cat === 'Trade Finance') return 'Invoice Finance'
  if (['Bus. Lend','Business Loan','Business Lending'].includes(cat)) return 'Business Loans'
  if (cat === 'Commercial' || tn.includes('commercial')) return 'Commercial Loans'
  if (['Residential','Refinance','Variable','Owner Occupied','Full Doc','Low Doc','First Home Buyer',
       'Investment','Pre-Approval','Purchase','Top up'].includes(cat)) return 'Residential'
  if (tn.includes('home loan') || tn.includes(' oo)') || tn.includes('inv)')) return 'Residential'
  return 'Other'
}

const CAT_COLORS = {
  'Residential': '#3D4F6B',
  'Asset Finance': '#EB99C2',
  'Commercial Loans': '#f59e0b',
  'SMSF': '#22c55e',
  'Business Loans': '#8b5cf6',
  'Invoice Finance': '#06b6d4',
  'Other': '#9ca3af',
}

const Card = ({ children, style }) => (
  <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #e8eaed', padding:'14px 16px', ...style }}>
    {children}
  </div>
)
const CardTitle = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>{children}</div>
)
const Stat = ({ label, value, sub, color }) => (
  <div>
    <div style={{ fontSize:10, color:'#9ca3af', marginBottom:2 }}>{label}</div>
    <div style={{ fontSize:20, fontWeight:700, color:color||'#2A3545', lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>{sub}</div>}
  </div>
)

function BarChart({ data, color1, color2, compare }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.amount||0, compare?(d.prevAmount||0):0))) * 1.1 || 1
  const h = 100
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${data.length*28+48} ${h+28}`} style={{ overflow:'visible', display:'block' }}>
        {[0,0.25,0.5,0.75,1].map(p => (
          <g key={p}>
            <line x1={44} x2={data.length*28+44} y1={h-p*h} y2={h-p*h} stroke="#f0f0f0" strokeWidth={0.5}/>
            <text x={40} y={h-p*h+3} textAnchor="end" fontSize={7} fill="#9ca3af">
              {(maxVal*p/1e6)>=1?`$${(maxVal*p/1e6).toFixed(1)}m`:`$${Math.round(maxVal*p/1000)}k`}
            </text>
          </g>
        ))}
        {data.map((d,i) => {
          const x = 46+i*28
          const bw = compare?10:18
          const h1 = (( d.amount||0)/maxVal)*h
          const h2 = ((d.prevAmount||0)/maxVal)*h
          return (
            <g key={i}>
              <rect x={x} y={h-h1} width={compare?bw:18} height={h1} fill={color1} rx={2} opacity={0.85}>
                <title>{d.month}: {fmt(d.amount)}</title>
              </rect>
              {compare && (
                <rect x={x+bw+2} y={h-h2} width={bw} height={h2} fill={color2} rx={2} opacity={0.85}>
                  <title>{d.month} prev: {fmt(d.prevAmount)}</title>
                </rect>
              )}
              <text x={x+(compare?bw:9)} y={h+10} textAnchor="middle" fontSize={7} fill="#9ca3af">{d.month}</text>
            </g>
          )
        })}
      </svg>
      {compare && (
        <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#7A8090' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:color1 }}/> Current 12m
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#7A8090' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:color2 }}/> Prior 12m
          </div>
        </div>
      )}
    </div>
  )
}

function DonutChart({ data, total, onSliceClick }) {
  const cx=80, cy=80, r=60, inner=38
  let startAngle=-90
  const slices = data.map(d => {
    const angle=(d.value/total)*360
    const s={...d, startAngle, angle}
    startAngle+=angle
    return s
  })
  function arc(start, angle, radius) {
    const s=(start*Math.PI)/180
    const e=((start+angle)*Math.PI)/180
    const x1=cx+radius*Math.cos(s), y1=cy+radius*Math.sin(s)
    const x2=cx+radius*Math.cos(e), y2=cy+radius*Math.sin(e)
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${angle>180?1:0} 1 ${x2} ${y2} Z`
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
      <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink:0 }}>
        {slices.map((s,i) => (
          <path key={i} d={arc(s.startAngle,s.angle,r)} fill={s.color} opacity={0.9}
            style={{ cursor:'pointer' }}
            onClick={() => onSliceClick && onSliceClick(s.label)}
            onMouseOver={e=>e.currentTarget.setAttribute('opacity','1')}
            onMouseOut={e=>e.currentTarget.setAttribute('opacity','0.9')}>
            <title>Click to see {s.label} deals</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={inner} fill="white"/>
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={8} fill="#9ca3af">Total</text>
        <text x={cx} y={cy+6} textAnchor="middle" fontSize={11} fontWeight="700" fill="#2A3545">
          {total>=1e6?`$${(total/1e6).toFixed(1)}m`:`$${Math.round(total/1000)}k`}
        </text>
      </svg>
      <div style={{ flex:1 }}>
        {data.map((d,i) => (
          <div key={i} onClick={() => onSliceClick && onSliceClick(d.label)}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 4px', borderBottom:'0.5px solid #f0f0f0', cursor:'pointer', borderRadius:4 }}
            onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:d.color, flexShrink:0 }}/>
              <span style={{ fontSize:11, color:'#2A3545' }}>{d.label}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, fontWeight:500, color:'#2A3545' }}>{fmt(d.value)}</span>
              <span style={{ fontSize:10, color:'#9ca3af' }}>{Math.round(d.value/total*100)}%</span>
              <span style={{ fontSize:10, color:'#EB99C2' }}>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DealListModal({ category, deals, onClose, navigate }) {
  const catDeals = deals.filter(d => cleanCat(d) === category)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, width:600, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 40px rgba(0,0,0,0.18)', overflow:'hidden' }}>
        <div style={{ background:'#3D4F6B', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{category}</div>
            <div style={{ fontSize:11, color:'#9ab0c8', marginTop:1 }}>{catDeals.length} settlements · ${catDeals.reduce((s,d)=>s+(d.Amount||0),0).toLocaleString()}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, padding:'4px 10px', color:'#9ab0c8', fontSize:12, cursor:'pointer' }}>✕ Close</button>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8f9fa', borderBottom:'1px solid #e8eaed' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:10 }}>Deal name</th>
                <th style={{ padding:'8px 12px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:10 }}>Amount</th>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:10 }}>Lender</th>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:10 }}>Settled</th>
              </tr>
            </thead>
            <tbody>
              {catDeals.sort((a,b)=>(b.Amount||0)-(a.Amount||0)).map((d,i) => (
                <tr key={i}
                  onClick={() => { onClose(); navigate('/crm/deal/'+encodeURIComponent(d['Transaction Name'])) }}
                  style={{ borderBottom:'0.5px solid #f0f0f0', cursor:'pointer' }}
                  onMouseOver={e=>e.currentTarget.style.background='#fdf0f6'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'8px 12px', fontWeight:500, color:'#EB99C2' }}>{d['Transaction Name']}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:500 }}>{d.Amount?'$'+d.Amount.toLocaleString():'—'}</td>
                  <td style={{ padding:'8px 12px', color:'#7A8090' }}>{d.Lender||'—'}</td>
                  <td style={{ padding:'8px 12px', color:'#7A8090' }}>{d['Date Settled']?.slice(0,10)||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function CRMDashboard() {
  const navigate = useNavigate()
  const [selectedCat, setSelectedCat] = useState(null)

  const settled = useMemo(() =>
    PIPELINE_DATA.filter(d => d.Status === '7. Settled' && d['Date Settled'])
  , [])

  const today = new Date()

  const monthlyChart = useMemo(() => {
    const map = {}
    settled.forEach(d => {
      const m = d['Date Settled'].slice(0,7)
      if (!map[m]) map[m]={amount:0,count:0}
      map[m].amount += d.Amount||0
      map[m].count += 1
    })
    return Array.from({length:12},(_,i) => {
      const d = new Date(today.getFullYear(), today.getMonth()-11+i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const prev = new Date(d.getFullYear()-1, d.getMonth(), 1)
      const prevKey = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`
      return {
        month: MONTHS[d.getMonth()],
        amount: map[key]?.amount||0,
        prevAmount: map[prevKey]?.amount||0,
        count: map[key]?.count||0,
      }
    })
  }, [settled])

  const fyData = useMemo(() => {
    const fy = {}
    settled.forEach(d => {
      const f = getFY(d['Date Settled'])
      if (!f) return
      if (!fy[f]) fy[f]={count:0,amount:0}
      fy[f].count+=1
      fy[f].amount+=d.Amount||0
    })
    return Object.entries(fy).sort(([a],[b])=>a.localeCompare(b)).map(([f,v])=>({fy:f,...v}))
  }, [settled])

  const catData = useMemo(() => {
    const cats = {}
    settled.forEach(d => {
      const c = cleanCat(d)
      if (!cats[c]) cats[c]=0
      cats[c]+=d.Amount||0
    })
    return Object.entries(cats).sort(([,a],[,b])=>b-a).map(([label,value])=>({label,value,color:CAT_COLORS[label]||'#9ca3af'}))
  }, [settled])

  const catCountData = useMemo(() => {
    const cats = {}
    settled.forEach(d => {
      const c = cleanCat(d)
      if (!cats[c]) cats[c]=0
      cats[c]+=1
    })
    return Object.entries(cats).sort(([,a],[,b])=>b-a).map(([label,value])=>({label,value,color:CAT_COLORS[label]||'#9ca3af'}))
  }, [settled])

  const timeframes = useMemo(() => {
    const times = []
    settled.forEach(d => {
      if (d['Created On'] && d['Date Settled']) {
        const days = Math.round((new Date(d['Date Settled'])-new Date(d['Created On']))/86400000)
        if (days>0 && days<500) times.push({days, cat:cleanCat(d)})
      }
    })
    return times
  }, [settled])

  const refSources = useMemo(() => {
    const refs = {}
    settled.forEach(d => {
      const r = d['Lead Source']||'Unknown'
      if (!refs[r]) refs[r]={count:0,amount:0}
      refs[r].count+=1
      refs[r].amount+=d.Amount||0
    })
    return Object.entries(refs).sort(([,a],[,b])=>b.count-a.count).map(([label,v])=>({label,...v}))
  }, [settled])

  const topClients = useMemo(() => {
    const clients = {}
    settled.forEach(d => {
      const name = d['Transaction Name']?.split('(')[0].trim()||'Unknown'
      if (!clients[name]) clients[name]={count:0,amount:0}
      clients[name].count+=1
      clients[name].amount+=d.Amount||0
    })
    return Object.entries(clients).sort(([,a],[,b])=>b.amount-a.amount).slice(0,8).map(([name,v])=>({name,...v}))
  }, [settled])

  const totalSettled = settled.length
  const totalVolume = settled.reduce((s,d)=>s+(d.Amount||0),0)
  const catTotal = catData.reduce((s,d)=>s+d.value,0)
  const current12m = monthlyChart.reduce((s,m)=>s+m.amount,0)
  const prior12m = monthlyChart.reduce((s,m)=>s+m.prevAmount,0)
  const growth = prior12m>0?Math.round((current12m-prior12m)/prior12m*100):null
  const totalUpfront = Math.round(totalVolume*0.0066)
  const avgTime = timeframes.length?Math.round(timeframes.reduce((s,t)=>s+t.days,0)/timeframes.length):0
  const medTime = timeframes.length?[...timeframes].sort((a,b)=>a.days-b.days)[Math.floor(timeframes.length/2)].days:0
  const buckets = [
    {label:'< 30 days',count:timeframes.filter(t=>t.days<30).length,color:'#22c55e'},
    {label:'30–60 days',count:timeframes.filter(t=>t.days>=30&&t.days<60).length,color:'#3D4F6B'},
    {label:'60–90 days',count:timeframes.filter(t=>t.days>=60&&t.days<90).length,color:'#EB99C2'},
    {label:'90–180 days',count:timeframes.filter(t=>t.days>=90&&t.days<180).length,color:'#f59e0b'},
    {label:'> 180 days',count:timeframes.filter(t=>t.days>=180).length,color:'#e74c3c'},
  ]
  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
  const thisMonthSettled = settled.filter(d=>d['Date Settled']?.startsWith(thisMonthKey)).reduce((s,d)=>s+(d.Amount||0),0)

  return (
    <div>
      <CRMTopbar />
      <div style={{ padding:'16px 24px' }}>
        <div style={{ marginBottom:14 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:'#2A3545', margin:0 }}>CRM — Sales Dashboard</h1>
          <div style={{ fontSize:11, color:'#7A8090', marginTop:2 }}>Historical settlement data · {totalSettled} deals since inception</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:14 }}>
          <Card><Stat label="Total settlements" value={totalSettled} sub="Since inception"/></Card>
          <Card><Stat label="Total volume settled" value={`$${(totalVolume/1e6).toFixed(1)}m`} sub="All time" color="#2A3545"/></Card>
          <Card><Stat label="Current 12m volume" value={`$${(current12m/1e6).toFixed(1)}m`} sub={growth!==null?`${growth>=0?'+':''}${growth}% vs prior 12m`:''} color="#EB99C2"/></Card>
          <Card><Stat label="Est. total upfront" value={`$${(totalUpfront/1000).toFixed(0)}k`} sub="@ 0.66% est." color="#22c55e"/></Card>
          <Card><Stat label="Avg settlement time" value={`${avgTime}d`} sub={`Median ${medTime}d · ${timeframes.length} deals`}/></Card>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
          <Card>
            <CardTitle>Monthly settlements — current 12m vs prior 12m</CardTitle>
            <BarChart data={monthlyChart} color1="#3D4F6B" color2="#EB99C2" compare="prevAmount"/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
              <div style={{ background:'#f8f9fa', borderRadius:7, padding:'8px 12px' }}>
                <div style={{ fontSize:10, color:'#7A8090' }}>Current 12m</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#3D4F6B' }}>{fmt(current12m)}</div>
                <div style={{ fontSize:10, color:'#9ca3af' }}>{monthlyChart.reduce((s,m)=>s+m.count,0)} settlements</div>
              </div>
              <div style={{ background:'#f8f9fa', borderRadius:7, padding:'8px 12px' }}>
                <div style={{ fontSize:10, color:'#7A8090' }}>Prior 12m</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#EB99C2' }}>{fmt(prior12m)}</div>
                {growth!==null && <div style={{ fontSize:10, fontWeight:500, color:growth>=0?'#166534':'#a32d2d', marginTop:2 }}>{growth>=0?'▲':'▼'} {Math.abs(growth)}% YoY</div>}
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle>Settlement volume by type</CardTitle>
            <DonutChart data={catData} total={catTotal} onSliceClick={setSelectedCat}/>
          </Card>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
          <Card>
            <CardTitle>Financial year breakdown</CardTitle>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #e8eaed' }}>
                  <th style={{ padding:'5px 8px', textAlign:'left', color:'#7A8090', fontWeight:600, fontSize:10 }}>FY</th>
                  <th style={{ padding:'5px 8px', textAlign:'center', color:'#7A8090', fontWeight:600, fontSize:10 }}>Deals</th>
                  <th style={{ padding:'5px 8px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:10 }}>Volume</th>
                  <th style={{ padding:'5px 8px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:10 }}>Avg deal</th>
                  <th style={{ padding:'5px 8px', textAlign:'right', color:'#7A8090', fontWeight:600, fontSize:10 }}>Est. upfront</th>
                </tr>
              </thead>
              <tbody>
                {fyData.map((f,i) => (
                  <tr key={i} style={{ borderBottom:'0.5px solid #f0f0f0' }}>
                    <td style={{ padding:'6px 8px', fontWeight:500, color:'#2A3545' }}>{f.fy}</td>
                    <td style={{ padding:'6px 8px', textAlign:'center' }}>{f.count}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:500 }}>{fmt(f.amount)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', color:'#7A8090' }}>{fmt(Math.round(f.amount/f.count))}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', color:'#22c55e' }}>${Math.round(f.amount*0.0066).toLocaleString()}</td>
                  </tr>
                ))}
                <tr style={{ borderTop:'1px solid #e8eaed', background:'#f8f9fa' }}>
                  <td style={{ padding:'6px 8px', fontWeight:700 }}>All time</td>
                  <td style={{ padding:'6px 8px', textAlign:'center', fontWeight:700 }}>{totalSettled}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:700 }}>{fmt(totalVolume)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', color:'#7A8090' }}>{fmt(Math.round(totalVolume/totalSettled))}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:700, color:'#22c55e' }}>${Math.round(totalVolume*0.0066).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle>Settlement timeframes — deal to close</CardTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              <div style={{ background:'#f8f9fa', borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#9ca3af' }}>Average</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#2A3545' }}>{avgTime}d</div>
              </div>
              <div style={{ background:'#f8f9fa', borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#9ca3af' }}>Median</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#2A3545' }}>{medTime}d</div>
              </div>
              <div style={{ background:'#f8f9fa', borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#9ca3af' }}>Fastest</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#22c55e' }}>{Math.min(...timeframes.map(t=>t.days))}d</div>
              </div>
            </div>
            {buckets.map((b,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                <div style={{ width:10, height:10, borderRadius:2, background:b.color, flexShrink:0 }}/>
                <span style={{ fontSize:11, color:'#2A3545', flex:1 }}>{b.label}</span>
                <div style={{ width:80, background:'#f0f0f0', borderRadius:4, height:6 }}>
                  <div style={{ background:b.color, borderRadius:4, height:6, width:`${(b.count/timeframes.length)*100}%` }}/>
                </div>
                <span style={{ fontSize:11, fontWeight:500, minWidth:24, textAlign:'right' }}>{b.count}</span>
                <span style={{ fontSize:10, color:'#9ca3af', minWidth:28 }}>{Math.round(b.count/timeframes.length*100)}%</span>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
          <Card>
            <CardTitle>Referral sources — settled deals</CardTitle>
            {refSources.filter(r=>r.label!=='Unknown').map((r,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'#f8f9fa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#7A8090' }}>{r.count}</div>
                  <span style={{ fontSize:11, color:'#2A3545' }}>{r.label}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, fontWeight:500 }}>{fmt(r.amount)}</div>
                  <div style={{ fontSize:9, color:'#9ca3af' }}>{fmt(Math.round(r.amount/r.count))} avg</div>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <CardTitle>Top connections by settled volume</CardTitle>
            {topClients.map((c,i) => (
              <div key={i} style={{ marginBottom:7 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:10, color:'#9ca3af', minWidth:14 }}>#{i+1}</span>
                    <span style={{ fontSize:11, color:'#2A3545', fontWeight:500 }}>{c.name}</span>
                  </div>
                  <div>
                    <span style={{ fontSize:11, fontWeight:500, color:'#EB99C2' }}>{fmt(c.amount)}</span>
                    <span style={{ fontSize:10, color:'#9ca3af', marginLeft:6 }}>{c.count} deal{c.count!==1?'s':''}</span>
                  </div>
                </div>
                <div style={{ background:'#f0f0f0', borderRadius:4, height:5 }}>
                  <div style={{ background:i===0?'#EB99C2':'#3D4F6B', borderRadius:4, height:5, width:`${(c.amount/topClients[0].amount)*100}%`, opacity:1-i*0.08 }}/>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <Card style={{ marginBottom:14 }}>
          <CardTitle>Deal count by type — all settlements</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:10 }}>
            {catCountData.map((c,i) => (
              <div key={i} style={{ textAlign:'center', padding:'10px 8px', background:'#f8f9fa', borderRadius:8, borderTop:`3px solid ${c.color}` }}>
                <div style={{ fontSize:22, fontWeight:700, color:'#2A3545' }}>{c.value}</div>
                <div style={{ fontSize:10, color:'#7A8090', marginTop:2 }}>{c.label}</div>
                <div style={{ fontSize:10, color:c.color, fontWeight:500, marginTop:1 }}>{Math.round(c.value/totalSettled*100)}%</div>
              </div>
            ))}
          </div>
        </Card>

        {selectedCat && (
          <DealListModal
            category={selectedCat}
            deals={settled}
            onClose={() => setSelectedCat(null)}
            navigate={navigate}
          />
        )}
      </div>
    </div>
  )
}
