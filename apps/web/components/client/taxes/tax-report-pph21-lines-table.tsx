'use client';

import type {
  ClinicianTaxIdentifier,
  Pph21ReportLine,
  Pph21ReportSummary,
} from '@hms/shared-types';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';

type TaxReportPph21LinesTableProps = {
  summary: Pph21ReportSummary;
  lines: Pph21ReportLine[];
  /** The full identities once revealed (audited); masked until then. */
  identifiers?: ClinicianTaxIdentifier[];
};

/**
 * One BP21 row per clinician (P27-T07): gross, the 50% base, the PPh 21
 * withheld and the tax identity it is issued under — masked by default, the
 * flag "identitas pajak belum lengkap" when the clinician has neither NPWP
 * nor NIK.
 */
export function TaxReportPph21LinesTable({
  summary,
  lines,
  identifiers = [],
}: TaxReportPph21LinesTableProps) {
  const t = useTranslations('operations.taxes.reports.pph21');
  const identifierById = new Map(identifiers.map((entry) => [entry.doctorId, entry]));

  function renderIdentity(line: Pph21ReportLine) {
    if (line.identityStatus === 'MISSING') {
      return <Badge variant="destructive">{t('lines.identityIncomplete')}</Badge>;
    }
    const revealed = identifierById.get(line.doctorId);
    return (
      <span className="font-mono text-xs">
        {revealed
          ? `${revealed.identityKind} ${revealed.taxIdentityNumber}`
          : `${line.identityStatus} ${line.identityMasked ?? ''}`}
      </span>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('lines.doctor')}</TableHead>
            <TableHead>{t('lines.profession')}</TableHead>
            <TableHead>{t('lines.identity')}</TableHead>
            <TableHead className="text-right">{t('lines.entryCount')}</TableHead>
            <TableHead className="text-right">{t('lines.grossFee')}</TableHead>
            <TableHead className="text-right">{t('lines.taxBase')}</TableHead>
            <TableHead className="text-right">{t('lines.taxAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.doctorId}>
              <TableCell className="font-medium">{line.doctorName}</TableCell>
              <TableCell>{t(`profession.${line.profession}`)}</TableCell>
              <TableCell>{renderIdentity(line)}</TableCell>
              <TableCell className="text-right">{line.entryCount}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.grossFee)}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.taxBase)}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.taxAmount)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell colSpan={4}>{t('lines.total')}</TableCell>
            <TableCell className="text-right">{formatRupiah(summary.totals.grossFee)}</TableCell>
            <TableCell className="text-right">{formatRupiah(summary.totals.taxBase)}</TableCell>
            <TableCell className="text-right">{formatRupiah(summary.totals.taxAmount)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
