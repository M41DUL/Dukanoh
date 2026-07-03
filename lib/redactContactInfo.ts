/**
 * Canonical JS mirror of the SQL `redact_contact_info()` function
 * (migration 20260703120000_redact_message_contact_info).
 *
 * The DATABASE trigger `on_message_redact` is the authoritative redactor at
 * runtime — messages are scrubbed server-side so the original still reaches the
 * admin-only `message_redactions` table. This module is the documented spec +
 * regression guard for the intended ruleset, covered by
 * __tests__/redactContactInfo.test.ts. If you change the SQL regex, change these
 * patterns too (and vice versa) so the two stay in sync.
 *
 * Patterns are applied in order; each match becomes `[hidden]`.
 */
const REDACTIONS: RegExp[] = [
  // emails
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  // platform / payment keywords (word-bounded so "insta" != "instant")
  /\b(whats\s?app|wtsapp|watsapp|instagram|insta|telegram|snapchat|paypal|venmo|cashapp|revolut|monzo|iban|bank\s+transfer|sort\s+code)\b/gi,
  // @handles
  /@[a-z0-9._]{2,}/gi,
  // UK mobile / +44, spacing-tolerant and anchored to the prefix
  /(\+?4[\s.()-]*4|0[\s.()-]*0[\s.()-]*4[\s.()-]*4|0)[\s.()-]*7([\s.()-]*\d){9}/g,
  // UK landline (0 + 1/2/3 area code)
  /0[\s.()-]*[123]([\s.()-]*\d){8,9}/g,
  // generic backstop: any run of 10+ digits (separators allowed)
  /\d([\s.()-]*\d){9,}/g,
];

/** Replace emails, platform/payment keywords, @handles and phone numbers with `[hidden]`. */
export function redactContactInfo(text: string): string {
  return REDACTIONS.reduce((acc, re) => acc.replace(re, '[hidden]'), text);
}
