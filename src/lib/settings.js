// Commission rates and app settings — stored in localStorage + Supabase
import { sbLoadSettings, sbSaveSettings } from './supabase.js'

const SETTINGS_KEY = 'rion-settings-v1'

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
  // User accounts — admins can manage these in Settings > Team
  users: [
    { id: '1', name: 'Cameron Finlayson', email: 'cameron@rion-capital.com', password: 'RionDash2', phone: '0400 000 000', role: 'admin', active: true },
  ],
}

export function loadSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY)
    if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) }
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
      return { ...DEFAULT_SETTINGS, ...cloud }
    }
  } catch {}
  return null
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
