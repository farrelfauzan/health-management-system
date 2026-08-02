import { Module } from '@nestjs/common';

import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentAdminController } from './controller/document-admin.controller';
import { DocumentRepository } from './repository/document.repository';
import { DocumentService } from './service/document.service';

/**
 * The shared document store (P15-T10). One module holds the clinic FAQ/SOP
 * corpus, the Phase 15 retrieval corpora, personal knowledge bases, and the
 * future patient/doctor document features — one ingestion pipeline, one
 * embedding space, one S3 layout (customer-service strategy D-CS-06).
 *
 * The first slice landed the schema and its grants. This one adds the admin
 * API over the **clinic corpus** and makes this module the first consumer of
 * `ObjectStorageService`: uploads are signed and go browser-direct, and the
 * API only ever reads an object's metadata to confirm one. The Ollama
 * ingestion pipeline (extract → chunk → embed) and the owner-scoped personal
 * routes (`P15-T20`) are the remaining slices; the repository already takes
 * `ownerType`/`ownerId` as required arguments so neither is a widening of a
 * query written here.
 *
 * `AuthModule` is imported for `AuthRepository`: the global guard proves the
 * actor may act on *some* document, and only a scope check in the service can
 * tell an admin's `ANY` grant from a doctor's `OWN` one.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DocumentAdminController],
  providers: [DocumentRepository, DocumentService],
  exports: [DocumentRepository, DocumentService],
})
export class DocumentManagementModule {}
