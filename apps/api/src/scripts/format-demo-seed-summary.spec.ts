import { formatDemoSeedSummary } from './format-demo-seed-summary';
import { DemoAccountFixture, DemoSeedLine } from './seed-demo.types';

describe('formatDemoSeedSummary', () => {
  const inputAccounts: DemoAccountFixture[] = [
    {
      email: 'admin.klinik@demo.salingjaga.com',
      fullName: 'Rina Marlina',
      roleCode: 'ADMIN',
      purpose: 'front desk',
    },
  ];

  it('counts each section and lists only what the run changed', () => {
    const inputLines: DemoSeedLine[] = [
      { section: 'Accounts', label: 'ADMIN admin.klinik@demo.salingjaga.com', outcome: 'CREATED' },
      { section: 'Tariffs', label: 'KIA-ANC', outcome: 'EXISTING' },
      { section: 'Tariffs', label: 'KB-IUD', outcome: 'UPDATED' },
    ];
    const actualOutput = formatDemoSeedSummary({
      lines: inputLines,
      accounts: inputAccounts,
      resetBootstrapEmails: [],
    });
    expect(actualOutput).toContain('Accounts: 1 created, 0 updated, 0 already present');
    expect(actualOutput).toContain('Tariffs: 0 created, 1 updated, 1 already present');
    expect(actualOutput).toContain('  - KB-IUD: updated');
    expect(actualOutput).not.toContain('  - KIA-ANC: existing');
  });

  it('prints each login with its role but never a password', () => {
    const actualOutput = formatDemoSeedSummary({
      lines: [],
      accounts: inputAccounts,
      resetBootstrapEmails: ['admin@salingjaga.com'],
    });
    expect(actualOutput).toContain('  admin.klinik@demo.salingjaga.com  [ADMIN]  front desk');
    expect(actualOutput.join('\n')).toMatch(/admin@salingjaga\.com {2}\[bootstrap\]/);
    expect(actualOutput.join('\n')).not.toMatch(/password: [^t]/);
  });

  it('ends with the demo order, dispensing before the invoice', () => {
    const actualOutput = formatDemoSeedSummary({
      lines: [],
      accounts: inputAccounts,
      resetBootstrapEmails: [],
    });
    const dispenseIndex = actualOutput.findIndex((line) => line.includes('PHARMACIST: dispense'));
    const invoiceIndex = actualOutput.findIndex((line) => line.includes('generate the invoice'));
    expect(dispenseIndex).toBeGreaterThan(-1);
    expect(invoiceIndex).toBeGreaterThan(dispenseIndex);
  });
});
