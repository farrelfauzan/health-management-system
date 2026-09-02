import { resolveInvoiceVariables } from '../../billing/service/resolve-invoice-variables';
import { DEFAULT_MATERAI_THRESHOLD_IDR } from '../../billing/service/materai-threshold';
import { buildInvoicePreviewFixture } from './invoice-preview-fixture';

describe('buildInvoicePreviewFixture', () => {
  const fixture = buildInvoicePreviewFixture('Asia/Jakarta');

  it('carries a 120-character patient name (US-E1-06)', () => {
    expect(fixture.patient?.fullName).toHaveLength(120);
  });

  it('carries twelve line items including exactly one zero-price line', () => {
    expect(fixture.items).toHaveLength(12);
    expect(fixture.items.filter((item) => item.unitPrice === 0)).toHaveLength(1);
  });

  it('totals above the materai threshold and matches the sum of its lines', () => {
    const lineSum = fixture.items.reduce((sum, item) => sum + item.amount, 0);
    expect(fixture.invoice.totalAmount).toBe(lineSum);
    expect(fixture.invoice.totalAmount).toBeGreaterThan(DEFAULT_MATERAI_THRESHOLD_IDR);
  });

  it('resolves through the real resolver: the zero-price line prints Rp 0, not blank', () => {
    const resolved = resolveInvoiceVariables(fixture);
    const zeroLine = resolved.items.find((item) => item['item.unitPrice'] === 'Rp 0');
    expect(zeroLine).toBeDefined();
    expect(zeroLine?.['item.amount']).toBe('Rp 0');
    expect(resolved.values['patient.fullName']).toHaveLength(120);
    expect(resolved.values['patient.nikMasked']).toMatch(/3271$/);
    expect(resolved.values['patient.nikMasked']).not.toContain('•••••••••••••');
  });

  it('never carries a plaintext identifier', () => {
    expect(fixture.patient?.nik).not.toMatch(/^\d{16}$/);
  });
});
