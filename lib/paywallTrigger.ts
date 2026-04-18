/**
 * Simple cross-screen signal: stripe-onboarding sets the flag,
 * profile tab consumes it on next focus to auto-open the paywall.
 */
let _pending = false;

export function schedulePaywallOpen() {
  _pending = true;
}

export function consumePaywallOpen(): boolean {
  const v = _pending;
  _pending = false;
  return v;
}
