import type { LabSpecimenLabel } from '@hms/shared-types';

/**
 * The tube label as a printable page (P18-T08): one 50 × 25 mm sheet per
 * specimen, built as a self-contained HTML document the browser prints.
 *
 * The API supplies the values and never the layout, and no printer is
 * integrated: this is `window.print()` on a page whose `@page` rule is the
 * label stock's size, which is what a thermal label printer on the bench PC
 * receives as a job. Everything is text — no barcode image — because a 25 mm
 * tall label has room for the accession number in a font a scanner-less
 * bench reads by eye, and the number is what the worklist search matches.
 *
 * Values are escaped on the way in: a patient's name is data, and this page
 * is the one place in the app where a string becomes markup by design.
 */
export function buildSpecimenLabelHtml(labels: readonly LabSpecimenLabel[], locale = 'id'): string {
  const sheets = labels.map((label) => buildLabelSheet(label, locale)).join('');
  return [
    '<!DOCTYPE html><html lang="',
    escapeHtml(locale),
    '"><head><meta charset="utf-8"><title>Label spesimen</title><style>',
    LABEL_CSS,
    '</style></head><body>',
    sheets,
    '</body></html>',
  ].join('');
}

function buildLabelSheet(label: LabSpecimenLabel, locale: string): string {
  const collectedAt = formatCollectedAt(label.collectedAt, locale);
  const sexAge = `${label.patient.sex === 'MALE' ? 'L' : 'P'} · ${label.patient.ageYears} th`;
  return [
    '<section class="label">',
    `<p class="accession">${escapeHtml(label.accessionNumber)}</p>`,
    `<p class="name">${escapeHtml(label.patient.fullName)}</p>`,
    `<p class="meta">${escapeHtml(label.patient.mrn)} · ${escapeHtml(sexAge)}</p>`,
    `<p class="meta">${escapeHtml(label.specimenType)} · ${escapeHtml(label.orderNumber)}</p>`,
    `<p class="meta">${escapeHtml(collectedAt)}</p>`,
    '</section>',
  ].join('');
}

function formatCollectedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 50 × 25 mm with a 1.5 mm bleed the roll's cutter eats. One label per page,
 * `page-break-after` on each so a rack of six comes out as six, and the last
 * one does not print a blank seventh.
 */
const LABEL_CSS = [
  '@page { size: 50mm 25mm; margin: 0; }',
  '* { box-sizing: border-box; }',
  'html, body { margin: 0; padding: 0; }',
  'body { font-family: Helvetica, Arial, sans-serif; color: #000; }',
  '.label { width: 50mm; height: 25mm; padding: 1.5mm 2mm; overflow: hidden; page-break-after: always; break-after: page; }',
  '.label:last-child { page-break-after: auto; break-after: auto; }',
  '.label p { margin: 0; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.accession { font-size: 11pt; font-weight: 700; letter-spacing: 0.02em; }',
  '.name { font-size: 9pt; font-weight: 600; }',
  '.meta { font-size: 7pt; }',
  '@media screen { body { background: #e2e8f0; padding: 8mm; } .label { background: #fff; margin-bottom: 4mm; box-shadow: 0 1px 2px rgba(0,0,0,.2); } }',
].join('\n');
