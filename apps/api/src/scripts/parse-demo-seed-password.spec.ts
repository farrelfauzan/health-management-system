import { parseDemoSeedPassword } from './parse-demo-seed-password';

describe('parseDemoSeedPassword', () => {
  it('returns a password that meets the account policy', () => {
    const inputPassword = 'a-long-enough-demo-passphrase';
    const actualPassword = parseDemoSeedPassword(inputPassword);
    expect(actualPassword).toBe(inputPassword);
  });

  it('refuses a missing value, because there is no default password', () => {
    expect(() => parseDemoSeedPassword(undefined)).toThrow(/DEMO_SEED_PASSWORD is required/);
  });

  it('refuses a blank value', () => {
    expect(() => parseDemoSeedPassword('   ')).toThrow(/DEMO_SEED_PASSWORD is required/);
  });

  it('refuses a password shorter than the policy allows', () => {
    expect(() => parseDemoSeedPassword('short-pw')).toThrow(/at least 12 characters/);
  });

  it('never echoes the refused value', () => {
    const inputPassword = 'secret9';
    expect(() => parseDemoSeedPassword(inputPassword)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(inputPassword) }),
    );
  });
});
