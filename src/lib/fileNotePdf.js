// Exports a deal's file notes (Notes tab, DealPage.jsx) to PDF — either a
// single note or the whole list — so a broker can save/print a record of
// what was actually sent to a client (e.g. a Document Request email) rather
// than only being able to view it inside the app.
import jsPDF from 'jspdf'

const MARGIN = 40
const LINE_HEIGHT = 13

function newDoc(title) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text(title, MARGIN, MARGIN)
  return { doc, pageWidth, pageHeight, y: MARGIN + 26 }
}

function ensureRoom(ctx, needed) {
  if (ctx.y + needed > ctx.pageHeight - MARGIN) {
    ctx.doc.addPage()
    ctx.y = MARGIN
  }
}

function writeNote(ctx, note) {
  const maxWidth = ctx.pageWidth - MARGIN * 2

  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(11)
  ctx.doc.setTextColor(20, 20, 20)
  const titleLines = ctx.doc.splitTextToSize(note.title || 'Untitled note', maxWidth)
  ensureRoom(ctx, titleLines.length * LINE_HEIGHT)
  ctx.doc.text(titleLines, MARGIN, ctx.y)
  ctx.y += titleLines.length * LINE_HEIGHT + 2

  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(9)
  ctx.doc.setTextColor(120, 120, 120)
  ensureRoom(ctx, LINE_HEIGHT)
  ctx.doc.text(`${note.date || ''} · ${note.type || ''} · ${note.user || ''}`, MARGIN, ctx.y)
  ctx.y += LINE_HEIGHT + 6

  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(10)
  ctx.doc.setTextColor(30, 30, 30)
  const bodyLines = ctx.doc.splitTextToSize(note.body || '', maxWidth)
  bodyLines.forEach(line => {
    ensureRoom(ctx, LINE_HEIGHT)
    ctx.doc.text(line, MARGIN, ctx.y)
    ctx.y += LINE_HEIGHT
  })
  ctx.y += 18
}

function safeFilename(s) {
  return (s || 'file-note').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file-note'
}

export function downloadFileNotePdf(note, dealName) {
  const ctx = newDoc(dealName || 'File Note')
  writeNote(ctx, note)
  ctx.doc.save(`${safeFilename(note.title)}.pdf`)
}

export function downloadFileNotesPdf(fileNotes, dealName) {
  const ctx = newDoc(`${dealName || 'Deal'} — File Notes`)
  fileNotes.forEach((note, i) => {
    writeNote(ctx, note)
    if (i < fileNotes.length - 1) {
      ctx.doc.setDrawColor(220, 220, 220)
      ctx.doc.line(MARGIN, ctx.y - 10, ctx.pageWidth - MARGIN, ctx.y - 10)
    }
  })
  ctx.doc.save(`${safeFilename(dealName)}-file-notes.pdf`)
}
