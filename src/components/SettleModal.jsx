import React, { useState } from 'react'
import { fmt } from '../lib/data'

export function getConnName(dealName) {
  if (!dealName) return ''
  const m = dealName.match(/^([A-Za-z&\s]+?)[\s(]/)
  return m ? m[1].trim() : dealName.split(' ')[0]
}

// Builds the updated clients array for a settlement. Always call this
// against the FRESHEST clients state — i.e. from inside setClients(prev =>
// applySettlement(prev, ...)) — never from a clients prop snapshot taken
// earlier. Settling two deals close together used to build both updates
// from the same stale snapshot, so the second settlement's save silently
// overwrote the first one's loan discharge. This function itself is pure;
// the caller is responsible for feeding it fresh state.
export function applySettlement(prevClients, { deal, settlementDate, existingClient, createNew, dischargeLoans }) {
  let updatedClients = [...(prevClients || [])]
  if (existingClient && !createNew) {
    updatedClients = updatedClients.map(c => {
      if (c.name !== existingClient.name) return c
      const loans = c.loans.map(l => dischargeLoans.includes(l.acc) ? { ...l, closed: true, dischargedDate: settlementDate } : l)
      const newLoan = { acc: `CRM-${Date.now()}`, lname: deal['Full Name(s)'] || deal['Transaction Name'], type: deal.Categories || 'Home Loan', bank: deal.Lender || '', amount: deal.Amount || 0, balance: deal.Amount || 0, rate: 0, rateType: 'Var', rpmt: 'P&I', settled: settlementDate, maturity: '', fixed: '', io: '', balloon: 0, closed: false, actionNotes: [`✓ Settled via CRM — ${settlementDate}`] }
      return { ...c, loans: [...loans, newLoan] }
    })
  } else if (createNew) {
    const newClient = { name: getConnName(deal['Transaction Name']), connNo: (prevClients?.length || 0) + 1071, stream: 'Private Wealth', days: 0, score: 0, lastReviewDate: settlementDate, manualOpp: {}, oppNotes: '', contacts: [{ type: 'Ind', first: deal['First Name(s)'] || '', middle: '', last: deal['Last Name(s)'] || '', email: deal['Emails(s)'] || '', mobile: deal.Mobile || '', dob: '', homeAddress: '' }], securities: [], loans: [{ acc: `CRM-${Date.now()}`, lname: deal['Full Name(s)'] || deal['Transaction Name'], type: deal.Categories || 'Home Loan', bank: deal.Lender || '', amount: deal.Amount || 0, balance: deal.Amount || 0, rate: 0, rateType: 'Var', rpmt: 'P&I', settled: settlementDate, maturity: '', fixed: '', io: '', balloon: 0, closed: false, actionNotes: [`✓ Settled via CRM — ${settlementDate}`] }] }
    updatedClients = [...updatedClients, newClient]
  }
  return updatedClients
}

export function SettleModal({ deal, clients, onConfirm, onCancel }) {
  const connName = getConnName(deal['Transaction Name'])
  const existingClient = clients?.find(c => c.name.toLowerCase().includes(connName.toLowerCase()) || connName.toLowerCase().includes(c.name.toLowerCase()))
  const [createNew, setCreateNew] = useState(!existingClient)
  const [dischargeLoans, setDischargeLoans] = useState([])
  const [settlementDate, setSettlementDate] = useState(deal['Date Settled'] || new Date().toISOString().slice(0,10))
  const clientLoans = existingClient ? existingClient.loans.filter(l => !l.closed) : []
  const isRefi = deal['Transaction Type']?.toLowerCase().includes('refi')

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'24px 28px', width:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#1a2535', marginBottom:4 }}>Settle deal → Rradar</div>
        <div style={{ fontSize:12, color:'#7A8090', marginBottom:20 }}>{deal['Transaction Name']} · {deal.Amount?fmt(deal.Amount):'—'}</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'#1a2535', marginBottom:4 }}>Settlement date</div>
          <input type="date" value={settlementDate} onChange={e=>setSettlementDate(e.target.value)} style={{ border:'1px solid #e8eaed', borderRadius:6, padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
        </div>
        {existingClient ? (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'#1a2535', marginBottom:8 }}>Link to Rradar client</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setCreateNew(false)} style={{ flex:1, padding:'8px', borderRadius:7, border:`2px solid ${!createNew?'#EB99C2':'#e8eaed'}`, background:!createNew?'#fdf0f6':'#fff', fontSize:12, cursor:'pointer', fontWeight:500, color:!createNew?'#EB99C2':'#7A8090' }}>
                Link to: {existingClient.name}
              </button>
              <button onClick={()=>setCreateNew(true)} style={{ flex:1, padding:'8px', borderRadius:7, border:`2px solid ${createNew?'#EB99C2':'#e8eaed'}`, background:createNew?'#fdf0f6':'#fff', fontSize:12, cursor:'pointer', fontWeight:500, color:createNew?'#EB99C2':'#7A8090' }}>
                Create new client
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom:14, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:7, padding:'10px 12px', fontSize:12, color:'#166534' }}>
            ✓ New client — will be created in Rradar on settlement
          </div>
        )}
        {existingClient && !createNew && clientLoans.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'#1a2535', marginBottom:4 }}>
              {isRefi?'Select loans being discharged (refinance)':'Discharge existing loans? (optional)'}
            </div>
            <div style={{ border:'1px solid #e8eaed', borderRadius:7, overflow:'hidden' }}>
              {clientLoans.map((l,i) => (
                <div key={i} onClick={()=>setDischargeLoans(prev=>prev.includes(l.acc)?prev.filter(a=>a!==l.acc):[...prev,l.acc])}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:i<clientLoans.length-1?'0.5px solid #f0f0f0':'none', cursor:'pointer', background:dischargeLoans.includes(l.acc)?'#fde8e8':'#fff' }}>
                  <input type="checkbox" checked={dischargeLoans.includes(l.acc)} onChange={()=>{}} style={{ accentColor:'#e74c3c' }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:500 }}>{l.lname||l.acc}</div>
                    <div style={{ fontSize:10, color:'#7A8090' }}>{l.acc} · {l.balance?fmt(l.balance):'—'}</div>
                  </div>
                  {dischargeLoans.includes(l.acc) && <span style={{ fontSize:10, color:'#e74c3c', fontWeight:500 }}>Discharge</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onCancel} style={{ padding:'8px 18px', borderRadius:7, border:'1px solid #e8eaed', background:'#fff', color:'#4a5568', fontSize:12, cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>onConfirm({ deal, settlementDate, existingClient:createNew?null:existingClient, createNew, dischargeLoans })}
            style={{ padding:'8px 20px', borderRadius:7, border:'none', background:'#22c55e', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ✓ Confirm settlement
          </button>
        </div>
      </div>
    </div>
  )
}
