// Shared logic for the Strategy tab's Comparison Tables feature — lives here
// (rather than inline in DealPage.jsx) so the exact same calculations and
// exact same table markup back both the on-screen editor and the Comparison
// Email builder. A change to the repayment formula, or to how a split
// lender's totals are laid out, only has to happen in one place.

export function fmtM(v) { return v==='' || v===undefined || v===null || isNaN(v) ? '—' : `$${Math.round(Number(v)).toLocaleString()}` }

// A "scenario" (one comparison box/table) contains "groups" (one per
// lender), each group contains "splits" (one or more facility tranches for
// that lender). Whether a scenario shows extra rows + a subtotal for a
// lender is derived from splits.length > 1 — never a separately-toggled
// flag — so it can't drift out of sync with what's actually on the page.
export function newSplit() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, property:'', purpose:'OO', type:'P&I', term:30, baseLoan:'', lmi:'', rate:'', features:'' }
}
export function newGroup() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, lender:'', totalTerm:'', splits:[newSplit()] }
}
export function newScenario() {
  return { id: Date.now(), label:'', groups:[newGroup()] }
}

// Reads a comparison table saved before splits existed — a flat `rows`
// array where the "Property" column was actually being used to hold the
// lender's name (there was no separate Lender field). Returns the scenario
// unchanged once it's already in the current { groups: [...] } shape.
export function normalizeScenario(sc) {
  if (sc.groups) return sc
  const rows = sc.rows || []
  return {
    id: sc.id, label: sc.label,
    groups: rows.map((r, idx) => ({
      id: r.id || `${sc.id}-g${idx}`,
      lender: r.property || '',
      totalTerm: '',
      splits: [{ id:`${sc.id}-g${idx}-s0`, property:'', purpose:r.purpose||'OO', type:r.type||'P&I', term:r.term||30, baseLoan:r.baseLoan||'', lmi:r.lmi||'', rate:r.rate||'', features:'' }],
    })),
  }
}

export function rowRepayment(r) {
  const n = v => Number(v)||0
  const total = n(r.baseLoan) + n(r.lmi)
  const rate = n(r.rate)/100
  const termMo = n(r.term)*12
  if (!rate || !termMo) return 0
  if (r.type === 'IO') return (n(r.baseLoan) * rate) / 12
  const rm = rate/12
  return (total * rm) / (1 - Math.pow(1+rm, -termMo))
}

export function groupTotals(g) {
  const n = v => Number(v)||0
  const splits = g.splits || []
  const totalBaseLoan = splits.reduce((sum,sp)=>sum+n(sp.baseLoan),0)
  const totalRepayment = splits.reduce((sum,sp)=>sum+rowRepayment(sp),0)
  const weightedRate = totalBaseLoan ? splits.reduce((sum,sp)=>sum+n(sp.rate)*n(sp.baseLoan),0)/totalBaseLoan : 0
  return { totalBaseLoan, totalRepayment, weightedRate }
}

// Finds the recommended group across every scenario, plus the indices
// needed to write back to it — the same lookup DealPage.jsx's Strategy tab
// does for its "Our Recommendation" panel and the email builder both need.
export function findRecommendedGroup(scenarios, rec) {
  let recommendedGroup = null, recommendedSceneIdx = -1, recommendedGroupIdx = -1
  if (rec) {
    scenarios.forEach((sc, sceneIdx) => {
      if (sc.id !== rec.scenarioId) return
      const gi = sc.groups.findIndex(g => g.id === rec.groupId)
      if (gi !== -1) { recommendedGroup = sc.groups[gi]; recommendedSceneIdx = sceneIdx; recommendedGroupIdx = gi }
    })
  }
  return { recommendedGroup, recommendedSceneIdx, recommendedGroupIdx }
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

const EMAIL_TABLE_FONT = "font-family:Aptos,Calibri,Arial,sans-serif;font-size:10.0pt;"
const TH = `padding:6px 8px;text-align:left;color:#fff;background:#3D4F6B;${EMAIL_TABLE_FONT}font-weight:700;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap`
const TD = `padding:6px 8px;border-bottom:0.5px solid #e2e8f0;color:#1a1a1a;${EMAIL_TABLE_FONT}white-space:nowrap`

// Renders every comparison scenario as plain HTML <table>s — same column
// layout and same flatten-plus-subtotal approach as the live editor in
// DealPage.jsx, but as static markup (no inputs) suitable for an email
// body. Deliberately no <p> tags anywhere (see emailUtils.js's note on the
// Outlook signature-splice heuristic) — everything here is <table>/<div>.
export function buildComparisonTableHtml(scenarios, opts = {}) {
  const showLMI = !!opts.showLMI
  if (!scenarios || scenarios.length === 0) return ''
  const cols = ['Lender','Property','Purpose','Type','Term','Total Loan Term','Base Loan', ...(showLMI ? ['LMI'] : []), 'Rate','Repayment']
  return scenarios.map(sc => {
    const rows = []
    sc.groups.forEach(g => {
      const multi = (g.splits||[]).length > 1
      g.splits.forEach(sp => {
        const repay = rowRepayment(sp)
        const cells = [
          esc(g.lender || '—'),
          esc(sp.property || 'TBC'),
          esc(sp.purpose || '—'),
          esc(sp.type || '—'),
          sp.term ? `${sp.term} Years` : '—',
          g.totalTerm ? `${g.totalTerm} Years` : (sp.type==='IO' ? '—' : 'n/a'),
          sp.baseLoan ? fmtM(sp.baseLoan) : '—',
          ...(showLMI ? [sp.lmi ? fmtM(sp.lmi) : '—'] : []),
          sp.rate ? `${Number(sp.rate).toFixed(2)}%` : '—',
          repay ? `$${Math.round(repay).toLocaleString()}` : '—',
        ]
        rows.push(`<tr>${cells.map(c => `<td style="${TD}">${c}</td>`).join('')}</tr>`)
      })
      if (multi) {
        const totals = groupTotals(g)
        const subCells = [
          `<td style="${TD}font-weight:700" colspan="5">Subtotal — ${esc(g.lender || 'Untitled lender')}</td>`,
          `<td style="${TD}"></td>`,
          `<td style="${TD}font-weight:700">${fmtM(totals.totalBaseLoan)}</td>`,
          ...(showLMI ? [`<td style="${TD}"></td>`] : []),
          `<td style="${TD}font-weight:700">${totals.weightedRate ? `${totals.weightedRate.toFixed(2)}% avg` : '—'}</td>`,
          `<td style="${TD}font-weight:700">${totals.totalRepayment ? `$${Math.round(totals.totalRepayment).toLocaleString()}` : '—'}</td>`,
        ]
        rows.push(`<tr style="background:#eef2f6">${subCells.join('')}</tr>`)
      }
    })
    const label = sc.label ? `<div style="${EMAIL_TABLE_FONT}font-weight:700;margin:0 0 6px">${esc(sc.label)}</div>` : ''
    return `${label}<table style="border-collapse:collapse;width:100%;margin:0 0 16px"><thead><tr>${cols.map(c => `<th style="${TH}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  }).join('')
}

// Renders the "Our Recommendation" table for a single recommended group —
// same Split/Bank/Property/Purpose/Loan Amount/Term/Total Loan
// Term/Rate/Repayment layout as the on-screen panel, TOTAL column included
// only once there's more than one split.
export function buildRecommendationTableHtml(recommendedGroup) {
  if (!recommendedGroup) return ''
  const n = v => Number(v)||0
  const splits = recommendedGroup.splits || []
  const showTotal = splits.length > 1
  const totalLoan = splits.reduce((sum,sp)=>sum+n(sp.baseLoan),0)
  const totalRepay = splits.reduce((sum,sp)=>sum+rowRepayment(sp),0)
  const weightedRate = totalLoan ? splits.reduce((sum,sp)=>sum+n(sp.rate)*n(sp.baseLoan),0)/totalLoan : 0
  const LABEL_TD = `padding:6px 8px;${EMAIL_TABLE_FONT}font-weight:700;text-transform:uppercase;font-size:9pt;color:#7A8090;white-space:nowrap;border-bottom:0.5px solid #e2e8f0`
  const CELL = `padding:6px 8px;${EMAIL_TABLE_FONT}color:#1a1a1a;border-bottom:0.5px solid #e2e8f0`
  const TOTAL_CELL = `${CELL}font-weight:700;background:#f8fafc`
  const row = (label, cellsFn, totalVal) => `<tr><td style="${LABEL_TD}">${label}</td>${splits.map((sp,si)=>`<td style="${CELL}">${cellsFn(sp,si)}</td>`).join('')}${showTotal ? `<td style="${TOTAL_CELL}">${totalVal ?? ''}</td>` : ''}</tr>`
  const rows = [
    `<tr><td style="${LABEL_TD}">Split</td>${splits.map((sp,si)=>`<td style="${CELL}font-weight:700;text-align:center">${si+1}</td>`).join('')}${showTotal ? `<td style="${TOTAL_CELL}text-align:center">TOTAL</td>` : ''}</tr>`,
    row('Bank', () => esc(recommendedGroup.lender || '—')),
    row('Property', sp => esc(sp.property || 'TBC')),
    row('Purpose', sp => esc(sp.purpose || '—')),
    row('Loan Amount', sp => fmtM(n(sp.baseLoan)), fmtM(totalLoan)),
    row('Term', sp => sp.term ? `${sp.term} Years (${sp.type})` : '—'),
    ...(recommendedGroup.totalTerm ? [`<tr><td style="${LABEL_TD}">Total Loan Term</td><td colspan="${splits.length + (showTotal?1:0)}" style="${CELL}font-weight:700">${recommendedGroup.totalTerm} Years</td></tr>`] : []),
    row('Rate', sp => sp.rate ? `${Number(sp.rate).toFixed(2)}%` : '—', weightedRate ? `${weightedRate.toFixed(2)}% W.avg` : '—'),
    row('Repayment', sp => { const r = rowRepayment(sp); return r ? `$${Math.round(r).toLocaleString()}` : '—' }, totalRepay ? `$${Math.round(totalRepay).toLocaleString()}` : '—'),
  ]
  return `<table style="border-collapse:collapse;margin:0 0 16px">${rows.join('')}</table>`
}
