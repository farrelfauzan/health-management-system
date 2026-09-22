import {
  KohortRegisterKindValue,
  MaternalReportFormatValue,
  MaternalReportKindValue,
} from '@hms/shared-types';
import { Controller, Get, Query, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MATERNAL_REPORT_EXAMPLES } from '../../../common/openapi/maternal-report-examples';
import { KohortRegisterQueryDto } from '../dto/kohort-register-query.dto';
import { MonthlyMaternalReportQueryDto } from '../dto/monthly-maternal-report-query.dto';
import { buildBirthsDeathsCsv } from '../service/build-births-deaths-csv';
import { buildKohortRegisterCsv } from '../service/build-kohort-register-csv';
import { buildMonthlyKiaCsv } from '../service/build-monthly-kia-csv';
import { MaternalReportsPdfService } from '../service/maternal-reports-pdf.service';
import { MaternalReportsService } from '../service/maternal-reports.service';

const FORMAT_NOTE =
  '`format` answers the JSON preview by default; `csv` streams UTF-8 with BOM (`text/csv`), `pdf` an A4 landscape PDF (`application/pdf`). Both file formats are audited as an export.';

type FileResponse = {
  readonly response: BinaryResponseWriter;
  readonly fileName: string;
};

/**
 * The KIA registers and monthly reports (P25-T15, SJ-238): kohort ibu, kohort
 * bayi and kohort KB for a month and optional desa, the monthly KIA indicator
 * report, and the births and deaths report Pasal 28(h) requires. Read-only,
 * clinicians only (`maternal-report.read:any`, D-033).
 */
@ApiTags('Maternal Reports')
@RequireFeature('maternal-care')
@Controller({ version: '1', path: 'maternal-reports' })
export class MaternalReportsController {
  constructor(
    private readonly maternalReportsService: MaternalReportsService,
    private readonly maternalReportsPdfService: MaternalReportsPdfService,
  ) {}

  @Get('kohort-ibu')
  @Auth([{ action: 'read', subject: 'MaternalReport' }])
  @ApiEndpoint({
    summary: 'Register kohort ibu for a month',
    responseDescription: `Every pregnancy active in the month, grouped by desa/kelurahan with the mothers without a village under "Tanpa desa", in the Kemenkes 2020 53-column order (D-040). \`villageCode\` narrows to one village. ${FORMAT_NOTE}`,
    responseExample: { data: MATERNAL_REPORT_EXAMPLES.kohortRegister },
  })
  async getKohortIbu(
    @Query() query: KohortRegisterQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.answerRegister('kohort-ibu', query, response, currentUser);
  }

  @Get('kohort-bayi')
  @Auth([{ action: 'read', subject: 'MaternalReport' }])
  @ApiEndpoint({
    summary: 'Register kohort bayi for a month',
    responseDescription: `Every baby in her neonatal period during the month — birth essentials, HB0, vitamin K1, KN1–KN3 and the SHK sample — in a provisional layout (D-040). ${FORMAT_NOTE}`,
    responseExample: {
      data: {
        ...MATERNAL_REPORT_EXAMPLES.kohortRegister,
        register: 'kohort-bayi',
        isProvisionalLayout: true,
      },
    },
  })
  async getKohortBayi(
    @Query() query: KohortRegisterQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.answerRegister('kohort-bayi', query, response, currentUser);
  }

  @Get('kohort-kb')
  @Auth([{ action: 'read', subject: 'MaternalReport' }])
  @ApiEndpoint({
    summary: 'Register kohort KB for a month',
    responseDescription: `Every family planning course live in the month with its services, in a provisional layout (D-040). ${FORMAT_NOTE}`,
    responseExample: {
      data: {
        ...MATERNAL_REPORT_EXAMPLES.kohortRegister,
        register: 'kohort-kb',
        isProvisionalLayout: true,
      },
    },
  })
  async getKohortKb(
    @Query() query: KohortRegisterQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.answerRegister('kohort-kb', query, response, currentUser);
  }

  @Get('monthly-kia')
  @Auth([{ action: 'read', subject: 'MaternalReport' }])
  @ApiEndpoint({
    summary: 'Monthly KIA report for a month',
    responseDescription: `The provisional indicator set (K1 = K1A + K1M, K4, K6, deliveries, KF lengkap, KN1, KN lengkap, KB new and active per method, HB0) and the LB3-KIA antenatal laboratory block, each with the rule it was counted by (D-040). ${FORMAT_NOTE}`,
    responseExample: { data: MATERNAL_REPORT_EXAMPLES.monthlyKia },
  })
  async getMonthlyKia(
    @Query() query: MonthlyMaternalReportQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const report = await this.maternalReportsService.getMonthlyKiaReport(query.month);
    const format = query.format ?? 'json';
    if (format === 'json') {
      return { data: report };
    }
    await this.audit('monthly-kia', query.month, null, format, currentUser);
    const fileName = `laporan-kia-${query.month}`;
    if (format === 'csv') {
      return this.writeCsv({ response, fileName }, buildMonthlyKiaCsv(report));
    }
    return this.writePdf(
      { response, fileName },
      await this.maternalReportsPdfService.renderMonthlyKia(
        report,
        this.maternalReportsService.timeZone,
      ),
    );
  }

  @Get('births-deaths')
  @Auth([{ action: 'read', subject: 'MaternalReport' }])
  @ApiEndpoint({
    summary: 'Births and deaths report for a month',
    responseDescription: `Live births and stillbirths from the newborn records, and deaths from stays discharged DIED, attributed to the mother, the newborn or another patient. Deaths outside the clinic are not captured, and the header says so. ${FORMAT_NOTE}`,
    responseExample: { data: MATERNAL_REPORT_EXAMPLES.birthsDeaths },
  })
  async getBirthsDeaths(
    @Query() query: MonthlyMaternalReportQueryDto,
    @Res({ passthrough: true }) response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const report = await this.maternalReportsService.getBirthsDeathsReport(query.month);
    const format = query.format ?? 'json';
    if (format === 'json') {
      return { data: report };
    }
    await this.audit('births-deaths', query.month, null, format, currentUser);
    const fileName = `laporan-kelahiran-kematian-${query.month}`;
    const timeZone = this.maternalReportsService.timeZone;
    if (format === 'csv') {
      return this.writeCsv({ response, fileName }, buildBirthsDeathsCsv(report, timeZone));
    }
    return this.writePdf(
      { response, fileName },
      await this.maternalReportsPdfService.renderBirthsDeaths(report, timeZone),
    );
  }

  private async answerRegister(
    register: KohortRegisterKindValue,
    query: KohortRegisterQueryDto,
    response: BinaryResponseWriter,
    currentUser: CurrentUser | undefined,
  ) {
    const villageCode = query.villageCode ?? null;
    const result = await this.maternalReportsService.getKohortRegister({
      register,
      month: query.month,
      villageCode,
    });
    const format = query.format ?? 'json';
    if (format === 'json') {
      return { data: result };
    }
    await this.audit(register, query.month, villageCode, format, currentUser);
    const fileName = `${register}-${query.month}${villageCode === null ? '' : `-${villageCode}`}`;
    if (format === 'csv') {
      return this.writeCsv({ response, fileName }, buildKohortRegisterCsv(result));
    }
    return this.writePdf(
      { response, fileName },
      await this.maternalReportsPdfService.renderKohortRegister(
        result,
        this.maternalReportsService.timeZone,
      ),
    );
  }

  private audit(
    kind: MaternalReportKindValue,
    month: string,
    villageCode: string | null,
    format: Exclude<MaternalReportFormatValue, 'json'>,
    currentUser: CurrentUser | undefined,
  ): Promise<void> {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return this.maternalReportsService.recordExport({
      kind,
      month,
      villageCode,
      format: format === 'csv' ? 'CSV' : 'PDF',
      actor: currentUser,
    });
  }

  private writeCsv(target: FileResponse, csv: string): undefined {
    target.response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    target.response.setHeader(
      'Content-Disposition',
      `attachment; filename="${target.fileName}.csv"`,
    );
    target.response.end(csv);
    return undefined;
  }

  private writePdf(target: FileResponse, bytes: Uint8Array): undefined {
    target.response.setHeader('Content-Type', 'application/pdf');
    target.response.setHeader(
      'Content-Disposition',
      `attachment; filename="${target.fileName}.pdf"`,
    );
    target.response.end(Buffer.from(bytes));
    return undefined;
  }
}
