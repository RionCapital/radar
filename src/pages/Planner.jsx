import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { sbSaveMarketing, sbLoadMarketing } from '../lib/supabase'
import { notifySaveFailed } from '../lib/saveStatus'
import { loadDeals } from '../lib/deals'
import { logo_rion_notag } from '../lib/icons'

const NAVY = '#3D5570'
const DEEP = '#2A3D54'
const PINK = '#EB99C2'
const BRAND_PINK = '#DA408D'
const SLATE = '#7A8090'

const STORAGE_KEY = 'rion-planner'
// Dedicated row (id 4) in the shared `marketing` table -- same pattern as
// Project Studio (id 2) and Marketing.jsx (id 1). Nothing else reads/writes
// this row, so no race is possible and no new Supabase table is needed.
const PLANNER_ROW_ID = 4

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEETING_TYPES = ['Client', 'Refer', 'Lend', 'Other']
const TYPE_COLOR = { Client: PINK, Refer: NAVY, Lend: '#6A9FCC', Other: SLATE }

// deal stages that haven't settled yet -- used to build the CRM dropdowns
const ACTIVE_STAGES = ['1. Lead', '2. Strategy', '3. Pre-Lodged', '4. Lodged', '5. Conditional', '6. Unconditional']
const NEAR_SETTLEMENT_STAGES = ['4. Lodged', '5. Conditional', '6. Unconditional']

const DEFAULT_LODGEMENT_COUNT_TARGET = 4

const TRAINING_OPTIONS = [
  { value: '', label: '\u2014', cat: null },
  { value: 'Run', label: 'Run', cat: 'Cardio' },
  { value: 'Swim', label: 'Swim', cat: 'Cardio' },
  { value: 'Walk', label: 'Walk', cat: 'Cardio' },
  { value: 'Hyrox', label: 'Hyrox', cat: 'Cardio' },
  { value: 'General PT', label: 'General PT', cat: 'Cardio' },
  { value: 'Shadow Box', label: 'Shadow box', cat: 'Boxing' },
  { value: 'Boxing', label: 'Boxing', cat: 'Boxing' },
  { value: 'Boxing Contact', label: 'Boxing - contact', cat: 'Boxing' },
  { value: 'Weights Upper', label: 'Weights - upper', cat: 'Strength' },
  { value: 'Weights Lower', label: 'Weights - lower', cat: 'Strength' },
  { value: 'Strength Cond', label: 'Strength & cond.', cat: 'Strength' },
  { value: 'Recovery', label: 'Recovery', cat: 'Recovery' },
]
const TRAINING_CAT_BY_VALUE = TRAINING_OPTIONS.reduce((m, o) => { if (o.value) m[o.value] = o.cat; return m }, {})
const TRAINING_CATS = ['Cardio', 'Boxing', 'Strength', 'Recovery']

// ─── date helpers ───────────────────────────────────────────────────────────
function toISO(d) { return d.toISOString().slice(0, 10) }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d) }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtShort(iso) { const d = parseISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
function fmtRange(mondayIso) {
  const start = parseISO(mondayIso)
  const end = parseISO(addDays(mondayIso, 6))
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = sameMonth ? `${start.getDate()}` : `${start.getDate()} ${MONTHS[start.getMonth()]}`
  return `${startStr} \u2013 ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
}
function businessDaysLeftInWeek(mondayIso) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let count = 0
  for (let i = 0; i < 5; i++) { // Mon..Fri
    const d = parseISO(addDays(mondayIso, i))
    if (d >= today) count++
  }
  return count
}
function monthKey(iso) { return iso.slice(0, 7) } // 'YYYY-MM' based on the Monday's date
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
function fmtMoney(n) {
  const v = Number(n) || 0
  return '$' + Math.round(v).toLocaleString('en-AU')
}
function uid() { return Date.now() + Math.random().toString(16).slice(2) }

function emptyWeek(weekStart) {
  return {
    weekStart,
    lodgementCountTarget: DEFAULT_LODGEMENT_COUNT_TARGET,
    lodgementTarget: 0,
    settlementTarget: 0,
    meetings: [],
    lodgements: [],
    settlements: [],
    training: {
      startWeight: '',
      endWeight: '',
      days: DAYS.reduce((m, d) => { m[d] = { am: '', pm: '' }; return m }, {}),
    },
    notes: '',
    createdAt: Date.now(),
  }
}

function weekStats(week) {
  if (!week) return { meetings: 0, byType: {}, lodgedTotal: 0, settledTotal: 0, lodgedCount: 0 }
  const byType = {}
  MEETING_TYPES.forEach(t => { byType[t] = 0 })
  week.meetings.forEach(m => { byType[m.type] = (byType[m.type] || 0) + 1 })
  const lodgedTotal = week.lodgements.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const settledTotal = week.settlements.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  return { meetings: week.meetings.length, byType, lodgedTotal, settledTotal, lodgedCount: week.lodgements.length }
}

function trainingStats(week) {
  const totals = { Cardio: 0, Boxing: 0, Strength: 0, Recovery: 0 }
  let sessions = 0
  const days = (week.training && week.training.days) || {}
  DAYS.forEach(d => {
    const slot = days[d] || {}
    ;['am', 'pm'].forEach(s => {
      const val = slot[s]
      if (val) {
        const cat = TRAINING_CAT_BY_VALUE[val]
        if (cat) { totals[cat] = (totals[cat] || 0) + 1; sessions++ }
      }
    })
  })
  return { totals, sessions }
}

// ─── small UI atoms ─────────────────────────────────────────────────────────
function inp(extra) { return { padding: '6px 9px', fontSize: 12, border: '1px solid #e2e6ed', borderRadius: 6, fontFamily: "'Montserrat',sans-serif", ...extra } }

function SectionCard({ title, action, children, style }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e6ed', borderRadius: 12, padding: 18, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function IconBtn({ onClick, children, title, danger }) {
  return (
    <button title={title} onClick={onClick} style={{
      background: danger ? '#fde8e8' : '#f0f3f7', border: 'none', borderRadius: 6, width: 24, height: 24,
      color: danger ? '#c0392b' : SLATE, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}

function dealLabel(d) {
  const stage = (d.Status || '').replace(/^\d+\.\s*/, '')
  const amt = d.Amount ? fmtMoney(d.Amount) : '\u2014'
  return `${d['Transaction Name']} \u2014 ${stage} \u2014 ${amt}`
}

// ─── main component ─────────────────────────────────────────────────────────
export default function Planner() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('week') // week | rhythm | analysis | history
  const [store, setStore] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (s) return JSON.parse(s)
    } catch {}
    const monday = toISO(getMonday(new Date()))
    return { weeks: { [monday]: emptyWeek(monday) }, viewWeek: monday, targetWeight: '', monthNotes: {} }
  })
  const [deals, setDeals] = useState(() => loadDeals())

  // ─── cloud sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    sbLoadMarketing(PLANNER_ROW_ID).then(cloud => {
      if (cloud?._planner?.weeks && Object.keys(cloud._planner.weeks).length) {
        const localRaw = localStorage.getItem(STORAGE_KEY)
        if (!localRaw) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud._planner))
          setStore(cloud._planner)
        }
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((next) => {
    setStore(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    sbSaveMarketing({ _planner: next }, PLANNER_ROW_ID).then(ok => {
      if (!ok) notifySaveFailed('planner')
    }).catch(err => notifySaveFailed('planner', { error: String(err) }))
  }, [])

  const viewWeek = store.viewWeek || toISO(getMonday(new Date()))
  const week = { ...emptyWeek(viewWeek), ...(store.weeks[viewWeek] || {}) }

  function updateWeek(patch) {
    const next = { ...store, weeks: { ...store.weeks, [viewWeek]: { ...week, ...patch } } }
    save(next)
  }
  function updateGlobal(patch) {
    save({ ...store, ...patch })
  }
  function updateMonthNotes(key, text) {
    save({ ...store, monthNotes: { ...(store.monthNotes || {}), [key]: text } })
  }

  function goToWeek(mondayIso) {
    const next = { ...store, viewWeek: mondayIso }
    if (!next.weeks[mondayIso]) next.weeks = { ...next.weeks, [mondayIso]: emptyWeek(mondayIso) }
    save(next)
    setTab('week')
  }

  function startNewWeek() {
    const nextMonday = addDays(viewWeek, 7)
    goToWeek(nextMonday)
  }

  function deleteWeek(mondayIso) {
    if (!window.confirm(`Delete the week of ${fmtRange(mondayIso)}? This can't be undone.`)) return
    const weeks = { ...store.weeks }
    delete weeks[mondayIso]
    const next = { ...store, weeks, viewWeek: store.viewWeek === mondayIso ? toISO(getMonday(new Date())) : store.viewWeek }
    save(next)
  }

  // ─── meetings ───────────────────────────────────────────────────────────
  function addMeeting() {
    const m = { id: uid(), day: 'Tue', time: '', type: 'Client', notes: '', done: false }
    updateWeek({ meetings: [...week.meetings, m] })
  }
  function updateMeeting(id, patch) {
    updateWeek({ meetings: week.meetings.map(m => m.id === id ? { ...m, ...patch } : m) })
  }
  function removeMeeting(id) {
    updateWeek({ meetings: week.meetings.filter(m => m.id !== id) })
  }

  // ─── lodgements ─────────────────────────────────────────────────────────
  function addLodgement() {
    const l = { id: uid(), priority: week.lodgements.length + 1, name: '', amount: '', done: false }
    updateWeek({ lodgements: [...week.lodgements, l] })
  }
  function addLodgementFromDeal(name) {
    if (!name) return
    const d = deals.find(x => x['Transaction Name'] === name)
    if (!d) return
    const l = { id: uid(), priority: week.lodgements.length + 1, name: d['Transaction Name'], amount: d.Amount || '', done: d.Status === '4. Lodged' }
    updateWeek({ lodgements: [...week.lodgements, l] })
  }
  function updateLodgement(id, patch) {
    updateWeek({ lodgements: week.lodgements.map(l => l.id === id ? { ...l, ...patch } : l) })
  }
  function removeLodgement(id) {
    updateWeek({ lodgements: week.lodgements.filter(l => l.id !== id) })
  }

  // ─── settlements ────────────────────────────────────────────────────────
  function addSettlement() {
    const s = { id: uid(), name: '', amount: '', done: false }
    updateWeek({ settlements: [...week.settlements, s] })
  }
  function addSettlementFromDeal(name) {
    if (!name) return
    const d = deals.find(x => x['Transaction Name'] === name)
    if (!d) return
    const s = { id: uid(), name: d['Transaction Name'], amount: d.Amount || '', done: d.Status === '7. Settled' }
    updateWeek({ settlements: [...week.settlements, s] })
  }
  function updateSettlement(id, patch) {
    updateWeek({ settlements: week.settlements.map(s => s.id === id ? { ...s, ...patch } : s) })
  }
  function removeSettlement(id) {
    updateWeek({ settlements: week.settlements.filter(s => s.id !== id) })
  }

  function pullSettledFromCRM() {
    const weekEnd = addDays(viewWeek, 6)
    const settled = (deals || []).filter(d => {
      const ds = d['Date Settled']
      if (!ds || d.Status !== '7. Settled') return false
      const dateOnly = String(ds).slice(0, 10)
      return dateOnly >= viewWeek && dateOnly <= weekEnd
    })
    if (!settled.length) { alert('No deals in your CRM show a settlement date within this week.') ; return }
    const existingNames = new Set(week.settlements.map(s => s.name))
    const additions = settled
      .filter(d => !existingNames.has(d['Transaction Name']))
      .map(d => ({ id: uid(), name: d['Transaction Name'], amount: d.Amount || '', done: true }))
    if (!additions.length) { alert('Those settlements are already listed below.'); return }
    updateWeek({ settlements: [...week.settlements, ...additions] })
  }

  // ─── training ───────────────────────────────────────────────────────────
  function updateTrainingField(patch) {
    updateWeek({ training: { ...week.training, ...patch } })
  }
  function updateTrainingSlot(day, slot, value) {
    const days = { ...week.training.days, [day]: { ...week.training.days[day], [slot]: value } }
    updateWeek({ training: { ...week.training, days } })
  }

  const stats = weekStats(week)
  const daysLeft = businessDaysLeftInWeek(viewWeek)

  const lodgementDealOptions = useMemo(() => {
    const existing = new Set(week.lodgements.map(l => l.name))
    return (deals || []).filter(d => ACTIVE_STAGES.includes(d.Status) && !existing.has(d['Transaction Name']))
  }, [deals, week.lodgements])

  const settlementDealOptions = useMemo(() => {
    const existing = new Set(week.settlements.map(s => s.name))
    return (deals || []).filter(d => NEAR_SETTLEMENT_STAGES.includes(d.Status) && !existing.has(d['Transaction Name']))
  }, [deals, week.settlements])

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', fontFamily: "'Montserrat',system-ui,sans-serif" }}>
      {/* topbar */}
      <div style={{ background: NAVY, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <img src={logo_rion_notag} alt="RION Capital" onClick={() => navigate('/')} style={{ height: 34, width: 'auto', cursor: 'pointer' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '2px 6px' }}>PLANNER</span>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[
              ['week', 'This Week'],
              ['rhythm', 'Weekly Rhythm'],
              ['analysis', 'Analysis'],
              ['history', 'History'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 500, border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: tab === key ? `2px solid ${PINK}` : '2px solid transparent',
                color: tab === key ? PINK : 'rgba(255,255,255,0.65)', marginBottom: '-1px', whiteSpace: 'nowrap',
              }}>{label}</button>
            ))}
          </nav>
        </div>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>⌂ Home</button>
      </div>

      <div style={{ padding: '24px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'week' && (
          <WeekTab
            week={week} viewWeek={viewWeek} daysLeft={daysLeft} stats={stats}
            targetWeight={store.targetWeight} onUpdateTargetWeight={v => updateGlobal({ targetWeight: v })}
            onPrev={() => goToWeek(addDays(viewWeek, -7))}
            onNext={() => goToWeek(addDays(viewWeek, 7))}
            onToday={() => goToWeek(toISO(getMonday(new Date())))}
            onStartNewWeek={startNewWeek}
            updateWeek={updateWeek}
            addMeeting={addMeeting} updateMeeting={updateMeeting} removeMeeting={removeMeeting}
            addLodgement={addLodgement} updateLodgement={updateLodgement} removeLodgement={removeLodgement}
            addSettlement={addSettlement} updateSettlement={updateSettlement} removeSettlement={removeSettlement}
            addLodgementFromDeal={addLodgementFromDeal} addSettlementFromDeal={addSettlementFromDeal}
            lodgementDealOptions={lodgementDealOptions} settlementDealOptions={settlementDealOptions}
            pullSettledFromCRM={pullSettledFromCRM}
            updateTrainingField={updateTrainingField} updateTrainingSlot={updateTrainingSlot}
          />
        )}
        {tab === 'rhythm' && <RhythmTab />}
        {tab === 'analysis' && <AnalysisTab store={store} onUpdateMonthNotes={updateMonthNotes} />}
        {tab === 'history' && <HistoryTab store={store} onOpen={goToWeek} onDelete={deleteWeek} />}
      </div>
    </div>
  )
}

// ─── THIS WEEK ──────────────────────────────────────────────────────────────
function WeekTab({
  week, viewWeek, daysLeft, stats, targetWeight, onUpdateTargetWeight,
  onPrev, onNext, onToday, onStartNewWeek, updateWeek,
  addMeeting, updateMeeting, removeMeeting,
  addLodgement, updateLodgement, removeLodgement,
  addSettlement, updateSettlement, removeSettlement,
  addLodgementFromDeal, addSettlementFromDeal, lodgementDealOptions, settlementDealOptions,
  pullSettledFromCRM, updateTrainingField, updateTrainingSlot,
}) {
  const settlePct = week.settlementTarget ? Math.min(100, Math.round(stats.settledTotal / week.settlementTarget * 100)) : 0
  const lodgeCountPct = week.lodgementCountTarget ? Math.min(100, Math.round(stats.lodgedCount / week.lodgementCountTarget * 100)) : 0
  const trStats = trainingStats(week)

  return (
    <div>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onPrev} style={navBtnStyle}>←</button>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: 'Georgia,serif' }}>Week of {fmtRange(viewWeek)}</div>
            <button onClick={onToday} style={{ background: 'none', border: 'none', color: SLATE, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>jump to this week</button>
          </div>
          <button onClick={onNext} style={navBtnStyle}>→</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e6ed', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: SLATE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bus. days left</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{daysLeft}</div>
          </div>
          <button onClick={onStartNewWeek} style={{ background: BRAND_PINK, border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
            + START NEW WEEK
          </button>
        </div>
      </div>

      {/* rhythm strip */}
      <RhythmStrip compact />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* lodgement target — count based, 4/week by default */}
        <SectionCard title="Weekly Target — Lodgements">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: SLATE }}>Target (no. of loans)</span>
            <input type="number" value={week.lodgementCountTarget} onChange={e => updateWeek({ lodgementCountTarget: e.target.value })} style={{ ...inp(), width: 70 }} />
            <span style={{ fontSize: 11, color: SLATE, marginLeft: 'auto' }}>Lodged: <b style={{ color: NAVY }}>{stats.lodgedCount}</b> of {week.lodgementCountTarget || 0}</span>
          </div>
          <div style={{ height: 8, background: '#f0f2f5', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${lodgeCountPct}%`, background: PINK, borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 10, color: SLATE, marginTop: 4 }}>{lodgeCountPct}% of target &middot; {fmtMoney(stats.lodgedTotal)} in value</div>
        </SectionCard>
        <SectionCard title="Weekly Target — Settlements ($)">
          <TargetRow value={week.settlementTarget} onChange={v => updateWeek({ settlementTarget: v })} actual={stats.settledTotal} pct={settlePct} color={NAVY} />
        </SectionCard>
      </div>

      {/* meetings */}
      <SectionCard title={`Meetings (${stats.meetings})`} style={{ marginTop: 16 }}
        action={<button onClick={addMeeting} style={addBtnStyle}>+ Add meeting</button>}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {MEETING_TYPES.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SLATE }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOR[t], display: 'inline-block' }} />
              {t}: <b style={{ color: NAVY }}>{stats.byType[t] || 0}</b>
            </div>
          ))}
        </div>
        {week.meetings.length === 0 && <EmptyRow text="No meetings booked yet this week." />}
        {week.meetings.map(m => {
          const isAdminDay = m.day === 'Mon' || m.day === 'Fri'
          return (
            <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5' }}>
              <input type="checkbox" checked={m.done} onChange={e => updateMeeting(m.id, { done: e.target.checked })} />
              <select value={m.day} onChange={e => updateMeeting(m.id, { day: e.target.value })} style={{ ...inp(), width: 62, background: isAdminDay ? '#fef3e2' : '#fff' }}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input type="time" value={m.time} onChange={e => updateMeeting(m.id, { time: e.target.value })} style={{ ...inp(), width: 92 }} />
              <select value={m.type} onChange={e => updateMeeting(m.id, { type: e.target.value })} style={{ ...inp(), width: 84 }}>
                {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={m.notes} onChange={e => updateMeeting(m.id, { notes: e.target.value })} placeholder="Who / what" style={{ ...inp(), flex: 1 }} />
              {isAdminDay && <span title="Mon & Fri are meeting-free admin/follow-up days" style={{ fontSize: 14 }}>⚠️</span>}
              <IconBtn danger title="Remove" onClick={() => removeMeeting(m.id)}>✕</IconBtn>
            </div>
          )
        })}
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* lodgements */}
        <SectionCard title="Lodgements this week"
          action={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value="" onChange={e => addLodgementFromDeal(e.target.value)} style={{ ...inp(), fontSize: 10 }}>
              <option value="">+ Add from CRM pipeline...</option>
              {lodgementDealOptions.map(d => <option key={d['Transaction Name']} value={d['Transaction Name']}>{dealLabel(d)}</option>)}
            </select>
            <button onClick={addLodgement} style={addBtnStyle}>+ Add manually</button>
          </div>}>
          {week.lodgements.length === 0 && <EmptyRow text="No lodgements listed." />}
          {week.lodgements.map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5' }}>
              <input type="checkbox" checked={l.done} onChange={e => updateLodgement(l.id, { done: e.target.checked })} />
              <input type="number" value={l.priority} onChange={e => updateLodgement(l.id, { priority: e.target.value })} style={{ ...inp(), width: 40 }} />
              <input value={l.name} onChange={e => updateLodgement(l.id, { name: e.target.value })} placeholder="Deal name" style={{ ...inp(), flex: 1 }} />
              <input type="number" value={l.amount} onChange={e => updateLodgement(l.id, { amount: e.target.value })} placeholder="$" style={{ ...inp(), width: 100, textAlign: 'right' }} />
              <IconBtn danger title="Remove" onClick={() => removeLodgement(l.id)}>✕</IconBtn>
            </div>
          ))}
          {week.lodgements.length > 0 && (
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: NAVY, marginTop: 8 }}>Total: {fmtMoney(stats.lodgedTotal)}</div>
          )}
        </SectionCard>

        {/* settlements */}
        <SectionCard title="Settlements this week"
          action={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value="" onChange={e => addSettlementFromDeal(e.target.value)} style={{ ...inp(), fontSize: 10 }}>
              <option value="">+ Add from CRM pipeline...</option>
              {settlementDealOptions.map(d => <option key={d['Transaction Name']} value={d['Transaction Name']}>{dealLabel(d)}</option>)}
            </select>
            <button onClick={pullSettledFromCRM} style={ghostBtnStyle}>Pull settled</button>
            <button onClick={addSettlement} style={addBtnStyle}>+ Add manually</button>
          </div>}>
          {week.settlements.length === 0 && <EmptyRow text="No settlements listed." />}
          {week.settlements.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5' }}>
              <input type="checkbox" checked={s.done} onChange={e => updateSettlement(s.id, { done: e.target.checked })} />
              <input value={s.name} onChange={e => updateSettlement(s.id, { name: e.target.value })} placeholder="Deal name" style={{ ...inp(), flex: 1 }} />
              <input type="number" value={s.amount} onChange={e => updateSettlement(s.id, { amount: e.target.value })} placeholder="$" style={{ ...inp(), width: 100, textAlign: 'right' }} />
              <IconBtn danger title="Remove" onClick={() => removeSettlement(s.id)}>✕</IconBtn>
            </div>
          ))}
          {week.settlements.length > 0 && (
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: NAVY, marginTop: 8 }}>Total: {fmtMoney(stats.settledTotal)}</div>
          )}
        </SectionCard>
      </div>

      {/* training / fitness */}
      <SectionCard title="Training & Fitness" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
          <WeightField label="Start weight" value={week.training.startWeight} onChange={v => updateTrainingField({ startWeight: v })} />
          <WeightField label="End weight" value={week.training.endWeight} onChange={v => updateTrainingField({ endWeight: v })} />
          <WeightField label="Target weight" value={targetWeight} onChange={onUpdateTargetWeight} accent={BRAND_PINK} />
          {targetWeight && week.training.endWeight && (
            <div>
              <div style={{ fontSize: 9, color: SLATE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diff to target</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{(Number(week.training.endWeight) - Number(targetWeight)).toFixed(1)}</div>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thTd}></th>
                {DAYS.map(d => <th key={d} style={{ ...thTd, fontSize: 10, color: SLATE, fontWeight: 600 }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {['am', 'pm'].map(slot => (
                <tr key={slot}>
                  <td style={{ ...thTd, fontSize: 10, color: SLATE, fontWeight: 600, textTransform: 'uppercase' }}>{slot}</td>
                  {DAYS.map(d => (
                    <td key={d} style={thTd}>
                      <select value={week.training.days[d]?.[slot] || ''} onChange={e => updateTrainingSlot(d, slot, e.target.value)} style={{ ...inp(), width: '100%', fontSize: 10, padding: '4px 4px' }}>
                        {TRAINING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
          {TRAINING_CATS.map(cat => (
            <div key={cat} style={{ fontSize: 11, color: SLATE }}>{cat}: <b style={{ color: NAVY }}>{trStats.totals[cat] || 0}</b></div>
          ))}
          <div style={{ fontSize: 11, color: SLATE }}>Total sessions: <b style={{ color: NAVY }}>{trStats.sessions}</b></div>
        </div>
      </SectionCard>

      <SectionCard title="Notes" style={{ marginTop: 16 }}>
        <textarea value={week.notes} onChange={e => updateWeek({ notes: e.target.value })} rows={3}
          placeholder="Anything to flag for this week — reviews due, referrer follow-ups, blockers..."
          style={{ ...inp(), width: '100%', resize: 'vertical', fontFamily: "'Montserrat',sans-serif" }} />
      </SectionCard>
    </div>
  )
}

const thTd = { padding: 4, textAlign: 'center' }

function WeightField({ label, value, onChange, accent }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: SLATE, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <input type="number" step="0.1" value={value} onChange={e => onChange(e.target.value)} style={{ ...inp(), width: 90, borderColor: accent || '#e2e6ed' }} />
    </div>
  )
}

function TargetRow({ value, onChange, actual, pct, color }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: SLATE }}>Target $</span>
        <input type="number" value={value} onChange={e => onChange(e.target.value)} style={{ ...inp(), width: 130 }} />
        <span style={{ fontSize: 11, color: SLATE, marginLeft: 'auto' }}>Actual: <b style={{ color: NAVY }}>{fmtMoney(actual)}</b></span>
      </div>
      <div style={{ height: 8, background: '#f0f2f5', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 10, color: SLATE, marginTop: 4 }}>{pct}% of target</div>
    </div>
  )
}

function EmptyRow({ text }) {
  return <div style={{ fontSize: 12, color: SLATE, fontStyle: 'italic', padding: '10px 0' }}>{text}</div>
}

const navBtnStyle = { background: '#fff', border: '1px solid #e2e6ed', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 14, color: NAVY }
const addBtnStyle = { background: NAVY, border: 'none', borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const ghostBtnStyle = { background: 'transparent', border: `1px solid ${NAVY}`, borderRadius: 6, padding: '5px 12px', color: NAVY, fontSize: 11, fontWeight: 600, cursor: 'pointer' }

// ─── WEEKLY RHYTHM ──────────────────────────────────────────────────────────
const RHYTHM_DAYS = [
  { day: 'Monday', tag: 'Admin & Outreach', color: '#fef3e2', tagColor: '#b7770d', items: ['No meetings — protect this block', 'Weekly plan set from last Friday\'s review', 'Annual-review cadence: send initial review emails to 2–3 clients', 'Direct Sales: research 4–6 target businesses for the month'] },
  { day: 'Tuesday', tag: 'Meetings', color: '#eef1f5', tagColor: NAVY, items: ['Client / referrer meetings', 'Gold & Silver referral touchpoints', 'Deal strategy & structuring calls'] },
  { day: 'Wednesday', tag: 'Meetings', color: '#eef1f5', tagColor: NAVY, items: ['Client / referrer meetings', 'Annual-review cadence: send comparison / outcome email', 'Mid-week pipeline check'] },
  { day: 'Thursday', tag: 'Meetings', color: '#eef1f5', tagColor: NAVY, items: ['Client / referrer meetings', 'Direct Sales: client review conversations from the back book'] },
  { day: 'Friday', tag: 'Admin & Follow-up', color: '#fef3e2', tagColor: '#b7770d', items: ['No meetings — protect this block', 'Annual-review cadence: follow-up call if no response', 'Weekly review: what worked, what to adjust', 'Set next week\'s plan before you leave'] },
]

function RhythmStrip({ compact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
      {RHYTHM_DAYS.map(d => (
        <div key={d.day} style={{ background: d.color, borderRadius: 8, padding: compact ? '8px 10px' : '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DEEP }}>{d.day}</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: d.tagColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.tag}</div>
        </div>
      ))}
    </div>
  )
}

function RhythmTab() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: 'Georgia,serif', marginBottom: 4 }}>Weekly Rhythm</div>
        <div style={{ fontSize: 12, color: SLATE, maxWidth: 720 }}>
          A reference playbook for how the week should run. Protect Monday and Friday as meeting-free days for admin,
          outreach and follow-up; use Tuesday–Thursday for client and referrer meetings. This mirrors standard
          time-blocking practice used across sales and broking teams: reserve fixed blocks for high-value activity,
          treat them as non-negotiable, and run a short weekly review to reset the plan.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {RHYTHM_DAYS.map(d => (
          <div key={d.day} style={{ background: '#fff', border: '1px solid #e2e6ed', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: DEEP, marginBottom: 4 }}>{d.day}</div>
            <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, color: d.tagColor, background: d.color, borderRadius: 20, padding: '2px 8px', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.tag}</span>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#4a5568', lineHeight: 1.6 }}>
              {d.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="Annual review cadence">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CadenceStep day="Monday" label="Initial email" desc="Send the review kick-off email to 2–3 clients due for their annual review." />
            <CadenceStep day="Wednesday" label="Outcome email" desc="Send the comparison / outcome email with the strategy and any refinance options." />
            <CadenceStep day="Friday" label="Follow-up call" desc="Call anyone who hasn't responded to the Wednesday email." />
          </div>
        </SectionCard>
        <SectionCard title="Referral touch cadence (Pillar A)">
          <div style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.8 }}>
            <div><b style={{ color: PINK }}>Gold</b> — monthly touchpoint, quarterly strategy discussion</div>
            <div><b style={{ color: NAVY }}>Silver</b> — bi-monthly touchpoint (every 6–8 weeks), semi-annual review</div>
            <div><b style={{ color: SLATE }}>Bronze</b> — quarterly touchpoint, light-touch content</div>
            <div><b>Contenders</b> — event-based, no fixed cadence</div>
            <div style={{ marginTop: 8, fontSize: 10, color: SLATE }}>Target: 10 relationship-building calls and 2–4 meetings per week, weighted toward Gold and Silver.</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Best-practice notes" style={{ marginTop: 16 }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#4a5568', lineHeight: 1.9 }}>
          <li>Plan the week in a fixed weekly session (Friday afternoon or Monday morning) and protect it as a non-negotiable appointment.</li>
          <li>Time-block the week rather than the day — assign Tue/Wed/Thu to meetings and keep Mon/Fri clear, then let the daily list sit inside that structure.</li>
          <li>Leave some slack in the week (not every hour scheduled) so a hot lead or urgent client issue doesn't blow up the whole plan.</li>
          <li>Track leading indicators (meetings booked, calls made) weekly rather than waiting for month-end numbers — problems are cheaper to fix early.</li>
          <li>Run a short Friday review: what got done, what slipped, and why — then reset next week's plan from that, not from a blank page.</li>
        </ul>
      </SectionCard>
    </div>
  )
}

function CadenceStep({ day, label, desc }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 66, flexShrink: 0, fontSize: 11, fontWeight: 700, color: BRAND_PINK }}>{day}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{label}</div>
        <div style={{ fontSize: 11, color: SLATE }}>{desc}</div>
      </div>
    </div>
  )
}

// ─── ANALYSIS (monthly) ─────────────────────────────────────────────────────
function AnalysisTab({ store, onUpdateMonthNotes }) {
  const monthRows = useMemo(() => {
    const byMonth = {}
    Object.keys(store.weeks).sort().forEach(wk => {
      const week = { ...emptyWeek(wk), ...store.weeks[wk] }
      const key = monthKey(wk)
      if (!byMonth[key]) {
        byMonth[key] = {
          key, meetings: 0, byType: {}, lodgedTotal: 0, settledTotal: 0, lodgedCount: 0,
          lodgementCountTargetSum: 0, settlementTargetSum: 0,
          training: { Cardio: 0, Boxing: 0, Strength: 0, Recovery: 0 }, sessions: 0,
          startWeight: null, endWeight: null, weeksCount: 0,
        }
      }
      const m = byMonth[key]
      const s = weekStats(week)
      MEETING_TYPES.forEach(t => { m.byType[t] = (m.byType[t] || 0) + (s.byType[t] || 0) })
      m.meetings += s.meetings
      m.lodgedTotal += s.lodgedTotal
      m.settledTotal += s.settledTotal
      m.lodgedCount += s.lodgedCount
      m.lodgementCountTargetSum += Number(week.lodgementCountTarget) || 0
      m.settlementTargetSum += Number(week.settlementTarget) || 0
      m.weeksCount += 1
      const tr = trainingStats(week)
      TRAINING_CATS.forEach(c => { m.training[c] += tr.totals[c] || 0 })
      m.sessions += tr.sessions
      if (week.training.startWeight && m.startWeight === null) m.startWeight = Number(week.training.startWeight)
      if (week.training.endWeight) m.endWeight = Number(week.training.endWeight)
    })
    return Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key)).slice(-6)
  }, [store.weeks])

  if (!monthRows.length) return <EmptyRow text="No weeks recorded yet." />

  const maxLodged = Math.max(1, ...monthRows.map(r => r.lodgedTotal))
  const maxSettled = Math.max(1, ...monthRows.map(r => r.settledTotal))
  const maxSessions = Math.max(1, ...monthRows.map(r => r.sessions))
  const avgMeetingsPerWeek = (monthRows.reduce((s, r) => s + r.meetings, 0) / monthRows.reduce((s, r) => s + r.weeksCount, 0)).toFixed(1)
  const totalSettled = monthRows.reduce((s, r) => s + r.settledTotal, 0)
  const monthsWithLodgeTarget = monthRows.filter(r => r.lodgementCountTargetSum > 0)
  const lodgeAchievementPct = monthsWithLodgeTarget.length
    ? Math.round(monthsWithLodgeTarget.reduce((s, r) => s + Math.min(1, r.lodgedCount / r.lodgementCountTargetSum), 0) / monthsWithLodgeTarget.length * 100)
    : null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: 'Georgia,serif', marginBottom: 4 }}>Performance Analysis</div>
        <div style={{ fontSize: 12, color: SLATE }}>Grouped by calendar month — trailing {monthRows.length} month{monthRows.length === 1 ? '' : 's'}. Also useful as an onboarding view for Courtney or a future broker.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Avg meetings / week" value={avgMeetingsPerWeek} accent={NAVY} />
        <StatCard label="Total settled (trailing)" value={fmtMoney(totalSettled)} accent={PINK} />
        <StatCard label="Lodgement target achievement" value={lodgeAchievementPct === null ? '—' : `${lodgeAchievementPct}%`} accent={BRAND_PINK} />
      </div>

      <SectionCard title="Lodgements — count vs. target (4/week)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {monthRows.map(r => {
            const pct = r.lodgementCountTargetSum ? Math.min(100, Math.round(r.lodgedCount / r.lodgementCountTargetSum * 100)) : 0
            return (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 74, fontSize: 10, color: SLATE, flexShrink: 0 }}>{monthLabel(r.key)}</div>
                <div style={{ flex: 1, height: 14, background: '#f0f2f5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: PINK, borderRadius: 4 }} />
                </div>
                <div style={{ width: 90, fontSize: 11, color: NAVY, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{r.lodgedCount} / {r.lodgementCountTargetSum || '—'}</div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Lodgements ($) per month" style={{ marginTop: 16 }}>
        <MonthBarList rows={monthRows} valueKey="lodgedTotal" max={maxLodged} color={PINK} formatter={fmtMoney} />
      </SectionCard>
      <SectionCard title="Settlements ($) per month" style={{ marginTop: 16 }}>
        <MonthBarList rows={monthRows} valueKey="settledTotal" max={maxSettled} color={BRAND_PINK} formatter={fmtMoney} />
      </SectionCard>

      <SectionCard title="Training & fitness trend" style={{ marginTop: 16 }}>
        <MonthBarList rows={monthRows} valueKey="sessions" max={maxSessions} color={NAVY} formatter={v => `${v} sessions`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          {monthRows.map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: SLATE, flexWrap: 'wrap' }}>
              <div style={{ width: 74, flexShrink: 0, fontWeight: 600, color: NAVY }}>{monthLabel(r.key)}</div>
              {TRAINING_CATS.map(cat => <span key={cat}>{cat}: <b style={{ color: NAVY }}>{r.training[cat]}</b></span>)}
              <span>Weight: <b style={{ color: NAVY }}>{r.startWeight ?? '—'} → {r.endWeight ?? '—'}</b></span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Monthly comments" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {monthRows.slice().reverse().map(r => (
            <div key={r.key}>
              <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{monthLabel(r.key)}</div>
              <textarea
                defaultValue={(store.monthNotes && store.monthNotes[r.key]) || ''}
                onBlur={e => onUpdateMonthNotes(r.key, e.target.value)}
                rows={2}
                placeholder="What went well, what to change next month..."
                style={{ ...inp(), width: '100%', resize: 'vertical', fontFamily: "'Montserrat',sans-serif" }}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e6ed', borderTop: `3px solid ${accent}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: SLATE, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{value}</div>
    </div>
  )
}

function MonthBarList({ rows, valueKey, max, color, formatter }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => {
        const v = r[valueKey]
        const pct = Math.max(2, Math.round(v / max * 100))
        return (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 74, fontSize: 10, color: SLATE, flexShrink: 0 }}>{monthLabel(r.key)}</div>
            <div style={{ flex: 1, height: 14, background: '#f0f2f5', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
            </div>
            <div style={{ width: 90, fontSize: 11, color: NAVY, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{formatter(v)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── HISTORY ────────────────────────────────────────────────────────────────
function HistoryTab({ store, onOpen, onDelete }) {
  const rows = useMemo(() => {
    return Object.keys(store.weeks).sort().reverse().map(k => ({ weekStart: k, ...weekStats({ ...emptyWeek(k), ...store.weeks[k] }), week: { ...emptyWeek(k), ...store.weeks[k] } }))
  }, [store.weeks])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: 'Georgia,serif', marginBottom: 4 }}>History</div>
        <div style={{ fontSize: 12, color: SLATE }}>Every week you've planned is kept here — open one to review or re-open it, or start a fresh week from This Week.</div>
      </div>
      {rows.length === 0 && <EmptyRow text="No weeks recorded yet." />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.weekStart} style={{ background: '#fff', border: '1px solid #e2e6ed', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{fmtRange(r.weekStart)}</div>
              {r.week.notes && <div style={{ fontSize: 10, color: SLATE, fontStyle: 'italic', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.week.notes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 11, color: SLATE, flex: 1 }}>
              <span>Meetings: <b style={{ color: NAVY }}>{r.meetings}</b></span>
              <span>Lodged: <b style={{ color: NAVY }}>{r.lodgedCount} / {r.week.lodgementCountTarget || 0}</b></span>
              <span>Settled: <b style={{ color: NAVY }}>{fmtMoney(r.settledTotal)}</b></span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onOpen(r.weekStart)} style={ghostBtnStyle}>Open</button>
              <button onClick={() => onDelete(r.weekStart)} style={{ ...ghostBtnStyle, border: '1px solid #c0392b', color: '#c0392b' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
