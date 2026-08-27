import { useState, useMemo, useRef, useEffect } from 'react'

const NAVY  = '#3D4F6B'
const PINK  = '#EB99C2'
const SLATE = '#7A8090'

// Fixed display order — matches Marketing's own section order.
const CATEGORY_ORDER = ['Clients', 'Referral Partners', 'Lenders', 'Others']
const CATEGORY_COLOURS = {
  Clients: '#8B5CF6', 'Referral Partners': '#D4A017', Lenders: '#3D4F6B', Others: SLATE,
}

// Free-text-capable payee input with a grouped dropdown of everyone in the
// Marketing tool (Clients / Referral Partners / Lenders / Others) — so
// Cameron can pick whoever an invoice is actually going to (a lender for a
// commission RCTI, a client for a mandate fee, etc.) instead of retyping a
// name every time. Typing something that isn't in the list is still fine —
// it just stays as free text, same as before this existed.
//
// Props:
//   value, onChange(name) — controlled text value
//   options — flat array of { name, category, company? } from loadPayeeOptions()
//   disabled, placeholder
export default function PayeePicker({ value, onChange, options = [], disabled, placeholder = 'Start typing…' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const grouped = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    const matches = q
      ? options.filter(o => o.name.toLowerCase().includes(q) || (o.company || '').toLowerCase().includes(q))
      : options
    const byCategory = {}
    matches.forEach(o => { (byCategory[o.category] = byCategory[o.category] || []).push(o) })
    return CATEGORY_ORDER
      .filter(cat => byCategory[cat]?.length)
      .map(cat => ({ category: cat, items: byCategory[cat].slice(0, 8) }))
  }, [options, value])

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0)
  const hasMore = totalShown < options.filter(o => {
    const q = (value || '').trim().toLowerCase()
    return !q || o.name.toLowerCase().includes(q) || (o.company || '').toLowerCase().includes(q)
  }).length

  function select(name) {
    onChange(name)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        disabled={disabled}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ border: '1px solid #e8eaed', borderRadius: 5, padding: '5px 7px', fontSize: 11, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
      {open && !disabled && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 3, width: 280, maxWidth: '80vw', background: '#fff', border: '1px solid #DDE3EC', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 50, maxHeight: 280, overflowY: 'auto' }}>
          {grouped.length === 0 && (
            <div style={{ padding: '12px', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
              No matches — you can still type a name and it'll be used as-is.
            </div>
          )}
          {grouped.map(g => (
            <div key={g.category}>
              <div style={{ padding: '6px 10px 3px', fontSize: 9.5, fontWeight: 700, color: CATEGORY_COLOURS[g.category] || SLATE, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9FAFB' }}>
                {g.category}
              </div>
              {g.items.map((o, i) => (
                <div key={`${g.category}-${o.name}-${i}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => select(o.name)}
                  style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F4F6FA' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: NAVY }}>{o.name}</span>
                  {o.company && o.company !== o.name && (
                    <span style={{ fontSize: 10, color: SLATE }}>{o.company}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {hasMore && (
            <div style={{ padding: '5px 10px', fontSize: 10, color: '#94a3b8', textAlign: 'center', borderTop: '1px solid #F0F4FA' }}>
              More matches — keep typing to narrow it down
            </div>
          )}
        </div>
      )}
    </div>
  )
}
