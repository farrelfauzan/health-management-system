import {
  CreateLabPanelInput,
  CreateLabTestInput,
  LabPanelView,
  LabTestView,
  ListLabPanelsQuery,
  ListLabTestsQuery,
  ReplaceLabReferenceRangesInput,
  UpdateLabPanelInput,
  UpdateLabTestInput,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { LabCatalogRepository } from '../repository/lab-catalog.repository';
import { LabCatalogMapper } from './lab-catalog.mapper';

/**
 * The laboratory catalog: what the clinic can test for, what each result means
 * and which tests are sold together.
 *
 * Master data only — nothing here knows about orders. Everything downstream
 * (ordering, specimens, results, the report, billing, the SATUSEHAT lab chain)
 * reads from it, which is why it ships first and alone.
 */
@Injectable()
export class LabCatalogService {
  constructor(
    private readonly labCatalogRepository: LabCatalogRepository,
    private readonly labCatalogMapper: LabCatalogMapper,
  ) {}

  async listLabTests(query: ListLabTestsQuery): Promise<LabTestView[]> {
    const records = await this.labCatalogRepository.listLabTests(query);
    return records.map((record) => this.labCatalogMapper.toLabTestView(record));
  }

  async createLabTest(payload: CreateLabTestInput): Promise<LabTestView> {
    await this.assertLabTestCodeIsFree(payload.code);
    const created = await this.labCatalogRepository.createLabTest({
      code: payload.code,
      name: payload.name,
      loincCode: payload.loincCode ?? null,
      loincDisplay: payload.loincDisplay ?? null,
      specimenType: payload.specimenType,
      resultType: payload.resultType,
      unit: payload.unit ?? null,
      decimals: payload.decimals ?? 0,
      codedOptions: payload.codedOptions ?? [],
      isActive: payload.isActive ?? true,
      serviceTariffId: payload.serviceTariffId ?? null,
    });
    return this.labCatalogMapper.toLabTestView(created);
  }

  async updateLabTest(id: string, payload: UpdateLabTestInput): Promise<LabTestView> {
    const existing = await this.labCatalogRepository.findLabTestById(id);
    if (!existing) {
      throw new NotFoundException('Lab test not found');
    }
    if (payload.code && payload.code !== existing.code) {
      await this.assertLabTestCodeIsFree(payload.code);
    }
    const updated = await this.labCatalogRepository.updateLabTest({ id, ...payload });
    return this.labCatalogMapper.toLabTestView(updated);
  }

  async replaceReferenceRanges(
    id: string,
    payload: ReplaceLabReferenceRangesInput,
  ): Promise<LabTestView> {
    const existing = await this.labCatalogRepository.findLabTestById(id);
    if (!existing) {
      throw new NotFoundException('Lab test not found');
    }
    const updated = await this.labCatalogRepository.replaceReferenceRanges({
      labTestId: id,
      ranges: payload.ranges,
    });
    return this.labCatalogMapper.toLabTestView(updated);
  }

  async listLabPanels(query: ListLabPanelsQuery): Promise<LabPanelView[]> {
    const records = await this.labCatalogRepository.listLabPanels(query);
    return records.map((record) => this.labCatalogMapper.toLabPanelView(record));
  }

  async createLabPanel(payload: CreateLabPanelInput): Promise<LabPanelView> {
    await this.assertLabPanelCodeIsFree(payload.code);
    await this.assertMembersExist(payload.labTestIds);
    const created = await this.labCatalogRepository.createLabPanel({
      code: payload.code,
      name: payload.name,
      isActive: payload.isActive ?? true,
      serviceTariffId: payload.serviceTariffId ?? null,
      labTestIds: payload.labTestIds,
    });
    return this.labCatalogMapper.toLabPanelView(created);
  }

  async updateLabPanel(id: string, payload: UpdateLabPanelInput): Promise<LabPanelView> {
    const existing = await this.labCatalogRepository.findLabPanelById(id);
    if (!existing) {
      throw new NotFoundException('Lab panel not found');
    }
    if (payload.code && payload.code !== existing.code) {
      await this.assertLabPanelCodeIsFree(payload.code);
    }
    if (payload.labTestIds) {
      await this.assertMembersExist(payload.labTestIds);
    }
    const updated = await this.labCatalogRepository.updateLabPanel({ id, ...payload });
    return this.labCatalogMapper.toLabPanelView(updated);
  }

  /**
   * Codes are what the clinic writes on its own forms and what every later
   * ticket joins on, so a duplicate is refused with a readable 409 rather than
   * left to surface as a unique-violation 500.
   */
  private async assertLabTestCodeIsFree(code: string): Promise<void> {
    const existing = await this.labCatalogRepository.findLabTestByCode(code);
    if (existing) {
      throw new ConflictException(`A lab test with code ${code} already exists`);
    }
  }

  private async assertLabPanelCodeIsFree(code: string): Promise<void> {
    const existing = await this.labCatalogRepository.findLabPanelByCode(code);
    if (existing) {
      throw new ConflictException(`A lab panel with code ${code} already exists`);
    }
  }

  /**
   * A panel naming a test that does not exist would be a panel nobody can
   * order. Counted rather than fetched: the answer is "are they all there",
   * and duplicates in the request are caught by the same comparison.
   */
  private async assertMembersExist(labTestIds: readonly string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(labTestIds));
    if (uniqueIds.length !== labTestIds.length) {
      throw new ConflictException('A panel cannot list the same test twice');
    }
    const foundCount = await this.labCatalogRepository.countActiveLabTests(uniqueIds);
    if (foundCount !== uniqueIds.length) {
      throw new NotFoundException('One or more lab tests in this panel do not exist');
    }
  }
}
