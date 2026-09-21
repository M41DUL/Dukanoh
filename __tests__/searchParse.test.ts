// The search dictionary: community words become the taxonomy, prices come out,
// leftovers are kept for text matching, and nothing is invented.
import { coerceParsed, emptyParse, isEmptyParse, mergeParsed, parseSearch, searchQueryKey } from '../lib/searchParse';
import { normaliseQueryKey } from '../supabase/functions/_shared/searchParsePrompt';
import { parsedToParams, parsedToRead, readSearchParams } from '../lib/searchParams';

const p = (s: string) => parseSearch(s);

describe('parseSearch: categories and colours', () => {
  test('a full phrase becomes filters with nothing left over', () => {
    expect(p('laal lehenga for shaadi under 150, medium')).toEqual({
      ...emptyParse(), categories: ['Lehenga'], colours: ['Red'], occasions: ['Wedding'], sizes: ['M'], priceMax: 150,
    });
  });
  test('community words and spellings', () => {
    expect(p('ghagra choli').categories).toEqual(['Lehenga']);
    expect(p('saari').categories).toEqual(['Saree']);
    expect(p('sharee').categories).toEqual(['Saree']);
    expect(p('shalwar kameez').categories).toEqual(['Salwar Kameez']);
    expect(p('3 piece suit').categories).toEqual(['Salwar Kameez']);
    expect(p('kurti').categories).toEqual(['Kurta']);
    expect(p('gharara').categories).toEqual(['Sharara']);
    expect(p('chunni').categories).toEqual(['Dupatta']);
    expect(p('choli').categories).toEqual(['Blouse']);
    expect(p('jhumkas').categories).toEqual(['Jewellery']);
    expect(p('khussa').categories).toEqual(['Shoes']);
    expect(p('waistcoat').categories).toEqual(['Nehru Jacket']);
  });
  test('the longest phrase wins over its parts', () => {
    expect(p('salwar').categories).toEqual(['Salwar']);
    expect(p('kurta pajama').categories).toEqual(['Kurta Pajama']);
    expect(p('palazzo suit').categories).toEqual(['Salwar Kameez']);
    expect(p('sharara suit').categories).toEqual(['Sharara']);
    expect(p('khaadi lawn suit')).toMatchObject({ categories: ['Salwar Kameez'], fabrics: ['Lawn'], residual: ['khaadi'] });
    expect(p('kurta pajama').residual).toEqual([]);
    expect(p('rani haar').categories).toEqual(['Jewellery']);
    expect(p('rani haar').colours).toEqual([]);
    expect(p('navy blue kurta').colours).toEqual(['Navy']);
    expect(p('bottle green saree').colours).toEqual(['Green']);
  });
  test('colours in the community\'s words', () => {
    expect(p('gulabi').colours).toEqual(['Pink']);
    expect(p('mehroon').colours).toEqual(['Maroon']);
    expect(p('firozi').colours).toEqual(['Teal']);
    expect(p('sabz').colours).toEqual(['Green']);
    expect(p('off-white').colours).toEqual(['Cream']);
    expect(p('sunehri').colours).toEqual(['Gold']);
  });
  test('typos within a letter or two still match, ambiguous ones do not', () => {
    expect(p('lehnga').categories).toEqual(['Lehenga']);
    expect(p('dupata').categories).toEqual(['Dupatta']);
    expect(p('anarkli').categories).toEqual(['Anarkali']);
    expect(p('shervani').categories).toEqual(['Sherwani']);
    expect(p('georgete').fabrics).toEqual(['Georgette']);
    expect(p('kurtha').categories).toEqual(['Kurta']);
    expect(p('lehengas').categories).toEqual(['Lehenga']);
  });
});

describe('parseSearch: occasions, fabrics, sizes, condition, gender', () => {
  test('occasions', () => {
    expect(p('walima outfit').occasions).toEqual(['Wedding']);
    expect(p('mehendi').occasions).toEqual(['Mehndi']);
    expect(p('gaye holud saree').occasions).toEqual(['Mehndi']);
    expect(p('eid').occasions).toEqual(['Eid']);
    expect(p('navratri').occasions).toEqual(['Festive']);
    expect(p('party wear').occasions).toEqual(['Party']);
    expect(p('office kurta').occasions).toEqual(['Formal']);
  });
  test('bridal and groom carry a gender and an occasion', () => {
    expect(p('bridal lehenga')).toMatchObject({ categories: ['Lehenga'], occasions: ['Wedding'], gender: 'Women' });
    expect(p('groom sherwani')).toMatchObject({ categories: ['Sherwani'], occasions: ['Wedding'], gender: 'Men' });
  });
  test('fabrics', () => {
    expect(p('banarasi silk saree')).toMatchObject({ fabrics: ['Silk'], categories: ['Saree'], residual: ['banarasi'] });
    expect(p('khaadi lawn')).toMatchObject({ fabrics: ['Lawn'], residual: ['khaadi'] });
    expect(p('jamawar').fabrics).toEqual(['Brocade']);
    expect(p('net dupatta')).toMatchObject({ fabrics: ['Net'], categories: ['Dupatta'] });
  });
  test('sizes only when the words say so', () => {
    expect(p('medium kurta').sizes).toEqual(['M']);
    expect(p('size 12 anarkali').sizes).toEqual(['M']);
    expect(p('xl sherwani').sizes).toEqual(['XL']);
    expect(p('free size dupatta').sizes).toEqual(['One size']);
    expect(p('m kurta').sizes).toEqual([]);
    expect(p('m kurta').residual).toEqual(['m']);
  });
  test('condition', () => {
    expect(p('bnwt lehenga').conditions).toEqual(['New']);
    expect(p('brand new saree').conditions).toEqual(['New']);
    expect(p('worn once anarkali').conditions).toEqual(['Excellent']);
  });
  test('gender from the words, never from the category', () => {
    expect(p("men's kurta").gender).toBe('Men');
    expect(p('mens kurta').gender).toBe('Men');
    expect(p('ladies kurta').gender).toBe('Women');
    expect(p('kurta for him').gender).toBe('Men');
    expect(p('sherwani').gender).toBeNull();
    expect(p('lehenga').gender).toBeNull();
  });
});

describe('parseSearch: prices', () => {
  test('maximums', () => {
    expect(p('lehenga under £150').priceMax).toBe(150);
    expect(p('lehenga under 150').priceMax).toBe(150);
    expect(p('saree below 80 quid').priceMax).toBe(80);
    expect(p('kurta up to £40').priceMax).toBe(40);
    expect(p('£100 anarkali').priceMax).toBe(100);
    expect(p('budget 200 sherwani').priceMax).toBe(200);
  });
  test('minimums and ranges', () => {
    expect(p('lehenga over £300').priceMin).toBe(300);
    expect(p('lehenga £50 to £100')).toMatchObject({ priceMin: 50, priceMax: 100 });
    expect(p('lehenga 50 to 100 pounds')).toMatchObject({ priceMin: 50, priceMax: 100 });
    expect(p('lehenga 100-50 pounds')).toMatchObject({ priceMin: 50, priceMax: 100 });
  });
  test('numbers that are not prices are not prices', () => {
    expect(p('size 12 anarkali').priceMax).toBeNull();
    expect(p('3 piece suit').priceMax).toBeNull();
    expect(p('lehenga under 99999').priceMax).toBe(2000);
    expect(p('lehenga 2 to 4').priceMax).toBeNull();
  });
});

describe('parseSearch: leftovers', () => {
  test('brands, weaves and unknown words are kept for the title search, stopwords are not', () => {
    expect(p('Sana Safinaz lawn suit for eid').residual).toEqual(['sana', 'safinaz']);
    expect(p('I want a nice chikankari kurta please').residual).toEqual(['chikankari']);
    expect(p('meyeder jama').residual).toEqual([]);
    expect(p('kuch red lehenga chahiye shaadi ke liye').residual).toEqual(['kuch']);
    expect(p('লেহেঙ্গা').residual).toEqual(['লেহেঙ্গা']);
  });
  test('plain words are a plain text search', () => {
    const r = p('vintage');
    expect(isEmptyParse(r)).toBe(true);
    expect(r.residual).toEqual(['vintage']);
    expect(isEmptyParse(p('red lehenga'))).toBe(false);
    expect(p('')).toEqual(emptyParse());
    expect(p('   ')).toEqual(emptyParse());
  });
  test('punctuation and case do not matter', () => {
    expect(p('RED Lehenga!!')).toMatchObject({ categories: ['Lehenga'], colours: ['Red'], residual: [] });
    expect(p('lehenga, red.')).toMatchObject({ categories: ['Lehenga'], colours: ['Red'] });
  });
});

describe('mergeParsed', () => {
  test('keeps what the dictionary found, adds what Claude found, and takes Claude\'s leftovers', () => {
    const local = { ...emptyParse(), categories: ['Kurta'], residual: ['khaadi', 'lawn'] };
    const remote = { ...emptyParse(), fabrics: ['Lawn'], gender: 'Women' as const, priceMax: 60, residual: ['khaadi'] };
    expect(mergeParsed(local, remote)).toEqual({ ...emptyParse(), categories: ['Kurta'], fabrics: ['Lawn'], gender: 'Women', priceMax: 60, residual: ['khaadi'] });
  });
  test('the dictionary wins a disagreement on gender and price', () => {
    const local = { ...emptyParse(), gender: 'Men' as const, priceMax: 100, residual: ['x'] };
    const remote = { ...emptyParse(), gender: 'Women' as const, priceMax: 50, residual: [] };
    expect(mergeParsed(local, remote)).toMatchObject({ gender: 'Men', priceMax: 100, residual: [] });
  });
});

describe('route parameters', () => {
  test('round-trip', () => {
    const parsed = { ...emptyParse(), categories: ['Lehenga', 'Blouse'], colours: ['Red'], occasions: ['Wedding'], sizes: ['M'], gender: 'Women' as const, priceMin: 50, priceMax: 150, residual: ['banarasi'] };
    const params = parsedToParams(' laal lehenga ', parsed, 'rules');
    expect(params).toEqual({
      title: '“laal lehenga”', term: 'laal lehenga', src: 'rules', categories: 'Lehenga,Blouse', colours: 'Red', occasions: 'Wedding', sizes: 'M',
      gender: 'Women', priceMin: '50', priceMax: '150', query: 'banarasi',
    });
    expect(readSearchParams(params)).toEqual({
      categories: ['Lehenga', 'Blouse'], colours: ['Red'], occasions: ['Wedding'], fabrics: [], sizes: ['M'], conditions: [],
      gender: 'Women', priceMin: 50, priceMax: 150, query: 'banarasi', term: 'laal lehenga', source: 'rules',
    });
  });
  test('empty and odd values read safely', () => {
    expect(readSearchParams({})).toEqual({
      categories: [], colours: [], occasions: [], fabrics: [], sizes: [], conditions: [], gender: null, priceMin: null, priceMax: null, query: '', term: '', source: null,
    });
    expect(readSearchParams({ gender: 'Kids', priceMax: 'abc', categories: ['Saree'], src: 'x' })).toMatchObject({ gender: null, priceMax: null, categories: ['Saree'], source: null });
  });
});

describe('coerceParsed', () => {
  test('keeps only taxonomy values and sane prices', () => {
    expect(coerceParsed({ categories: ['Lehenga', 'Abaya', 'Lehenga'], colours: 'Red', gender: 'Kids', priceMax: 99999, residual: ['Sabyasachi!', 7] }))
      .toEqual({ ...emptyParse(), categories: ['Lehenga'], priceMax: 2000, residual: ['sabyasachi'] });
    expect(coerceParsed(null)).toEqual(emptyParse());
    expect(coerceParsed({ residual: ['ready', 'to', 'wear', '2026', 'khaadi'] }).residual).toEqual(['khaadi']); // ready-to-wear is filler, not a title word
  });
});

describe('the cache key', () => {
  test('matches the server\'s for the same phrase', () => {
    for (const q of ["  Men's  RED lehenga!!  ", 'lehenga under £150', 'লেহেঙ্গা shaadi', 'off-white saree']) {
      expect(searchQueryKey(q)).toBe(normaliseQueryKey(q));
    }
  });
});

describe('parsedToRead', () => {
  test('gives the listings screen exactly what the params round trip would', () => {
    const term = ' banarasi silk saree under 200 ';
    const parsed = { ...emptyParse(), categories: ['Saree'], fabrics: ['Silk'], priceMax: 200, residual: ['banarasi'] };
    expect(parsedToRead(term, parsed, 'claude')).toEqual(readSearchParams(parsedToParams(term, parsed, 'claude')));
  });
  test('an empty leftover list reads as no text query', () => {
    expect(parsedToRead('saree', { ...emptyParse(), categories: ['Saree'] }, 'rules').query).toBe('');
  });
});
