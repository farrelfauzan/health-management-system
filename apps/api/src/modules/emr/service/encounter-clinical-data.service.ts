import {
  BpjsReferralResponse,
  DiagnosisResponse,
  EncounterWithRelationsRecord,
  Icd9cmCode,
  Icd10Code,
  ImmunizationResponse,
  ProcedureResponse,
  VitalSignsResponse,
} from '@hms/shared-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { Icd9cmCodeService } from '../../terminology/service/icd9cm-code.service';
import { Icd10CodeService } from '../../terminology/service/icd10-code.service';
import { AddDiagnosisDto } from '../dto/add-diagnosis.dto';
import { PharmacyFlowService } from '../../pharmacy-flow/service/pharmacy-flow.service';
import { AddImmunizationDto } from '../dto/add-immunization.dto';
import { AddProcedureDto } from '../dto/add-procedure.dto';
import { RecordVitalSignsDto } from '../dto/record-vital-signs.dto';
import { UpsertBpjsReferralDto } from '../dto/upsert-bpjs-referral.dto';
import { EncounterRepository } from '../repository/encounter.repository';
import { EncounterAccessService } from './encounter-access.service';
import { EncounterMapper } from './encounter.mapper';

type CodedEntry = {
  code: string;
  display: string;
};

function parseCalendarDate(value: string): Date {
  const [yearPart = '', monthPart = '', dayPart = ''] = value.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
}

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
    private readonly pharmacyFlowService: PharmacyFlowService,
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

  /**
   * Records or replaces the encounter's BPJS rujukan (P11-T06). One referral
   * per encounter — PCare carries it on the kunjungan payload, so the last
   * decision recorded before close is what gets reported.
   */
  async saveBpjsReferral(
    encounterId: string,
    payload: UpsertBpjsReferralDto,
    currentUser: CurrentUser,
  ): Promise<BpjsReferralResponse> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const saved = await this.encounterRepository.upsertBpjsReferral({
      encounterId,
      destinationProviderCode: payload.destinationProviderCode,
      subSpecialtyCode: payload.subSpecialtyCode ?? null,
      saranaCode: payload.saranaCode ?? null,
      khususCode: payload.khususCode ?? null,
      estimatedReferralDate: parseCalendarDate(payload.estimatedReferralDate),
      notes: payload.notes ?? null,
      recordedById: currentUser.sub,
    });
    return this.encounterMapper.toBpjsReferralResponse(saved);
  }

  async getBpjsReferral(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<BpjsReferralResponse> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const encounter = await this.encounterRepository.findEncounterWithRelationsById(encounterId);
    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }
    await this.encounterAccessService.assertCanReadEncounter({ encounter, scope, currentUser });
    const referral = await this.encounterRepository.findBpjsReferralByEncounterId(encounterId);
    if (!referral) {
      throw new NotFoundException('No BPJS referral recorded for this encounter');
    }
    return this.encounterMapper.toBpjsReferralResponse(referral);
  }

  async removeBpjsReferral(encounterId: string, currentUser: CurrentUser): Promise<void> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const referral = await this.encounterRepository.findBpjsReferralByEncounterId(encounterId);
    if (!referral) {
      throw new NotFoundException('No BPJS referral recorded for this encounter');
    }
    await this.encounterRepository.softDeleteBpjsReferral(referral.id);
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
   * Records one vaccination against the visit (P10-T16).
   *
   * The catalog row must be flagged `isVaccine`: recording paracetamol as an
   * immunisation would put a nonsense `Immunization` in the national record,
   * and the flag is the only thing that distinguishes a vaccine from any other
   * KFA product. A vaccine without a KFA code is still recorded — the clinic
   * gave it, and the local history is the point — it is simply skipped in the
   * bundle and named in the gap log.
   */
  async addImmunization(
    encounterId: string,
    payload: AddImmunizationDto,
    currentUser: CurrentUser,
  ): Promise<ImmunizationResponse> {
    const encounter = await this.assertWritableEncounter(encounterId, currentUser);
    const vaccine = await this.pharmacyFlowService.findActiveVaccineById(payload.medicationId);
    if (!vaccine) {
      throw new BadRequestException('Medication not found, inactive, or not marked as a vaccine');
    }
    const created = await this.encounterRepository.createImmunization({
      encounterId,
      patientId: encounter.patientId,
      medicationId: payload.medicationId,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : undefined,
      lotNumber: payload.lotNumber,
      expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : undefined,
      doseNumber: payload.doseNumber,
      route: payload.route,
      site: payload.site,
      // Defaults to the attending doctor: in a klinik pratama the person who
      // records the vaccination is almost always the one who gave it, and a
      // performer nobody named is worth less than the obvious one.
      performedById: payload.performedById ?? encounter.doctorId,
      notes: payload.notes,
    });

    return this.encounterMapper.toImmunizationResponse(created);
  }

  async removeImmunization(
    encounterId: string,
    immunizationId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.assertWritableEncounter(encounterId, currentUser);
    const immunization = await this.encounterRepository.findImmunizationById(immunizationId);

    if (!immunization || immunization.encounterId !== encounterId) {
      throw new NotFoundException('Immunization not found');
    }

    await this.encounterRepository.softDeleteImmunization(immunizationId);
  }

  async listPatientImmunizations(patientId: string): Promise<ImmunizationResponse[]> {
    const records = await this.encounterRepository.listImmunizationsByPatient(patientId);
    return records.map((record) => this.encounterMapper.toImmunizationResponse(record));
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

  /**
   * Returns the encounter it just checked, so a caller that needs a fact from
   * it — the patient a vaccination belongs to, the doctor who gave it — does
   * not read the same row twice.
   */
  private async assertWritableEncounter(
    id: string,
    currentUser: CurrentUser,
  ): Promise<EncounterWithRelationsRecord> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.encounterRepository.findEncounterWithRelationsById(id);

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    this.encounterAccessService.assertEncounterOpen(encounter);
    return encounter;
  }
}
