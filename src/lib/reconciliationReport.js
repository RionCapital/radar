import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Computes the diff data for a single statement reconciliation. Pure — takes
// the clients state as it stood BEFORE this import is applied, plus the
// pending review data and the allocations the broker just confirmed.
//
// "Possibly discharged" detection: rather than comparing against every
// account in the current statement (which would false-flag any loan that
// simply isn't covered by this particular aggregator/lender export), this
// only flags a loan if it had a commission entry LAST month but has none
// this month — i.e. it was actively being paid through this exact
// statement source and then suddenly stopped. That's a much stronger signal
// and avoids flagging loans that were never part of this statement to
// begin with.
export function computeReconciliationData({ clients, pending, allocations, month }) {
  const stmtMap = pending?.stmtMap || {}

  const newDeals = allocations
    .filter(a => a.mode === 'new')
    .map(a => ({ client: a.clientName, acc: a.newLoan.acc, lender: a.newLoan.bank, amount: a.newLoan.balance }))

  const merged = allocations
    .filter(a => typeof a.mode === 'string' && a.mode.startsWith('merge-'))
    .map(a => {
      const targetIdx = parseInt(a.mode.slice('merge-'.length), 10)
      const client = clients.find(c => c.name === a.clientName)
      const targetLoan = client?.loans?.[targetIdx]
      return { client: a.clientName, loanName: targetLoan?.lname || '—', acc: a.newLoan.acc, balance: a.newLoan.balance }
    })

  const dischargedMerges = allocations
    .filter(a => typeof a.mode === 'number')
    .map(a => {
      const client = clients.find(c => c.name === a.clientName)
      const oldLoan = client?.loans?.[a.mode]
      return { client: a.clientName, oldAcc: oldLoan?.acc || '—', newAcc: a.newLoan.acc, balance: a.newLoan.balance }
    })

  const [y, m] = month.split('-').map(Number)
  const prevDate = new Date(y, m - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const dischargedAccNumbers = new Set(dischargedMerges.map(d => d.oldAcc))

  const possiblyDischarged = []
  const majorMovements = []
  clients.forEach(c => {
    c.loans.forEach(l => {
      const acc = String(l.acc || '').trim()
      if (!acc) return
      const hist = l.commissionHistory || []
      const found = stmtMap[acc]

      if (!l.closed) {
        const hadPrev = hist.some(h => h.month === prevMonth)
        if (hadPrev && !found) {
          possiblyDischarged.push({ client: c.name, acc, lname: l.lname, balance: l.balance, lastSeen: prevMonth })
        }
      }

      if (found && found.bal != null && !dischargedAccNumbers.has(acc)) {
        const oldBal = l.balance || 0
        const newBal = found.bal
        if (oldBal > 0) {
          const pctChange = (newBal - oldBal) / oldBal
          if (Math.abs(pctChange) > 0.10) {
            majorMovements.push({ client: c.name, acc, lname: l.lname, oldBal, newBal, pctChange })
          }
        }
      }
    })
  })

  const summary = {
    month,
    newDealsCount: newDeals.length,
    newDealsVolume: newDeals.reduce((s, d) => s + (d.amount || 0), 0),
    mergedCount: merged.length,
    dischargedCount: dischargedMerges.length,
    possiblyDischargedCount: possiblyDischarged.length,
    majorMovementsCount: majorMovements.length,
  }

  return { summary, newDeals, merged, dischargedMerges, possiblyDischarged, majorMovements }
}

export function downloadReconciliationReport(data) {
  const doc = new jsPDF()
  const NAVY = [61, 79, 107]
  const fmtD = v => `$${Math.round(v || 0).toLocaleString()}`
  let y = 18

  doc.setFontSize(16); doc.setTextColor(...NAVY)
  doc.text('Rion Capital — Reconciliation & Monthly Analysis', 14, y); y += 8
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(`Statement month: ${data.summary.month}  ·  Generated: ${new Date().toLocaleDateString('en-AU')}`, 14, y); y += 10

  doc.setFontSize(11); doc.setTextColor(...NAVY)
  doc.text('Summary', 14, y); y += 4
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['New deals', `${data.summary.newDealsCount} (${fmtD(data.summary.newDealsVolume)})`],
      ['Merged — CRM deal linked to bank account', String(data.summary.mergedCount)],
      ['Discharged (merged during this reconciliation)', String(data.summary.dischargedCount)],
      ['Possibly discharged — not seen this statement', String(data.summary.possiblyDischargedCount)],
      ['Major balance movements (>10%)', String(data.summary.majorMovementsCount)],
    ],
    theme: 'plain',
    styles: { fontSize: 9 },
  })
  y = doc.lastAutoTable.finalY + 10

  function section(title, rows, columns, warn) {
    if (!rows.length) return
    if (y > 250) { doc.addPage(); y = 18 }
    doc.setFontSize(11); doc.setTextColor(...(warn ? [180, 60, 30] : NAVY))
    doc.text(title, 14, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [columns.map(c => c.header)],
      body: rows.map(r => columns.map(c => c.get(r))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: warn ? [180, 60, 30] : NAVY },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  section('New Deals', data.newDeals, [
    { header: 'Client', get: r => r.client },
    { header: 'Account', get: r => r.acc },
    { header: 'Lender', get: r => r.lender || '—' },
    { header: 'Amount', get: r => fmtD(r.amount) },
  ])

  section('Merged — CRM Deal Linked to Bank Account', data.merged, [
    { header: 'Client', get: r => r.client },
    { header: 'Loan', get: r => r.loanName },
    { header: 'Account (from bank)', get: r => r.acc },
    { header: 'Balance', get: r => fmtD(r.balance) },
  ])

  section('Discharged Loans (merged this reconciliation)', data.dischargedMerges, [
    { header: 'Client', get: r => r.client },
    { header: 'Old Account', get: r => r.oldAcc },
    { header: 'New Account', get: r => r.newAcc },
    { header: 'New Balance', get: r => fmtD(r.balance) },
  ])

  section('⚠ Possibly Discharged — Not Seen This Statement', data.possiblyDischarged, [
    { header: 'Client', get: r => r.client },
    { header: 'Account', get: r => r.acc },
    { header: 'Loan', get: r => r.lname || '—' },
    { header: 'Last Balance', get: r => fmtD(r.balance) },
    { header: 'Last Seen', get: r => r.lastSeen },
  ], true)

  section('Major Balance Movements (>10%)', data.majorMovements, [
    { header: 'Client', get: r => r.client },
    { header: 'Account', get: r => r.acc },
    { header: 'Prior Balance', get: r => fmtD(r.oldBal) },
    { header: 'New Balance', get: r => fmtD(r.newBal) },
    { header: 'Change', get: r => `${r.pctChange >= 0 ? '+' : ''}${(r.pctChange * 100).toFixed(1)}%` },
  ])

  if (!data.newDeals.length && !data.merged.length && !data.dischargedMerges.length && !data.possiblyDischarged.length && !data.majorMovements.length) {
    doc.setFontSize(10); doc.setTextColor(120)
    doc.text('No new deals, discharges, or major movements detected this month.', 14, y)
  }

  doc.save(`Rion-Capital-Reconciliation-${data.summary.month}.pdf`)
}
