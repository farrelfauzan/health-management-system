import { Module } from '@nestjs/common';

import { LabPanelController } from './controller/lab-panel.controller';
import { LabTestController } from './controller/lab-test.controller';
import { LabCatalogRepository } from './repository/lab-catalog.repository';
import { LabCatalogMapper } from './service/lab-catalog.mapper';
import { LabCatalogService } from './service/lab-catalog.service';

/**
 * The laboratory module (`P18-T01`). Master data only for now — ordering,
 * specimens, results and the lab report join it in P18-T02 onward, which is
 * why the module exists as a shell around a catalog rather than the catalog
 * living in billing next to its tariffs.
 */
@Module({
  controllers: [LabTestController, LabPanelController],
  providers: [LabCatalogRepository, LabCatalogMapper, LabCatalogService],
  exports: [LabCatalogService],
})
export class LaboratoryModule {}
