// ─── Servicing calculator ────────────────────────────────────────────────────
// Pure calculation for commercial-property servicing: no React, no storage, so
// every number here can be unit-tested against a hand-worked example and the
// same functions back the on-screen panel, the sensitivity table and anything
// that later needs to print for a submission.
//
// The shape of the assessment follows how a bank actually reads a deal rather
// than how a spreadsheet adds up:
//
//   1. Income is SHADED before it counts (rent at 80%, bonus at 80%, …).
//   2. Tax is taken on the REAL (unshaded) assessable income, because the ATO
//      doesn't care what the lender shades — then the after-tax figure is what
//      services the debt.
//   3. Commitments are ASSESSED, not actual: every debt is re-rated at the
//      higher of (its rate + buffer) and the floor, and re-amortised P&I over
//      its remaining term. An interest-only loan at its real repayment is the
//      classic way to overstate capacity.
//   4. Living expenses are the GREATER of declared and the HEM benchmark.
//   5. An entity borrowing through an SPV is tested twice — the property on
//      its own ICR/DSCR, and the guarantors on their consolidated position
//      including that debt.
//
// Every policy number (buffer, floor, shading, minimum ratios, tax brackets,
// HEM) comes in through `policy` so nothing is hard-coded to one lender's
// rules or one financial year.

export const FREQ_TO_ANNUAL = { Weekly: 52, Fortnightly: 26, Monthly: 12, Quarterly: 4, Annually: 1 }
export const toAnnual = (amount, freq) => (Number(amount) || 0) * (FREQ_TO_ANNUAL[freq] ?? 1)
const n = v => Number(v) || 0
const round2 = v => Math.round(v * 100) / 100

// ─── Policy ──────────────────────────────────────────────────────────────────
// Shipped defaults are deliberately conservative and are all editable in
// Settings → Rradar → Servicing, then overridable per deal. The HEM table
// ships EMPTY on purpose: the real benchmark is licensed from the Melbourne
// Institute and isn't published, so inventing figures here would put made-up
// numbers behind a lending decision. Until it's populated, living expenses
// fall back to declared (with an optional manual floor) and every result says
// so.
export const DEFAULT_SERVICING_POLICY = {
  // Rate treatment
  buffer: 2.00,                 // added to the actual/product rate
  floorRate: 5.50,              // assessment never goes below this
  applyBufferToExisting: true,  // existing debt re-rated too, not taken at face value

  // Commitment treatment
  creditCardAssessPct: 3.80,    // % of LIMIT per month, regardless of balance
  residentialAmortYears: 30,    // assessment term for resi debt
  commercialAmortYears: 20,     // commercial amortises faster — drives the number hard
  assessIoAsPi: true,           // an IO loan is assessed P&I over its remaining term

  // Income shading (% of gross that counts)
  shading: {
    Salary: 100,
    Overtime: 80,
    Bonus: 80,
    Commission: 80,
    Allowance: 80,
    'Rental Income': 80,
    'Commercial Rent': 80,
    Dividends: 80,
    'Trust Distribution': 80,
    'Centrelink / Family Tax Benefit': 100,
    Other: 80,
  },

  // Commercial property test
  vacancyAllowancePct: 5,       // taken off commercial rent before the ratio
  minICR: 2.00,
  minDSCR: 1.50,

  // Living expenses
  useHem: true,
  manualExpenseFloor: '',       // annual $; used when the HEM table is empty

  // Tax — editable so it can be rolled each financial year rather than
  // waiting on a release. Brackets are {upTo (null = no cap), rate, base}:
  // tax = base + (income - previous upTo) * rate.
  taxYearLabel: '2025–26',
  taxBrackets: [
    { upTo: 18200,  rate: 0,     base: 0 },
    { upTo: 45000,  rate: 0.16,  base: 0 },
    { upTo: 135000, rate: 0.30,  base: 4288 },
    { upTo: 190000, rate: 0.37,  base: 31288 },
    { upTo: null,   rate: 0.45,  base: 51638 },
  ],
  medicareLevyPct: 2.0,
  companyTaxRate: 25.0,         // base rate entity; 30% for a non-BRE

  // HEM — populated by the user from their licensed source. Each row is
  // { composition, dependants, incomeFrom, incomeTo, annual }.
  hemEffectiveFrom: '',
  hem: [],
}

export const HEM_COMPOSITIONS = ['Single', 'Couple']

// A deal's own overrides sit on top of the Settings policy. Only keys the
// broker actually changed are stored, so a later change to the house default
// still flows through to every deal that didn't override it.
export function resolvePolicy(settingsPolicy, dealOverride) {
  const base = { ...DEFAULT_SERVICING_POLICY, ...(settingsPolicy || {}) }
  const ov = dealOverride || {}
  const merged = { ...base }
  Object.keys(ov).forEach(k => {
    const v = ov[k]
    if (v === undefined || v === null || v === '') return
    merged[k] = v
  })
  merged.shading = { ...DEFAULT_SERVICING_POLICY.shading, ...(settingsPolicy?.shading || {}), ...(ov.shading || {}) }
  merged.taxBrackets = ov.taxBrackets?.length ? ov.taxBrackets
    : (settingsPolicy?.taxBrackets?.length ? settingsPolicy.taxBrackets : DEFAULT_SERVICING_POLICY.taxBrackets)
  merged.hem = ov.hem?.length ? ov.hem : (settingsPolicy?.hem || [])
  return merged
}

// ─── Tax ─────────────────────────────────────────────────────────────────────
// Marginal income tax plus the Medicare levy. Deliberately ignores offsets,
// HECS and the levy surcharge — a lender's own calculator does the same, and
// pretending to more precision than that would be false comfort.
export function incomeTax(taxable, policy) {
  const inc = Math.max(0, n(taxable))
  const brackets = policy?.taxBrackets?.length ? policy.taxBrackets : DEFAULT_SERVICING_POLICY.taxBrackets
  let prevCap = 0
  for (const b of brackets) {
    const cap = b.upTo === null || b.upTo === undefined ? Infinity : n(b.upTo)
    if (inc <= cap) return n(b.base) + (inc - prevCap) * n(b.rate)
    prevCap = cap
  }
  const last = brackets[brackets.length - 1]
  return n(last.base) + (inc - prevCap) * n(last.rate)
}

export function medicareLevy(taxable, policy) {
  return Math.max(0, n(taxable)) * (n(policy?.medicareLevyPct ?? DEFAULT_SERVICING_POLICY.medicareLevyPct) / 100)
}

export function totalPersonalTax(taxable, policy) {
  return incomeTax(taxable, policy) + medicareLevy(taxable, policy)
}

export function companyTax(taxable, policy) {
  return Math.max(0, n(taxable)) * (n(policy?.companyTaxRate ?? DEFAULT_SERVICING_POLICY.companyTaxRate) / 100)
}

// ─── Repayments ──────────────────────────────────────────────────────────────
export function amortisedAnnualRepayment(principal, annualRatePct, years) {
  const P = n(principal)
  const r = n(annualRatePct) / 100 / 12
  const months = n(years) * 12
  if (P <= 0) return 0
  if (!months) return 0
  if (!r) return P / years
  return (P * r) / (1 - Math.pow(1 + r, -months)) * 12
}

export function assessedRate(actualRatePct, policy) {
  const buffered = n(actualRatePct) + n(policy.buffer)
  return Math.max(buffered, n(policy.floorRate))
}

// One liability, converted into the annual commitment a lender would load.
// `kind` drives the amortisation term; a credit card or overdraft ignores
// balance and term entirely and is taken as a percentage of the limit.
export function assessedCommitment(liability, policy) {
  const type = liability.type || 'Other'
  if (type === 'Credit Card' || type === 'Store Card' || type === 'Overdraft') {
    const limit = n(liability.limit) || n(liability.balance)
    return { annual: limit * (n(policy.creditCardAssessPct) / 100) * 12, basis: `${policy.creditCardAssessPct}% of $${Math.round(limit).toLocaleString()} limit per month` }
  }
  const balance = n(liability.balance)
  if (balance <= 0) return { annual: 0, basis: 'No balance' }

  const isCommercial = !!liability.commercial
  const defaultTerm = isCommercial ? n(policy.commercialAmortYears) : n(policy.residentialAmortYears)
  const term = n(liability.remainingTermYears) || defaultTerm
  const rate = policy.applyBufferToExisting
    ? assessedRate(liability.rate, policy)
    : (n(liability.rate) || n(policy.floorRate))

  // HECS and anything with a stated repayment that can't be re-amortised
  // sensibly is taken at its declared repayment.
  if (type === 'HECS') {
    return { annual: toAnnual(liability.repayment, liability.frequency || 'Monthly'), basis: 'Declared repayment' }
  }
  const annual = amortisedAnnualRepayment(balance, rate, term)
  return { annual, basis: `P&I over ${term}yrs at ${round2(rate)}% (assessed)` }
}

// ─── Income ──────────────────────────────────────────────────────────────────
export function shadePct(type, policy) {
  const s = policy.shading || {}
  return s[type] !== undefined ? n(s[type]) : 100
}

// Splits one register row across entities. `ownership` is either an entity
// name, "Shared Equally", or the legacy "100% <Name>" string; `ownerPct`
// optionally overrides with an explicit percentage to a single entity.
// `splitNames` is who an unallocated row falls back to. That's the
// individuals, not every entity — "Shared Equally" on a personal mortgage
// means the couple share it, and loading a third of it onto their SPV would
// both flatter the people and sink the company.
export function splitByOwner(row, entityNames, splitNames) {
  const out = {}
  entityNames.forEach(e => { out[e] = 0 })
  const amount = toAnnual(row.amount, row.frequency)
  if (!entityNames.length) return out
  const fallback = (splitNames && splitNames.length) ? splitNames : entityNames

  const explicit = row.ownerEntity && entityNames.includes(row.ownerEntity)
  if (explicit) {
    const pct = row.ownerPct === '' || row.ownerPct === undefined ? 100 : n(row.ownerPct)
    out[row.ownerEntity] += amount * (pct / 100)
    // Any remainder with no second owner named stays with the named entity,
    // rather than silently vanishing from the group total.
    const remainder = amount * (1 - pct / 100)
    if (remainder > 0.005) {
      if (row.ownerEntity2 && entityNames.includes(row.ownerEntity2)) out[row.ownerEntity2] += remainder
      else out[row.ownerEntity] += remainder
    }
    return out
  }

  const named = entityNames.find(e => row.ownership === e || row.ownership === `100% ${e}`)
  if (named) { out[named] += amount; return out }

  fallback.forEach(e => { out[e] += amount / fallback.length })
  return out
}

// ─── Living expenses ─────────────────────────────────────────────────────────
// The greater of declared and the HEM benchmark, the way a lender assesses it.
// Returns which basis won so the panel can say so rather than showing a number
// with no provenance.
export function hemLookup(policy, { composition, dependants, grossIncome }) {
  const rows = policy.hem || []
  if (!rows.length) return null
  const deps = n(dependants)
  const inc = n(grossIncome)
  const matches = rows.filter(r =>
    (!r.composition || r.composition === composition) &&
    n(r.dependants) === deps &&
    inc >= n(r.incomeFrom) &&
    (r.incomeTo === '' || r.incomeTo === null || r.incomeTo === undefined || inc <= n(r.incomeTo))
  )
  if (!matches.length) return null
  // Most specific band wins if several overlap.
  return matches.reduce((best, r) => (n(r.annual) > n(best.annual) ? r : best))
}

export function assessedLivingExpenses(policy, { declaredAnnual, composition, dependants, grossIncome }) {
  const declared = n(declaredAnnual)
  const manualFloor = n(policy.manualExpenseFloor)
  const hemRow = policy.useHem ? hemLookup(policy, { composition, dependants, grossIncome }) : null
  const hem = hemRow ? n(hemRow.annual) : 0

  const candidates = [
    { basis: 'Declared', amount: declared },
    ...(hem ? [{ basis: 'HEM benchmark', amount: hem }] : []),
    ...(manualFloor ? [{ basis: 'Manual floor', amount: manualFloor }] : []),
  ]
  const winner = candidates.reduce((a, b) => (b.amount > a.amount ? b : a))
  return {
    amount: winner.amount,
    basis: winner.basis,
    declared,
    hem,
    hemAvailable: !!(policy.hem || []).length,
    usedHem: winner.basis === 'HEM benchmark',
  }
}

// ─── Commercial property ─────────────────────────────────────────────────────
// Gross rent is what the tenant pays in total; net rent is rent after the
// landlord's own (non-recoverable) outgoings. Commercial leases are usually
// quoted net with the tenant paying outgoings, so the two bases have to be
// told apart or the income is overstated by the outgoings every time.
export function propertyIncome(property, policy) {
  const rent = n(property.annualRent)
  const vacancyPct = property.vacancyPct === '' || property.vacancyPct === undefined
    ? n(policy.vacancyAllowancePct) : n(property.vacancyPct)
  const afterVacancy = rent * (1 - vacancyPct / 100)
  const nonRecoverable = n(property.outgoingsNonRecoverable)
  // On a gross lease the landlord wears ALL outgoings, so the recoverable
  // portion comes off too — there's no tenant reimbursement to add back.
  const recoverable = n(property.outgoingsRecoverable)
  const outgoings = property.rentBasis === 'Gross' ? nonRecoverable + recoverable : nonRecoverable
  const netRent = afterVacancy - outgoings
  const shaded = netRent * (shadePct('Commercial Rent', policy) / 100)
  return { grossRent: rent, vacancyPct, afterVacancy, outgoings, netRent, shadedNetRent: shaded }
}

export function propertyDebtService(property, policy) {
  const loan = n(property.loanAmount)
  const rate = assessedRate(property.rate, policy)
  const term = n(property.termYears) || n(policy.commercialAmortYears)
  const interestOnly = loan * (rate / 100)
  const principalAndInterest = amortisedAnnualRepayment(loan, rate, term)
  return { loan, assessedRate: rate, term, interestOnly, principalAndInterest }
}

// ICR = net property income ÷ interest. DSCR = net property income ÷ full P&I
// commitment. A lender will usually want both, with ICR the binding one on an
// IO facility and DSCR the binding one once it amortises.
export function propertyTest(property, policy) {
  const inc = propertyIncome(property, policy)
  const debt = propertyDebtService(property, policy)
  const icr = debt.interestOnly > 0 ? inc.netRent / debt.interestOnly : null
  const dscr = debt.principalAndInterest > 0 ? inc.netRent / debt.principalAndInterest : null
  return {
    ...inc, ...debt, icr, dscr,
    icrPass: icr === null ? null : icr >= n(policy.minICR),
    dscrPass: dscr === null ? null : dscr >= n(policy.minDSCR),
    // What the guarantors have to cover if the property can't carry itself.
    shortfall: Math.max(0, debt.principalAndInterest - inc.netRent),
  }
}

// The loan this property's income supports at the target DSCR — the question
// every client asks second, after "will it go through".
export function maxLoanAtDscr(property, policy, targetDscr) {
  const target = n(targetDscr) || n(policy.minDSCR)
  const inc = propertyIncome(property, policy)
  if (!target || inc.netRent <= 0) return 0
  const affordableRepayment = inc.netRent / target
  const rate = assessedRate(property.rate, policy)
  const term = n(property.termYears) || n(policy.commercialAmortYears)
  const r = rate / 100 / 12
  const months = term * 12
  if (!months) return 0
  const monthly = affordableRepayment / 12
  if (!r) return monthly * months
  return monthly * (1 - Math.pow(1 + r, -months)) / r
}

// ─── Entities ────────────────────────────────────────────────────────────────
// Entities come straight from Loan Details → Clients & Contacts, so a person
// or company is only ever captured once and the link runs both ways. Anything
// servicing needs that a contact record doesn't carry (dependants,
// shareholdings, guarantees) is held alongside, keyed by name.
export const ENTITY_TYPES = ['Individual', 'Company', 'Trust', 'SMSF', 'Partnership']
export const isIndividual = e => (e.type || 'Individual') === 'Individual'

export function buildEntities(contacts, entityDetail) {
  return (contacts || [])
    .filter(c => c.name && c.name.trim())
    .map(c => {
      const detail = (entityDetail || {})[c.name] || {}
      return {
        name: c.name,
        type: c.type || 'Individual',
        abn: c.abn || detail.abn || '',
        acn: detail.acn || '',
        trustee: detail.trustee || '',
        dependants: detail.dependants ?? 0,
        maritalStatus: c.maritalStatus || detail.maritalStatus || '',
        // [{ name, pct }] — who owns the company/trust, which is how its
        // position flows back to the people behind it.
        owners: detail.owners || [],
        // Entity names this entity has guaranteed.
        guarantees: detail.guarantees || [],
        excluded: !!detail.excluded,
      }
    })
}

// Household composition for the HEM lookup. Two individuals who are each
// other's spouse are one couple household; a single applicant is a single.
export function householdOf(entity, entities) {
  if (!isIndividual(entity)) return null
  const individuals = entities.filter(isIndividual)
  const married = /married|de facto|defacto/i.test(entity.maritalStatus || '')
  return married && individuals.length > 1 ? 'Couple' : 'Single'
}

// Groups the individuals into households. HEM is a benchmark for a HOUSEHOLD,
// so a couple gets ONE benchmark between them — assessing each of them at the
// couple figure would charge the deal twice for the same groceries.
export function buildHouseholds(entities) {
  const individuals = entities.filter(isIndividual)
  const couple = individuals.filter(e => /married|de facto|defacto/i.test(e.maritalStatus || ''))
  const households = []
  if (couple.length > 1) {
    households.push({ composition: 'Couple', members: couple.map(e => e.name), dependants: Math.max(...couple.map(e => n(e.dependants))) })
  }
  individuals.filter(e => !couple.includes(e) || couple.length <= 1).forEach(e => {
    if (couple.length > 1 && couple.includes(e)) return
    households.push({ composition: 'Single', members: [e.name], dependants: n(e.dependants) })
  })
  return households
}

// Assessed living expenses per household, then shared evenly between its
// members so each person's panel shows their part of one household figure.
export function householdExpenses(entities, registers, entityNames, individualNames, policy, grossByEntity) {
  const out = {}
  buildHouseholds(entities).forEach(h => {
    const declared = (registers.livingExpenses || []).reduce((sum, r) => {
      const split = splitByOwner(r, entityNames, individualNames)
      return sum + h.members.reduce((s2, m) => s2 + (split[m] || 0), 0)
    }, 0)
    const grossIncome = h.members.reduce((s, m) => s + n(grossByEntity[m]), 0)
    const assessed = assessedLivingExpenses(policy, {
      declaredAnnual: declared, composition: h.composition, dependants: h.dependants, grossIncome,
    })
    h.members.forEach(m => {
      out[m] = { ...assessed, household: h.composition, householdMembers: h.members, share: 1 / h.members.length,
        amount: assessed.amount / h.members.length, declared: assessed.declared / h.members.length,
        householdAmount: assessed.amount, householdDeclared: assessed.declared }
    })
  })
  return out
}

// ─── Per-entity assessment ───────────────────────────────────────────────────
// Returns both the lender's view (shaded income, assessed commitments) and
// the real-dollars view (actual income, actual tax), because a broker needs
// to explain the gap between "what you earn" and "what counts".
export function assessEntity(entity, ctx) {
  const { policy, entityNames, individualNames, registers, property, entities, expensesByEntity } = ctx
  const lines = []
  let grossIncome = 0      // real, unshaded — the tax base
  let shadedIncome = 0     // what the lender counts

  const addIncome = (label, type, amount) => {
    if (!amount) return
    const pct = shadePct(type, policy)
    grossIncome += amount
    shadedIncome += amount * (pct / 100)
    lines.push({ label, type, amount, shadePct: pct, shaded: amount * (pct / 100) })
  }

  // Employment — captured per individual by name, so it only ever applies to
  // the person it belongs to.
  if (isIndividual(entity)) {
    const jobs = (registers.employment || {})[entity.name] || []
    jobs.forEach(job => {
      ;(job.incomeLines || []).forEach(l => {
        addIncome(`${job.employer || 'Employment'} — ${l.type}`, l.type, toAnnual(l.amount, l.frequency))
      })
    })
  }

  // Other income (rent, dividends, distributions) split by owner.
  ;(registers.otherIncome || []).forEach(r => {
    const split = splitByOwner(r, entityNames, individualNames)
    addIncome(r.type || 'Other income', r.type || 'Other', split[entity.name] || 0)
  })

  // The property being bought, if this entity is the one buying it.
  let propertyResult = null
  if (property && property.ownerEntity === entity.name && n(property.loanAmount) >= 0) {
    propertyResult = propertyTest(property, policy)
    grossIncome += propertyResult.netRent
    shadedIncome += propertyResult.shadedNetRent
    lines.push({
      label: `${property.address || 'New commercial property'} — net rent`,
      type: 'Commercial Rent', amount: propertyResult.netRent,
      shadePct: shadePct('Commercial Rent', policy), shaded: propertyResult.shadedNetRent, isNewProperty: true,
    })
  }

  // Commitments: existing debts owned by this entity, plus the new loan.
  const commitments = []
  let assessedCommitmentsTotal = 0
  let deductibleInterest = 0
  ;(registers.liabilities || []).forEach(r => {
    const split = splitByOwner({ ...r, amount: 100, frequency: 'Annually' }, entityNames, individualNames)
    const share = (split[entity.name] || 0) / 100
    if (share <= 0) return
    const a = assessedCommitment(r, policy)
    const annual = a.annual * share
    assessedCommitmentsTotal += annual
    if (r.investment) deductibleInterest += n(r.balance) * share * (n(r.rate) / 100)
    commitments.push({ label: `${r.type} — ${r.institution || r.accountName || 'unnamed'}`, annual, basis: a.basis, share })
  })
  if (propertyResult) {
    assessedCommitmentsTotal += propertyResult.principalAndInterest
    deductibleInterest += propertyResult.interestOnly
    commitments.push({
      label: `${property.address || 'New commercial property'} — proposed loan`,
      annual: propertyResult.principalAndInterest,
      basis: `P&I over ${propertyResult.term}yrs at ${round2(propertyResult.assessedRate)}% (assessed)`,
      isNewLoan: true, share: 1,
    })
  }

  // Tax is on real income less real deductions — negative gearing is what
  // makes a lot of these deals work, so leaving it out understates capacity.
  const taxableIncome = Math.max(0, grossIncome - deductibleInterest)
  const tax = isIndividual(entity) ? totalPersonalTax(taxableIncome, policy) : companyTax(taxableIncome, policy)

  // Living expenses apply to people, not companies.
  // Worked out once per household (see householdExpenses) and handed in,
  // so a couple is assessed against one benchmark between them.
  const expenses = isIndividual(entity)
    ? (expensesByEntity[entity.name] || { amount: 0, basis: 'Declared', declared: 0, hem: 0, hemAvailable: !!(policy.hem || []).length, usedHem: false })
    : { amount: 0, basis: 'n/a (entity)', declared: 0, hem: 0, hemAvailable: !!(policy.hem || []).length, usedHem: false }

  const netIncomeAfterTax = shadedIncome - tax
  const surplus = netIncomeAfterTax - expenses.amount - assessedCommitmentsTotal
  const outgoingsTotal = expenses.amount + assessedCommitmentsTotal
  const nsr = outgoingsTotal > 0 ? netIncomeAfterTax / outgoingsTotal : null

  return {
    entity, lines, commitments, propertyResult,
    grossIncome, shadedIncome, taxableIncome, deductibleInterest, tax,
    netIncomeAfterTax, expenses,
    assessedCommitments: assessedCommitmentsTotal,
    surplus, surplusMonthly: surplus / 12,
    nsr, pass: surplus >= 0,
  }
}

// ─── Guarantees ──────────────────────────────────────────────────────────────
// A director guarantee means the lender can come after the guarantor for the
// whole of the guaranteed entity's commitments. Showing an individual's
// position without it is the most common way a group assessment flatters
// itself, so it's surfaced explicitly rather than folded in silently.
export function guaranteeExposure(entityName, entities, byEntity) {
  const me = entities.find(e => e.name === entityName)
  if (!me) return { total: 0, items: [] }
  const items = (me.guarantees || [])
    .map(g => {
      const target = byEntity[g]
      if (!target) return null
      return { entity: g, commitments: target.assessedCommitments, shortfall: Math.max(0, -target.surplus) }
    })
    .filter(Boolean)
  return { total: items.reduce((s, i) => s + i.shortfall, 0), items }
}

// ─── Group ───────────────────────────────────────────────────────────────────
// The consolidated position: every entity's income, tax, expenses and
// commitments added up once. This is NOT a sum of the per-entity surpluses
// where guarantees are involved — a guaranteed shortfall is already inside
// the consolidation, so counting it again on the guarantor would double it.
export function assessGroup(perEntity, policy, property) {
  const included = perEntity.filter(r => !r.entity.excluded)
  const sum = k => included.reduce((s, r) => s + (r[k] || 0), 0)
  const grossIncome = sum('grossIncome')
  const shadedIncome = sum('shadedIncome')
  const tax = sum('tax')
  const expenses = included.reduce((s, r) => s + (r.expenses?.amount || 0), 0)
  const assessedCommitments = sum('assessedCommitments')
  const netIncomeAfterTax = shadedIncome - tax
  const surplus = netIncomeAfterTax - expenses - assessedCommitments
  const outgoings = expenses + assessedCommitments
  const nsr = outgoings > 0 ? netIncomeAfterTax / outgoings : null
  const propertyRes = property && property.loanAmount ? propertyTest(property, policy) : null
  return {
    grossIncome, shadedIncome, tax, expenses, assessedCommitments,
    netIncomeAfterTax, surplus, surplusMonthly: surplus / 12, nsr,
    pass: surplus >= 0, property: propertyRes,
    entityCount: included.length,
  }
}

// ─── Top level ───────────────────────────────────────────────────────────────
export function assessServicing({ contacts, structure, policy }) {
  const st = structure || {}
  const entities = buildEntities(contacts, st.entityDetail)
  const entityNames = entities.map(e => e.name)
  const property = st.commercialProperty || null
  const registers = {
    employment: st.employment || {},
    otherIncome: st.otherIncome || [],
    livingExpenses: st.livingExpenses || [],
    liabilities: st.liabilitiesReg || [],
  }
  const individualNames = entities.filter(isIndividual).map(e => e.name)

  // Two passes: the HEM band is keyed off household income, so gross income
  // has to be known before expenses can be assessed, and expenses have to be
  // known before a surplus means anything.
  const probe = { policy, entityNames, individualNames, registers, property, entities, expensesByEntity: {} }
  const grossByEntity = Object.fromEntries(entities.map(e => [e.name, assessEntity(e, probe).grossIncome]))
  const expensesByEntity = householdExpenses(entities, registers, entityNames, individualNames, policy, grossByEntity)

  const ctx = { policy, entityNames, individualNames, registers, property, entities, expensesByEntity }
  const perEntity = entities.map(e => assessEntity(e, ctx))
  const byEntity = Object.fromEntries(perEntity.map(r => [r.entity.name, r]))
  perEntity.forEach(r => { r.guarantee = guaranteeExposure(r.entity.name, entities, byEntity) })
  const group = assessGroup(perEntity, policy, property)
  return { entities, perEntity, byEntity, group, property, policy }
}

// ─── Sensitivity ─────────────────────────────────────────────────────────────
// Re-runs the whole assessment with the rate moved and/or the vacancy
// assumption worsened — the two things that actually break these deals.
export function sensitivity({ contacts, structure, policy }, scenarios) {
  return (scenarios || []).map(sc => {
    const p = { ...policy, buffer: n(policy.buffer) + n(sc.rateDelta || 0) }
    const st = sc.vacancyPct === undefined || !structure?.commercialProperty
      ? structure
      : { ...structure, commercialProperty: { ...structure.commercialProperty, vacancyPct: sc.vacancyPct } }
    const res = assessServicing({ contacts, structure: st, policy: p })
    return {
      label: sc.label,
      groupSurplus: res.group.surplus,
      groupNsr: res.group.nsr,
      icr: res.group.property?.icr ?? null,
      dscr: res.group.property?.dscr ?? null,
      pass: res.group.pass && (res.group.property ? res.group.property.dscrPass !== false : true),
    }
  })
}
