import { resolveDemoLabPrice } from './resolve-demo-lab-price';

describe('resolveDemoLabPrice', () => {
  it('prices a listed test from the list', () => {
    expect(resolveDemoLabPrice({ code: 'HB', kind: 'TEST' })).toBe(25000);
  });

  it('prices a listed panel from the list', () => {
    expect(resolveDemoLabPrice({ code: 'DARAH-RUTIN', kind: 'PANEL' })).toBe(75000);
  });

  it('prices an unlisted urinalysis parameter as a dipstick line', () => {
    expect(resolveDemoLabPrice({ code: 'URXYZ', kind: 'TEST' })).toBe(10000);
  });

  /** A clinic's own test added before seeding must still be priced, never a gap. */
  it('prices any other unlisted test with the default', () => {
    expect(resolveDemoLabPrice({ code: 'CUSTOM-TEST', kind: 'TEST' })).toBe(30000);
  });

  it('prices an unlisted panel with the panel default', () => {
    expect(resolveDemoLabPrice({ code: 'CUSTOM-PANEL', kind: 'PANEL' })).toBe(100000);
  });
});
