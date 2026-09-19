import type {
  PpnOutputGroup,
  PpnOutputReportLine,
  PpnOutputSourceLine,
  SummarizePpnOutputParams,
  SummarizedPpnOutput,
} from '#taxes/types';

const LEGACY_CODE = 'LEGACY';
const NOT_OBJECT_CODE = 'NOT_OBJECT';

/**
 * Folds a month's issued invoice lines into the PPN keluaran draft (P27-T05):
 * one report line per invoice and faktur code, and one group per code.
 * Lines with no tax snapshot (billed before P27-T04, or with the tax module
 * off) and lines outside PPN are counted apart and never enter the totals.
 */
export function summarizePpnOutput(params: SummarizePpnOutputParams): SummarizedPpnOutput {
  const reportLines = foldByInvoiceAndCode(params.lines);
  const groups = buildGroups(
    reportLines.filter((line) => /^\d+$/.test(line.fakturTransactionCode)),
  );
  const legacy = reportLines.filter((line) => line.fakturTransactionCode === LEGACY_CODE);
  const notObject = reportLines.filter((line) => line.fakturTransactionCode === NOT_OBJECT_CODE);
  return {
    lines: reportLines,
    summary: {
      kind: 'PPN_OUTPUT',
      invoiceCount: new Set(params.lines.map((line) => line.invoiceId)).size,
      groups,
      legacyLineCount: legacy.reduce((total, line) => total + line.lineCount, 0),
      legacyAmount: legacy.reduce((total, line) => total + line.taxableAmount, 0),
      notObjectLineCount: notObject.reduce((total, line) => total + line.lineCount, 0),
      notObjectAmount: notObject.reduce((total, line) => total + line.taxableAmount, 0),
      totals: {
        taxableAmount: groups.reduce((total, group) => total + group.taxableAmount, 0),
        taxBase: groups.reduce((total, group) => total + group.taxBase, 0),
        taxAmount: groups.reduce((total, group) => total + group.taxAmount, 0),
      },
      ...params.dueDates,
    },
  };
}

function toBucket(line: PpnOutputSourceLine): string {
  if (line.taxCode === null) {
    return LEGACY_CODE;
  }
  return line.fakturTransactionCode ?? NOT_OBJECT_CODE;
}

function foldByInvoiceAndCode(lines: readonly PpnOutputSourceLine[]): PpnOutputReportLine[] {
  const folded = new Map<string, PpnOutputReportLine>();
  for (const line of lines) {
    const code = toBucket(line);
    const key = `${line.invoiceId}:${code}`;
    const current = folded.get(key) ?? {
      invoiceId: line.invoiceId,
      invoiceNumber: line.invoiceNumber,
      issuedAt: line.issuedAt.toISOString(),
      fakturTransactionCode: code,
      lineCount: 0,
      taxableAmount: 0,
      taxBase: 0,
      taxAmount: 0,
    };
    current.lineCount += 1;
    current.taxableAmount += line.taxableAmount ?? line.amount;
    current.taxBase += line.taxBase ?? 0;
    current.taxAmount += line.taxAmount;
    folded.set(key, current);
  }
  return [...folded.values()].sort(
    (a, b) =>
      a.issuedAt.localeCompare(b.issuedAt) || a.invoiceNumber.localeCompare(b.invoiceNumber),
  );
}

function buildGroups(lines: readonly PpnOutputReportLine[]): PpnOutputGroup[] {
  const codes = [...new Set(lines.map((line) => line.fakturTransactionCode))].sort();
  return codes.map((code) => {
    const members = lines.filter((line) => line.fakturTransactionCode === code);
    return {
      fakturTransactionCode: code,
      invoiceCount: new Set(members.map((line) => line.invoiceId)).size,
      lineCount: members.reduce((total, line) => total + line.lineCount, 0),
      taxableAmount: members.reduce((total, line) => total + line.taxableAmount, 0),
      taxBase: members.reduce((total, line) => total + line.taxBase, 0),
      taxAmount: members.reduce((total, line) => total + line.taxAmount, 0),
    };
  });
}
