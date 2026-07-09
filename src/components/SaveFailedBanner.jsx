import React from 'react'

// Deliberately different from the quick, quiet Toast — a failed save is
// serious enough that it shouldn't just fade away after a couple of
// seconds. Sits pinned to the top of the screen until dismissed, so it's
// hard to miss and doesn't get buried by whatever else is on screen.
export default function SaveFailedBanner({ failure, onDismiss }) {
  if (!failure) return null
  const what = failure.kind === 'deals' ? 'a deal' : failure.kind === 'clients' ? 'a client record' : 'your change'
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
      background: '#dc2626', color: '#fff', padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      fontSize: 13, fontWeight: 500, boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      flexWrap: 'wrap', textAlign: 'center',
    }}>
      <span>
        ⚠️ A save didn't reach the server — {what} may only be saved on this device right now. Check your internet connection and try that change again before closing this tab.
      </span>
      <button onClick={onDismiss} style={{
        background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
        borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
      }}>Dismiss</button>
    </div>
  )
}
