import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('PII audit regression sentinels', () => {
  it.each([
    ['auth/service/auth.service.ts', /metadata:\s*\{\s*email/],
    ['admin-management/service/admin-management.service.ts', /metadata:\s*\{[^}]*email/],
    ['patient-management/service/patient-management.service.ts', /metadata:\s*\{\s*mrn/],
    ['billing/service/billing.service.ts', /metadata:\s*\{[^}]*(invoiceNumber|reason)/],
  ])('keeps prohibited values out of %s audit metadata', (relativePath, sentinel) => {
    expect(readSource(`modules/${relativePath}`)).not.toMatch(sentinel);
  });

  it('keeps raw Prisma query and parameter event logging disabled', () => {
    const source = readSource('common/prisma/prisma.service.ts');

    expect(source).not.toContain("level: 'query'");
    expect(source).not.toContain("$on('query'");
    expect(source).not.toContain('event.params');
  });
});
