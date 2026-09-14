import {
  resolveSatusehatServiceClassCode,
  SatusehatLocationEntryRegistration,
  SatusehatLocationKindValue,
  SatusehatLocationPushInput,
  SatusehatLocationRegistrationContext,
  SatusehatLocationRegistrationOutcomeValue,
  SatusehatLocationRegistrationOutcomeView,
  SatusehatLocationRegistrationResultView,
  SatusehatLocationSourceRecords,
  SatusehatLocationTreeEntry,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSatusehatLocationResource } from '../../../common/satusehat/build-satusehat-location-resource';
import {
  SatusehatFhirLocation,
  SatusehatLocationResourceInput,
} from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatLocationClient } from '../../../common/satusehat/satusehat-location.client';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatConfig, SatusehatErrorCode } from '../../../common/satusehat/satusehat.types';
import { RegisterSatusehatLocationsDto } from '../dto/register-satusehat-locations.dto';
import { SatusehatLocationRepository } from '../repository/satusehat-location.repository';
import { findSatusehatLocationEntryBlocker } from './find-satusehat-location-entry-blocker';
import { SatusehatLocationTreeService } from './satusehat-location-tree.service';

const PHYSICAL_TYPE_BY_KIND: Readonly<
  Record<SatusehatLocationKindValue, SatusehatLocationResourceInput['physicalTypeCode']>
> = {
  SITE: 'si',
  SPECIALTY: 'ro',
  WARD: 'wa',
  ROOM: 'ro',
  BED: 'bd',
};
/**
 * Failures after which every further row would fail the same way, so the batch
 * stops instead of hammering the platform (NFR-05): the breaker is open, or the
 * deployment cannot authenticate at all.
 */
const BATCH_STOPPING_ERROR_CODES: readonly SatusehatErrorCode[] = [
  'SATUSEHAT_CIRCUIT_OPEN',
  'SATUSEHAT_NOT_CONFIGURED',
  'SATUSEHAT_UNAUTHORIZED',
];
const BAD_REQUEST_STATUS = 400;
/** "Found duplicate: Location (RuleNumber: 20002)" — a POST for an identifier SATUSEHAT holds (P24-T01). */
const DUPLICATE_REJECTION_PATTERN = /duplicate/i;
const AUDIT_RESOURCE = 'satusehat_location';

/**
 * Registers the clinic's Location tree on SATUSEHAT (P24-T06, FR-LOC-03..08).
 *
 * Rows run sequentially in tree order, so a parent is registered before any
 * child names it in `partOf`, and a parent registered earlier in the batch
 * unblocks its children within the same request. Before every POST an
 * identifier search looks for the row's UUID, so a retried registration adopts
 * the Location a timed-out POST already created (FR-LOC-07); a POST that still
 * meets the platform's duplicate rule adopts through the same search. A target
 * that is already registered is pushed again as a PUT, which is how a rename or
 * a deactivation reaches SATUSEHAT (FR-LOC-08) — nothing is ever deleted.
 */
@Injectable()
export class SatusehatLocationRegistrationService {
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    private readonly satusehatLocationRepository: SatusehatLocationRepository,
    private readonly satusehatLocationTreeService: SatusehatLocationTreeService,
    private readonly satusehatLocationClient: SatusehatLocationClient,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  async registerLocations(
    payload: RegisterSatusehatLocationsDto,
    currentUser: CurrentUser,
  ): Promise<SatusehatLocationRegistrationResultView> {
    const sources = await this.satusehatLocationRepository.findLocationSources();
    const entries = this.satusehatLocationTreeService.buildEntries(sources);
    const targets = this.selectTargets(entries, payload);
    const context = this.buildContext(sources, entries, currentUser);
    const outcomes: SatusehatLocationRegistrationOutcomeView[] = [];
    let stopMessage: string | null =
      context.organizationId === ''
        ? 'SATUSEHAT_ORGANIZATION_ID is not configured for this deployment'
        : null;
    let processedCount = 0;
    for (const entry of targets) {
      if (stopMessage !== null) {
        outcomes.push(this.toOutcome(entry, 'SKIPPED', null, stopMessage));
        continue;
      }
      // Sequential on purpose: order is what makes `partOf` valid (FR-LOC-07).
       
      const registration = await this.registerEntry(entry, context);
      outcomes.push(registration.view);
      if (registration.shouldStopBatch) {
        stopMessage = registration.view.message;
      } else {
        processedCount += 1;
      }
    }
    return { outcomes, processedCount, stoppedEarly: stopMessage !== null };
  }

  /**
   * `all` means every row not yet registered; named targets keep tree order
   * whatever order they were sent in. An unknown target is a 404 rather than a
   * silent no-op, so a stale panel cannot report success for a removed row.
   */
  private selectTargets(
    entries: SatusehatLocationTreeEntry[],
    payload: RegisterSatusehatLocationsDto,
  ): SatusehatLocationTreeEntry[] {
    if (payload.all === true) {
      return entries.filter((entry) => entry.satusehatLocationId === null);
    }
    const requestedKeys = new Set((payload.targets ?? []).map((target) => `${target.kind}:${target.id}`));
    const selected = entries.filter((entry) => requestedKeys.has(`${entry.kind}:${entry.id}`));
    if (selected.length !== requestedKeys.size) {
      throw new NotFoundException('One or more locations were not found');
    }
    return selected;
  }

  private buildContext(
    sources: SatusehatLocationSourceRecords,
    entries: SatusehatLocationTreeEntry[],
    currentUser: CurrentUser,
  ): SatusehatLocationRegistrationContext {
    return {
      organizationId: this.satusehatConfig.organizationId ?? '',
      clinicLatitude: sources.clinic?.latitude ?? null,
      clinicLongitude: sources.clinic?.longitude ?? null,
      registeredClinicLocationId: sources.clinic?.satusehatLocationId ?? null,
      locationIds: new Map(entries.map((entry) => [entry.id, entry.satusehatLocationId])),
      entriesById: new Map(entries.map((entry) => [entry.id, entry])),
      actorUserId: currentUser.sub,
    };
  }

  private async registerEntry(
    entry: SatusehatLocationTreeEntry,
    context: SatusehatLocationRegistrationContext,
  ): Promise<SatusehatLocationEntryRegistration> {
    const currentId = context.locationIds.get(entry.id) ?? null;
    const parentEntry = entry.parentId === null ? undefined : context.entriesById.get(entry.parentId);
    const parent =
      parentEntry === undefined
        ? null
        : { name: parentEntry.name, satusehatLocationId: context.locationIds.get(parentEntry.id) ?? null };
    const blocker =
      currentId !== null
        ? null
        : findSatusehatLocationEntryBlocker({
            entry,
            clinicLatitude: context.clinicLatitude,
            clinicLongitude: context.clinicLongitude,
            parent,
          });
    if (blocker !== null) {
      return { view: this.toOutcome(entry, 'BLOCKED', null, blocker.message), shouldStopBatch: false };
    }
    try {
      return { view: await this.pushEntry({ entry, context, currentId, parent }), shouldStopBatch: false };
    } catch (caughtError) {
      if (!(caughtError instanceof SatusehatError)) {
        throw caughtError;
      }
      const shouldStopBatch = BATCH_STOPPING_ERROR_CODES.includes(caughtError.code);
      return {
        view: this.toOutcome(entry, shouldStopBatch ? 'SKIPPED' : 'FAILED', currentId, caughtError.message),
        shouldStopBatch,
      };
    }
  }

  private async pushEntry(input: SatusehatLocationPushInput): Promise<SatusehatLocationRegistrationOutcomeView> {
    const { entry, context, currentId } = input;
    // The site's id came from `SATUSEHAT_LOCATION_ID`: SATUSEHAT already holds
    // it, so it is stored, not re-sent — renaming a Location registered outside
    // this panel is not ours to do.
    if (entry.kind === 'SITE' && currentId !== null && context.registeredClinicLocationId === null) {
      return this.recordRegistration(input, currentId, 'ADOPTED');
    }
    const resource = this.buildResource(input);
    if (currentId !== null) {
      await this.satusehatLocationClient.updateLocation(currentId, resource);
      await this.recordAudit(input, currentId, 'SATUSEHAT_LOCATION_UPDATED');
      return this.toOutcome(entry, 'UPDATED', currentId, null);
    }
    const existingId = await this.satusehatLocationClient.findLocationIdByIdentifier(
      context.organizationId,
      entry.id,
    );
    if (existingId !== null) {
      return this.recordRegistration(input, existingId, 'ADOPTED');
    }
    const created = await this.createLocationOrAdoptDuplicate(input, resource);
    return this.recordRegistration(input, created.satusehatLocationId, created.outcome);
  }

  private async createLocationOrAdoptDuplicate(
    input: SatusehatLocationPushInput,
    resource: SatusehatFhirLocation,
  ): Promise<{ satusehatLocationId: string; outcome: SatusehatLocationRegistrationOutcomeValue }> {
    try {
      return {
        satusehatLocationId: await this.satusehatLocationClient.createLocation(resource),
        outcome: 'CREATED',
      };
    } catch (caughtError) {
      if (!this.isDuplicateRejection(caughtError)) {
        throw caughtError;
      }
      const adoptedId = await this.satusehatLocationClient.findLocationIdByIdentifier(
        input.context.organizationId,
        input.entry.id,
      );
      if (adoptedId === null) {
        throw caughtError;
      }
      return { satusehatLocationId: adoptedId, outcome: 'ADOPTED' };
    }
  }

  private isDuplicateRejection(caughtError: unknown): boolean {
    return (
      caughtError instanceof SatusehatError &&
      caughtError.code === 'SATUSEHAT_REQUEST_REJECTED' &&
      caughtError.upstreamStatusCode === BAD_REQUEST_STATUS &&
      DUPLICATE_REJECTION_PATTERN.test(caughtError.message)
    );
  }

  private buildResource(input: SatusehatLocationPushInput): SatusehatFhirLocation {
    const { entry, context, currentId, parent } = input;
    return buildSatusehatLocationResource({
      organizationId: context.organizationId,
      localId: entry.id,
      satusehatLocationId: currentId,
      physicalTypeCode: PHYSICAL_TYPE_BY_KIND[entry.kind],
      name: entry.name,
      isActive: entry.isActive,
      latitude: context.clinicLatitude,
      longitude: context.clinicLongitude,
      parent:
        entry.kind === 'SITE' || parent === null || parent.satusehatLocationId === null
          ? null
          : { satusehatLocationId: parent.satusehatLocationId, name: parent.name },
      serviceClassCode: resolveSatusehatServiceClassCode(entry.roomClass?.satusehatServiceClass ?? null),
    });
  }

  private async recordRegistration(
    input: SatusehatLocationPushInput,
    satusehatLocationId: string,
    outcome: SatusehatLocationRegistrationOutcomeValue,
  ): Promise<SatusehatLocationRegistrationOutcomeView> {
    await this.satusehatLocationRepository.saveLocationId({
      kind: input.entry.kind,
      id: input.entry.id,
      satusehatLocationId,
    });
    input.context.locationIds.set(input.entry.id, satusehatLocationId);
    await this.recordAudit(input, satusehatLocationId, 'SATUSEHAT_LOCATION_REGISTERED');
    return this.toOutcome(input.entry, outcome, satusehatLocationId, null);
  }

  private async recordAudit(
    input: SatusehatLocationPushInput,
    satusehatLocationId: string,
    action: 'SATUSEHAT_LOCATION_REGISTERED' | 'SATUSEHAT_LOCATION_UPDATED',
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: AUDIT_RESOURCE,
      resourceId: input.entry.id,
      actorUserId: input.context.actorUserId,
      metadata: { kind: input.entry.kind, satusehatLocationId, isActive: input.entry.isActive },
    });
  }

  private toOutcome(
    entry: SatusehatLocationTreeEntry,
    outcome: SatusehatLocationRegistrationOutcomeValue,
    satusehatLocationId: string | null,
    message: string | null,
  ): SatusehatLocationRegistrationOutcomeView {
    return { kind: entry.kind, id: entry.id, name: entry.name, outcome, satusehatLocationId, message };
  }
}
