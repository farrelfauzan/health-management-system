import { LabPanelRecord, LabTestRecord } from '@hms/shared-types';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { LabCatalogRepository } from '../repository/lab-catalog.repository';
import { LabCatalogMapper } from './lab-catalog.mapper';
import { LabCatalogService } from './lab-catalog.service';

const labTestId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const labPanelId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const timestamp = new Date('2026-07-20T08:00:00.000Z');

function buildLabTestRecord(overrides: Partial<LabTestRecord> = {}): LabTestRecord {
  return {
    id: labTestId,
    code: 'HB',
    name: 'Hemoglobin',
    loincCode: '718-7',
    loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
    specimenType: 'WHOLE_BLOOD',
    resultType: 'NUMERIC',
    unit: 'g/dL',
    decimals: 1,
    codedOptions: [],
    isActive: true,
    serviceTariffId: null,
    price: null,
    referenceRanges: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function buildLabPanelRecord(overrides: Partial<LabPanelRecord> = {}): LabPanelRecord {
  return {
    id: labPanelId,
    code: 'DARAH-RUTIN',
    name: 'Darah Rutin',
    isActive: true,
    serviceTariffId: null,
    price: null,
    members: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('LabCatalogService', () => {
  const repositoryMock = {
    listLabTests: jest.fn(),
    findLabTestById: jest.fn(),
    findLabTestByCode: jest.fn(),
    createLabTest: jest.fn(),
    updateLabTest: jest.fn(),
    replaceReferenceRanges: jest.fn(),
    listLabPanels: jest.fn(),
    findLabPanelById: jest.fn(),
    findLabPanelByCode: jest.fn(),
    countActiveLabTests: jest.fn(),
    createLabPanel: jest.fn(),
    updateLabPanel: jest.fn(),
  };
  const service = new LabCatalogService(
    repositoryMock as unknown as LabCatalogRepository,
    new LabCatalogMapper(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lab tests', () => {
    it('defaults an unspecified test to active, priced by nothing, with no options', async () => {
      repositoryMock.findLabTestByCode.mockResolvedValue(null);
      repositoryMock.createLabTest.mockResolvedValue(buildLabTestRecord());

      await service.createLabTest({
        code: 'HB',
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        unit: 'g/dL',
      });

      expect(repositoryMock.createLabTest).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          decimals: 0,
          codedOptions: [],
          serviceTariffId: null,
          loincCode: null,
        }),
      );
    });

    it('refuses a duplicate code with 409 rather than a unique-violation 500', async () => {
      repositoryMock.findLabTestByCode.mockResolvedValue(buildLabTestRecord());

      await expect(
        service.createLabTest({
          code: 'HB',
          name: 'Hemoglobin lain',
          specimenType: 'SERUM',
          resultType: 'TEXT',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositoryMock.createLabTest).not.toHaveBeenCalled();
    });

    it('does not re-check the code when an update leaves it alone', async () => {
      repositoryMock.findLabTestById.mockResolvedValue(buildLabTestRecord());
      repositoryMock.updateLabTest.mockResolvedValue(buildLabTestRecord({ name: 'Hb' }));

      await service.updateLabTest(labTestId, { name: 'Hb' });

      expect(repositoryMock.findLabTestByCode).not.toHaveBeenCalled();
    });

    it('refuses an update that would take another test’s code', async () => {
      repositoryMock.findLabTestById.mockResolvedValue(buildLabTestRecord());
      repositoryMock.findLabTestByCode.mockResolvedValue(
        buildLabTestRecord({ id: 'other', code: 'GDS' }),
      );

      await expect(service.updateLabTest(labTestId, { code: 'GDS' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404s an unknown test rather than creating one', async () => {
      repositoryMock.findLabTestById.mockResolvedValue(null);

      await expect(service.updateLabTest(labTestId, { name: 'Hb' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('renders a range with no value at all as absent, not as zero', async () => {
      repositoryMock.listLabTests.mockResolvedValue([
        buildLabTestRecord({
          referenceRanges: [
            {
              id: 'range-1',
              sex: null,
              ageMinDays: null,
              ageMaxDays: null,
              low: null,
              high: null,
              criticalLow: null,
              criticalHigh: null,
              textNormal: 'Negatif',
            },
          ],
        }),
      ]);

      const [actualTest] = await service.listLabTests({});

      expect(actualTest?.referenceRanges[0]).toEqual({ id: 'range-1', textNormal: 'Negatif' });
    });
  });

  describe('lab panels', () => {
    it('creates a panel whose members all exist', async () => {
      repositoryMock.findLabPanelByCode.mockResolvedValue(null);
      repositoryMock.countActiveLabTests.mockResolvedValue(2);
      repositoryMock.createLabPanel.mockResolvedValue(buildLabPanelRecord());

      await service.createLabPanel({
        code: 'DARAH-RUTIN',
        name: 'Darah Rutin',
        labTestIds: [labTestId, 'cccccccc-3333-4333-8333-cccccccccccc'],
      });

      expect(repositoryMock.createLabPanel).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true, serviceTariffId: null }),
      );
    });

    it('refuses a panel naming a test that does not exist', async () => {
      repositoryMock.findLabPanelByCode.mockResolvedValue(null);
      repositoryMock.countActiveLabTests.mockResolvedValue(1);

      await expect(
        service.createLabPanel({
          code: 'DARAH-RUTIN',
          name: 'Darah Rutin',
          labTestIds: [labTestId, 'cccccccc-3333-4333-8333-cccccccccccc'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.createLabPanel).not.toHaveBeenCalled();
    });

    it('refuses a panel that lists the same test twice — the report would print it twice', async () => {
      repositoryMock.findLabPanelByCode.mockResolvedValue(null);

      await expect(
        service.createLabPanel({
          code: 'DARAH-RUTIN',
          name: 'Darah Rutin',
          labTestIds: [labTestId, labTestId],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositoryMock.countActiveLabTests).not.toHaveBeenCalled();
    });

    it('does not re-validate membership when an update leaves the members alone', async () => {
      repositoryMock.findLabPanelById.mockResolvedValue(buildLabPanelRecord());
      repositoryMock.updateLabPanel.mockResolvedValue(buildLabPanelRecord({ name: 'CBC' }));

      await service.updateLabPanel(labPanelId, { name: 'CBC' });

      expect(repositoryMock.countActiveLabTests).not.toHaveBeenCalled();
    });
  });
});
