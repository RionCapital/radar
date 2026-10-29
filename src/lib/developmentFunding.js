// ── Development Funding Table ────────────────────────────────────────────
// Used in place of the standard purchase/construction funding table when a
// deal's Category is "Development". Modelled on the ThinkPrivate funding
// table layout (Senior Debt vs Developer Equity columns), with the
// drawdown-schedule interest option from Cameron's 18M construction model.
//
// Everything lives on deal._strategy.dev so switching a deal's category
// away from Development and back never loses the inputs, and nothing here
// touches the standard funding table's fields.
//
// Verified against ThinkPrivate scenario (Zozac, Lot 1 DP1302794):
//   loan $2,332,272.73 · finance costs $230,195.32 · profit $308,427.86
//   ROE 45.95% · LTC 78.16% · LVR As Is 52.43% — all to the cent.

const n = v => Number(v) || 0
const pct = v => n(v) / 100

// Fixed cost rows, in report order. `contingency` is not here — it's a %
// of construction, calculated and always funded by senior debt.
export const DEV_COST_ROWS = [
  ['construction', 'Construction costs (ex. GST)'],
  ['professional', 'Professional costs'],
  ['consultants',  'Consultants costs'],
  ['statutory',    'Statutory costs'],
  ['marketing',    'Marketing costs'],
  ['holding',      'Holding costs'],
  ['stampDuty',    'Stamp duty costs'],
  ['other',        'Other costs'],
]

// Cash the customer is putting in on top of the facility (and on top of
// anything already spent, which sits in the Developer Equity column).
export const DEV_CONTRIBUTION_TYPES = ['Developer cash contribution','Deposit paid','Savings','Gifted funds','Equity release','Second mortgage','Proceeds of sale','Other']

export const GST_METHODS = [
  ['margin', 'Margin scheme'],
  ['full',   'Full GST (GRV ÷ 11)'],
  ['none',   'No GST'],
]

// Defaults mirror what ThinkPrivate pre-fills, so a blank deal behaves
// sensibly before anything is typed.
export const DEV_DEFAULTS = {
  gstMethod: 'margin',
  agentCommPct: 1,
  agentCommGst: true,
  deductAgentFromNrv: false,
  contingencyPct: 5,
  brokerFeePct: 1.5,
  brokerFeeGst: true,
  estFeePct: 1.5,
  lineFeePct: 0,
  termMonths: 12,
  interestMethod: 'utilisation',
  utilisationPct: 60,
}

export function devValue(dev, key) {
  const v = dev?.[key]
  return v === undefined || v === null || v === '' ? DEV_DEFAULTS[key] : v
}

export function calcDevFunding(devIn) {
  const dev = devIn || {}
  const g = k => devValue(dev, k)

  // ── Realisation ──
  const grv = n(dev.grv)
  const gstMethod = g('gstMethod')
  const gst = gstMethod === 'full' ? grv / 11
    : gstMethod === 'margin' ? Math.max(0, grv - n(dev.originalPurchasePrice)) / 11
    : 0
  const agentComm = grv * pct(g('agentCommPct')) * (g('agentCommGst') ? 1.1 : 1)
  const deductAgent = !!g('deductAgentFromNrv')
  const nrv = grv - gst - (deductAgent ? agentComm : 0)

  // ── Land ──
  // Senior debt against the land is set either as an LVR % of the As Is
  // value or as a typed amount (when there's no land value to measure).
  const landValue = n(dev.landValue)
  const landLvrSet = dev.landLvr !== undefined && dev.landLvr !== null && dev.landLvr !== ''
  const landDebt = landValue ? (landLvrSet ? landValue * pct(dev.landLvr) : n(dev.landDebtAmount)) : n(dev.landDebtAmount)
  const landEquity = Math.max(0, landValue - landDebt)

  // ── Project costs ──
  const costs = dev.costs || {}
  const rows = DEV_COST_ROWS.map(([key, label]) => ({
    key, label, debt: n(costs[key]?.debt), equity: n(costs[key]?.equity),
  }))
  const customRows = (dev.customCosts || []).map(c => ({
    key: c.id, label: c.label || 'Other cost', debt: n(c.debt), equity: n(c.equity), custom: true,
  }))
  const construction = rows[0]
  const contingencyPct = n(g('contingencyPct'))
  const contingency = (construction.debt + construction.equity) * contingencyPct / 100

  const costDebt = rows.concat(customRows).reduce((s, r) => s + r.debt, 0) + contingency
  const costEquity = rows.concat(customRows).reduce((s, r) => s + r.equity, 0)

  // ── Loan amount ──
  // Default: LVR on NRV (ThinkPrivate's method). Typed amount when there's
  // no NRV yet, same two-way pattern as the standard funding table.
  const lvrNrvSet = dev.lvrNrv !== undefined && dev.lvrNrv !== null && dev.lvrNrv !== ''
  const loan = nrv ? (lvrNrvSet ? nrv * pct(dev.lvrNrv) : n(dev.loanAmount)) : n(dev.loanAmount)

  // ── Finance costs ──
  const termMonths = n(g('termMonths'))
  const rate = pct(dev.rate)
  const estFee = loan * pct(g('estFeePct'))
  const lineFee = loan * pct(g('lineFeePct')) * termMonths / 12
  const brokerFee = loan * pct(g('brokerFeePct')) * (g('brokerFeeGst') ? 1.1 : 1)
  const otherFees = n(dev.otherFees)

  const interestMethod = g('interestMethod')
  let interest = 0, schedule = null, peakBalance = 0, effectiveUtilisation = 0
  if (interestMethod === 'drawdown') {
    // 18M-model style: land advance + upfront fees drawn on day one, the
    // senior-funded project costs drawn in equal monthly amounts across the
    // build period, interest charged monthly on the drawn balance (not
    // compounded — matches Cameron's spreadsheet).
    const buildMonths = Math.max(1, Math.min(termMonths || 1, n(dev.buildMonths) || termMonths || 1))
    const monthlyDraw = costDebt / buildMonths
    let bal = landDebt + estFee + brokerFee + otherFees
    schedule = []
    for (let m = 1; m <= termMonths; m++) {
      const draw = m <= buildMonths ? monthlyDraw : 0
      bal += draw
      const int = bal * rate / 12
      interest += int
      peakBalance = Math.max(peakBalance, bal)
      schedule.push({ month: m, draw, balance: bal, interest: int })
    }
    effectiveUtilisation = loan && rate && termMonths ? interest / (loan * rate * termMonths / 12) : 0
  } else {
    effectiveUtilisation = pct(g('utilisationPct'))
    interest = loan * rate * termMonths / 12 * effectiveUtilisation
    peakBalance = loan
  }
  const financeCosts = estFee + lineFee + brokerFee + otherFees + interest

  // ── Totals ──
  const seniorSubtotal = landDebt + costDebt + financeCosts
  const equitySubtotal = landEquity + costEquity
  const tdc = seniorSubtotal + equitySubtotal
  const buffer = loan - seniorSubtotal // negative = shortfall, more equity needed

  const profit = nrv - tdc - (deductAgent ? 0 : agentComm)

  // ── Customer contributions ──
  // Funds Available = facility + contributions, measured against what still
  // has to be paid (the Senior Debt column). Costs already spent aren't
  // counted again here — they're in the Developer Equity column.
  const contributions = (dev.contributions || []).map(r => ({ ...r, amount: n(r.amount) }))
  const contributionsTotal = contributions.reduce((sum, r) => sum + r.amount, 0)
  const totalFundsAvailable = loan + contributionsTotal
  const surplusDeficit = totalFundsAvailable - seniorSubtotal
  // Rounded to cents so an LVR-derived land advance (e.g. 52.43%) doesn't
  // leave a floating-point sliver that reads as 'not covered'.
  const settlementShortfall = Math.max(0, Math.round((n(dev.existingDebt) - landDebt) * 100) / 100)

  const div = (a, b) => (b ? a / b : 0)
  return {
    grv, gst, gstMethod, agentComm, deductAgent, nrv, lots: n(dev.lots),
    landValue, landDebt, landEquity,
    rows, customRows, contingency, contingencyPct,
    costDebt, costEquity,
    loan, termMonths, rate,
    estFee, lineFee, brokerFee, otherFees, interest, financeCosts,
    interestMethod, schedule, peakBalance, effectiveUtilisation,
    seniorSubtotal, equitySubtotal, tdc, buffer,
    contributions, contributionsTotal, totalFundsAvailable, surplusDeficit,
    profit,
    lvrAsIs: div(landDebt, landValue),
    lvrNrv: div(loan, nrv),
    lvrGrv: div(loan, grv),
    ltc: div(loan, tdc),
    profitOnTdc: div(profit, tdc),
    roe: div(profit, equitySubtotal),
    existingDebt: n(dev.existingDebt),
    settlementShortfall,
    settlementCovered: settlementShortfall > 0 && contributionsTotal >= settlementShortfall,
  }
}

// ── One-page report (for pasting into Word) ─────────────────────────────
// Inline styles and plain tables only — that's what survives a paste into
// Word intact. Arial rather than Montserrat since Word won't have the web
// font; Steel Blue headers to match the brand.

const BLUE = '#3D5570', NAVY = '#2A3545', PINK = '#DA408D', GREY = '#7A8090', LIGHT = '#EEF2F6', LINE = '#D9DEE5'

const money = v => { const x = Math.round(n(v) * 100) / 100; const t = `$${Math.abs(x).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; return x < 0 ? `(${t})` : t }
const money0 = v => `$${Math.round(n(v)).toLocaleString('en-AU')}`
const pc = v => `${(n(v) * 100).toFixed(2)}%`
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function todayLabel() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

export function buildDevFundingReportHtml(deal, dev) {
  const c = calcDevFunding(dev)
  const font = "font-family:Arial,Helvetica,sans-serif;"
  const td = (txt, extra = '') => `<td style="${font}font-size:9pt;color:${NAVY};padding:3pt 6pt;border-bottom:0.5pt solid ${LINE};${extra}">${txt}</td>`
  const tdR = (txt, extra = '') => td(txt, `text-align:right;${extra}`)
  const th = (txt, right) => `<th style="${font}font-size:8.5pt;color:#ffffff;background:${BLUE};padding:4pt 6pt;text-align:${right ? 'right' : 'left'};font-weight:bold;">${txt}</th>`
  const heading = t => `<p style="${font}font-size:10pt;font-weight:bold;color:${BLUE};margin:10pt 0 4pt 0;text-transform:uppercase;letter-spacing:0.5pt;">${t}</p>`

  const fundRow = (label, debt, equity, bold) => {
    const b = bold ? `font-weight:bold;background:${LIGHT};` : ''
    return `<tr>${td(esc(label), b)}${tdR(money(debt), b)}${tdR(money(equity), b)}${tdR(money(debt + equity), b)}</tr>`
  }

  const costLines = [
    fundRow("Land value 'As Is'", c.landDebt, c.landEquity),
    fundRow(c.rows[0].label, c.rows[0].debt, c.rows[0].equity),
    c.contingency ? fundRow(`Contingency (${c.contingencyPct.toFixed(2)}%)`, c.contingency, 0) : '',
    ...c.rows.slice(1).concat(c.customRows).filter(r => r.debt || r.equity).map(r => fundRow(r.label, r.debt, r.equity)),
    fundRow('Finance costs', c.financeCosts, 0),
    fundRow('Sub-total', c.seniorSubtotal, c.equitySubtotal, true),
  ].join('')

  const bufferLabel = c.buffer >= 0 ? 'Buffer' : 'Shortfall (additional equity required)'
  const totalsRows = `
    <tr>${td(bufferLabel)}${tdR(money(c.buffer), c.buffer < 0 ? 'color:#dc2626;' : '')}${td('')}${td('')}</tr>
    <tr>${td('Total facility', `font-weight:bold;color:#ffffff;background:${NAVY};`)}${tdR(money(c.loan), `font-weight:bold;color:#ffffff;background:${NAVY};`)}${td('', `background:${NAVY};`)}${td('', `background:${NAVY};`)}</tr>`

  const fundsSection = c.contributions.some(r => r.amount) ? `${heading('Funds available')}
<table style="width:100%;border-collapse:collapse;">
  <tr>${td('Total facility')}${tdR(money(c.loan))}</tr>
  ${c.contributions.filter(r => r.amount).map(r => `<tr>${td(esc(r.label || 'Customer contribution'))}${tdR(money(r.amount))}</tr>`).join('')}
  <tr>${td('Total funds available', `font-weight:bold;background:${LIGHT};`)}${tdR(money(c.totalFundsAvailable), `font-weight:bold;background:${LIGHT};`)}</tr>
  <tr>${td('Less funds required (Senior Debt sub-total)')}${tdR(money(c.seniorSubtotal))}</tr>
  <tr>${td('Surplus / (Deficit)', `font-weight:bold;color:#ffffff;background:${c.surplusDeficit < 0 ? '#dc2626' : NAVY};`)}${tdR(money(c.surplusDeficit), `font-weight:bold;color:#ffffff;background:${c.surplusDeficit < 0 ? '#dc2626' : NAVY};`)}</tr>
</table>` : ''

  const gstLabel = c.gstMethod === 'margin' ? 'GST (margin scheme)' : c.gstMethod === 'full' ? 'GST' : 'GST (n/a)'
  const leftMetrics = [
    ['Gross realisation value (GRV)', money(c.grv)],
    [gstLabel, money(c.gst)],
    ...(c.deductAgent ? [['Agent selling commission', money(c.agentComm)]] : []),
    ['Net realisation value (NRV)', money(c.nrv)],
    ['Total development costs (TDC)', money(c.tdc)],
    ['Project profit', money(c.profit)],
    ['Profit on TDC', pc(c.profitOnTdc)],
    ['Return on equity', pc(c.roe)],
  ]
  const rightMetrics = [
    ['Loan amount', money(c.loan)],
    ['Loan term', `${c.termMonths} months`],
    ["LVR against land 'As Is'", pc(c.lvrAsIs)],
    ['LVR on NRV', pc(c.lvrNrv)],
    ['LVR on GRV', pc(c.lvrGrv)],
    ['Loan to cost (LTC)', pc(c.ltc)],
    ...(c.lots ? [['No. of units / lots', String(c.lots)]] : []),
  ]
  const metricTable = list => `<table style="width:100%;border-collapse:collapse;">${list.map(([k, v]) =>
    `<tr>${td(esc(k), `color:${GREY};`)}${tdR(v, 'font-weight:bold;')}</tr>`).join('')}</table>`

  const interestNote = c.interestMethod === 'drawdown'
    ? `monthly drawdown schedule (${pc(c.effectiveUtilisation)} effective utilisation)`
    : `${pc(c.effectiveUtilisation)} average utilisation`
  const ratePart = c.rate ? `Interest ${(c.rate * 100).toFixed(2)}% p.a. on ${interestNote}: ${money0(c.interest)}` : ''
  const financeNote = [
    ratePart,
    c.estFee ? `Establishment fee ${(devValue(dev, 'estFeePct'))}%: ${money0(c.estFee)}` : '',
    c.lineFee ? `Line fee ${devValue(dev, 'lineFeePct')}% p.a.: ${money0(c.lineFee)}` : '',
    c.brokerFee ? `Broker fee ${devValue(dev, 'brokerFeePct')}%${devValue(dev, 'brokerFeeGst') ? ' + GST' : ''}: ${money0(c.brokerFee)}` : '',
    c.otherFees ? `Other fees: ${money0(c.otherFees)}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  const title = deal?.['Transaction Name'] || 'Development'
  const lender = deal?.Lender ? ` &nbsp;·&nbsp; ${esc(deal.Lender)}` : ''

  return `<div style="${font}color:${NAVY};">
<table style="width:100%;border-collapse:collapse;"><tr>
  <td style="${font}padding:0 0 4pt 0;border-bottom:2pt solid ${PINK};">
    <span style="font-size:15pt;font-weight:bold;color:${NAVY};">Development Funding Table</span><br/>
    <span style="font-size:9.5pt;color:${GREY};">${esc(title)}${lender}</span>
  </td>
  <td style="${font}padding:0 0 4pt 0;border-bottom:2pt solid ${PINK};text-align:right;vertical-align:bottom;">
    <span style="font-size:10pt;font-weight:bold;color:${BLUE};">RION CAPITAL</span><br/>
    <span style="font-size:8.5pt;color:${GREY};">Prepared ${todayLabel()}</span>
  </td>
</tr></table>
${heading('Funding table')}
<table style="width:100%;border-collapse:collapse;">
  <tr>${th('Item')}${th('Senior Debt', true)}${th('Developer Equity', true)}${th('Total', true)}</tr>
  ${costLines}
  ${totalsRows}
</table>
${financeNote ? `<p style="${font}font-size:8pt;color:${GREY};margin:4pt 0 0 0;">Finance costs: ${financeNote}</p>` : ''}
${fundsSection}
${heading('Funding metrics')}
<table style="width:100%;border-collapse:collapse;"><tr>
  <td style="width:50%;vertical-align:top;padding-right:8pt;">${metricTable(leftMetrics)}</td>
  <td style="width:50%;vertical-align:top;padding-left:8pt;">${metricTable(rightMetrics)}</td>
</tr></table>
<p style="${font}font-size:7.5pt;color:${GREY};margin:10pt 0 0 0;">Indicative only. Figures are estimates based on information provided and are subject to lender credit approval, valuation and final terms. Construction costs shown exclusive of GST.</p>
</div>`
}

export async function copyDevFundingReport(deal, dev) {
  const html = buildDevFundingReportHtml(deal, dev)
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()], { type: 'text/plain' }),
      })])
      return true
    }
  } catch {}
  return false
}

// A Word-openable document (HTML with Office namespaces). A4 portrait with
// narrow margins so the table sits on one page.
export function downloadDevFundingReportDoc(deal, dev) {
  const body = buildDevFundingReportHtml(deal, dev)
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Development Funding Table</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page Section1 { size:21cm 29.7cm; margin:1.6cm 1.6cm 1.6cm 1.6cm; } div.Section1 { page:Section1; } body { font-family:Arial,Helvetica,sans-serif; }</style>
</head><body><div class="Section1">${body}</div></body></html>`
  const blob = new Blob(['﻿', doc], { type: 'application/msword' })
  const name = `${(deal?.['Transaction Name'] || 'Development').replace(/[^\w\s-]/g, '').trim() || 'Development'} - Funding Table.doc`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
