import { randomUUID } from 'node:crypto';

import {
  SatusehatSubmissionAllergy,
  SatusehatSubmissionBundleData,
  SatusehatSubmissionDispenseItem,
  SatusehatSubmissionMedication,
  SatusehatSubmissionImmunization,
  SatusehatSubmissionPrescriptionItem,
  SatusehatSubmissionProcedure,
  SatusehatSubmissionRecord,
  SatusehatLabReportBundleData,
  SatusehatLabReportItem,
  SaveAllergyIhsIdPayload,
} from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import {
  SatusehatCompositionSectionInput,
  SatusehatCreatedResourceLocation,
  SatusehatFhirBundleEntry,
  SatusehatFhirTransactionBundle,
  SatusehatLabObservationMapInput,
  SatusehatTransactionResponse,
  SatusehatTransactionResponseEntry,
} from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatAmbiguousMatchError } from '../../../common/satusehat/satusehat-ambiguous-match.error';
import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionDataError } from './satusehat-submission-data.error';

/** What {@link SatusehatSubmissionService.buildLabReportTransactionBundle} needs. */
type LabReportBundleInput = {
  bundleData: SatusehatLabReportBundleData;
  reportableItems: readonly SatusehatLabReportItem[];
  patientIhsNumber: string;
  practitionerIhsNumber: string | undefined;
  /** fullUrl → local id, filled as entries are built and read back afterwards. */
  serviceRequestFullUrls: Map<string, string>;
  specimenFullUrls: Map<string, string>;
  observationFullUrls: Map<string, string>;
};

type LabReportWriteBackInput = {
  labOrderId: string;
  bundle: SatusehatFhirTransactionBundle;
  createdResources: ReadonlyMap<string, SatusehatCreatedResourceLocation>;
  serviceRequestFullUrls: ReadonlyMap<string, string>;
  specimenFullUrls: ReadonlyMap<string, string>;
  observationFullUrls: ReadonlyMap<string, string>;
};

const PERMANENT_ERROR_CODES: readonly string[] = [
  'SATUSEHAT_NOT_CONFIGURED',
  'SATUSEHAT_UNAUTHORIZED',
  'SATUSEHAT_REQUEST_REJECTED',
];
const MAX_STORED_ERROR_LENGTH = 500;

/** FHIR resource type names are upper camel case with no separators. */
const FHIR_RESOURCE_TYPE_PATTERN = /^[A-Z][A-Za-z]+$/;
const HISTORY_SEGMENT = '_history';

/**
 * Processes one outbox row end to end: rebuilds the encounter bundle from the
 * live clinical record, resolves (or automatically links) the patient and
 * practitioner IHS numbers, posts the transaction bundle, and records the
 * outcome. Transient upstream failures reschedule with exponential backoff up
 * to the attempt cap; data problems and permanent upstream rejections settle
 * the row as FAILED for the admin retry surface (P10-T06).
 */
@Injectable()
export class SatusehatSubmissionService {
  private readonly logger = new Logger(SatusehatSubmissionService.name);
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    configService: ConfigService,
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly linkRepository: SatusehatLinkRepository,
    private readonly masterDataClient: SatusehatMasterDataClient,
    private readonly fhirMapper: SatusehatFhirMapper,
    private readonly httpClient: SatusehatHttpClient,
    private readonly auditService: AuditService,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  async processSubmission(submission: SatusehatSubmissionRecord): Promise<void> {
    const attemptNumber = submission.attempts + 1;
    try {
      if (submission.kind === 'LAB_REPORT') {
        await this.processLabReportSubmission(submission);
        return;
      }
      if (submission.encounterId === null) {
        throw new SatusehatSubmissionDataError('Encounter submission carries no encounter');
      }
      const satusehatEncounterId = await this.submitEncounterBundle(submission.encounterId);
      await this.submissionRepository.markSubmitted(submission.id, satusehatEncounterId);
      this.logger.log('SATUSEHAT encounter submission succeeded');
    } catch (caughtError) {
      await this.recordFailure(submission, attemptNumber, caughtError);
    }
  }

  /**
   * The lab branch (P18-T09). An order whose every test is uncoded settles
   * SUBMITTED rather than FAILED: there is nothing to send, the gap has been
   * logged, and leaving the row failing for ever would put a permanent red
   * mark on the monitor for a catalog decision no retry can change.
   */
  private async processLabReportSubmission(submission: SatusehatSubmissionRecord): Promise<void> {
    if (submission.labOrderId === null) {
      throw new SatusehatSubmissionDataError('Lab report submission carries no order');
    }
    const reported = await this.submitLabReportBundle(submission.labOrderId);
    await this.submissionRepository.markSubmitted(submission.id, null);
    this.logger.log(
      reported
        ? 'SATUSEHAT lab report submission succeeded'
        : 'SATUSEHAT lab report had nothing reportable; settled without sending',
    );
  }

  private async submitEncounterBundle(encounterId: string): Promise<string | null> {
    const bundleData = await this.submissionRepository.findBundleData(encounterId);
    if (!bundleData) {
      throw new SatusehatSubmissionDataError('Encounter no longer exists');
    }
    if (bundleData.encounterStatus !== 'FINISHED' || bundleData.endedAt === null) {
      throw new SatusehatSubmissionDataError(
        `Encounter is ${bundleData.encounterStatus}; only finished encounters are reported`,
      );
    }
    const patientIhsNumber = await this.resolvePatientIhsNumber(bundleData);
    const practitionerIhsNumber = await this.resolvePractitionerIhsNumber(bundleData);
    const allergyFullUrls = new Map<string, string>();
    const bundle = this.buildTransactionBundle(
      bundleData,
      bundleData.endedAt,
      patientIhsNumber,
      practitionerIhsNumber,
      allergyFullUrls,
    );
    const response = await this.httpClient.sendRequest<SatusehatTransactionResponse>({
      method: 'POST',
      path: '',
      body: bundle,
    });
    const createdResources = this.extractCreatedResources(bundle, response);
    await this.saveAllergyIhsIds(allergyFullUrls, createdResources);
    const encounterEntry = bundle.entry.find((entry) => entry.request.url === 'Encounter');
    return encounterEntry ? (createdResources.get(encounterEntry.fullUrl)?.id ?? null) : null;
  }

  /**
   * Builds and posts the laboratory chain for one released order, then writes
   * back the ids the platform assigned. Returns false when the order had
   * nothing reportable.
   */
  private async submitLabReportBundle(labOrderId: string): Promise<boolean> {
    const bundleData = await this.submissionRepository.findLabReportBundleData(labOrderId);
    if (bundleData === null) {
      throw new SatusehatSubmissionDataError('Lab order no longer exists');
    }
    if (bundleData.orderStatus !== 'RELEASED' || bundleData.releasedAt === null) {
      throw new SatusehatSubmissionDataError(
        `Lab order is ${bundleData.orderStatus}; only released orders are reported`,
      );
    }
    if (bundleData.encounterId !== null && bundleData.satusehatEncounterId === null) {
      // The claim gate only admits a row whose encounter has settled, so
      // reaching here means that encounter settled FAILED. Parking with the
      // reason is the honest outcome: the report is not wrong, it simply has
      // no Encounter to reference until the visit is reported.
      throw new SatusehatSubmissionDataError(
        'Encounter not reported to SATUSEHAT, so the lab report has nothing to reference',
      );
    }
    const reportableItems = bundleData.items.filter(
      (item) => item.loincCode !== null && item.result !== null,
    );
    this.logLabReportGaps(bundleData, reportableItems);
    if (reportableItems.length === 0) {
      return false;
    }
    const patientIhsNumber = await this.resolvePatientIhsNumber(bundleData);
    const practitionerIhsNumber = await this.resolveLabRequesterIhsNumber(bundleData);
    const serviceRequestFullUrls = new Map<string, string>();
    const specimenFullUrls = new Map<string, string>();
    const observationFullUrls = new Map<string, string>();
    const bundle = this.buildLabReportTransactionBundle({
      bundleData,
      reportableItems,
      patientIhsNumber,
      practitionerIhsNumber,
      serviceRequestFullUrls,
      specimenFullUrls,
      observationFullUrls,
    });
    const response = await this.httpClient.sendRequest<SatusehatTransactionResponse>({
      method: 'POST',
      path: '',
      body: bundle,
    });
    const createdResources = this.extractCreatedResources(bundle, response);
    await this.saveLabReportIhsIds({
      labOrderId,
      bundle,
      createdResources,
      serviceRequestFullUrls,
      specimenFullUrls,
      observationFullUrls,
    });
    return true;
  }

  /**
   * Names what the chain left out, and why. An uncoded test is a catalog gap
   * the clinic can close; an item with no released value is one the bench has
   * not signed off. Both are silent omissions from the national record unless
   * they are said out loud here.
   */
  private logLabReportGaps(
    bundleData: SatusehatLabReportBundleData,
    reportableItems: readonly SatusehatLabReportItem[],
  ): void {
    const reportableIds = new Set(reportableItems.map((item) => item.labOrderItemId));
    const uncodedCount = bundleData.items.filter(
      (item) => !reportableIds.has(item.labOrderItemId) && item.loincCode === null,
    ).length;
    const unreleasedCount = bundleData.items.filter(
      (item) =>
        !reportableIds.has(item.labOrderItemId) && item.loincCode !== null && item.result === null,
    ).length;
    if (uncodedCount > 0) {
      this.logger.warn(
        `SATUSEHAT lab report skipped ${uncodedCount} test(s) with no LOINC code in the catalog`,
      );
    }
    if (unreleasedCount > 0) {
      this.logger.warn(
        `SATUSEHAT lab report skipped ${unreleasedCount} test(s) with no verified result`,
      );
    }
  }

  /**
   * The ordering doctor's IHS number, or none. Unlike an encounter — which
   * cannot be reported without its attending practitioner — a laboratory
   * request is performed by the Organization, so an unlinkable requester costs
   * the chain a `requester` element rather than the whole submission.
   */
  private async resolveLabRequesterIhsNumber(
    bundleData: SatusehatLabReportBundleData,
  ): Promise<string | undefined> {
    if (bundleData.practitionerIhsNumber) {
      return bundleData.practitionerIhsNumber;
    }
    if (bundleData.doctorId === null) {
      return undefined;
    }
    try {
      return await this.resolvePractitionerIhsNumber({
        doctorId: bundleData.doctorId,
        practitionerIhsNumber: bundleData.practitionerIhsNumber,
      });
    } catch (caughtError) {
      if (caughtError instanceof SatusehatSubmissionDataError) {
        this.logger.warn(
          'SATUSEHAT lab report could not resolve the ordering doctor; reporting without a requester',
        );
        return undefined;
      }
      throw caughtError;
    }
  }

  /**
   * Assembles the chain as one transaction bundle, wired together with
   * `urn:uuid:` bundle-local references so the platform resolves the links
   * itself: a Specimen names the requests it serves, an Observation names the
   * request it answers and the tube it came from, and the DiagnosticReport
   * names all three. Nothing here is posted twice — one round trip settles the
   * whole order.
   */
  private buildLabReportTransactionBundle(
    input: LabReportBundleInput,
  ): SatusehatFhirTransactionBundle {
    const {
      bundleData,
      reportableItems,
      patientIhsNumber,
      practitionerIhsNumber,
      serviceRequestFullUrls,
      specimenFullUrls,
      observationFullUrls,
    } = input;
    const releasedAt = bundleData.releasedAt ?? new Date();
    // A laboratory-only visit has no encounter to point at, so the chain sends
    // one of its own (P18-T10) and the rest of the bundle references it
    // locally. An order raised during a consultation references the Encounter
    // that visit already reported.
    const labOnlyEncounterEntry: SatusehatFhirBundleEntry | null =
      bundleData.encounterId === null
        ? {
            fullUrl: `urn:uuid:${randomUUID()}`,
            resource: this.fhirMapper.mapLabOnlyVisitToEncounter({
              registrationId: bundleData.registrationId,
              patientIhsNumber,
              patientName: bundleData.patientName,
              startedAt: bundleData.visitStartedAt,
              endedAt: releasedAt,
            }),
            request: { method: 'POST', url: 'Encounter' },
          }
        : null;
    const encounterReference =
      labOnlyEncounterEntry?.fullUrl ?? `Encounter/${bundleData.satusehatEncounterId}`;
    const serviceRequestEntries: SatusehatFhirBundleEntry[] = reportableItems.map((item) => {
      const fullUrl = `urn:uuid:${randomUUID()}`;
      serviceRequestFullUrls.set(fullUrl, item.labOrderItemId);
      return {
        fullUrl,
        resource: this.fhirMapper.mapLabItemToServiceRequest({
          orderNumber: bundleData.orderNumber,
          itemSeq: item.itemSeq,
          loincCode: item.loincCode ?? '',
          ...(item.loincDisplay ? { loincDisplay: item.loincDisplay } : {}),
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference,
          orderedAt: bundleData.orderedAt,
          ...(practitionerIhsNumber ? { practitionerIhsNumber } : {}),
          ...(bundleData.primaryConditionCode
            ? { reasonCode: bundleData.primaryConditionCode }
            : {}),
          ...(bundleData.primaryConditionDisplay
            ? { reasonDisplay: bundleData.primaryConditionDisplay }
            : {}),
        }),
        request: { method: 'POST', url: 'ServiceRequest' },
      };
    });
    const serviceRequestUrlByItemId = new Map(
      [...serviceRequestFullUrls].map(([fullUrl, itemId]) => [itemId, fullUrl]),
    );
    // Only the tubes that actually serve a reported test. A draw taken for an
    // item that turned out to be uncoded has nothing to attach to, and sending
    // it would put a specimen on the record with no observation to explain it.
    const reportedSpecimenIds = new Set(
      reportableItems
        .map((item) => item.specimenId)
        .filter((specimenId): specimenId is string => specimenId !== null),
    );
    const specimenEntries: SatusehatFhirBundleEntry[] = bundleData.specimens
      .filter((specimen) => reportedSpecimenIds.has(specimen.specimenId))
      .map((specimen) => {
        const fullUrl = `urn:uuid:${randomUUID()}`;
        specimenFullUrls.set(fullUrl, specimen.specimenId);
        return {
          fullUrl,
          resource: this.fhirMapper.mapLabSpecimen({
            specimenType: specimen.specimenType,
            accessionNumber: specimen.accessionNumber,
            collectedAt: specimen.collectedAt,
            patientIhsNumber,
            patientName: bundleData.patientName,
            serviceRequestReferences: reportableItems
              .filter((item) => item.specimenId === specimen.specimenId)
              .map((item) => serviceRequestUrlByItemId.get(item.labOrderItemId))
              .filter((reference): reference is string => reference !== undefined),
          }),
          request: { method: 'POST', url: 'Specimen' },
        };
      });
    const specimenUrlBySpecimenId = new Map(
      [...specimenFullUrls].map(([fullUrl, specimenId]) => [specimenId, fullUrl]),
    );
    const observationEntries: SatusehatFhirBundleEntry[] = reportableItems.map((item) => {
      const fullUrl = `urn:uuid:${randomUUID()}`;
      const result = item.result;
      if (result === null) {
        throw new SatusehatSubmissionDataError('Reportable item lost its result');
      }
      observationFullUrls.set(fullUrl, result.labResultId);
      const specimenReference =
        item.specimenId === null ? undefined : specimenUrlBySpecimenId.get(item.specimenId);
      return {
        fullUrl,
        resource: this.fhirMapper.mapLabResultToObservation({
          loincCode: item.loincCode ?? '',
          ...(item.loincDisplay ? { loincDisplay: item.loincDisplay } : {}),
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference,
          serviceRequestReference: serviceRequestUrlByItemId.get(item.labOrderItemId) ?? '',
          ...(specimenReference ? { specimenReference } : {}),
          ...this.buildLabObservationValueInput(result),
          ...(result.unit !== null ? { unit: result.unit } : {}),
          ...(result.refLow !== null ? { refLow: result.refLow } : {}),
          ...(result.refHigh !== null ? { refHigh: result.refHigh } : {}),
          ...(result.refText !== null ? { refText: result.refText } : {}),
          ...(result.flag !== null ? { flag: result.flag } : {}),
          isAmendment: result.isAmendment,
          effectiveAt: this.resolveLabEffectiveAt(bundleData, item, result.enteredAt),
          issuedAt: releasedAt,
        }),
        request: { method: 'POST', url: 'Observation' },
      };
    });
    const diagnosticReportEntry: SatusehatFhirBundleEntry = {
      fullUrl: `urn:uuid:${randomUUID()}`,
      resource: this.fhirMapper.mapLabOrderToDiagnosticReport({
        orderNumber: bundleData.orderNumber,
        ...(bundleData.singlePanelLoincCode
          ? { panelLoincCode: bundleData.singlePanelLoincCode }
          : {}),
        ...(bundleData.singlePanelLoincDisplay
          ? { panelLoincDisplay: bundleData.singlePanelLoincDisplay }
          : {}),
        patientIhsNumber,
        patientName: bundleData.patientName,
        encounterReference,
        serviceRequestReferences: serviceRequestEntries.map((entry) => entry.fullUrl),
        specimenReferences: specimenEntries.map((entry) => entry.fullUrl),
        observationReferences: observationEntries.map((entry) => entry.fullUrl),
        // A report is amended when any value on it supersedes one already
        // released — the whole sheet is reissued, so the sheet's status says so.
        isAmendment: reportableItems.some((item) => item.result?.isAmendment === true),
        effectiveAt: this.resolveLabReportEffectiveAt(bundleData, releasedAt),
        issuedAt: releasedAt,
      }),
      request: { method: 'POST', url: 'DiagnosticReport' },
    };
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        // First, so everything after it can reference a visit that exists.
        ...(labOnlyEncounterEntry === null ? [] : [labOnlyEncounterEntry]),
        ...serviceRequestEntries,
        ...specimenEntries,
        ...observationEntries,
        diagnosticReportEntry,
      ],
    };
  }

  /** The one value form the result carries, as the mapper's input names it. */
  private buildLabObservationValueInput(
    result: NonNullable<SatusehatLabReportItem['result']>,
  ): Pick<SatusehatLabObservationMapInput, 'valueNumeric' | 'valueString' | 'valueCoded'> {
    if (result.valueNumeric !== null) {
      return { valueNumeric: result.valueNumeric };
    }
    if (result.valueCoded !== null) {
      return { valueCoded: result.valueCoded };
    }
    return { valueString: result.valueText ?? '' };
  }

  /**
   * When the measurement applies to: the moment the tube was drawn, which is
   * the clinically meaningful instant — a fasting glucose describes the
   * patient at 7am, not at the moment the analyst typed it. Falls back to when
   * the value was entered for an item with no tube.
   */
  private resolveLabEffectiveAt(
    bundleData: SatusehatLabReportBundleData,
    item: SatusehatLabReportItem,
    enteredAt: Date,
  ): Date {
    const specimen = bundleData.specimens.find(
      (candidate) => candidate.specimenId === item.specimenId,
    );
    return specimen?.collectedAt ?? enteredAt;
  }

  /** The earliest draw on the order — when the sheet as a whole applies to. */
  private resolveLabReportEffectiveAt(
    bundleData: SatusehatLabReportBundleData,
    releasedAt: Date,
  ): Date {
    const collectedTimes = bundleData.specimens.map((specimen) => specimen.collectedAt.getTime());
    return collectedTimes.length === 0
      ? releasedAt
      : new Date(Math.min(...collectedTimes));
  }

  /**
   * Writes the assigned ids back onto the order, its items, its tubes and its
   * values, so a resubmission updates those resources instead of creating a
   * second set beside them.
   */
  private async saveLabReportIhsIds(input: LabReportWriteBackInput): Promise<void> {
    const diagnosticReportEntry = input.bundle.entry.find(
      (entry) => entry.request.url === 'DiagnosticReport',
    );
    await this.submissionRepository.saveLabReportIhsIds({
      labOrderId: input.labOrderId,
      diagnosticReportId:
        diagnosticReportEntry === undefined
          ? null
          : (input.createdResources.get(diagnosticReportEntry.fullUrl)?.id ?? null),
      serviceRequestIdsByItemId: this.collectCreatedIds(
        input.serviceRequestFullUrls,
        input.createdResources,
      ),
      specimenIdsBySpecimenId: this.collectCreatedIds(
        input.specimenFullUrls,
        input.createdResources,
      ),
      observationIdsByResultId: this.collectCreatedIds(
        input.observationFullUrls,
        input.createdResources,
      ),
    });
  }

  /** Local id → assigned IHS id, for the entries the platform did create. */
  private collectCreatedIds(
    fullUrlsByLocalId: ReadonlyMap<string, string>,
    createdResources: ReadonlyMap<string, SatusehatCreatedResourceLocation>,
  ): Record<string, string> {
    const assigned: Record<string, string> = {};
    for (const [fullUrl, localId] of fullUrlsByLocalId) {
      const created = createdResources.get(fullUrl);
      if (created !== undefined) {
        assigned[localId] = created.id;
      }
    }
    return assigned;
  }

  private buildTransactionBundle(
    bundleData: SatusehatSubmissionBundleData,
    endedAt: Date,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
    allergyFullUrls: Map<string, string>,
  ): SatusehatFhirTransactionBundle {
    const encounterFullUrl = `urn:uuid:${randomUUID()}`;
    const conditionEntries: SatusehatFhirBundleEntry[] = this.sortDiagnoses(bundleData).map(
      (diagnosis) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapDiagnosisToCondition({
          icd10Code: diagnosis.code,
          icd10Display: diagnosis.display,
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          recordedAt: diagnosis.recordedAt,
        }),
        request: { method: 'POST', url: 'Condition' },
      }),
    );
    const procedureEntries = this.buildProcedureEntries(
      bundleData,
      endedAt,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
    );
    const allergyEntries = this.buildAllergyEntries(
      bundleData,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
      allergyFullUrls,
    );
    const immunizationEntries = this.buildImmunizationEntries(
      bundleData,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
    );
    const observationEntries: SatusehatFhirBundleEntry[] = bundleData.latestVitalSigns
      ? this.fhirMapper
          .mapVitalSignsToObservations({
            ...bundleData.latestVitalSigns,
            patientIhsNumber,
            practitionerIhsNumber,
            encounterReference: encounterFullUrl,
          })
          .map((observation) => ({
            fullUrl: `urn:uuid:${randomUUID()}`,
            resource: observation,
            request: { method: 'POST', url: 'Observation' },
          }))
      : [];
    const medicationEntries = this.buildMedicationEntries(
      bundleData,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
    );
    const encounterResource = this.fhirMapper.mapEncounter({
      encounterId: bundleData.encounterId,
      patientIhsNumber,
      patientName: bundleData.patientName,
      practitionerIhsNumber,
      practitionerName: bundleData.doctorName,
      arrivedAt: bundleData.arrivedAt,
      startedAt: bundleData.startedAt,
      endedAt,
      ...(bundleData.admission
        ? {
            admission: {
              admittedAt: bundleData.admission.admittedAt,
              dischargedAt: bundleData.admission.dischargedAt,
            },
          }
        : {}),
      conditionReferences: conditionEntries.map((entry, index) => ({
        reference: entry.fullUrl,
        rank: index + 1,
      })),
    });
    const clinicalImpressionEntry = this.buildClinicalImpressionEntry(
      bundleData,
      endedAt,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
      conditionEntries,
    );
    const compositionEntry = this.buildCompositionEntry({
      bundleData,
      endedAt,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
      conditionEntries,
      procedureEntries,
      observationEntries,
      medicationEntries,
      immunizationEntries,
    });
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        { fullUrl: encounterFullUrl, resource: encounterResource, request: { method: 'POST', url: 'Encounter' } },
        ...conditionEntries,
        ...procedureEntries,
        ...allergyEntries,
        ...observationEntries,
        ...medicationEntries,
        ...immunizationEntries,
        ...clinicalImpressionEntry,
        ...compositionEntry,
      ],
    };
  }

  /**
   * Builds the Composition — the *resume medis*, one document per episode —
   * from the SOAP narrative and the entries already in the bundle. It is
   * appended last because it references all of them.
   *
   * A section is emitted only when it has narrative or entries: an encounter
   * with no procedures gets no "Tindakan" section rather than an empty one,
   * which would assert the question was asked and answered with nothing. An
   * encounter with nothing at all produces no Composition — a document with no
   * sections is not a medical resume.
   */
  private buildCompositionEntry(context: {
    bundleData: SatusehatSubmissionBundleData;
    endedAt: Date;
    encounterFullUrl: string;
    patientIhsNumber: string;
    practitionerIhsNumber: string;
    conditionEntries: readonly SatusehatFhirBundleEntry[];
    procedureEntries: readonly SatusehatFhirBundleEntry[];
    observationEntries: readonly SatusehatFhirBundleEntry[];
    medicationEntries: readonly SatusehatFhirBundleEntry[];
    immunizationEntries: readonly SatusehatFhirBundleEntry[];
  }): SatusehatFhirBundleEntry[] {
    const { bundleData } = context;
    const sections: SatusehatCompositionSectionInput[] = [
      {
        title: 'Anamnesis',
        loincCode: '10164-2',
        loincDisplay: 'History of present illness Narrative',
        narrative: bundleData.soapNote.subjective ?? undefined,
      },
      {
        title: 'Pemeriksaan',
        loincCode: '29545-1',
        loincDisplay: 'Physical findings Narrative',
        narrative: bundleData.soapNote.objective ?? undefined,
        entryReferences: context.observationEntries.map((entry) => entry.fullUrl),
      },
      {
        title: 'Diagnosis',
        loincCode: '29308-4',
        loincDisplay: 'Diagnosis',
        narrative: bundleData.soapNote.assessment ?? undefined,
        entryReferences: context.conditionEntries.map((entry) => entry.fullUrl),
      },
      {
        title: 'Tindakan',
        loincCode: '29554-3',
        loincDisplay: 'Procedure Narrative',
        entryReferences: context.procedureEntries.map((entry) => entry.fullUrl),
      },
      {
        title: 'Terapi',
        loincCode: '10160-0',
        loincDisplay: 'History of Medication use Narrative',
        entryReferences: context.medicationEntries
          .filter((entry) => entry.request.url === 'MedicationRequest')
          .map((entry) => entry.fullUrl),
      },
      {
        title: 'Imunisasi',
        loincCode: '11369-6',
        loincDisplay: 'History of Immunization Narrative',
        entryReferences: context.immunizationEntries.map((entry) => entry.fullUrl),
      },
      {
        title: 'Rencana',
        loincCode: '18776-5',
        loincDisplay: 'Plan of care note',
        narrative: bundleData.soapNote.plan ?? undefined,
      },
    ];
    const composition = this.fhirMapper.mapComposition({
      encounterId: bundleData.encounterId,
      patientIhsNumber: context.patientIhsNumber,
      patientName: bundleData.patientName,
      practitionerIhsNumber: context.practitionerIhsNumber,
      practitionerName: bundleData.doctorName,
      encounterReference: context.encounterFullUrl,
      endedAt: context.endedAt,
      sections,
    });
    if (composition.section.length === 0) {
      return [];
    }
    return [
      {
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: composition,
        request: { method: 'POST', url: 'Composition' },
      },
    ];
  }

  /**
   * The assessment narrative and the prognosis, as a ClinicalImpression beside
   * the Composition. Skipped entirely when neither was recorded — an
   * impression with no summary, no finding and no prognosis says nothing.
   */
  private buildClinicalImpressionEntry(
    bundleData: SatusehatSubmissionBundleData,
    endedAt: Date,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
    conditionEntries: readonly SatusehatFhirBundleEntry[],
  ): SatusehatFhirBundleEntry[] {
    const summary = bundleData.soapNote.assessment?.trim() ?? '';
    const { prognosis } = bundleData.soapNote;
    if (summary === '' && prognosis === null && conditionEntries.length === 0) {
      return [];
    }
    return [
      {
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapClinicalImpression({
          encounterId: bundleData.encounterId,
          patientIhsNumber,
          patientName: bundleData.patientName,
          practitionerIhsNumber,
          practitionerName: bundleData.doctorName,
          encounterReference: encounterFullUrl,
          endedAt,
          ...(summary === '' ? {} : { summary }),
          findingReferences: conditionEntries.map((entry) => entry.fullUrl),
          ...(prognosis === null ? {} : { prognosis }),
        }),
        request: { method: 'POST', url: 'ClinicalImpression' },
      },
    ];
  }

  /**
   * Builds one Procedure entry per ICD-9-CM-coded tindakan recorded on the
   * visit. A procedure typed as free text carries no ICD-9-CM code, so it is
   * skipped and named in the gap report rather than sent under a coding the
   * platform does not recognise — the same policy as the KFA medication gap
   * (P10-T07).
   */
  private buildProcedureEntries(
    bundleData: SatusehatSubmissionBundleData,
    endedAt: Date,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
  ): SatusehatFhirBundleEntry[] {
    const skippedProcedures = bundleData.procedures.filter((procedure) => !procedure.isCoded);
    this.reportProcedureGaps(skippedProcedures);
    return bundleData.procedures
      .filter((procedure) => procedure.isCoded)
      .map((procedure) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapProcedure({
          procedureId: procedure.procedureId,
          icd9cmCode: procedure.code,
          icd9cmDisplay: procedure.display,
          patientIhsNumber,
          patientName: bundleData.patientName,
          practitionerIhsNumber,
          practitionerName: bundleData.doctorName,
          encounterReference: encounterFullUrl,
          performedAt: procedure.performedAt,
          encounterStartedAt: bundleData.startedAt,
          encounterEndedAt: endedAt,
          notes: procedure.notes ?? undefined,
        }),
        request: { method: 'POST', url: 'Procedure' },
      }));
  }

  private reportProcedureGaps(
    skippedProcedures: readonly SatusehatSubmissionProcedure[],
  ): void {
    if (skippedProcedures.length === 0) {
      return;
    }
    const described = skippedProcedures
      .map((procedure) => `${procedure.code} (${procedure.display})`)
      .join(', ');
    this.logger.warn(
      `SATUSEHAT procedure mapping gap: skipped ${skippedProcedures.length} procedure(s) without an ICD-9-CM code: ${described}`,
    );
  }

  /**
   * Appends the patient's not-yet-reported active allergies to this encounter's
   * bundle. Allergies are patient-scoped while the outbox is keyed by
   * encounter, which is why they had never been reported at all; riding
   * whichever visit comes next, then recording the returned id and never
   * sending the row again, is the cheapest thing that gets a penicillin
   * reaction into the national record without a second outbox.
   *
   * `recorder` is the attending doctor only when the row was written during
   * this visit. An allergy taken down years ago by somebody else would
   * otherwise be attributed to whoever happened to see the patient today.
   */
  private buildAllergyEntries(
    bundleData: SatusehatSubmissionBundleData,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
    allergyFullUrls: Map<string, string>,
  ): SatusehatFhirBundleEntry[] {
    this.reportRetractedAllergyGap(bundleData.retractedReportedAllergyCount);
    return bundleData.unreportedAllergies.map((allergy) => {
      const fullUrl = `urn:uuid:${randomUUID()}`;
      allergyFullUrls.set(fullUrl, allergy.allergyId);
      return {
        fullUrl,
        resource: this.fhirMapper.mapAllergyToAllergyIntolerance({
          allergyId: allergy.allergyId,
          substance: allergy.substance,
          reaction: allergy.reaction ?? undefined,
          severity: allergy.severity,
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          recordedAt: allergy.recordedAt,
          ...(this.wasRecordedDuringEncounter(allergy, bundleData)
            ? {
                recorderIhsNumber: practitionerIhsNumber,
                recorderName: bundleData.doctorName,
              }
            : {}),
        }),
        request: { method: 'POST', url: 'AllergyIntolerance' },
      };
    });
  }

  /**
   * Retracting an allergy on the platform needs an `entered-in-error` update
   * this adapter does not do yet. Logging the count leaves the divergence
   * visible instead of silent — no identifying detail, the same discipline as
   * the medication gap report.
   */
  private reportRetractedAllergyGap(retractedCount: number): void {
    if (retractedCount === 0) {
      return;
    }
    this.logger.warn(
      `SATUSEHAT allergy retraction gap: ${retractedCount} reported allergy(ies) were deleted locally and remain active on the platform`,
    );
  }

  private wasRecordedDuringEncounter(
    allergy: SatusehatSubmissionAllergy,
    bundleData: SatusehatSubmissionBundleData,
  ): boolean {
    if (bundleData.endedAt === null) {
      return false;
    }
    const recordedAt = allergy.recordedAt.getTime();
    return (
      recordedAt >= bundleData.startedAt.getTime() && recordedAt <= bundleData.endedAt.getTime()
    );
  }

  /**
   * An allergy whose entry the platform did not confirm keeps its null id and
   * is offered again on the next encounter. Two workers submitting concurrent
   * encounters for the same patient can both include the same unreported
   * allergy: the row lease (SJ-76) makes that rare, and the worst case is one
   * duplicate resource on the platform rather than a silently unreported
   * allergy — which is the right way round.
   */
  private async saveAllergyIhsIds(
    allergyFullUrls: ReadonlyMap<string, string>,
    createdResources: ReadonlyMap<string, SatusehatCreatedResourceLocation>,
  ): Promise<void> {
    const payloads: SaveAllergyIhsIdPayload[] = [];
    for (const [fullUrl, allergyId] of allergyFullUrls) {
      const created = createdResources.get(fullUrl);
      if (created !== undefined) {
        payloads.push({ allergyId, satusehatAllergyId: created.id });
      }
    }
    await this.submissionRepository.saveAllergyIhsIds(payloads);
  }

  /**
   * Builds one Immunization entry per KFA-coded vaccination on the visit.
   *
   * A vaccine whose catalog row has no KFA code is skipped and named in the
   * gap report — the platform only accepts KFA-coded products, and the fix is
   * the catalog, not a guessed code. The vaccination stays in the local record
   * either way, which is the point of recording it structurally at all.
   */
  private buildImmunizationEntries(
    bundleData: SatusehatSubmissionBundleData,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
  ): SatusehatFhirBundleEntry[] {
    const skipped = bundleData.immunizations.filter(
      (immunization) => immunization.kfaCode === null,
    );
    this.reportImmunizationGaps(skipped);
    return bundleData.immunizations
      .filter(
        (immunization): immunization is SatusehatSubmissionImmunization & { kfaCode: string } =>
          immunization.kfaCode !== null,
      )
      .map((immunization) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapImmunization({
          immunizationId: immunization.immunizationId,
          kfaCode: immunization.kfaCode,
          vaccineName: immunization.vaccineName,
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          occurredAt: immunization.occurredAt,
          lotNumber: immunization.lotNumber ?? undefined,
          expirationDate: immunization.expirationDate ?? undefined,
          doseNumber: immunization.doseNumber ?? undefined,
          route: immunization.route ?? undefined,
          site: immunization.site ?? undefined,
          performerIhsNumber: practitionerIhsNumber,
          performerName: bundleData.doctorName,
          notes: immunization.notes ?? undefined,
        }),
        request: { method: 'POST', url: 'Immunization' },
      }));
  }

  private reportImmunizationGaps(
    skippedImmunizations: readonly SatusehatSubmissionImmunization[],
  ): void {
    if (skippedImmunizations.length === 0) {
      return;
    }
    this.logger.warn(
      `SATUSEHAT immunization mapping gap: skipped ${skippedImmunizations.length} vaccination(s) whose vaccine has no KFA code`,
    );
  }

  /**
   * Builds Medication, MedicationRequest, and MedicationDispense entries for
   * every KFA-coded item on the visit's prescriptions and dispense records.
   * Items whose catalog row has no `kfaCode` are skipped — the platform only
   * accepts KFA-coded products — and reported as a gap log so the catalog gap
   * is fixable instead of silently shrinking the submission (P10-T05).
   */
  private buildMedicationEntries(
    bundleData: SatusehatSubmissionBundleData,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
  ): SatusehatFhirBundleEntry[] {
    const medicationFullUrls = new Map<string, string>();
    const medicationEntries: SatusehatFhirBundleEntry[] = [];
    const skippedMedications = new Map<string, SatusehatSubmissionMedication>();
    const registerMedication = (medication: SatusehatSubmissionMedication): string | null => {
      if (medication.kfaCode === null) {
        skippedMedications.set(medication.medicationId, medication);
        return null;
      }
      const existingFullUrl = medicationFullUrls.get(medication.medicationId);
      if (existingFullUrl) {
        return existingFullUrl;
      }
      const fullUrl = `urn:uuid:${randomUUID()}`;
      medicationFullUrls.set(medication.medicationId, fullUrl);
      medicationEntries.push({
        fullUrl,
        resource: this.fhirMapper.mapMedicationToResource({
          medicationCode: medication.code,
          kfaCode: medication.kfaCode,
          name: medication.name,
        }),
        request: { method: 'POST', url: 'Medication' },
      });
      return fullUrl;
    };
    /**
     * Registers a compound as one `Medication` of type SD whose ingredients
     * reference the component products' own entries.
     *
     * A compound with **any** uncoded component is skipped whole rather than
     * sent with the ingredients that happen to be coded: a half-described
     * racikan is worse than an absent one, because the next clinic reads it as
     * complete (P10-T18).
     */
    const compoundFullUrls = new Map<string, string>();
    const skippedCompounds: string[] = [];
    const registerCompound = (item: SatusehatSubmissionPrescriptionItem): string | null => {
      const compound = item.compound;
      if (compound === null) {
        return null;
      }
      const existingFullUrl = compoundFullUrls.get(item.prescriptionItemId);
      if (existingFullUrl) {
        return existingFullUrl;
      }
      const ingredientReferences: Array<{
        medicationReference: string;
        medicationDisplay: string;
        quantity: number;
        unit: string;
      }> = [];
      for (const component of compound.components) {
        const componentFullUrl = registerMedication(component.medication);
        if (componentFullUrl === null) {
          skippedCompounds.push(`${compound.compoundName} (${component.medication.code})`);
          return null;
        }
        ingredientReferences.push({
          medicationReference: componentFullUrl,
          medicationDisplay: component.medication.name,
          quantity: component.quantity,
          unit: component.unit,
        });
      }
      const fullUrl = `urn:uuid:${randomUUID()}`;
      compoundFullUrls.set(item.prescriptionItemId, fullUrl);
      medicationEntries.push({
        fullUrl,
        resource: this.fhirMapper.mapCompoundMedication({
          prescriptionItemId: item.prescriptionItemId,
          compoundName: compound.compoundName,
          ingredients: ingredientReferences,
        }),
        request: { method: 'POST', url: 'Medication' },
      });
      return fullUrl;
    };
    const requestFullUrls = new Map<string, string>();
    const requestEntries: SatusehatFhirBundleEntry[] = [];
    for (const prescription of bundleData.prescriptions) {
      for (const item of prescription.items) {
        const medicationFullUrl = item.compound
          ? registerCompound(item)
          : item.medication
            ? registerMedication(item.medication)
            : null;
        if (medicationFullUrl === null) {
          continue;
        }
        const requestFullUrl = `urn:uuid:${randomUUID()}`;
        // Keyed by the prescription line, not by the medication: a compound
        // has no medication to key on, and a dispense of one has to find its
        // request.
        requestFullUrls.set(item.prescriptionItemId, requestFullUrl);
        requestEntries.push({
          fullUrl: requestFullUrl,
          resource: this.fhirMapper.mapPrescriptionItemToMedicationRequest({
            prescriptionId: item.prescriptionId,
            prescriptionItemId: item.prescriptionItemId,
            medicationReference: medicationFullUrl,
            medicationDisplay: item.compound
              ? item.compound.compoundName
              : (item.medication?.name ?? ''),
            patientIhsNumber,
            patientName: bundleData.patientName,
            practitionerIhsNumber,
            practitionerName: bundleData.doctorName,
            encounterReference: encounterFullUrl,
            dosage: item.dosage,
            frequency: item.frequency,
            instructions: item.instructions ?? undefined,
            quantity: item.quantity,
            unit: item.compound
              ? undefined
              : (item.medication?.unit ?? undefined),
            authoredOn: prescription.issuedAt ?? undefined,
          }),
          request: { method: 'POST', url: 'MedicationRequest' },
        });
      }
    }
    const dispenseEntries: SatusehatFhirBundleEntry[] = [];
    for (const dispenseItem of bundleData.dispenseItems) {
      const medicationFullUrl = dispenseItem.prescriptionItemId
        ? (compoundFullUrls.get(dispenseItem.prescriptionItemId) ?? null)
        : dispenseItem.medication
          ? registerMedication(dispenseItem.medication)
          : null;
      if (medicationFullUrl === null) {
        continue;
      }
      dispenseEntries.push({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapDispenseItemToMedicationDispense({
          dispenseRecordId: dispenseItem.dispenseRecordId,
          dispenseItemId: dispenseItem.dispenseItemId,
          medicationReference: medicationFullUrl,
          medicationDisplay: dispenseItem.medication?.name ?? 'Racikan',
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          medicationRequestReference: dispenseItem.prescriptionItemId
            ? requestFullUrls.get(dispenseItem.prescriptionItemId)
            : this.resolveProductRequestReference(bundleData, dispenseItem, requestFullUrls),
          quantity: dispenseItem.quantity,
          unit: dispenseItem.medication?.unit ?? undefined,
          dispensedAt: dispenseItem.dispensedAt,
        }),
        request: { method: 'POST', url: 'MedicationDispense' },
      });
    }
    this.reportCompoundGaps(skippedCompounds);
    this.reportMedicationGaps(skippedMedications);
    return [...medicationEntries, ...requestEntries, ...dispenseEntries];
  }

  /**
   * A product dispense finds its request through the prescription line that
   * named the same medication — the line id is the only key both sides share
   * now that a line may have no medication at all.
   */
  private resolveProductRequestReference(
    bundleData: SatusehatSubmissionBundleData,
    dispenseItem: SatusehatSubmissionDispenseItem,
    requestFullUrls: ReadonlyMap<string, string>,
  ): string | undefined {
    const line = bundleData.prescriptions
      .find((prescription) => prescription.prescriptionId === dispenseItem.prescriptionId)
      ?.items.find(
        (item) => item.medication?.medicationId === dispenseItem.medication?.medicationId,
      );
    return line ? requestFullUrls.get(line.prescriptionItemId) : undefined;
  }

  /**
   * A compound skipped for an uncoded ingredient names both the compound and
   * the component, because the fix is the component's catalog row and an
   * operator told only "a compound was skipped" cannot find it.
   */
  private reportCompoundGaps(skippedCompounds: readonly string[]): void {
    if (skippedCompounds.length === 0) {
      return;
    }
    this.logger.warn(
      `SATUSEHAT compound mapping gap: skipped ${skippedCompounds.length} compound(s) with an uncoded component: ${skippedCompounds.join(', ')}`,
    );
  }

  private reportMedicationGaps(
    skippedMedications: ReadonlyMap<string, SatusehatSubmissionMedication>,
  ): void {
    if (skippedMedications.size === 0) {
      return;
    }
    this.logger.warn(
      `SATUSEHAT medication mapping gap: skipped ${skippedMedications.size} item(s) without a KFA code`,
    );
  }

  /** PRIMARY first (rank 1), then secondaries in the order they were recorded. */
  private sortDiagnoses(bundleData: SatusehatSubmissionBundleData) {
    return [...bundleData.diagnoses].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'PRIMARY' ? -1 : 1;
      }
      return left.recordedAt.getTime() - right.recordedAt.getTime();
    });
  }

  private async resolvePatientIhsNumber(bundleData: {
    patientId: string;
    patientIhsNumber: string | null;
  }): Promise<string> {
    if (bundleData.patientIhsNumber) {
      return bundleData.patientIhsNumber;
    }
    const target = await this.linkRepository.findPatientLinkTarget(bundleData.patientId);
    if (!target || target.nik === null) {
      throw new SatusehatSubmissionDataError(
        'Patient has no NIK on record, so the IHS number cannot be resolved',
      );
    }
    const ihsNumber = await this.masterDataClient.findPatientIhsNumberByNik(target.nik);
    if (ihsNumber === null) {
      throw new SatusehatSubmissionDataError('No SATUSEHAT patient record matches the stored NIK');
    }
    await this.linkRepository.savePatientIhsNumber({
      patientId: bundleData.patientId,
      ihsNumber,
    });
    await this.auditService.record({
      action: 'SATUSEHAT_PATIENT_LINKED',
      resource: 'PatientProfile',
      resourceId: bundleData.patientId,
      actorUserId: null,
      metadata: { lookup: 'NIK', trigger: 'SUBMISSION_WORKER' },
    });
    return ihsNumber;
  }

  private async resolvePractitionerIhsNumber(bundleData: {
    doctorId: string;
    practitionerIhsNumber: string | null;
  }): Promise<string> {
    if (bundleData.practitionerIhsNumber) {
      return bundleData.practitionerIhsNumber;
    }
    const target = await this.linkRepository.findDoctorLinkTarget(bundleData.doctorId);
    if (!target || target.nik === null) {
      throw new SatusehatSubmissionDataError(
        'Doctor has no NIK on record, so the IHS practitioner number cannot be resolved',
      );
    }
    const ihsNumber = await this.masterDataClient.findPractitionerIhsNumberByNik(target.nik);
    if (ihsNumber === null) {
      throw new SatusehatSubmissionDataError(
        'No SATUSEHAT practitioner record matches the stored NIK',
      );
    }
    await this.linkRepository.saveDoctorIhsNumber({ doctorId: bundleData.doctorId, ihsNumber });
    await this.auditService.record({
      action: 'SATUSEHAT_DOCTOR_LINKED',
      resource: 'DoctorProfile',
      resourceId: bundleData.doctorId,
      actorUserId: null,
      metadata: { lookup: 'NIK', trigger: 'SUBMISSION_WORKER' },
    });
    return ihsNumber;
  }

  /**
   * Pairs each request entry with the resource the platform created for it and
   * returns the created ids keyed by the request entry's `fullUrl`. Nothing in
   * a transaction response echoes `fullUrl` back, so the only link between a
   * `urn:uuid:` bundle-local reference and the id the platform assigned is
   * order — which FHIR guarantees per resource type. Pairing is therefore done
   * within a resource type and only when the platform returned exactly as many
   * of that type as were requested; a type whose counts disagree is skipped
   * whole, so a caller reading an absent key learns the id is unknown instead
   * of receiving somebody else's.
   */
  private extractCreatedResources(
    bundle: SatusehatFhirTransactionBundle,
    response: SatusehatTransactionResponse,
  ): Map<string, SatusehatCreatedResourceLocation> {
    const createdByType = new Map<string, SatusehatCreatedResourceLocation[]>();
    for (const responseEntry of response.entry ?? []) {
      const created = this.parseCreatedResource(responseEntry);
      if (created === null) {
        continue;
      }
      const bucket = createdByType.get(created.resourceType);
      if (bucket) {
        bucket.push(created);
      } else {
        createdByType.set(created.resourceType, [created]);
      }
    }
    const createdResources = new Map<string, SatusehatCreatedResourceLocation>();
    for (const [resourceType, fullUrls] of this.groupRequestedFullUrls(bundle)) {
      const created = createdByType.get(resourceType) ?? [];
      if (created.length !== fullUrls.length) {
        this.logger.warn(
          `SATUSEHAT transaction response returned ${created.length} ${resourceType} resource(s) for ${fullUrls.length} request(s); their ids were not resolved`,
        );
        continue;
      }
      fullUrls.forEach((fullUrl, index) => {
        const createdResource = created[index];
        if (createdResource !== undefined) {
          createdResources.set(fullUrl, createdResource);
        }
      });
    }
    return createdResources;
  }

  private groupRequestedFullUrls(bundle: SatusehatFhirTransactionBundle): Map<string, string[]> {
    const requestedFullUrls = new Map<string, string[]>();
    for (const requestEntry of bundle.entry) {
      const bucket = requestedFullUrls.get(requestEntry.request.url);
      if (bucket) {
        bucket.push(requestEntry.fullUrl);
      } else {
        requestedFullUrls.set(requestEntry.request.url, [requestEntry.fullUrl]);
      }
    }
    return requestedFullUrls;
  }

  /**
   * Reads the resource type and id out of one response entry. The platform
   * answers with an absolute `location`
   * (`https://…/fhir-r4/v1/Encounter/<id>/_history/<version>`) even though FHIR
   * also permits the relative `Encounter/<id>/_history/<version>` form, so the
   * path is walked by segment rather than matched against a fixed prefix. An
   * inline `resource` is the fallback for servers that echo the created body.
   */
  private parseCreatedResource(
    entry: SatusehatTransactionResponseEntry,
  ): SatusehatCreatedResourceLocation | null {
    const location = entry.response?.location;
    if (typeof location === 'string') {
      const parsed = this.parseResourceLocation(location);
      if (parsed !== null) {
        return parsed;
      }
    }
    const { resourceType, id } = entry.resource ?? {};
    if (typeof resourceType === 'string' && typeof id === 'string' && id !== '') {
      return { resourceType, id };
    }
    return null;
  }

  private parseResourceLocation(location: string): SatusehatCreatedResourceLocation | null {
    const path = location.split(/[?#]/)[0] ?? '';
    const segments = path.split('/').filter((segment) => segment !== '');
    const historyIndex = segments.lastIndexOf(HISTORY_SEGMENT);
    const idIndex = historyIndex > 0 ? historyIndex - 1 : segments.length - 1;
    const resourceType = segments[idIndex - 1];
    const id = segments[idIndex];
    if (resourceType === undefined || !FHIR_RESOURCE_TYPE_PATTERN.test(resourceType)) {
      return null;
    }
    return id === undefined || id === '' ? null : { resourceType, id };
  }

  private async recordFailure(
    submission: SatusehatSubmissionRecord,
    attemptNumber: number,
    caughtError: unknown,
  ): Promise<void> {
    if (caughtError instanceof SatusehatAmbiguousMatchError) {
      await this.parkAmbiguousMatch(submission, caughtError);
      return;
    }
    const message = this.describeError(caughtError);
    const isPermanent =
      caughtError instanceof SatusehatSubmissionDataError ||
      (caughtError instanceof SatusehatError && PERMANENT_ERROR_CODES.includes(caughtError.code));
    if (isPermanent || attemptNumber >= this.satusehatConfig.submissionMaxAttempts) {
      await this.submissionRepository.markFailed({
        id: submission.id,
        attempts: attemptNumber,
        lastError: message,
      });
      this.logger.warn(
        `SATUSEHAT submission failed permanently after attempt ${attemptNumber}`,
      );
      return;
    }
    const delayMs = this.satusehatConfig.submissionRetryBaseDelayMs * 2 ** (attemptNumber - 1);
    await this.submissionRepository.scheduleRetry({
      id: submission.id,
      attempts: attemptNumber,
      nextAttemptAt: new Date(Date.now() + delayMs),
      lastError: message,
    });
    this.logger.warn(
      `SATUSEHAT submission attempt ${attemptNumber} failed transiently`,
    );
  }

  /**
   * Ambiguity is not a failed attempt — it is a refusal. Retrying cannot
   * resolve which of the matching national records is the right one, and the
   * platform masks NIK so the code can never re-verify; a human has to settle
   * it in the SATUSEHAT portal. The row is parked FAILED for the admin retry
   * surface with the attempt budget untouched, so once the ambiguity is
   * resolved upstream the operator still has every retry available.
   */
  private async parkAmbiguousMatch(
    submission: SatusehatSubmissionRecord,
    ambiguousMatchError: SatusehatAmbiguousMatchError,
  ): Promise<void> {
    await this.submissionRepository.markFailed({
      id: submission.id,
      attempts: submission.attempts,
      lastError: this.describeError(ambiguousMatchError),
    });
    await this.auditService.record({
      action: 'SATUSEHAT_LINK_AMBIGUOUS',
      resource: 'SatusehatSubmission',
      resourceId: submission.id,
      actorUserId: null,
      metadata: {
        lookup: 'NIK',
        trigger: 'SUBMISSION_WORKER',
        matchCount: ambiguousMatchError.matchCount,
      },
    });
    this.logger.warn('SATUSEHAT submission refused: the NIK matched more than one record');
  }

  /**
   * The message, truncated, stored on the outbox row (P18-T16): what fails
   * here is a national gateway's verdict on a FHIR bundle, and the
   * OperationOutcome text is the only thing an operator can act on. The row
   * is read under `satusehat.submission.read`, never printed to the log.
   */
  private describeError(caughtError: unknown): string {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    return message.slice(0, MAX_STORED_ERROR_LENGTH);
  }
}
