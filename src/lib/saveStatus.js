// Tiny pub/sub for surfacing save failures to the UI. Every save to
// Supabase across the app is fire-and-forget by design (so typing doesn't
// feel blocked on network round-trips) — but that meant a failed save was
// completely invisible: no error shown, nothing. This is the shared hook
// point that lets any save path (clients, deals, whatever comes later)
// notify the UI when a save to Supabase didn't land, so it can show
// something a person will actually see instead of failing silently.
export const SAVE_FAILED_EVENT = 'rradar:save-failed'

export function notifySaveFailed(kind, detail) {
  console.warn(`[save-failed] ${kind}`, detail)
  try {
    window.dispatchEvent(new CustomEvent(SAVE_FAILED_EVENT, { detail: { kind, at: Date.now(), ...detail } }))
  } catch {}
}
