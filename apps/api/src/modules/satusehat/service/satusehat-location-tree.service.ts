import {
  SatusehatLocationNode,
  SatusehatLocationSourceRecords,
  SatusehatLocationTreeEntry,
  SatusehatLocationTreeView,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveSatusehatRootLocationId } from '../../../common/satusehat/resolve-satusehat-root-location-id';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { SatusehatLocationRepository } from '../repository/satusehat-location.repository';
import { buildSatusehatLocationTree } from './build-satusehat-location-tree';
import { findSatusehatLocationEntryBlocker } from './find-satusehat-location-entry-blocker';

/**
 * The "Lokasi SATUSEHAT" panel's read (P24-T06): every registrable row, parents
 * first, with REGISTERED / UNREGISTERED / BLOCKED and the reason a row waits.
 */
@Injectable()
export class SatusehatLocationTreeService {
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    private readonly satusehatLocationRepository: SatusehatLocationRepository,
    configService: ConfigService,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  async getTree(): Promise<SatusehatLocationTreeView> {
    const sources = await this.satusehatLocationRepository.findLocationSources();
    const entries = this.buildEntries(sources);
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    return { nodes: entries.map((entry) => this.toNode(entry, entriesById, sources)) };
  }

  /**
   * The flat tree, with the site's id resolved as FR-LOC-02 does: the stored
   * root, else the deployment's `SATUSEHAT_LOCATION_ID`. A clinic that only
   * ever set the env value therefore sees its site as registered, and its
   * polis and wards register under the Location it already has.
   */
  buildEntries(sources: SatusehatLocationSourceRecords): SatusehatLocationTreeEntry[] {
    const rootLocationId = resolveSatusehatRootLocationId({
      registeredRootLocationId: sources.clinic?.satusehatLocationId ?? null,
      configuredLocationId: this.satusehatConfig.locationId,
    });
    return buildSatusehatLocationTree(sources, rootLocationId);
  }

  private toNode(
    entry: SatusehatLocationTreeEntry,
    entriesById: Map<string, SatusehatLocationTreeEntry>,
    sources: SatusehatLocationSourceRecords,
  ): SatusehatLocationNode {
    const parentEntry = entry.parentId === null ? undefined : entriesById.get(entry.parentId);
    const blocker =
      entry.satusehatLocationId !== null
        ? null
        : findSatusehatLocationEntryBlocker({
            entry,
            clinicLatitude: sources.clinic?.latitude ?? null,
            clinicLongitude: sources.clinic?.longitude ?? null,
            parent:
              parentEntry === undefined
                ? null
                : { name: parentEntry.name, satusehatLocationId: parentEntry.satusehatLocationId },
          });
    return {
      kind: entry.kind,
      id: entry.id,
      parentId: entry.parentId,
      depth: entry.depth,
      name: entry.name,
      code: entry.code,
      isActive: entry.isActive,
      satusehatLocationId: entry.satusehatLocationId,
      status:
        entry.satusehatLocationId !== null ? 'REGISTERED' : blocker === null ? 'UNREGISTERED' : 'BLOCKED',
      blockReason: blocker?.reason ?? null,
      blockMessage: blocker?.message ?? null,
    };
  }
}
