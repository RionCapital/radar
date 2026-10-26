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

// ─── What's been recommended ─────────────────────────────────────────────────
// A deal can span several properties, each with its own comparison table, so
// the recommendation is a LIST of picks — one lender group per table. It used
// to be a single { scenarioId, groupId } pointer, which meant recommending
// Bankwest for Thornton silently un-recommended Bankwest for Campbelltown.
// Deals saved under the old shape still read correctly: a lone object is
// treated as a one-entry list.
export function normalizeRecommendation(rec) {
  if (!rec) return []
  const list = Array.isArray(rec) ? rec : [rec]
  return list.filter(r => r && r.scenarioId !== undefined && r.groupId !== undefined)
}

// Every recommended group, in table order, each with the scenario it came
// from and the indices needed to write back into `scenarios`.
export function findRecommendedGroups(scenarios, rec) {
  const picks = normalizeRecommendation(rec)
  const out = []
  ;(scenarios || []).forEach((sc, sceneIdx) => {
    picks.forEach(p => {
      if (sc.id !== p.scenarioId) return
      const gi = (sc.groups || []).findIndex(g => g.id === p.groupId)
      if (gi !== -1) out.push({ group: sc.groups[gi], scenario: sc, sceneIdx, groupIdx: gi })
    })
  })
  return out
}

// Back-compat single-group lookup, for anything that still wants just the
// first pick.
export function findRecommendedGroup(scenarios, rec) {
  const first = findRecommendedGroups(scenarios, rec)[0]
  return first
    ? { recommendedGroup: first.group, recommendedSceneIdx: first.sceneIdx, recommendedGroupIdx: first.groupIdx }
    : { recommendedGroup: null, recommendedSceneIdx: -1, recommendedGroupIdx: -1 }
}

// Adds, replaces or removes a pick. One lender per table: ticking a different
// lender in a table you've already picked from swaps that table's choice
// rather than stacking two lenders for the same property.
export function toggleRecommendation(rec, scenarioId, groupId) {
  const picks = normalizeRecommendation(rec)
  const existing = picks.find(p => p.scenarioId === scenarioId)
  if (existing && existing.groupId === groupId) {
    return picks.filter(p => p.scenarioId !== scenarioId)
  }
  return [...picks.filter(p => p.scenarioId !== scenarioId), { scenarioId, groupId }]
}

export function isRecommended(rec, scenarioId, groupId) {
  return normalizeRecommendation(rec).some(p => p.scenarioId === scenarioId && p.groupId === groupId)
}

// Drops any pick pointing at a table or lender that no longer exists.
export function pruneRecommendation(rec, scenarios) {
  return normalizeRecommendation(rec).filter(p =>
    (scenarios || []).some(sc => sc.id === p.scenarioId && (sc.groups || []).some(g => g.id === p.groupId))
  )
}

// Flattens the recommended groups into the column list the summary table
// draws — one entry per split, each carrying its own lender, because splits
// in one recommendation can now come from different tables and lenders.
export function recommendationColumns(groups) {
  const cols = []
  ;(groups || []).forEach((g, gi) => {
    ;(g.splits || []).forEach((sp, si) => {
      cols.push({ split: sp, group: g, groupIdx: gi, firstOfGroup: si === 0, splitCount: (g.splits || []).length })
    })
  })
  return cols
}

// Totals across every recommended split, whichever table or lender it came
// from — the weighted average rate is over the whole recommended structure.
export function recommendationTotals(cols) {
  const n = v => Number(v)||0
  const totalLoan = cols.reduce((sum,c)=>sum+n(c.split.baseLoan),0)
  const totalRepay = cols.reduce((sum,c)=>sum+rowRepayment(c.split),0)
  const weightedRate = totalLoan ? cols.reduce((sum,c)=>sum+n(c.split.rate)*n(c.split.baseLoan),0)/totalLoan : 0
  return { totalLoan, totalRepay, weightedRate }
}

// "Bankwest", "Bankwest and ANZ", "Bankwest, ANZ and NAB" — the same lender
// twice reads as one name, which is the usual case across properties.
export function recommendedLenderLabel(groups) {
  const names = [...new Set((groups || []).map(g => (g.lender || '').trim()).filter(Boolean))]
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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
// Fixed per-column pixel widths (via <colgroup> + table-layout:fixed) rather
// than leaving the browser to auto-size each column by content — auto-sizing
// squeezed Property and Rate down to their narrowest values. table-layout:
// fixed means these are the actual rendered widths regardless of content
// length, so the table comes out wider overall too.
const COMPARISON_COL_WIDTH = { 'Lender':140, 'Property':130, 'Purpose':80, 'Type':70, 'Term':90, 'Total Loan Term':120, 'Base Loan':120, 'LMI':90, 'Rate':100, 'Repayment':110 }

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
    const colgroup = `<colgroup>${cols.map(c => `<col style="width:${COMPARISON_COL_WIDTH[c] || 100}px" />`).join('')}</colgroup>`
    return `${label}<table style="border-collapse:collapse;table-layout:fixed;margin:0 0 16px">${colgroup}<thead><tr>${cols.map(c => `<th style="${TH}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  }).join('')
}

// Renders the "Our Recommendation" table for a single recommended group —
// same Split/Bank/Property/Purpose/Loan Amount/Term/Total Loan
// Term/Rate/Repayment layout as the on-screen panel, TOTAL column included
// only once there's more than one split.
// Label column and every split/TOTAL data column are the same fixed width —
// "even" per Cameron, and about 50% wider than the columns were rendering
// at before (auto-sized by content, which is roughly 85-90px for typical
// values like "$4,960,000") — so ~130px per data column.
const REC_LABEL_COL_WIDTH = 120
const REC_DATA_COL_WIDTH = 130

export function buildRecommendationTableHtml(recommended) {
  // Accepts one group (the old shape) or a list of them.
  const groups = (Array.isArray(recommended) ? recommended : [recommended]).filter(Boolean)
  if (!groups.length) return ''
  const n = v => Number(v)||0
  const cols = recommendationColumns(groups)
  if (!cols.length) return ''
  const showTotal = cols.length > 1
  const { totalLoan, totalRepay, weightedRate } = recommendationTotals(cols)
  const LABEL_TD = `padding:6px 8px;${EMAIL_TABLE_FONT}font-weight:700;text-transform:uppercase;font-size:9pt;color:#7A8090;white-space:nowrap;border-bottom:0.5px solid #e2e8f0`
  const CELL = `padding:6px 8px;${EMAIL_TABLE_FONT}color:#1a1a1a;border-bottom:0.5px solid #e2e8f0`
  const TOTAL_CELL = `${CELL}font-weight:700;background:#f8fafc`
  const colgroup = `<colgroup><col style="width:${REC_LABEL_COL_WIDTH}px" />${cols.map(() => `<col style="width:${REC_DATA_COL_WIDTH}px" />`).join('')}${showTotal ? `<col style="width:${REC_DATA_COL_WIDTH}px" />` : ''}</colgroup>`
  const row = (label, cellsFn, totalVal) => `<tr><td style="${LABEL_TD}">${label}</td>${cols.map((c,ci)=>`<td style="${CELL}">${cellsFn(c,ci)}</td>`).join('')}${showTotal ? `<td style="${TOTAL_CELL}">${totalVal ?? ''}</td>` : ''}</tr>`

  // Total Loan Term belongs to the lender group, not the split. With one
  // group it stays a single spanning cell, as it always was; across groups
  // each one's term sits over its own splits.
  const terms = groups.map(g => g.totalTerm).filter(Boolean)
  let totalTermRow = ''
  if (terms.length) {
    if (groups.length === 1) {
      totalTermRow = `<tr><td style="${LABEL_TD}">Total Loan Term</td><td colspan="${cols.length + (showTotal?1:0)}" style="${CELL}font-weight:700">${esc(groups[0].totalTerm)} Years</td></tr>`
    } else {
      const cells = groups.map(g => {
        const span = (g.splits || []).length || 1
        return `<td colspan="${span}" style="${CELL}font-weight:700">${g.totalTerm ? `${esc(g.totalTerm)} Years` : '—'}</td>`
      }).join('')
      totalTermRow = `<tr><td style="${LABEL_TD}">Total Loan Term</td>${cells}${showTotal ? `<td style="${TOTAL_CELL}"></td>` : ''}</tr>`
    }
  }

  const rows = [
    `<tr><td style="${LABEL_TD}">Split</td>${cols.map((c,ci)=>`<td style="${CELL}font-weight:700;text-align:center">${ci+1}</td>`).join('')}${showTotal ? `<td style="${TOTAL_CELL}text-align:center">TOTAL</td>` : ''}</tr>`,
    row('Bank', c => esc(c.group.lender || '—')),
    row('Property', c => esc(c.split.property || 'TBC')),
    row('Purpose', c => esc(c.split.purpose || '—')),
    row('Loan Amount', c => fmtM(n(c.split.baseLoan)), fmtM(totalLoan)),
    row('Term', c => c.split.term ? `${esc(c.split.term)} Years (${esc(c.split.type)})` : '—'),
    ...(totalTermRow ? [totalTermRow] : []),
    row('Rate', c => c.split.rate ? `${Number(c.split.rate).toFixed(2)}%` : '—', weightedRate ? `${weightedRate.toFixed(2)}% W.avg` : '—'),
    row('Repayment', c => { const r = rowRepayment(c.split); return r ? `$${Math.round(r).toLocaleString()}` : '—' }, totalRepay ? `$${Math.round(totalRepay).toLocaleString()}` : '—'),
  ]
  return `<table style="border-collapse:collapse;table-layout:fixed;margin:0 0 16px">${colgroup}${rows.join('')}</table>`
}

