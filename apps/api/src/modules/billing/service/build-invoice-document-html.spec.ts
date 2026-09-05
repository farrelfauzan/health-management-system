import { ResolvedInvoiceVariables } from '@hms/shared-types';

import { buildInvoiceDocumentHtml } from './build-invoice-document-html';
import { BUILT_IN_INVOICE_TEMPLATE } from './built-in-invoice-template';

function buildResolved(
  overrides: {
    values?: Record<string, string>;
    items?: Array<Record<string, string>>;
  } = {},
): ResolvedInvoiceVariables {
  return {
    values: {
      'clinic.name': 'Klinik Sehat Bersama',
      'invoice.number': 'INV/20260901/0007',
      'invoice.total': 'Rp 275.000',
      'patient.fullName': 'Siti Rahmawati',
      ...overrides.values,
    },
    items: overrides.items ?? [
      {
        'item.no': '1',
        'item.description': 'Konsultasi Dokter Umum',
        'item.quantity': '1',
        'item.unitPrice': 'Rp 275.000',
        'item.amount': 'Rp 275.000',
      },
    ],
    warnings: [],
  };
}

const NO_WATERMARK = { isVoid: false, reason: null, voidedByName: null };

describe('buildInvoiceDocumentHtml', () => {
  it('substitutes scalar tokens into their spans', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml:
        '<p><span data-hms-var="clinic.name"></span> — <span data-hms-var="invoice.number"></span></p>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
    });

    expect(actual).toContain('<span data-hms-var="clinic.name">Klinik Sehat Bersama</span>');
    expect(actual).toContain('<span data-hms-var="invoice.number">INV/20260901/0007</span>');
  });

  it('escapes hostile values instead of parsing them', () => {
    // US-E1-06: a patient named like markup prints as text — nothing a value
    // contains can become an element in the rendered document.
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<p><span data-hms-var="patient.fullName"></span></p>',
      resolved: buildResolved({
        values: { 'patient.fullName': '<script>alert(1)</script> & "Bob"' },
      }),
      watermark: NO_WATERMARK,
    });

    expect(actual).toContain('&lt;script&gt;');
    expect(actual).not.toContain('<script>');
    expect(actual).toContain('&amp;');
  });

  it('renders an unresolved token as empty, never as the raw token', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<p><span data-hms-var="patient.phone"></span></p>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
    });

    expect(actual).toContain('<span data-hms-var="patient.phone"></span>');
    expect(actual).not.toContain('{{');
  });

  it('expands the items block into one row per line with a repeating header group', () => {
    const items = Array.from({ length: 7 }, (_value, index) => ({
      'item.no': String(index + 1),
      'item.description': `Tindakan ${index + 1}`,
      'item.quantity': '1',
      'item.unitPrice': 'Rp 10.000',
      'item.amount': 'Rp 10.000',
    }));
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<div data-hms-var="items"></div>',
      resolved: buildResolved({ items }),
      watermark: NO_WATERMARK,
    });

    expect(actual.match(/<tbody>(.*)<\/tbody>/s)?.[1]?.match(/<tr>/g)).toHaveLength(7);
    expect(actual).toContain('<thead>');
    expect(actual).toContain('table-header-group');
    expect(actual).toContain('Tindakan 7');
  });

  it('renders only the configured item columns, in the configured order', () => {
    // FR-E1-04 / P16-T11: the author's `settings.itemsColumns` decides the
    // table shape — here amount first, then description, and nothing else.
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<div data-hms-var="items"></div>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
      itemColumns: ['item.amount', 'item.description'],
    });

    expect(actual).toContain('<thead><tr><th>Jumlah</th><th>Uraian</th></tr></thead>');
    expect(actual).not.toContain('<th>No</th>');
    expect(actual).not.toContain('Harga Satuan');
    expect(actual.match(/<tbody><tr>(.*?)<\/tr>/s)?.[1]?.match(/<td/g)).toHaveLength(2);
  });

  it('falls back to every built-in column when no column config is given', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<div data-hms-var="items"></div>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
      itemColumns: [],
    });

    expect(actual).toContain(
      '<thead><tr><th>No</th><th>Uraian</th><th>Jml</th><th>Harga Satuan</th><th>Jumlah</th></tr></thead>',
    );
  });

  it('reserves the materai area only when asked (FR-E1-13)', () => {
    const withArea = buildInvoiceDocumentHtml({
      contentHtml: '<p>a</p>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
      showMateraiArea: true,
    });
    const withoutArea = buildInvoiceDocumentHtml({
      contentHtml: '<p>a</p>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
    });

    expect(withArea).toContain('class="hms-materai"');
    expect(withArea).toContain('page-break-inside: avoid');
    expect(withoutArea).not.toContain('hms-materai"');
  });

  it('renders an inline image token as an img and refuses a non-inline value', () => {
    const withInline = buildInvoiceDocumentHtml({
      contentHtml: '<span data-hms-var="clinic.logo"></span>',
      resolved: buildResolved({ values: { 'clinic.logo': 'data:image/png;base64,iVBORw0KGgo=' } }),
      watermark: NO_WATERMARK,
    });
    const withRemote = buildInvoiceDocumentHtml({
      contentHtml: '<span data-hms-var="clinic.logo"></span>',
      resolved: buildResolved({ values: { 'clinic.logo': 'https://evil.example/x.png' } }),
      watermark: NO_WATERMARK,
    });

    expect(withInline).toContain('<img src="data:image/png;base64,iVBORw0KGgo=');
    expect(withRemote).not.toContain('<img');
    expect(withRemote).not.toContain('evil.example');
  });

  it('stamps the VOID watermark with reason and voiding user', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<p><span data-hms-var="invoice.number"></span></p>',
      resolved: buildResolved(),
      watermark: { isVoid: true, reason: 'wrong patient', voidedByName: 'admin@hms.local' },
    });

    expect(actual).toContain('BATAL / VOID');
    expect(actual).toContain('hms-void-watermark');
    expect(actual).toContain('wrong patient — admin@hms.local');
  });

  it('omits every watermark artefact on a live document', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml: '<p>a</p>',
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
    });

    expect(actual).not.toContain('BATAL / VOID');
    expect(actual).not.toContain('<footer');
  });

  it('stretches editor-saved layout tables across the page while leaving the items table alone', () => {
    // The editor serialises a two-column layout table as `width:100px` with
    // `width:68px` / `width:32px` columns. The base stylesheet has to override
    // that inline width and keep the ratio, or the letterhead wraps one
    // character per line.
    const actual = buildInvoiceDocumentHtml({
      contentHtml:
        '<table style="width:100px"><colgroup><col style="width:68px"><col style="width:32px"></colgroup><tbody><tr><td><p><span data-hms-var="clinic.name"></span></p></td><td><p>x</p></td></tr></tbody></table>',
      resolved: buildResolved(),
      watermark: { isVoid: false, reason: null, voidedByName: null },
    });

    expect(actual).toContain(
      '.hms-document table:not(.hms-items) { width: 100% !important; table-layout: fixed;',
    );
    expect(actual).toContain('<table style="width:100px">');
  });

  it('produces a self-contained document from the built-in template', () => {
    const actual = buildInvoiceDocumentHtml({
      contentHtml: BUILT_IN_INVOICE_TEMPLATE.contentHtml,
      resolved: buildResolved(),
      watermark: NO_WATERMARK,
    });

    expect(actual.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(actual).toContain('Klinik Sehat Bersama');
    expect(actual).toContain('Konsultasi Dokter Umum');
    // Self-containment: nothing in the page references the network.
    expect(actual).not.toContain('http://');
    expect(actual).not.toContain('https://');
  });
});
