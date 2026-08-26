// Exports a client-level "email sent" note (Contact Notes & History panel,
// ClientDashboard.jsx) to PDF — a visual snapshot of the actual email HTML
// that was sent, not just the plain-text file-note style used for deal-level
// notes (see fileNotePdf.js, which is a different, unrelated system).
//
// Renders the stored HTML and rasterizes it via jsPDF's .html() method
// (which itself lazy-loads html2canvas at runtime).
//
// IMPORTANT: the render container must be positioned ON-SCREEN (fixed,
// top:0/left:0) for html2canvas to capture it correctly — an earlier version
// of this positioned it off-screen (left:-10000px) to hide it, which
// produced a silently blank PDF (html2canvas's cloned-document capture
// doesn't reliably paint content placed far outside the viewport). We hide
// it from the user instead with an opaque cover div at a higher z-index —
// that has no effect on the capture since html2canvas clones and repaints
// the target node from its own computed styles rather than screenshotting
// the composited page.
import jsPDF from 'jspdf'

function safeFilename(s) {
  return (s || 'email').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'email'
}

const RENDER_WIDTH = 600 // matches the 600px-wide email templates

export async function downloadEmailNotePdf(note, clientName) {
  if (!note?.html) throw new Error('No email content stored on this note')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.width = `${RENDER_WIDTH}px`
  container.style.background = '#ffffff'
  container.style.zIndex = '2147483646'
  container.innerHTML = note.html
  document.body.appendChild(container)

  // Opaque cover so the user doesn't see the raw render flash on screen
  // while html2canvas does its work — purely cosmetic, doesn't affect capture.
  const cover = document.createElement('div')
  cover.style.position = 'fixed'
  cover.style.inset = '0'
  cover.style.background = '#f1f5f9'
  cover.style.zIndex = '2147483647'
  cover.style.display = 'flex'
  cover.style.alignItems = 'center'
  cover.style.justifyContent = 'center'
  cover.style.fontFamily = 'Helvetica, Arial, sans-serif'
  cover.style.fontSize = '13px'
  cover.style.color = '#3D4F6B'
  cover.textContent = 'Generating PDF…'
  document.body.appendChild(cover)

  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 24
    await new Promise((resolve, reject) => {
      try {
        doc.html(container, {
          x: margin,
          y: margin,
          width: pageWidth - margin * 2,
          windowWidth: RENDER_WIDTH,
          autoPaging: 'text',
          html2canvas: { scale: (pageWidth - margin * 2) / RENDER_WIDTH, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
          callback: () => resolve(),
        })
      } catch (err) {
        reject(err)
      }
    })
    const label = note.subject || clientName || 'email'
    doc.save(`${safeFilename(label)}.pdf`)
  } finally {
    document.body.removeChild(container)
    document.body.removeChild(cover)
  }
}
