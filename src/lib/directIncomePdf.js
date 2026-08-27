// Tax invoice PDF generator for Direct Income — shared by the invoice list
// (History tab) and the invoice detail page, so there's exactly one place
// that draws an invoice rather than two copies drifting apart. Renders one
// table row per line item (via invoiceItems()), so it works unchanged for
// both legacy single-line entries and new multi-line invoices.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadSettings } from './settings'
import { RION_LOGO_PNG } from './logoBase64'
import { taxRateFraction, invoiceItems, invoiceTotals } from './directIncome'

const NAVY_RGB = [61, 79, 107]
const PINK_RGB = [235, 153, 194]

export function fmt2(n) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
export function fmtDateAU(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Built from Settings > Business Details (Company details) so invoices
// always reflect the current company info without needing a code change —
// falls back to sensible defaults if Settings hasn't been touched yet.
export function loadIssuer() {
  const s = loadSettings()
  const c = s.companyDetails || {}
  return {
    name: c.fullCompanyName || 'Rion Capital Investments Pty Ltd',
    abn: c.abn || '76 641 258 040',
    addressLine1: c.address || '201/90 Podium Way, ORAN PARK NSW 2570, AUSTRALIA',
    addressLine2: '',
    country: '',
    bankName: c.bankName || 'Rion Capital Investments Pty Ltd',
    bsb: c.bsb || '062 - 656',
    account: c.accountNumber || '1049 3213',
  }
}

// Splits a single address string into "Number Street" / "Suburb State
// Postcode", and separates out the country if there is one — dropping it
// entirely when it's Australia, since that's the default and doesn't need
// stating. Assumes the common "Street, Suburb State Postcode[, Country]"
// pattern; addresses that don't follow it just fall back to one line
// rather than guessing wrong.
export function formatAddressLines(raw) {
  if (!raw) return { line1: '', line2: '', country: '' }
  let parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  let country = ''
  if (parts.length > 1 && /^australia$/i.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1)
  } else if (parts.length > 2 && !/^australia$/i.test(parts[parts.length - 1])) {
    country = parts[parts.length - 1]
    parts = parts.slice(0, -1)
  }
  if (parts.length <= 1) return { line1: parts[0] || '', line2: '', country }
  const line2 = parts[parts.length - 1]
  const line1 = parts.slice(0, -1).join(', ')
  return { line1, line2, country }
}

// suppliers — the combined Marketing contact list (referrers/lenders/others),
// used to look up the "bill to" legal name/address/ABN for whoever the
// invoice's supplierName matches, same as before this file existed.
export function downloadTaxInvoicePdf(entry, suppliers) {
  const issuer = loadIssuer()
  const supplier = (suppliers || []).find(s => s.name === entry.supplierName)
  const billToName = supplier?.company || entry.supplierName || '—'
  const supplierAddr = formatAddressLines(supplier?.address)
  const issuerAddr = formatAddressLines(issuer.addressLine1)
  const items = invoiceItems(entry)
  const { amount: subtotal, taxAmount, total } = invoiceTotals(entry)

  const doc = new jsPDF()
  const rightMargin = 195

  let y = 20
  const logoW = 92, logoH = 37.4
  try { doc.addImage(RION_LOGO_PNG, 'PNG', rightMargin - logoW, 12, logoW, logoH) } catch {}

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NAVY_RGB)
  doc.text('TAX INVOICE', 14, y); y += 10

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40)
  doc.text(billToName, 14, y); y += 5
  if (supplierAddr.line1) { doc.text(supplierAddr.line1, 14, y); y += 5 }
  if (supplierAddr.line2) { doc.text(supplierAddr.line2, 14, y); y += 5 }
  if (supplierAddr.country) { doc.text(supplierAddr.country, 14, y); y += 5 }
  if (supplier?.abn) { doc.text(`ABN ${supplier.abn}`, 14, y); y += 5 }

  let my = 58
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY_RGB)
  doc.text('Invoice Date', 95, my)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
  doc.text(fmtDateAU(entry.issueDate), 95, my + 5); my += 12
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
  doc.text('Invoice Number', 95, my)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
  doc.text(entry.invoiceNumber || '—', 95, my + 5); my += 12
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
  doc.text('ABN', 95, my)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
  doc.text(issuer.abn, 95, my + 5)

  let iy = 58
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40)
  doc.text(issuer.name, 140, iy); iy += 4.5
  doc.text(`ABN ${issuer.abn}`, 140, iy); iy += 4.5
  if (issuerAddr.line1) { doc.text(issuerAddr.line1, 140, iy); iy += 4.5 }
  if (issuerAddr.line2) { doc.text(issuerAddr.line2, 140, iy); iy += 4.5 }
  if (issuerAddr.country) { doc.text(issuerAddr.country, 140, iy) }

  y = Math.max(y, my, iy) + 14

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Quantity', 'Unit Price', 'GST', 'Amount AUD']],
    body: items.map(it => {
      const taxPct = Math.round(taxRateFraction(it.taxRate) * 100)
      return [
        `${it.item || ''}${it.description ? ' - ' + it.description : ''}`,
        Number(it.qty || 0).toFixed(2), `${fmt2(it.price)}`, `${taxPct}%`, fmt2(it.amount),
      ]
    }),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: NAVY_RGB, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  })

  let ty = doc.lastAutoTable.finalY + 8
  const overallTaxPct = subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0
  doc.setFontSize(9.5); doc.setTextColor(60)
  doc.text('Subtotal', 150, ty); doc.text(fmt2(subtotal), rightMargin, ty, { align: 'right' }); ty += 6
  doc.text(`TOTAL  GST  ${overallTaxPct}%`, 150, ty); doc.text(fmt2(taxAmount), rightMargin, ty, { align: 'right' }); ty += 3
  doc.setDrawColor(...NAVY_RGB); doc.line(140, ty, rightMargin, ty); ty += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY_RGB)
  doc.text('TOTAL AUD', 150, ty); doc.text(fmt2(total), rightMargin, ty, { align: 'right' })
  ty += 14

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40)
  doc.text(`Due Date: ${fmtDateAU(entry.dueDate)}`, 14, ty); ty += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`NAME: ${issuer.bankName}`, 14, ty); ty += 4.5
  doc.text(`BSB: ${issuer.bsb}`, 14, ty); ty += 4.5
  doc.text(`Account: ${issuer.account}`, 14, ty)

  // Perforated cut line + Payment Advice tear-off
  let cy = Math.max(230, ty + 20)
  doc.setDrawColor(...PINK_RGB); doc.setLineDashPattern([2, 2], 0)
  doc.line(14, cy, rightMargin, cy)
  doc.setLineDashPattern([], 0)
  cy += 12

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY_RGB)
  doc.text('PAYMENT ADVICE', 14, cy)
  let ay = cy + 10
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40)
  doc.text('To:', 14, ay)
  doc.text(issuer.name, 30, ay); ay += 4.5
  doc.text(`ABN ${issuer.abn}`, 30, ay); ay += 4.5
  if (issuerAddr.line1) { doc.text(issuerAddr.line1, 30, ay); ay += 4.5 }
  if (issuerAddr.line2) { doc.text(issuerAddr.line2, 30, ay); ay += 4.5 }
  if (issuerAddr.country) { doc.text(issuerAddr.country, 30, ay) }

  let py = cy + 10
  const rows = [
    ['Customer', billToName],
    ['Invoice Number', entry.invoiceNumber || '—'],
    ['Amount Due', fmt2(total)],
    ['Due Date', fmtDateAU(entry.dueDate)],
  ]
  rows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
    doc.text(label, 120, py)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
    doc.text(String(val), 195, py, { align: 'right' })
    py += 6
  })
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY_RGB)
  doc.text('Amount Enclosed', 120, py); py += 5
  doc.setDrawColor(180); doc.line(120, py, 195, py); py += 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
  doc.text('Enter the amount you are paying above', 120, py)

  doc.save(`${entry.invoiceNumber || 'invoice'}.pdf`)
}
