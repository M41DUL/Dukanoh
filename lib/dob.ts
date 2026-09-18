/**
 * Date-of-birth helpers shared by email signup, the username step that social
 * sign-ups pass through, and the profile editor. Terms 2: members must be 18+.
 */
export const UNDER_18_MESSAGE = 'You must be 18 or over to use Dukanoh';

/** Formats raw keypad input as DD/MM/YYYY while typing. */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** DD/MM/YYYY → YYYY-MM-DD, or null if not a real date. */
export function dobToIso(display: string): string | null {
  const parts = display.replace(/\s/g, '').split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  const date = new Date(`${y}-${m}-${d}`);
  if (isNaN(date.getTime())) return null;
  return `${y}-${m}-${d}`;
}

/** True when the ISO date is at least 18 years before today. */
export function isOver18(isoDate: string): boolean {
  const dob = new Date(isoDate);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob <= cutoff;
}
