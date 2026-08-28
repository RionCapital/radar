import React, { useState } from 'react'
import { BANKS } from '../lib/data'
import { getLoanTypes } from '../lib/settings'
import { FieldGroup, SaveBtn, CancelBtn, DateInput } from '../components/UI'

const blank = () => ({
  name: '', connNo: '', stream: 'Private Wealth',
  days: 0, score: 0, contacts: [], securities: [], notes: [],
  loans: []
})

const blankContact = () => ({ name: '', email: '', phone: '' })
const blankLoan = () => ({ acc: '', lname: '', type: 'Home Loan (OO)', bank: 'CBA', security: '1', amount: 0, balance: 0, rate: 0, rpmt: 'P&I', term: 30, ioTerm: 0, fixed: '', io: '', balloon: '', settled: new Date().toISOString().slice(0,10) })

export default function AddClient({ clients, onSave, onClose }) {
  const nextConnNo = Math.max(...(clients||[]).map(c => c.connNo || 0), 1099) + 1
  const [client, setClient] = useState(() => ({ ...blank(), connNo: nextConnNo }))
  const [errors, setErrors] = useState({})
  const loanTypeOptions = getLoanTypes()

  const set = (field, val) => setClient(c => ({ ...c, [field]: val }))

  function validate() {
    const e = {}
    if (!client.name.trim()) e.name = 'Name is required'
    if (clients.find(c => c.name.toLowerCase() === client.name.trim().toLowerCase())) e.name = 'A client with this name already exists'
    if (!client.connNo) e.connNo = 'Connection number is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return
    const maxConn = Math.max(...clients.map(c => c.connNo || 0), 1099)
    onSave({
      ...client,
      name: client.name.trim(),
      connNo: parseInt(client.connNo) || maxConn + 1,
      days: parseInt(client.days) || 0,
    })
  }

  const inp = { width: '100%' }
  const err = field => errors[field] ? <div style={{ fontSize: 10, color: '#c0392b', marginTop: 2 }}>{errors[field]}</div> : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: 680, maxHeight: '80vh', overflowY: 'auto', padding: 24, margin: '0 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>Add New Connection</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
        </div>

        {/* Client details */}
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Connection details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <FieldGroup label="Connection name *"><input style={inp} value={client.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Smith or Smith Family Trust" /></FieldGroup>
            {err('name')}
          </div>
          <div>
            <FieldGroup label="Connection no. *">
              <input style={inp} type="number" value={client.connNo} onChange={e => set('connNo', e.target.value)} placeholder={`e.g. ${Math.max(...clients.map(c => c.connNo || 0), 1099) + 1}`} />
            </FieldGroup>
            {err('connNo')}
          </div>
          <FieldGroup label="Stream">
            <select style={inp} value={client.stream} onChange={e => set('stream', e.target.value)}>
              <option>Private Wealth</option>
              <option>Commercial</option>
            </select>
          </FieldGroup>
        </div>

        {/* Contacts */}
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 4 }}>Contacts</div>
        {client.contacts.map((ct, i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, marginBottom: 8, border: '0.5px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <FieldGroup label="Name"><input style={inp} value={ct.name} onChange={e => { const c=[...client.contacts]; c[i]={...c[i],name:e.target.value}; set('contacts',c) }} /></FieldGroup>
              <FieldGroup label="Email"><input style={inp} value={ct.email} onChange={e => { const c=[...client.contacts]; c[i]={...c[i],email:e.target.value}; set('contacts',c) }} /></FieldGroup>
              <FieldGroup label="Phone"><input style={inp} value={ct.phone} onChange={e => { const c=[...client.contacts]; c[i]={...c[i],phone:e.target.value}; set('contacts',c) }} /></FieldGroup>
              <button onClick={() => set('contacts', client.contacts.filter((_,j)=>j!==i))} style={{ padding: '4px 8px', borderRadius: 6, border: '0.5px solid #fde8e8', background: '#fde8e8', color: '#c0392b', cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 2 }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={() => set('contacts', [...client.contacts, blankContact()])} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '0.5px solid var(--pk)', background: 'transparent', color: 'var(--pk)', cursor: 'pointer', marginBottom: 16 }}>+ Add contact</button>

        {/* Loans */}
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Loan facilities</div>
        {client.loans.map((l, i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 10, border: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--pk)' }}>Loan {i + 1}</div>
              <button onClick={() => set('loans', client.loans.filter((_,j)=>j!==i))} style={{ padding: '3px 8px', borderRadius: 6, border: '0.5px solid #fde8e8', background: '#fde8e8', color: '#c0392b', cursor: 'pointer', fontSize: 10 }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <FieldGroup label="Account no."><input style={inp} value={l.acc} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],acc:e.target.value}; set('loans',ls) }} /></FieldGroup>
              <FieldGroup label="Loan name"><input style={inp} value={l.lname} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],lname:e.target.value}; set('loans',ls) }} /></FieldGroup>
              <FieldGroup label="Security #"><input style={inp} value={l.security} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],security:e.target.value}; set('loans',ls) }} /></FieldGroup>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <FieldGroup label="Type">
                <select style={inp} value={l.type} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],type:e.target.value}; set('loans',ls) }}>
                  {loanTypeOptions.map(t => <option key={t}>{t}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Bank">
                <select style={inp} value={l.bank} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],bank:e.target.value}; set('loans',ls) }}>
                  {BANKS.map(b => <option key={b}>{b}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Repayment">
                <select style={inp} value={l.rpmt} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],rpmt:e.target.value}; set('loans',ls) }}>
                  <option>P&I</option><option>IO</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Rate (%)"><input style={inp} type="number" step="0.01" value={l.rate||''} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],rate:+e.target.value}; set('loans',ls) }} /></FieldGroup>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <FieldGroup label="Loan limit ($)"><input style={inp} type="number" value={l.amount||''} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],amount:+e.target.value}; set('loans',ls) }} /></FieldGroup>
              <FieldGroup label="Current balance ($)"><input style={inp} type="number" value={l.balance||''} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],balance:+e.target.value}; set('loans',ls) }} /></FieldGroup>
              <FieldGroup label="Term (years)"><input style={inp} type="number" step="0.5" value={l.term||''} onChange={e => { const ls=[...client.loans]; ls[i]={...ls[i],term:+e.target.value}; set('loans',ls) }} /></FieldGroup>
              <FieldGroup label="Settlement date"><DateInput style={inp} value={l.settled} onChange={v => { const ls=[...client.loans]; ls[i]={...ls[i],settled:v}; set('loans',ls) }} /></FieldGroup>
            </div>
          </div>
        ))}
        <button onClick={() => set('loans', [...client.loans, blankLoan()])} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '0.5px solid var(--pk)', background: 'transparent', color: 'var(--pk)', cursor: 'pointer', marginBottom: 20 }}>+ Add loan facility</button>

        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
          <button onClick={handleSave} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--pk)', border: 'none', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>Save connection</button>
          <CancelBtn onClick={onClose} />
        </div>
      </div>
    </div>
  )
}
