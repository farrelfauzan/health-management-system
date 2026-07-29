import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BpjsEligibilityCheckRecord,
  BpjsEligibilityIdentifierTypeValue,
  BpjsEligibilityOutcomeData,
  BpjsEligibilityResultView,
  BpjsPatientLookupIdentifiers,
  BpjsPcareConfigRecord,
  CheckBpjsEligibilityInput,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsPcareHttpClient } from '../../../common/bpjs-pcare/bpjs-pcare-http.client';
import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcarePesertaSummary } from '../../../common/bpjs-pcare/bpjs-pcare-peserta.types';
import { BpjsPcareConnection } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { parseBpjsPcarePeserta } from '../../../common/bpjs-pcare/parse-bpjs-pcare-peserta';
import { BpjsEligibilityRepository } from '../repository/bpjs-eligibility.repository';
import { BpjsPcareConfigRepository } from '../repository/bpjs-pcare-config.repository';

const BPJS_ELIGIBILITY_AUDIT_RESOURCE = 'PatientProfile';
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * Checks a patient's BPJS membership (peserta) at registration check-in
 * (P11-T04). The check is synchronous — the front desk needs the answer with
 * the patient at the counter — and cached per patient per clinic-local day so
 * repeat check-ins never hammer PCare. A transport failure degrades to an
 * explicit UNREACHABLE state on a 200 response instead of an error:
 * registration must never block on BPJS, and the transient state is never
 * cached so the next attempt retries upstream. Lookups prefer the stored
 * BPJS number and fall back to NIK; a patient with neither is a readable 400.
 */
@Injectable()
export class BpjsEligibilityService {
  private readonly clinicTimeZone: string;
  constructor(
    private readonly eligibilityRepository: BpjsEligibilityRepository,
    private readonly configRepository: BpjsPcareConfigRepository,
    private readonly httpClient: BpjsPcareHttpClient,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async checkEligibility(
    patientId: string,
    input: CheckBpjsEligibilityInput,
    actor: CurrentUser,
  ): Promise<BpjsEligibilityResultView> {
    const identifiers = await this.eligibilityRepository.findPatientLookupIdentifiers(patientId);
    if (identifiers === null) {
      throw new NotFoundException('Patient not found');
    }
    const checkedDate = this.resolveClinicToday();
    if (!input.force) {
      const cachedRecord = await this.eligibilityRepository.findCheckForDate(
        patientId,
        checkedDate,
      );
      if (cachedRecord !== null) {
        return this.toRecordView(cachedRecord, true);
      }
    }
    const lookup = this.resolveLookup(identifiers);
    const configRecord = await this.requireConfigRecord();
    const connection = await this.requireConnection();
    return this.performLiveCheck({
      patientId,
      checkedDate,
      lookup,
      configRecord,
      connection,
      actor,
      wasForced: input.force,
    });
  }

  private async performLiveCheck(options: {
    patientId: string;
    checkedDate: Date;
    lookup: { checkedVia: BpjsEligibilityIdentifierTypeValue; path: string };
    configRecord: BpjsPcareConfigRecord;
    connection: BpjsPcareConnection;
    actor: CurrentUser;
    wasForced: boolean;
  }): Promise<BpjsEligibilityResultView> {
    const { patientId, checkedDate, lookup, configRecord, connection, actor, wasForced } = options;
    const checkedAt = new Date();
    let summary: BpjsPcarePesertaSummary | null;
    try {
      const envelope = await this.httpClient.sendRequest(connection, {
        method: 'GET',
        path: lookup.path,
      });
      summary = parseBpjsPcarePeserta(envelope.response);
    } catch (caughtError) {
      return this.settleFailedLookup({
        caughtError,
        patientId,
        checkedDate,
        checkedVia: lookup.checkedVia,
        checkedAt,
        actor,
        wasForced,
      });
    }
    const record = await this.eligibilityRepository.upsertCheck({
      patientId,
      checkedDate,
      checkedAt,
      checkedVia: lookup.checkedVia,
      ...(summary === null
        ? this.buildNotFoundData('No BPJS member matches the stored identifier')
        : this.buildMemberData(summary, configRecord)),
    });
    await this.recordCheckAudit(actor, patientId, record.outcome, lookup.checkedVia, wasForced);
    return this.toRecordView(record, false);
  }

  private async settleFailedLookup(options: {
    caughtError: unknown;
    patientId: string;
    checkedDate: Date;
    checkedVia: BpjsEligibilityIdentifierTypeValue;
    checkedAt: Date;
    actor: CurrentUser;
    wasForced: boolean;
  }): Promise<BpjsEligibilityResultView> {
    const { caughtError, patientId, checkedDate, checkedVia, checkedAt, actor, wasForced } =
      options;
    if (!(caughtError instanceof BpjsPcareError)) {
      throw caughtError;
    }
    if (caughtError.code === 'BPJS_PCARE_NOT_CONFIGURED') {
      throw new ServiceUnavailableException(caughtError.message);
    }
    if (caughtError.code === 'BPJS_PCARE_REQUEST_REJECTED') {
      const record = await this.eligibilityRepository.upsertCheck({
        patientId,
        checkedDate,
        checkedAt,
        checkedVia,
        ...this.buildNotFoundData(caughtError.message),
      });
      await this.recordCheckAudit(actor, patientId, record.outcome, checkedVia, wasForced);
      return this.toRecordView(record, false);
    }
    await this.recordCheckAudit(actor, patientId, 'UNREACHABLE', checkedVia, wasForced);
    return {
      state: 'UNREACHABLE',
      isFromCache: false,
      checkedAt: checkedAt.toISOString(),
      checkedVia,
      message: `BPJS PCare is unreachable — registration can proceed without the check (${caughtError.code}: ${caughtError.message})`,
    };
  }

  private buildNotFoundData(statusReason: string): BpjsEligibilityOutcomeData {
    return {
      outcome: 'NOT_FOUND',
      memberName: null,
      memberType: null,
      memberClass: null,
      providerCode: null,
      providerName: null,
      isRegisteredHere: null,
      isProlanis: false,
      isPrb: false,
      statusReason,
    };
  }

  private buildMemberData(
    summary: BpjsPcarePesertaSummary,
    configRecord: BpjsPcareConfigRecord,
  ): BpjsEligibilityOutcomeData {
    return {
      outcome: summary.isActive ? 'ACTIVE' : 'INACTIVE',
      memberName: summary.name,
      memberType: summary.memberTypeName,
      memberClass: summary.memberClassName,
      providerCode: summary.providerCode,
      providerName: summary.providerName,
      isRegisteredHere:
        summary.providerCode === null
          ? null
          : summary.providerCode === configRecord.kdProviderPpk,
      isProlanis: summary.isProlanis,
      isPrb: summary.isPrb,
      statusReason: summary.statusReason,
    };
  }

  private resolveLookup(identifiers: BpjsPatientLookupIdentifiers): {
    checkedVia: BpjsEligibilityIdentifierTypeValue;
    path: string;
  } {
    if (identifiers.bpjsNumber !== null) {
      return { checkedVia: 'BPJS_NUMBER', path: `peserta/${identifiers.bpjsNumber}` };
    }
    if (identifiers.nik !== null) {
      return { checkedVia: 'NIK', path: `peserta/nik/${identifiers.nik}` };
    }
    throw new BadRequestException(
      'Patient has no BPJS number or NIK on file — add one to the patient profile before checking eligibility',
    );
  }

  private async requireConfigRecord(): Promise<BpjsPcareConfigRecord> {
    const record = await this.configRepository.findConfig();
    if (record === null) {
      throw new NotFoundException('BPJS PCare is not configured');
    }
    return record;
  }

  private async requireConnection(): Promise<BpjsPcareConnection> {
    try {
      const connection = await this.configRepository.getConnection();
      if (connection === null) {
        throw new NotFoundException('BPJS PCare is not configured');
      }
      return connection;
    } catch (caughtError) {
      if (
        caughtError instanceof BpjsPcareError &&
        caughtError.code === 'BPJS_PCARE_NOT_CONFIGURED'
      ) {
        throw new ServiceUnavailableException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private async recordCheckAudit(
    actor: CurrentUser,
    patientId: string,
    state: string,
    checkedVia: BpjsEligibilityIdentifierTypeValue,
    wasForced: boolean,
  ): Promise<void> {
    await this.auditService.record({
      action: 'BPJS_ELIGIBILITY_CHECKED',
      resource: BPJS_ELIGIBILITY_AUDIT_RESOURCE,
      resourceId: patientId,
      actorUserId: actor.sub,
      metadata: { state, checkedVia, wasForced },
    });
  }

  private toRecordView(
    record: BpjsEligibilityCheckRecord,
    isFromCache: boolean,
  ): BpjsEligibilityResultView {
    return {
      state: record.outcome,
      isFromCache,
      checkedAt: record.checkedAt.toISOString(),
      checkedVia: record.checkedVia,
      member: {
        name: record.memberName,
        memberType: record.memberType,
        memberClass: record.memberClass,
        providerCode: record.providerCode,
        providerName: record.providerName,
        isRegisteredHere: record.isRegisteredHere,
        isProlanis: record.isProlanis,
        isPrb: record.isPrb,
        statusReason: record.statusReason,
      },
      message: this.buildOutcomeMessage(record),
    };
  }

  private buildOutcomeMessage(record: BpjsEligibilityCheckRecord): string {
    if (record.outcome === 'ACTIVE') {
      return 'BPJS member is active';
    }
    if (record.outcome === 'INACTIVE') {
      return record.statusReason === null
        ? 'BPJS member is inactive — this visit will not be reimbursed'
        : `BPJS member is inactive — ${record.statusReason}`;
    }
    return record.statusReason ?? 'No BPJS member matches the stored identifier';
  }

  private resolveClinicToday(): Date {
    const calendarDate = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const [yearPart = '', monthPart = '', dayPart = ''] = calendarDate.split('-');
    return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
  }
}
