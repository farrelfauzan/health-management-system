import {
  CoretaxFakturDocument,
  CoretaxFakturGoodService,
  CoretaxFakturTaxInvoice,
} from '@hms/shared-types';

/**
 * The layout of DJP's "Sample Faktur PK Template v.1.4.xml", shipped inside
 * converter v1.6 as the reference output: the declaration as DJP writes it,
 * the root naming `TaxInvoice.xsd` (which DJP does not publish), LF line
 * ends, one tab per level, an empty value as a self-closing element, and no
 * newline after the root's closing tag.
 */
const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8" ?>';
const ROOT_OPEN =
  '<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">';
const ROOT_CLOSE = '</TaxInvoiceBulk>';
const LINE_END = '\n';
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

/** A point for decimals, at most two places, no trailing zeros, no separators. */
function formatAmount(value: number): string {
  return String(Number(value.toFixed(MAX_DECIMAL_PLACES)));
}

function writeElement(depth: number, name: string, value: string): string {
  const indent = INDENT.repeat(depth);
  return value === '' ? `${indent}<${name}/>` : `${indent}<${name}>${escapeXml(value)}</${name}>`;
}

/** The `GoodService` columns of the template's DetailFaktur sheet, in order. */
function writeGoodService(line: CoretaxFakturGoodService): string[] {
  const depth = 5;
  return [
    `${INDENT.repeat(4)}<GoodService>`,
    writeElement(depth, 'Opt', line.opt),
    writeElement(depth, 'Code', line.code),
    writeElement(depth, 'Name', line.name),
    writeElement(depth, 'Unit', line.unit),
    writeElement(depth, 'Price', formatAmount(line.price)),
    writeElement(depth, 'Qty', formatAmount(line.qty)),
    writeElement(depth, 'TotalDiscount', formatAmount(line.totalDiscount)),
    writeElement(depth, 'TaxBase', formatAmount(line.taxBase)),
    writeElement(depth, 'OtherTaxBase', formatAmount(line.otherTaxBase)),
    writeElement(depth, 'VATRate', formatAmount(line.vatRate)),
    writeElement(depth, 'VAT', formatAmount(line.vat)),
    writeElement(depth, 'STLGRate', formatAmount(line.stlgRate)),
    writeElement(depth, 'STLG', formatAmount(line.stlg)),
    `${INDENT.repeat(4)}</GoodService>`,
  ];
}

/** The `TaxInvoice` columns of the template's Faktur sheet, in order. */
function writeTaxInvoice(invoice: CoretaxFakturTaxInvoice): string[] {
  const depth = 3;
  return [
    `${INDENT.repeat(2)}<TaxInvoice>`,
    writeElement(depth, 'TaxInvoiceDate', invoice.taxInvoiceDate),
    writeElement(depth, 'TaxInvoiceOpt', invoice.taxInvoiceOpt),
    writeElement(depth, 'TrxCode', invoice.trxCode),
    writeElement(depth, 'AddInfo', invoice.addInfo),
    writeElement(depth, 'CustomDoc', invoice.customDoc),
    writeElement(depth, 'CustomDocMonthYear', invoice.customDocMonthYear),
    writeElement(depth, 'RefDesc', invoice.refDesc),
    writeElement(depth, 'FacilityStamp', invoice.facilityStamp),
    writeElement(depth, 'SellerIDTKU', invoice.sellerIdTku),
    writeElement(depth, 'BuyerTin', invoice.buyerTin),
    writeElement(depth, 'BuyerDocument', invoice.buyerDocument),
    writeElement(depth, 'BuyerCountry', invoice.buyerCountry),
    writeElement(depth, 'BuyerDocumentNumber', invoice.buyerDocumentNumber),
    writeElement(depth, 'BuyerName', invoice.buyerName),
    writeElement(depth, 'BuyerAdress', invoice.buyerAddress),
    writeElement(depth, 'BuyerEmail', invoice.buyerEmail),
    writeElement(depth, 'BuyerIDTKU', invoice.buyerIdTku),
    `${INDENT.repeat(depth)}<ListOfGoodService>`,
    ...invoice.goodServices.flatMap(writeGoodService),
    `${INDENT.repeat(depth)}</ListOfGoodService>`,
    `${INDENT.repeat(2)}</TaxInvoice>`,
  ];
}

/**
 * Faktur Keluaran for converter v1.6 (23/01/2026): root `TaxInvoiceBulk`, the
 * seller's `TIN`, then `ListOfTaxInvoice` with one `TaxInvoice` per faktur.
 * `BuyerAdress` is DJP's spelling.
 */
export function serializeCoretaxFakturV16Xml(document: CoretaxFakturDocument): string {
  return [
    XML_DECLARATION,
    ROOT_OPEN,
    writeElement(1, 'TIN', document.sellerTin),
    `${INDENT}<ListOfTaxInvoice>`,
    ...document.taxInvoices.flatMap(writeTaxInvoice),
    `${INDENT}</ListOfTaxInvoice>`,
    ROOT_CLOSE,
  ].join(LINE_END);
}
