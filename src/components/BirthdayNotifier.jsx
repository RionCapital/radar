import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'rion-radar-bday-sent'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getSentKeys() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) } catch { return new Set() }
}
function saveSentKeys(keys) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys])) } catch {}
}

function getBirthdayKey(contact, clientName) {
  // Key includes current year so it resets annually
  const year = new Date().getFullYear()
  return `${clientName}-${contact.first}-${contact.last}-${year}`
}

function parseDOB(dob) {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d)) return null
  return d
}

function getDaysUntilBirthday(dob) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const d = parseDOB(dob)
  if (!d) return null
  const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((thisYear - today) / 86400000)
  // If birthday already passed this year, check if it was within last 7 days (missed)
  if (diff < -7) return null // too far in the past
  if (diff < 0) return diff  // negative = missed (within last 7 days)
  if (diff > 7) return null  // too far in future
  return diff // 0-7 = upcoming
}

function fmtBirthdayDate(dob) {
  const d = parseDOB(dob)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function buildSMSMessage(firstName) {
  return `Happy Birthday ${firstName}! 🎂 Hope you have a wonderful day. Warm regards, Cameron`
}

export function useBirthdayCount(clients) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const sentKeys = getSentKeys()
    let n = 0
    clients.forEach(c => {
      (c.contacts || []).forEach(contact => {
        if (contact.type !== 'Ind' || !contact.first || !contact.dob) return
        const days = getDaysUntilBirthday(contact.dob)
        if (days === null) return
        const key = getBirthdayKey(contact, c.name)
        if (!sentKeys.has(key)) n++
      })
    })
    setCount(n)
  }, [clients])
  return count
}

export default function BirthdayNotifier({ clients, onClose }) {
  const [sentKeys, setSentKeys] = useState(() => getSentKeys())
  const [dismissed, setDismissed] = useState(false)

  // Build list of upcoming/missed birthdays
  const birthdays = []
  clients.forEach(c => {
    (c.contacts || []).forEach(contact => {
      if (contact.type !== 'Ind' || !contact.first || !contact.dob) return
      const days = getDaysUntilBirthday(contact.dob)
      if (days === null) return
      const key = getBirthdayKey(contact, c.name)
      if (sentKeys.has(key)) return
      birthdays.push({
        key,
        clientName: c.name,
        firstName: contact.first,
        lastName: contact.last,
        dob: contact.dob,
        days,
        mobile: contact.mobile || '',
      })
    })
  })

  // Sort: missed first (negative days), then soonest upcoming
  birthdays.sort((a, b) => a.days - b.days)

  function handleSend(bday) {
    const next = new Set(sentKeys)
    next.add(bday.key)
    setSentKeys(next)
    saveSentKeys(next)
    // Open SMS via phone link
    const msg = encodeURIComponent(buildSMSMessage(bday.firstName))
    const num = bday.mobile.replace(/\s/g, '')
    if (num) {
      window.open(`sms:${num}?body=${msg}`, '_blank')
    }
  }

  function handleDismiss() {
    setDismissed(true)
    if (onClose) onClose()
  }

  if (dismissed || birthdays.length === 0) return null

  const missed = birthdays.filter(b => b.days < 0)
  const upcoming = birthdays.filter(b => b.days >= 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: 420, maxWidth: '92vw',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 48px rgba(0,0,0,0.18)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ background: '#3D4F6B', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎂</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Birthday Notifications</div>
              <div style={{ fontSize: 11, color: '#9ab0c8', marginTop: 1 }}>
                {birthdays.length} contact{birthdays.length !== 1 ? 's' : ''} — {missed.length > 0 ? `${missed.length} missed · ` : ''}{upcoming.length} upcoming
              </div>
            </div>
          </div>
          <button onClick={handleDismiss} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#9ab0c8', fontSize: 11, cursor: 'pointer' }}>
            Remind me later
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 0' }}>

          {/* Missed */}
          {missed.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#a32d2d', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 20px 8px' }}>
                Missed birthdays
              </div>
              {missed.map(b => (
                <BirthdayRow key={b.key} bday={b} onSend={handleSend} />
              ))}
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div style={{ marginTop: missed.length > 0 ? 8 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#3D4F6B', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 20px 8px' }}>
                Upcoming — next 7 days
              </div>
              {upcoming.map(b => (
                <BirthdayRow key={b.key} bday={b} onSend={handleSend} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '0.5px solid #e8eaed', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleDismiss} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #e8eaed',
            background: '#fff', color: '#4a5568', fontSize: 12, cursor: 'pointer', fontWeight: 500
          }}>
            Close — remind me later
          </button>
        </div>
      </div>
    </div>
  )
}

function BirthdayRow({ bday, onSend }) {
  const [msg, setMsg] = useState(buildSMSMessage(bday.firstName))
  const [expanded, setExpanded] = useState(false)

  const isMissed = bday.days < 0
  const dayLabel = bday.days === 0 ? 'Today! 🎉' : bday.days < 0 ? `${Math.abs(bday.days)}d ago` : bday.days === 1 ? 'Tomorrow' : `In ${bday.days} days`

  return (
    <div style={{ padding: '10px 20px', borderBottom: '0.5px solid #f4f5f7' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: isMissed ? '#fde8e8' : '#fdf0f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: isMissed ? '#a32d2d' : '#EB99C2', flexShrink: 0 }}>
          {bday.firstName[0]}
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2A3545' }}>{bday.firstName} {bday.lastName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: '#7A8090' }}>{fmtBirthdayDate(bday.dob)}</span>
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 500, background: isMissed ? '#fde8e8' : bday.days === 0 ? '#fdf0f6' : '#eef6ff', color: isMissed ? '#a32d2d' : bday.days === 0 ? '#EB99C2' : '#185fa5' }}>
              {dayLabel}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#7A8090', marginTop: 1 }}>{bday.clientName}</div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setExpanded(e => !e)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e8eaed', background: '#fff', fontSize: 11, color: '#7A8090', cursor: 'pointer' }}>
            {expanded ? 'Hide' : 'Edit msg'}
          </button>
          <button onClick={() => onSend({ ...bday, mobile: bday.mobile })} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#EB99C2', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            💬 Send
          </button>
        </div>
      </div>
      {/* Editable message */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            rows={3}
            style={{ width: '100%', border: '1px solid #e8eaed', borderRadius: 7, padding: '8px 10px', fontSize: 12, lineHeight: 1.5, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#2A3545' }}
          />
          <button onClick={() => {
            const num = bday.mobile.replace(/\s/g,'')
            if (num) window.open(`sms:${num}?body=${encodeURIComponent(msg)}`, '_blank')
            onSend(bday)
          }} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3D4F6B', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            💬 Send edited message
          </button>
        </div>
      )}
    </div>
  )
}
