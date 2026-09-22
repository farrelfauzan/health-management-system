import {
  BirthsDeathsReportResponse,
  KohortRegisterResponse,
  MATERNAL_REPORT_LABELS,
  MonthlyKiaReportResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import {
  BuildMaternalReportPdfHtmlParams,
  MaternalReportPdfSection,
  buildMaternalReportPdfHtml,
} from './build-maternal-report-pdf-html';
import { resolveMaternalReportTitle } from './resolve-maternal-report-title';

/** A4 landscape; the register is wide and the sheet it replaces is landscape too. */
const A4_LANDSCAPE = { paperWidthInches: 11.69, paperHeightInches: 8.27, landscape: true } as const;
const PAGE_MARGIN_INCHES = { top: 0.4, right: 0.4, bottom: 0.5, left: 0.4 } as const;

const PROVISIONAL_LAYOUT_NOTICE =
  'Tata letak sementara (D-040): susunan kolom belum dibandingkan dengan formulir puskesmas pilot.';

/**
 * Renders a register or report as a landscape PDF through the shared
 * renderer (P25-T15). Rendered on every request and never stored: the
 * register is a view of the month as the record stands when it is printed.
 */
@Injectable()
export class MaternalReportsPdfService {
  constructor(private readonly pdfRendererService: PdfRendererService) {}

  renderKohortRegister(register: KohortRegisterResponse, timeZone: string): Promise<Uint8Array> {
    const columns = register.columns.map((column) => column.label);
    return this.render(
      {
        title: resolveMaternalReportTitle(register.register),
        header: register.header,
        notices: register.isProvisionalLayout ? [PROVISIONAL_LAYOUT_NOTICE] : [],
        sections: register.groups.map((group) => ({
          heading: `Desa/Kelurahan: ${group.villageName}`,
          columns,
          rows: group.rows.map((row) => row.values),
        })),
      },
      timeZone,
    );
  }

  renderMonthlyKia(report: MonthlyKiaReportResponse, timeZone: string): Promise<Uint8Array> {
    const toSection = (
      heading: string,
      indicators: MonthlyKiaReportResponse['indicators'],
    ): MaternalReportPdfSection => ({
      heading,
      columns: ['Indikator', 'Jumlah', 'Definisi'],
      rows: indicators.map((indicator) => [
        indicator.label,
        String(indicator.value),
        indicator.definition,
      ]),
      numericColumns: [1],
    });
    return this.render(
      {
        title: resolveMaternalReportTitle('monthly-kia'),
        header: report.header,
        notices: report.isProvisionalLayout ? [PROVISIONAL_LAYOUT_NOTICE] : [],
        sections: [
          toSection('Indikator KIA', report.indicators),
          toSection('Pemeriksaan laboratorium antenatal (LB3-KIA)', report.antenatalLab),
        ],
      },
      timeZone,
    );
  }

  renderBirthsDeaths(report: BirthsDeathsReportResponse, timeZone: string): Promise<Uint8Array> {
    const formatInstant = (value: string): string =>
      new Intl.DateTimeFormat('id-ID', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value));
    return this.render(
      {
        title: resolveMaternalReportTitle('births-deaths'),
        header: report.header,
        notices: [report.coverageNote],
        sections: [
          {
            heading: 'Ringkasan',
            columns: [
              'Lahir hidup',
              'Lahir mati',
              'Kematian ibu',
              'Kematian bayi baru lahir',
              'Kematian lainnya',
            ],
            rows: [
              [
                String(report.summary.liveBirths),
                String(report.summary.stillbirths),
                String(report.summary.maternalDeaths),
                String(report.summary.newbornDeaths),
                String(report.summary.otherDeaths),
              ],
            ],
            numericColumns: [0, 1, 2, 3, 4],
          },
          {
            heading: 'Kelahiran',
            columns: [
              'Waktu lahir',
              'Hidup/Mati',
              'JK',
              'Berat (g)',
              'Nama ibu',
              'Desa/Kelurahan',
              'Penolong',
            ],
            rows: report.births.map((birth) => [
              formatInstant(birth.birthAt),
              MATERNAL_REPORT_LABELS.birthOutcome[birth.outcome],
              MATERNAL_REPORT_LABELS.sex[birth.sex],
              birth.birthWeightGrams === null ? '' : String(birth.birthWeightGrams),
              birth.motherName,
              birth.villageName ?? MATERNAL_REPORT_LABELS.noVillage,
              birth.attendantName,
            ]),
            numericColumns: [3],
          },
          {
            heading: 'Kematian',
            columns: ['Waktu meninggal', 'Kelompok', 'Nama', 'Usia', 'Desa/Kelurahan'],
            rows: report.deaths.map((death) => [
              formatInstant(death.diedAt),
              MATERNAL_REPORT_LABELS.deathPatientKind[death.patientKind],
              death.patientName,
              death.ageLabel,
              death.villageName ?? MATERNAL_REPORT_LABELS.noVillage,
            ]),
          },
        ],
      },
      timeZone,
    );
  }

  private render(params: BuildMaternalReportPdfHtmlParams, timeZone: string): Promise<Uint8Array> {
    return this.pdfRendererService.render(buildMaternalReportPdfHtml(params), {
      ...A4_LANDSCAPE,
      marginInches: PAGE_MARGIN_INCHES,
      printBackground: true,
      traceId: `maternal-report:${params.header.month}:${timeZone}`,
    });
  }
}
