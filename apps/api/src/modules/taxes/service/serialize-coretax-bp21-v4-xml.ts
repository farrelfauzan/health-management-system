import { CoretaxBp21Document, CoretaxBp21Line } from '@hms/shared-types';

/**
 * The layout of DJP's own converter output (the `bp21.xml` sample published
 * beside the v4 workbook on pajak.go.id node 112031, which is what Excel's
 * XML-map export writes): an XML declaration with `standalone="yes"`, the
 * root carrying only the `xsi` namespace, CRLF line ends, one tab per level
 * and no newline after the root's closing tag.
 */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ROOT_OPEN = '<Bp21Bulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
const ROOT_CLOSE = '</Bp21Bulk>';
const LINE_END = '\r\n';
const INDENT = '\t';
const MAX_DECIMAL_PLACES = 2;
const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/** As Excel writes a number cell: no thousands separator, a point for decimals, no trailing zeros. */
function formatDecimal(value: number): string {
  return String(Number(value.toFixed(MAX_DECIMAL_PLACES)));
}

function writeElement(depth: number, name: string, value: string): string {
  return `${INDENT.repeat(depth)}<${name}>${escapeXml(value)}</${name}>`;
}

/** The `Bp21Type` sequence, in the schema's element order. */
function writeLine(line: CoretaxBp21Line): string[] {
  const depth = 3;
  return [
    `${INDENT.repeat(2)}<Bp21>`,
    writeElement(depth, 'TaxPeriodMonth', String(line.taxPeriodMonth)),
    writeElement(depth, 'TaxPeriodYear', String(line.taxPeriodYear)),
    writeElement(depth, 'CounterpartTin', line.counterpartTin),
    writeElement(
      depth,
      'IDPlaceOfBusinessActivityOfIncomeRecipient',
      line.recipientPlaceOfBusinessId,
    ),
    writeElement(depth, 'StatusTaxExemption', line.ptkpLabel),
    writeElement(depth, 'TaxCertificate', line.taxCertificate),
    writeElement(depth, 'TaxObjectCode', line.taxObjectCode),
    writeElement(depth, 'Gross', formatDecimal(line.gross)),
    writeElement(depth, 'Deemed', formatDecimal(line.deemedPercent)),
    writeElement(depth, 'Rate', formatDecimal(line.ratePercent)),
    writeElement(depth, 'Document', line.documentType),
    writeElement(depth, 'DocumentNumber', line.documentNumber),
    writeElement(depth, 'DocumentDate', line.documentDate),
    writeElement(depth, 'IDPlaceOfBusinessActivity', line.withholderPlaceOfBusinessId),
    writeElement(depth, 'WithholdingDate', line.withholdingDate),
    `${INDENT.repeat(2)}</Bp21>`,
  ];
}

/**
 * BP21 v4 (DJP "BP21 Excel to XML v.4", 17/04/2025): root `Bp21Bulk`, the
 * withholder's `TIN`, then `ListOfBp21` with one `Bp21` per line.
 */
export function serializeCoretaxBp21V4Xml(document: CoretaxBp21Document): string {
  return [
    XML_DECLARATION,
    ROOT_OPEN,
    writeElement(1, 'TIN', document.withholderTin),
    `${INDENT}<ListOfBp21>`,
    ...document.lines.flatMap(writeLine),
    `${INDENT}</ListOfBp21>`,
    ROOT_CLOSE,
  ].join(LINE_END);
}
