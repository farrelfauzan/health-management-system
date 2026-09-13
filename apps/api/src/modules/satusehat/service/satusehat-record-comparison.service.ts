import {
  SatusehatHeldReadBack,
  SatusehatHeldResource,
  SatusehatLabReportItem,
  SatusehatRecordComparisonView,
  SatusehatSubmissionBundleData,
  SatusehatSubmissionMedication,
  SatusehatSubmissionResourceRecord,
} from '@hms/shared-types';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { DoctorOwnProfileService } from '../../doctor-management/service/doctor-own-profile.service';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { compareSatusehatRecord } from './compare-satusehat-record';

/** Same polite cap as the admin check (P21-T03), for the same shared platform. */
const READ_BACK_CONCURRENCY = 8;

/** HTTP status the platform answers for an id it does not hold (P21-T01). */
const NOT_FOUND_STATUS = 404;

/**
 * Only the resource types the comparison has a line for. Reading an Encounter
 * or a Composition back would cost a request and change no verdict.
 */
const COMPARED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'Condition',
  'Observation',
  'Procedure',
  'Medication',
]);

/** Marks a sent resource the read-back could not answer for. */
const UNREADABLE = 'UNREADABLE';

/**
 * "Does SATUSEHAT hold what I recorded?" for the doctor who treated the patient
 * (P21-T04).
 *
 * Unlike the admin monitor (P21-T03) this shows **content** — codes, names and
 * values on both sides — because under D-033 the treating clinician is exactly
 * who may see it. That is also why the gate is narrower than `encounter.read`:
 * the route needs `satusehat.record.read`, which only DOCTOR holds and only at
 * OWN scope, and ownership is the encounter's attending doctor, resolved from
 * the caller rather than from anything in the request. A covering doctor who
 * may read the encounter still may not run this.
 *
 * Reads go back by stored id only, never by searching the platform: a search
 * could return another clinic's resources for the same patient.
 */
@Injectable()
export class SatusehatRecordComparisonService {
  private readonly logger = new Logger(SatusehatRecordComparisonService.name);

  constructor(
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly httpClient: SatusehatHttpClient,
    private readonly doctorOwnProfileService: DoctorOwnProfileService,
    private readonly auditContextService: AuditContextService,
  ) {}

  async compareEncounterRecord(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<SatusehatRecordComparisonView> {
    const bundle = await this.findTreatedEncounterOrThrow(encounterId, currentUser);
    const submission = await this.submissionRepository.findEncounterSubmission(encounterId);
    const isSubmitted = submission?.status === 'SUBMITTED';
    const encounterRecords =
      submission !== null && isSubmitted
        ? await this.submissionRepository.findSubmissionResources(submission.id)
        : [];
    const labRecords = await this.collectLabReportRecords(encounterId);
    const readBack = await this.readBackHeld([...labRecords, ...encounterRecords]);
    return {
      encounterId,
      submissionId: submission?.id ?? null,
      isSubmitted,
      hasResourceList: encounterRecords.length > 0,
      checkedAt: new Date().toISOString(),
      lines: compareSatusehatRecord({
        diagnoses: bundle.diagnoses,
        latestVitalSigns: bundle.latestVitalSigns,
        procedures: bundle.procedures,
        medications: this.collectMedications(bundle),
        labItems: await this.collectLabItems(encounterId),
        held: readBack.held,
      }),
      unreadableResourceCount: readBack.unreadableResourceCount,
    };
  }

  /**
   * The items of every lab order raised in the visit, read the way the lab
   * chain is submitted (P18-T09), so both sides describe the same value. A
   * clinic without the laboratory feature has no orders and gets no lines.
   */
  private async collectLabItems(encounterId: string): Promise<SatusehatLabReportItem[]> {
    const labOrderIds = await this.submissionRepository.findEncounterLabOrderIds(encounterId);
    const bundles = await Promise.all(
      labOrderIds.map((labOrderId) =>
        this.submissionRepository.findLabReportBundleData(labOrderId),
      ),
    );
    return bundles.flatMap((labBundle) => (labBundle === null ? [] : [...labBundle.items]));
  }

  /**
   * What the visit's lab reports sent, newest report first — the comparison
   * keeps the first value it reads for a code, so an amendment must be read
   * ahead of the report it corrects. Placed ahead of the encounter's own
   * resources for the same reason.
   */
  private async collectLabReportRecords(
    encounterId: string,
  ): Promise<SatusehatSubmissionResourceRecord[]> {
    const submissionIds =
      await this.submissionRepository.findSubmittedLabReportSubmissionIds(encounterId);
    const perSubmission = await Promise.all(
      submissionIds.map((submissionId) =>
        this.submissionRepository.findSubmissionResources(submissionId),
      ),
    );
    return perSubmission.flat();
  }

  /**
   * The patient is stamped on the audit context as soon as the record is
   * known, the way `EncounterAccessService` does: the route names only the
   * encounter, and the audit row must name the patient whose record was read.
   */
  private async findTreatedEncounterOrThrow(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<SatusehatSubmissionBundleData> {
    const bundle = await this.submissionRepository.findBundleData(encounterId);
    if (bundle === null) {
      throw new NotFoundException('Encounter not found');
    }
    this.auditContextService.setPatientId(bundle.patientId);
    const ownDoctorId = await this.doctorOwnProfileService.resolveOwnDoctorProfileId(
      currentUser.sub,
    );
    if (bundle.doctorId !== ownDoctorId) {
      throw new ForbiddenException(
        'Only the doctor who treated this patient may compare the record with SATUSEHAT',
      );
    }
    return bundle;
  }

  /**
   * Plain prescription lines only. A compound is sent as one `Medication`
   * describing its ingredients (P10-T18), with no single KFA code to line up
   * against a local item, so it has no line here.
   */
  private collectMedications(
    bundle: SatusehatSubmissionBundleData,
  ): SatusehatSubmissionMedication[] {
    return bundle.prescriptions.flatMap((prescription) =>
      prescription.items.flatMap((item) => (item.medication === null ? [] : [item.medication])),
    );
  }

  /** Reads every compared resource back in fixed-size waves. */
  private async readBackHeld(
    records: readonly SatusehatSubmissionResourceRecord[],
  ): Promise<SatusehatHeldReadBack> {
    const compared = records.filter(
      (record) => record.outcome === 'SENT' && COMPARED_RESOURCE_TYPES.has(record.resourceType),
    );
    const readBack: SatusehatHeldReadBack = { held: [], unreadableResourceCount: 0 };
    for (let index = 0; index < compared.length; index += READ_BACK_CONCURRENCY) {
      const wave = compared.slice(index, index + READ_BACK_CONCURRENCY);
      const settled = await Promise.all(wave.map((record) => this.readHeldResource(record)));
      for (const outcome of settled) {
        if (outcome === UNREADABLE) {
          readBack.unreadableResourceCount += 1;
        } else if (outcome !== null) {
          readBack.held.push(outcome);
        }
      }
    }
    return readBack;
  }

  /**
   * `null` when the platform does not hold the resource — a real finding.
   * {@link UNREADABLE} when we could not ask: a failed read, or a resource sent
   * without a paired id. The two mean opposite things to a doctor deciding
   * whether the record reached SATUSEHAT.
   */
  private async readHeldResource(
    record: SatusehatSubmissionResourceRecord,
  ): Promise<SatusehatHeldResource | null | typeof UNREADABLE> {
    if (record.satusehatId === null) {
      return UNREADABLE;
    }
    try {
      const resource = await this.httpClient.sendRequest<unknown>({
        method: 'GET',
        path: `/${record.resourceType}/${record.satusehatId}`,
      });
      return typeof resource === 'object' && resource !== null
        ? (resource as SatusehatHeldResource)
        : UNREADABLE;
    } catch (caughtError) {
      if (
        caughtError instanceof SatusehatError &&
        caughtError.upstreamStatusCode === NOT_FOUND_STATUS
      ) {
        return null;
      }
      this.logger.warn(
        `SATUSEHAT record read-back failed for ${record.resourceType}: ${
          caughtError instanceof SatusehatError ? caughtError.code : 'unknown error'
        }`,
      );
      return UNREADABLE;
    }
  }
}
