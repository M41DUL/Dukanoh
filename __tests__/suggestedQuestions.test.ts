import {
  buildSuggestedQuestions,
  hasMeasurements,
  SuggestedQuestionInput,
} from '../lib/suggestedQuestions';

// A buyer on a plain buyable listing with all gaps present.
const base: SuggestedQuestionInput = {
  isBuyer: true,
  canBuy: true,
  messageCount: 0,
  askedContents: [],
  measurements: null,
  imageCount: 1,
  condition: 'Good',
  category: 'Women',
  occasion: null,
};

describe('hasMeasurements', () => {
  it('is false for null or all-empty objects', () => {
    expect(hasMeasurements(null)).toBe(false);
    expect(hasMeasurements({})).toBe(false);
    expect(hasMeasurements({ chest: null, waist: '', length: undefined })).toBe(false);
  });

  it('is true when any field has a real value', () => {
    expect(hasMeasurements({ chest: '40', waist: null })).toBe(true);
    expect(hasMeasurements({ note: 'runs small' })).toBe(true);
  });
});

describe('buildSuggestedQuestions — visibility gates', () => {
  it('returns [] for a seller', () => {
    expect(buildSuggestedQuestions({ ...base, isBuyer: false })).toEqual([]);
  });

  it('returns [] when the listing is not buyable', () => {
    expect(buildSuggestedQuestions({ ...base, canBuy: false })).toEqual([]);
  });

  it('returns [] once the thread has 6+ messages', () => {
    expect(buildSuggestedQuestions({ ...base, messageCount: 6 })).toEqual([]);
  });

  it('shows chips early in the thread', () => {
    expect(buildSuggestedQuestions({ ...base, messageCount: 5 }).length).toBeGreaterThan(0);
  });
});

describe('buildSuggestedQuestions — gap-driven rules', () => {
  it('asks for measurements only when missing', () => {
    expect(buildSuggestedQuestions(base)).toContain('What are the measurements?');
    expect(buildSuggestedQuestions({ ...base, measurements: { chest: '40' } })).not.toContain(
      'What are the measurements?'
    );
  });

  it('asks for more photos only when there is at most one', () => {
    expect(buildSuggestedQuestions(base)).toContain('Can you send more photos?');
    expect(buildSuggestedQuestions({ ...base, imageCount: 3 })).not.toContain('Can you send more photos?');
  });

  it('asks about flaws unless the item is new', () => {
    expect(buildSuggestedQuestions(base)).toContain('Any flaws or damage?');
    expect(buildSuggestedQuestions({ ...base, condition: 'New with tags' })).not.toContain(
      'Any flaws or damage?'
    );
  });

  it('asks about sizing for shoes', () => {
    expect(buildSuggestedQuestions({ ...base, category: 'Shoes' })).toContain('Is it true to size?');
    expect(buildSuggestedQuestions(base)).not.toContain('Is it true to size?');
  });

  it('asks about delivery timing for time-sensitive occasions', () => {
    expect(buildSuggestedQuestions({ ...base, occasion: 'Festive' })).toContain('Will it arrive in time?');
    expect(buildSuggestedQuestions({ ...base, occasion: 'Casualwear' })).not.toContain(
      'Will it arrive in time?'
    );
  });

  it('asks about authenticity only for weddings', () => {
    // Reduce other gaps so the authenticity chip isn't capped out.
    const minimalGaps: SuggestedQuestionInput = {
      ...base,
      measurements: { chest: '40' },
      imageCount: 4,
      condition: 'New',
    };
    expect(buildSuggestedQuestions({ ...minimalGaps, occasion: 'Wedding' })).toContain('Is this authentic?');
    expect(buildSuggestedQuestions({ ...minimalGaps, occasion: 'Festive' })).not.toContain('Is this authentic?');
  });

  it('always includes the availability fallback', () => {
    // A listing with no gaps still offers the fallback question.
    const noGaps: SuggestedQuestionInput = {
      ...base,
      measurements: { chest: '40' },
      imageCount: 4,
      condition: 'New',
    };
    expect(buildSuggestedQuestions(noGaps)).toEqual(['Is this still available?']);
  });
});

describe('buildSuggestedQuestions — capping and dedupe', () => {
  it('caps at 4 chips', () => {
    const many: SuggestedQuestionInput = { ...base, category: 'Shoes', occasion: 'Wedding' };
    expect(buildSuggestedQuestions(many)).toHaveLength(4);
  });

  it('drops a question the buyer has already asked', () => {
    const asked = { ...base, askedContents: ['What are the measurements?'] };
    expect(buildSuggestedQuestions(asked)).not.toContain('What are the measurements?');
  });

  it('matches already-asked case-insensitively and trimmed', () => {
    const asked = { ...base, askedContents: ['  is this still available?  '] };
    expect(buildSuggestedQuestions(asked)).not.toContain('Is this still available?');
  });
});
