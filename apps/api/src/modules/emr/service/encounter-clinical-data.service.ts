import {
  DiagnosisResponse,
  Icd9cmCode,
  Icd10Code,
  ProcedureResponse,
  VitalSignsResponse,
} from '@hms/shared-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { Icd9cmCodeService } from '../../terminology/service/icd9cm-code.service';
import { Icd10CodeService } from '../../terminology/service/icd10-code.service';
import { AddDiagnosisDto } from '../dto/add-diagnosis.dto';
import { AddProcedureDto } from '../dto/add-procedure.dto';
import { RecordVitalSignsDto } from '../dto/record-vital-signs.dto';
import { EncounterRepository } from '../repository/encounter.repository';
import { EncounterAccessService } from './encounter-access.service';
import { EncounterMapper } from './encounter.mapper';

type CodedEntry = {
  code: string;
  display: string;
};

/**
 * The measured and coded content of an encounter. Every write goes through the
 * same gate — the encounter must exist, the caller must be allowed to sign it,
 * and it must still be IN_PROGRESS — so a closed record can never grow a new
 * diagnosis after the fact.
 */
@Injectable()
export class EncounterClinicalDataService {
  constructor(
    private readonly encounterRepository: EncounterRepository,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly encounterMapper: EncounterMapper,
    private readonly icd10CodeService: Icd10CodeService,
    private readonly icd9cmCodeService: Icd9cmCodeService,
  ) {}

  /**
   * Appends a measurement set. Vitals are never overwritten: re-measuring after
   * an abnormal reading is routine, and replacing the row would erase the
   * finding that prompted the recheck.
   */
  async recordVitalSigns(
    encounterId: string,
    payload: RecordVitalSignsDto,
    currentUser: CurrentUser,
  ): Promise<VitalSignsResponse> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const created = await this.encounterRepository.createVitalSigns({
      encounterId,
      heightCm: payload.heightCm,
      weightKg: payload.weightKg,
      systolicBloodPressure: payload.systolicBloodPressure,
      diastolicBloodPressure: payload.diastolicBloodPressure,
      pulseRate: payload.pulseRate,
      respiratoryRate: payload.respiratoryRate,
      temperatureCelsius: payload.temperatureCelsius,
      oxygenSaturation: payload.oxygenSaturation,
      notes: payload.notes,
      recordedAt: payload.recordedAt ? new Date(payload.recordedAt) : undefined,
      recordedById: currentUser.sub,
    });

    return this.encounterMapper.toVitalSignsResponse(created);
  }

  async addDiagnosis(
    encounterId: string,
    payload: AddDiagnosisDto,
    currentUser: CurrentUser,
  ): Promise<DiagnosisResponse> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const entry = await this.resolveDiagnosisEntry(payload);
    const created = await this.encounterRepository.createDiagnosis({
      encounterId,
      icd10CodeId: payload.icd10CodeId,
      code: entry.code,
      display: entry.display,
      type: payload.type,
      notes: payload.notes,
      recordedById: currentUser.sub,
    });

    return this.encounterMapper.toDiagnosisResponse(created);
  }

  /**
   * Retracts a diagnosis by soft-deleting it. The row survives for audit while
   * the partial unique indexes — scoped to `deleted_at IS NULL` — free the code
   * and the PRIMARY slot so the correction can be recorded.
   */
  async removeDiagnosis(
    encounterId: string,
    diagnosisId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const diagnosis = await this.encounterRepository.findDiagnosisById(diagnosisId);

    if (!diagnosis || diagnosis.encounterId !== encounterId) {
      throw new NotFoundException('Diagnosis not found');
    }

    await this.encounterRepository.softDeleteDiagnosis(diagnosisId);
  }

  async addProcedure(
    encounterId: string,
    payload: AddProcedureDto,
    currentUser: CurrentUser,
  ): Promise<ProcedureResponse> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const entry = await this.resolveProcedureEntry(payload);
    const created = await this.encounterRepository.createProcedure({
      encounterId,
      icd9cmCodeId: payload.icd9cmCodeId,
      code: entry.code,
      display: entry.display,
      notes: payload.notes,
      performedAt: payload.performedAt ? new Date(payload.performedAt) : undefined,
      recordedById: currentUser.sub,
    });

    return this.encounterMapper.toProcedureResponse(created);
  }

  async removeProcedure(
    encounterId: string,
    procedureId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const procedure = await this.encounterRepository.findProcedureById(procedureId);

    if (!procedure || procedure.encounterId !== encounterId) {
      throw new NotFoundException('Procedure not found');
    }

    await this.encounterRepository.softDeleteProcedure(procedureId);
  }

  /**
   * When a catalog row is named, its code and title are snapshotted from the
   * catalog rather than from the request: a client can otherwise sign a display
   * that disagrees with the code it claims to be.
   */
  private async resolveDiagnosisEntry(payload: AddDiagnosisDto): Promise<CodedEntry> {
    if (!payload.icd10CodeId) {
      return this.toUncatalogedEntry(payload);
    }

    const catalogCode: Icd10Code | null = await this.icd10CodeService.findActiveIcd10CodeById(
      payload.icd10CodeId,
    );

    if (!catalogCode) {
      throw new BadRequestException('ICD-10 code not found or inactive');
    }

    return { code: catalogCode.code, display: catalogCode.display };
  }

  private async resolveProcedureEntry(payload: AddProcedureDto): Promise<CodedEntry> {
    if (!payload.icd9cmCodeId) {
      return this.toUncatalogedEntry(payload);
    }

    const catalogCode: Icd9cmCode | null = await this.icd9cmCodeService.findActiveIcd9cmCodeById(
      payload.icd9cmCodeId,
    );

    if (!catalogCode) {
      throw new BadRequestException('ICD-9-CM code not found or inactive');
    }

    return { code: catalogCode.code, display: catalogCode.display };
  }

  private toUncatalogedEntry(payload: { code?: string; display?: string }): CodedEntry {
    if (!payload.code || !payload.display) {
      throw new BadRequestException('Both code and display are required without a catalog code');
    }

    return { code: payload.code, display: payload.display };
  }

  private async assertWritableEncounter(id: string, currentUser: CurrentUser): Promise<void> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.encounterRepository.findEncounterWithRelationsById(id);

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    this.encounterAccessService.assertEncounterOpen(encounter);
  }
}
