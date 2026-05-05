import React from 'react'

export default function Toast({ message }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed', top: 64, right: 20, zIndex: 9999,
      background: '#27ae60', color: '#fff',
      padding: '8px 18px', borderRadius: 8,
      fontSize: 12, fontWeight: 500,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      animation: 'fadeIn 0.2s ease',
    }}>
      {message}
    </div>
  )
}
