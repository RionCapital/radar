// Exports a client-level "email sent" note (Contact Notes & History panel,
// ClientDashboard.jsx) to PDF — a visual snapshot of the actual email HTML
// that was sent, not just the plain-text file-note style used for deal-level
// notes (see fileNotePdf.js, which is a different, unrelated system).
//
// Renders the stored HTML off-screen and rasterizes it via jsPDF's .html()
// method (which itself lazy-loads html2canvas at runtime).
import jsPDF from 'jspdf'

function safeFilename(s) {
  return (s || 'email').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'email'
}

const RENDER_WIDTH = 600 // matches the 600px-wide email templates

export async function downloadEmailNotePdf(note, clientName) {
  if (!note?.html) throw new Error('No email content stored on this note')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = `${RENDER_WIDTH}px`
  container.style.background = '#ffffff'
  container.innerHTML = note.html
  document.body.appendChild(container)

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
          html2canvas: { scale: (pageWidth - margin * 2) / RENDER_WIDTH, useCORS: true, backgroundColor: '#ffffff' },
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
  }
}
