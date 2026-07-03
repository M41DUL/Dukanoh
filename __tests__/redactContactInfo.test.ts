import { redactContactInfo } from '../lib/redactContactInfo';

// Expected outputs mirror the live SQL redact_contact_info() results so this
// JS mirror can't silently drift from the database trigger.
describe('redactContactInfo', () => {
  describe('phone numbers', () => {
    it('redacts a standard UK mobile', () => {
      expect(redactContactInfo('call me on 07712 345678')).toBe('call me on [hidden]');
    });

    it('redacts a fully space-separated (evasion) number', () => {
      expect(redactContactInfo('0 7 7 1 2 3 4 5 6 7 8')).toBe('[hidden]');
    });

    it('redacts a +44 number', () => {
      expect(redactContactInfo('+44 7712 345678')).toBe('[hidden]');
    });

    it('redacts a UK landline', () => {
      expect(redactContactInfo('landline 0208 123 4567')).toBe('landline [hidden]');
    });

    it('redacts numbers joined by dashes and parentheses', () => {
      const out = redactContactInfo('(07712)-345-678');
      expect(out).toContain('[hidden]');
      expect(out).not.toMatch(/\d/); // every digit gone
    });
  });

  describe('emails, handles and keywords', () => {
    it('redacts an email with dots and underscores', () => {
      expect(redactContactInfo('email me a.b_c@gmail.com')).toBe('email me [hidden]');
    });

    it('redacts a platform keyword', () => {
      expect(redactContactInfo('message me on whatsapp instead')).toBe('message me on [hidden] instead');
    });

    it('redacts a payment keyword', () => {
      expect(redactContactInfo('my paypal works too')).toBe('my [hidden] works too');
    });

    it('redacts an @handle including underscores', () => {
      expect(redactContactInfo('follow @myinsta_shop')).toBe('follow [hidden]');
    });

    it('redacts multiple channels in one message', () => {
      expect(redactContactInfo('ring 07712 345678 or a@b.com on whatsapp')).toBe(
        'ring [hidden] or [hidden] on [hidden]'
      );
    });

    it('redacts "whats app" with a space', () => {
      expect(redactContactInfo('add me on whats app')).toBe('add me on [hidden]');
    });
  });

  describe('does not over-redact legitimate clothing chat', () => {
    it('leaves "instant" alone (word boundary, not "insta")', () => {
      expect(redactContactInfo('this is instant delivery honestly')).toBe('this is instant delivery honestly');
    });

    it('leaves a short size list alone', () => {
      expect(redactContactInfo('sizes 8 10 12 14 available')).toBe('sizes 8 10 12 14 available');
    });

    it('leaves prices and sizes alone', () => {
      expect(redactContactInfo('price is £40 for size 10')).toBe('price is £40 for size 10');
    });

    it('leaves a short date alone', () => {
      expect(redactContactInfo('listed on 2026-07-03')).toBe('listed on 2026-07-03');
    });

    it('leaves an ordinary message untouched', () => {
      expect(redactContactInfo('Is this still available? Love the colour!')).toBe(
        'Is this still available? Love the colour!'
      );
    });
  });

  describe('known trade-off: long number runs', () => {
    it('redacts a very long space-separated number list (10+ digits)', () => {
      // Matches the disclosed SQL behaviour — recoverable via message_redactions.
      expect(redactContactInfo('sizes 8 10 12 14 16 18 20')).toBe('sizes 8 1[hidden]');
    });
  });
});
