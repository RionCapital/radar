// Direct Income → accounting package export.
//
// Every package wants its own column names and its own tax codes, so each one
// is defined in ACCOUNTING_FORMATS below as a header list plus a row mapper.
// One CSV row per invoice LINE ITEM — that's how Xero, QuickBooks and MYOB all
// expect multi-line invoices: the invoice-level fields (number, contact,
// dates) repeat on every line, and the importer groups them by invoice number.
//
// Which format is used comes from Settings > Rradar > Accounting. Adding a
// package, or correcting a header an importer rejects, means editing one entry
// here and nothing else.
import { invoiceItems } from './directIncome'

export const ACCOUNTING_PACKAGES = ['Rion Standard', 'Xero', 'MYOB', 'QuickBooks', 'Reckon One', 'Sage']
export const DEFAULT_ACCOUNTING_PACKAGE = 'Xero'

// Our three tax rates, in each package's own vocabulary.
const TAX_CODES = {
  Xero:         { 'GST on Income': 'OUTPUT',   'GST Free': 'EXEMPTOUTPUT', 'BAS Excluded': 'BASEXCLUDED' },
  'Rion Standard': { 'GST on Income': 'OUTPUT', 'GST Free': 'EXEMPTOUTPUT', 'BAS Excluded': 'BASEXCLUDED' },
  MYOB:         { 'GST on Income': 'GST',      'GST Free': 'FRE',          'BAS Excluded': 'N-T' },
  QuickBooks:   { 'GST on Income': 'GST',      'GST Free': 'GST Free',     'BAS Excluded': 'Out of Scope' },
  'Reckon One': { 'GST on Income': 'GST',      'GST Free': 'FRE',          'BAS Excluded': 'NCG' },
  Sage:         { 'GST on Income': 'GST',      'GST Free': 'FRE',          'BAS Excluded': 'NT' },
}
const taxCode = (pkg, rate) => (TAX_CODES[pkg] || TAX_CODES.Xero)[rate] || ''

// Our account strings look like "002 - Upfront Business - Commission"; the
// importers want the code on its own.
function accountCode(account) {
  const m = /^\s*(\d+)\s*-/.exec(String(account || ''))
  return m ? m[1] : String(account || '')
}

const n2 = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2)
// dd/mm/yyyy — every one of these packages is being used on an Australian
// file, and an ISO date is the classic cause of a month/day flip on import.
function dmy(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(iso)
}
function plus14(iso) {
  if (!iso) return ''
  const dt = new Date(iso + 'T00:00:00')
  if (isNaN(dt)) return ''
  dt.setDate(dt.getDate() + 14)
  return dt.toISOString().slice(0, 10)
}

// Everything one line item needs, resolved once so each format mapper stays
// a plain field list.
function lineContext(entry, item, payees) {
  const payee = (payees || []).find(p => p.name === entry.supplierName) || {}
  const qty = Number(item.qty) || 1
  const amount = Number(item.amount) || 0
  const unit = qty ? amount / qty : amount
  return {
    contact: entry.supplierName || '',
    email: payee.email || '',
    company: payee.company || '',
    address: payee.address || '',
    invoiceNo: entry.invoiceNumber || '',
    reference: [entry.clientName, entry.dealName].filter(Boolean).join(' · '),
    issueDate: entry.issueDate || '',
    dueDate: entry.dueDate || plus14(entry.issueDate),
    description: item.description || item.item || '',
    qty, unit, amount,
    tax: Number(item.taxAmount) || 0,
    total: amount + (Number(item.taxAmount) || 0),
    account: accountCode(item.account),
    rate: item.taxRate || '',
  }
}

export const ACCOUNTING_FORMATS = {
  // Cameron's own Xero Sales Invoice template, column for column.
  Xero: {
    fileLabel: 'Xero',
    headers: ['*ContactName','EmailAddress','POAddressLine1','POAddressLine2','POAddressLine3','POAddressLine4','POCity','PORegion','POPostalCode','POCountry','*InvoiceNumber','Reference','*InvoiceDate','*DueDate','InventoryItemCode','*Description','*Quantity','*UnitAmount','Discount','*AccountCode','*TaxType','TrackingName1','TrackingOption1','TrackingName2','TrackingOption2','Currency','BrandingTheme'],
    row: (c, pkg) => [c.contact, c.email, c.address, '', '', '', '', '', '', '', c.invoiceNo, c.reference, dmy(c.issueDate), dmy(c.dueDate), '', c.description, c.qty, n2(c.unit), '', c.account, taxCode(pkg, c.rate), '', '', '', '', 'AUD', ''],
  },
  // Same layout as Xero — the in-house default when a package isn't set.
  'Rion Standard': {
    fileLabel: 'Rion_Standard',
    headers: ['*ContactName','EmailAddress','POAddressLine1','POAddressLine2','POAddressLine3','POAddressLine4','POCity','PORegion','POPostalCode','POCountry','*InvoiceNumber','Reference','*InvoiceDate','*DueDate','InventoryItemCode','*Description','*Quantity','*UnitAmount','Discount','*AccountCode','*TaxType','TrackingName1','TrackingOption1','TrackingName2','TrackingOption2','Currency','BrandingTheme'],
    row: (c, pkg) => [c.contact, c.email, c.address, '', '', '', '', '', '', '', c.invoiceNo, c.reference, dmy(c.issueDate), dmy(c.dueDate), '', c.description, c.qty, n2(c.unit), '', c.account, taxCode(pkg, c.rate), '', '', '', '', 'AUD', ''],
  },
  // QuickBooks Online's multi-invoice import template.
  QuickBooks: {
    fileLabel: 'QuickBooks',
    headers: ['*InvoiceNo','*Customer','*InvoiceDate','*DueDate','Terms','Location','Memo','Item(Product/Service)','ItemDescription','ItemQuantity','ItemRate','*ItemAmount','*ItemTaxCode','ItemTaxAmount','Currency'],
    row: (c, pkg) => [c.invoiceNo, c.contact, dmy(c.issueDate), dmy(c.dueDate), '', '', c.reference, '', c.description, c.qty, n2(c.unit), n2(c.amount), taxCode(pkg, c.rate), n2(c.tax), 'AUD'],
  },
  // MYOB's "Sales - Service" layout (service lines, not inventory items).
  MYOB: {
    fileLabel: 'MYOB',
    headers: ['Co./Last Name','First Name','Addr 1 - Line 1','Inv No.','Date','Customer PO','Description','Account #','Amount','Job','Comment','Journal Memo','Tax Code','Non-GST Amount','GST Amount','Sale Status','Currency Code'],
    row: (c, pkg) => [c.contact, '', c.address, c.invoiceNo, dmy(c.issueDate), c.reference, c.description, c.account, n2(c.amount), '', '', c.reference, taxCode(pkg, c.rate), n2(c.amount), n2(c.tax), 'Open', 'AUD'],
  },
  'Reckon One': {
    fileLabel: 'Reckon_One',
    headers: ['Customer','Invoice Number','Invoice Date','Due Date','Reference','Description','Quantity','Unit Price','Amount','Account','Tax Code','Tax Amount','Currency'],
    row: (c, pkg) => [c.contact, c.invoiceNo, dmy(c.issueDate), dmy(c.dueDate), c.reference, c.description, c.qty, n2(c.unit), n2(c.amount), c.account, taxCode(pkg, c.rate), n2(c.tax), 'AUD'],
  },
  Sage: {
    fileLabel: 'Sage',
    headers: ['Customer Name','Invoice Number','Invoice Date','Due Date','Reference','Description','Quantity','Unit Price','Net Amount','Ledger Account','Tax Rate','Tax Amount','Total','Currency'],
    row: (c, pkg) => [c.contact, c.invoiceNo, dmy(c.issueDate), dmy(c.dueDate), c.reference, c.description, c.qty, n2(c.unit), n2(c.amount), c.account, taxCode(pkg, c.rate), n2(c.tax), n2(c.total), 'AUD'],
  },
}

export function getFormat(pkg) {
  return ACCOUNTING_FORMATS[pkg] || ACCOUNTING_FORMATS[DEFAULT_ACCOUNTING_PACKAGE]
}

const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`

export function buildAccountingCsv(entries, pkg, payees) {
  const fmt = getFormat(pkg)
  const rows = []
  ;(entries || []).forEach(entry => {
    invoiceItems(entry).forEach(item => {
      // Skip empty placeholder lines — a blank row fails validation on import
      // and there's nothing useful in it anyway.
      if (!Number(item.amount) && !(item.description || item.item)) return
      rows.push(fmt.row(lineContext(entry, item, payees), pkg))
    })
  })
  return { csv: [fmt.headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n'), lines: rows.length }
}

export function downloadAccountingCsv(entries, pkg, payees, label) {
  const fmt = getFormat(pkg)
  const { csv, lines } = buildAccountingCsv(entries, pkg, payees)
  if (!lines) return 0
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Direct_Income_${fmt.fileLabel}_${(label || '').replace(/[^\w-]+/g, '_') || new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return lines
}
