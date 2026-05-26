// Commission rates and app settings — stored in localStorage

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
}

export function getUpfrontRate(category) {
  const settings = loadSettings()
  return (settings.commissionRates[category]?.upfront || 0.50) / 100
}

export function calcUpfront(amount, category) {
  if (!amount) return 0
  return Math.round(amount * getUpfrontRate(category))
}

// Get the currently logged-in user's profile from sessionStorage
export function getCurrentUser() {
  try {
    const s = sessionStorage.getItem('rion-auth')
    return s ? JSON.parse(s) : null
  } catch { return null }
}
