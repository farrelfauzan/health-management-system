import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { ClinicalRequestDocumentRepository } from './repository/clinical-request-document.repository';
import { ClinicalRequestDocumentService } from './service/clinical-request-document.service';

/**
 * The paper a patient carries out of the consulting room (`P18-T12`): the surat
 * pengantar laboratorium and the resep.
 *
 * Its own module rather than a service in each of laboratory and pharmacy-flow,
 * because both print the same letterhead through the same renderer into the
 * same document store — two copies would drift, and the second one would be the
 * one nobody updated.
 *
 * It imports nothing from either caller. The laboratory and pharmacy modules
 * gather their own context and hand it over, so the dependency runs one way and
 * this module never forms an opinion about what was ordered.
 */
@Module({
  imports: [DocumentTemplateModule, PdfModule, StorageModule],
  providers: [ClinicalRequestDocumentRepository, ClinicalRequestDocumentService],
  exports: [ClinicalRequestDocumentService],
})
export class ClinicalRequestDocumentModule {}
