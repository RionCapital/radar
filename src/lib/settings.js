// Commission rates and app settings — stored in localStorage + Supabase
import { sbLoadSettings, sbSaveSettings } from './supabase.js'
import { LOAN_TYPES } from './data.js'

const SETTINGS_KEY = 'rion-settings-v1'

// Loan types whose exact string is depended on elsewhere in the app —
// MAF drives the parcels page + dashboard routing (loan.type==='MAF'), and
// Asset Finance drives the calculated balance graph on the loan detail page
// (loan.type==='Asset Finance'). These can be reordered like any other type
// but not renamed or removed — editable in Settings > CRM > Loan Types.
export const PROTECTED_LOAN_TYPES = ['Asset Finance', 'MAF']

export const DEFAULT_SETTINGS = {
  commissionRates: {
    'Residential':      { upfront: 0.66, trail: 0.15, label: 'Residential Home Loans' },
    'Asset Finance':    { upfront: 2.50, trail: 0.00, label: 'Asset Finance' },
    'Commercial Loans': { upfront: 0.50, trail: 0.15, label: 'Commercial Loans' },
    'Business Loans':   { upfront: 0.50, trail: 0.15, label: 'Business Loans' },
    'SMSF':             { upfront: 0.66, trail: 0.15, label: 'SMSF' },
    'Invoice Finance':  { upfront: 0.50, trail: 0.00, label: 'Invoice Finance' },
    'Other':            { upfront: 0.50, trail: 0.15, label: 'Other' },
  },
  brokerName: 'Cameron Finlayson',
  brokerEmail: 'cameron@rion-capital.com',
  brokerPhone: '0400 000 000',
  brokerMobile: '0400 000 000',
  businessName: 'Rion Capital Investments Pty Ltd',
  // Company-wide details used on generated documents (tax invoices, etc.) —
  // distinct from the individual broker defaults above, which are for
  // email templates. Editable in Settings > Business Details.
  companyDetails: {
    fullCompanyName: 'Rion Capital Investments Pty Ltd',
    tradingName: 'Rion Capital',
    abn: '76 641 258 040',
    acn: '',
    address: '201/90 Podium Way, ORAN PARK NSW 2570, AUSTRALIA',
    phone: '0421 498 878',
    email: 'cameron@rion-capital.com',
    bankName: 'Rion Capital Investments Pty Ltd',
    bsb: '062 - 656',
    accountNumber: '1049 3213',
    startingInvoiceNumber: 1150,
  },
  // Default weekly targets for the Planner — editable in Settings > Planner Targets.
  // Applied when a new week is first created; existing weeks keep whatever they already have.
  plannerTargets: {
    lodgementCount: 4,
    settlementCount: 3,
    settlementDollar: 1000000,
  },
  // Loan types offered in every "+ Add loan" / loan-type dropdown across
  // the app — editable in Settings > CRM > Loan Types. A plain list of
  // strings, stored directly on each loan as loan.type; renaming an entry
  // here only changes what shows up for loans added from now on, it does
  // NOT retroactively rename existing loans (unlike CRM > Stages, there's
  // no id-based indirection here). See PROTECTED_LOAN_TYPES above.
  loanTypes: LOAN_TYPES,
  // CRM pipeline stages — editable in Settings > CRM > Stages. `id` is
  // permanent and never shown; it's what every page uses internally to
  // recognise a stage (e.g. "this deal is Settled") so a deal's Status
  // keeps resolving correctly even after the stage is renamed or moved.
  // `label` is the editable display text; the "N. " number prefix stored
  // on deals is always derived from a stage's position in this list, never
  // hand-typed, so renumbering after an add/reorder happens automatically.
  dealStages: [
    { id: 'discovery',     label: 'Discovery' },
    { id: 'strategy',      label: 'Strategy' },
    { id: 'pre-lodged',    label: 'Pre-Lodged' },
    { id: 'lodged',        label: 'Lodged' },
    { id: 'conditional',   label: 'Conditional' },
    { id: 'unconditional', label: 'Unconditional' },
    { id: 'settled',       label: 'Settled' },
    { id: 'withdrawn',     label: 'Withdrawn' },
  ],
  // Which email application should open when a broker sends a templated
  // email from the CRM — editable in Settings > CRM > Communication.
  // 'outlook' downloads a .eml file (double-click opens native Outlook
  // compose), 'gmail' opens a Gmail compose tab + copies the formatted
  // body to the clipboard (Gmail's URL scheme can't carry rich HTML),
  // 'other' just copies the formatted body to the clipboard.
  emailClient: 'outlook',
  // Documents a broker can attach to CRM templated emails (e.g. credit
  // guides, privacy statements, the Fact Find, the Asset & Liability
  // Statement) — uploaded once in Settings > CRM > Communication and
  // reused from there, rather than re-attached by hand every time.
  // `content` is the raw base64 payload (no "data:mime;base64," prefix) —
  // exactly the shape emailUtils.js's downloadEml() expects for an
  // attachment, so it can go straight into a .eml with no reprocessing.
  // A template's `attachmentIds` (see emailTemplates below) lists which of
  // these attach automatically when that template's email is sent; the
  // Document Request send screen also lets a broker tick/untick specific
  // ones for a single email without changing the template's defaults.
  emailAttachments: [],
  // Email templates authored in Settings > CRM > Communication. The two
  // built-in templates below (type: 'rfi' / 'outstanding') power the
  // Document Request emails on a deal's Attachments tab — their ids are
  // fixed so code can always find them, but their content is fully
  // editable here. {{CLIENT_NAME}}, {{CHECKLIST}} and {{KEY_POINTS_BLOCK}}
  // are placeholder tokens filled in at send time. Any other templates a
  // broker adds are freeform and untouched by the migration below.
  emailTemplates: [
    {
      id: 'rfi-default',
      type: 'rfi',
      name: 'Request for Information (Initial)',
      subject: 'Information Required — {{CLIENT_NAME}}',
      body:
        'Thank you for the opportunity to assist with your finance application.\n\n' +
        'To progress your application, we require the following information and documentation:\n\n' +
        '{{CHECKLIST}}\n\n' +
        '{{KEY_POINTS_BLOCK}}\n\n' +
        'Please provide these items at your earliest convenience so we can keep your application moving. If you have any questions about any of the items above, please don\'t hesitate to reach out.',
    },
    {
      id: 'outstanding-default',
      type: 'outstanding',
      name: 'Outstanding Documents (Follow-up)',
      subject: 'Outstanding Documents Required — {{CLIENT_NAME}}',
      body:
        'Thank you for the information provided so far.\n\n' +
        'To continue progressing your application, we still require the following outstanding items:\n\n' +
        '{{CHECKLIST}}\n\n' +
        '{{KEY_POINTS_BLOCK}}\n\n' +
        'Please provide these outstanding items as soon as possible so there is no delay to your application. If you have any questions, please don\'t hesitate to reach out.',
    },
  ],
  // User accounts — admins can manage these in Settings > Team
  users: [
    { id: '1', name: 'Cameron Finlayson', email: 'cameron@rion-capital.com', password: 'RionDash2', phone: '0400 000 000', role: 'admin', active: true },
  ],
}

// Ensures the two built-in typed templates (rfi / outstanding) always exist,
// without discarding any freeform templates a broker has added. Existing
// settings saved before these were introduced would otherwise have an
// emailTemplates array missing them entirely.
function withTypedTemplates(settings) {
  const existing = settings.emailTemplates || []
  const merged = [...existing]
  DEFAULT_SETTINGS.emailTemplates.forEach(def => {
    if (!merged.some(t => t.type === def.type)) merged.push(def)
  })
  if (merged.length === existing.length) return settings
  return { ...settings, emailTemplates: merged }
}

export function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY)
    if (s) return withTypedTemplates({ ...DEFAULT_SETTINGS, ...JSON.parse(s) })
  } catch {}
  return DEFAULT_SETTINGS
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
  sbSaveSettings(settings).catch(() => {})
}

export async function syncSettingsFromSupabase() {
  try {
    const cloud = await sbLoadSettings()
    if (cloud) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloud))
      return withTypedTemplates({ ...DEFAULT_SETTINGS, ...cloud })
    }
  } catch {}
  return null
}

// Resolve the current (editable) built-in template for a given flow —
// 'rfi' for the initial Request for Information email, 'outstanding' for
// the follow-up that lists only unticked items. Falls back to the
// hardcoded default if a broker somehow deletes it.
export function getEmailTemplateByType(type, settingsArg) {
  const settings = settingsArg || loadSettings()
  const found = (settings.emailTemplates || []).find(t => t.type === type)
  if (found) return found
  return DEFAULT_SETTINGS.emailTemplates.find(t => t.type === type)
}

export function getUpfrontRate(category) {
  const settings = loadSettings()
  return (settings.commissionRates[category]?.upfront || 0.50) / 100
}

export function calcUpfront(amount, category) {
  if (!amount) return 0
  return Math.round(amount * getUpfrontRate(category))
}

// Per-deal commission override — for facilities where the rate was actually
// negotiated rather than the standard category rate from Settings. This is
// forecasting/pipeline information ONLY: it feeds the CRM's Pipeline
// forecast and Marketing's Inflight Deals view for deals not yet settled.
// It deliberately does NOT write anywhere near a client's real income —
// that stays sourced from the commission statement alone, with no
// exceptions, to avoid any risk of double-counting real money.
export function dealUpfrontCommission(deal) {
  const ov = deal._commission || {}
  if (ov.upfrontAmountOverride !== undefined && ov.upfrontAmountOverride !== null && ov.upfrontAmountOverride !== '') {
    return Math.round(Number(ov.upfrontAmountOverride))
  }
  if (ov.upfrontRateOverride !== undefined && ov.upfrontRateOverride !== null && ov.upfrontRateOverride !== '') {
    return Math.round((deal.Amount || 0) * Number(ov.upfrontRateOverride) / 100)
  }
  return calcUpfront(deal.Amount, deal.Categories)
}

// The effective rate behind dealUpfrontCommission — for display, e.g.
// "2.50%" vs "Negotiated". Falls back to the standard category rate.
export function dealUpfrontRateEffective(deal) {
  const ov = deal._commission || {}
  if (ov.upfrontAmountOverride !== undefined && ov.upfrontAmountOverride !== null && ov.upfrontAmountOverride !== '' && deal.Amount) {
    return (Number(ov.upfrontAmountOverride) / deal.Amount) * 100
  }
  if (ov.upfrontRateOverride !== undefined && ov.upfrontRateOverride !== null && ov.upfrontRateOverride !== '') {
    return Number(ov.upfrontRateOverride)
  }
  return getUpfrontRate(deal.Categories) * 100
}

export function dealCommissionIsOverridden(deal) {
  const ov = deal._commission || {}
  return (ov.upfrontAmountOverride !== undefined && ov.upfrontAmountOverride !== null && ov.upfrontAmountOverride !== '')
    || (ov.upfrontRateOverride !== undefined && ov.upfrontRateOverride !== null && ov.upfrontRateOverride !== '')
}

// Get the currently logged-in user's profile from sessionStorage
export function getCurrentUser() {
  try {
    const s = sessionStorage.getItem('rion-auth')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

// Every active team member is a candidate to be assigned as a client's
// broker — Settings > Team Members is the single place these are managed.
export function getBrokerOptions(settingsArg) {
  const settings = settingsArg || loadSettings()
  return (settings.users || []).filter(u => u.active !== false)
}

// The single source of truth for "whose contact details should appear on
// this client's emails". Every email touchpoint (Annual Review, Fixed/IO
// Expiry, Maturity, General, Property Review, and the quick templates on
// the Contacts page) should resolve broker name/phone/email through this
// function rather than reading getCurrentUser() (whoever happens to be
// logged in when the email is sent, which is wrong the moment more than
// one person can send from an account) or hardcoding a name. Reads the
// broker assigned to this specific client (client.brokerId, set from the
// Client Dashboard or bulk-assigned in Settings > Team Members) and falls
// back to the settings-wide default broker for any client that hasn't
// been assigned one yet, so nothing breaks before every client is triaged.
export function getClientBroker(client, settingsArg) {
  const settings = settingsArg || loadSettings()
  const users = settings.users || []
  const assigned = client?.brokerId ? users.find(u => u.id === client.brokerId && u.active !== false) : null
  if (assigned) {
    return { id: assigned.id, name: assigned.name || '', email: assigned.email || '', phone: assigned.phone || '' }
  }
  return {
    id: null,
    name: settings.brokerName || '',
    email: settings.brokerEmail || '',
    phone: settings.brokerPhone || settings.brokerMobile || '',
  }
}

// The single source of truth for "what CRM pipeline stages exist, in what
// order, and what are they currently called" — every page that shows or
// filters deals by stage should read through this (or stageDisplay below)
// rather than keeping its own hardcoded stage list, so a rename/add/
// reorder made in Settings > CRM > Stages takes effect everywhere at once
// instead of silently drifting out of sync. Adds a computed `display`
// string ("N. Label") to each stage — this is exactly what gets stored in
// a deal's Status field, so a stage's position in this list IS its number.
export function getDealStages(settingsArg) {
  const settings = settingsArg || loadSettings()
  const stages = (settings.dealStages && settings.dealStages.length) ? settings.dealStages : DEFAULT_SETTINGS.dealStages
  return stages.map((s, i) => ({ ...s, display: `${i + 1}. ${s.label}` }))
}

// Resolve a single stage's current display string ("7. Settled") by its
// permanent id — for anywhere that needs to set or compare a deal's
// Status against a *specific* stage (e.g. "mark this deal Settled")
// regardless of what that stage is currently labelled or numbered.
export function stageDisplay(id, settingsArg) {
  const found = getDealStages(settingsArg).find(s => s.id === id)
  return found ? found.display : ''
}

// The single source of truth for "what loan types show up in every
// '+ Add loan' / loan-type dropdown" — read through this rather than
// importing LOAN_TYPES from lib/data.js directly, so a broker's edits in
// Settings > CRM > Loan Types take effect everywhere at once.
export function getLoanTypes(settingsArg) {
  const settings = settingsArg || loadSettings()
  return (settings.loanTypes && settings.loanTypes.length) ? settings.loanTypes : DEFAULT_SETTINGS.loanTypes
}
