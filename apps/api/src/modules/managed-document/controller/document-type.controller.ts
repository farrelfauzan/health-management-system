import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_TYPE_EXAMPLES } from '../../../common/openapi/document-type-examples';
import { CreateDocumentTypeDto } from '../dto/create-document-type.dto';
import { ListDocumentTypesQueryDto } from '../dto/list-document-types-query.dto';
import { SetDocumentTypeDefaultApproversDto } from '../dto/set-document-type-default-approvers.dto';
import { UpdateDocumentTypeDto } from '../dto/update-document-type.dto';
import { DocumentTypeService } from '../service/document-type.service';

const CREATED_STATUS = 201;

/**
 * Document types as master data (`P16-T39`, §7.5.8).
 *
 * Reading the list needs the registry's read key — the new-document picker
 * and the settings screen are the same list — while every write needs
 * `document-type.write:any`, a back-office grant beside the template pair.
 * Neither is a clinical act, and no role is seeded for either (OQ-1).
 */
@ApiTags('Document Types')
@Controller({
  version: '1',
  path: 'document-types',
})
export class DocumentTypeController {
  constructor(private readonly documentTypeService: DocumentTypeService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'List document types',
    responseDescription:
      'Every live type in the clinic’s order, each with its usage count and default approvers (FR-E5-39). Deactivated types are omitted unless `includeInactive=true` — the settings screen asks for them, the new-document picker never does (FR-E5-36).',
    responseExample: {
      data: [DOCUMENT_TYPE_EXAMPLES.systemView, DOCUMENT_TYPE_EXAMPLES.clinicView],
    },
  })
  async listTypes(@Query() query: ListDocumentTypesQueryDto) {
    return { data: await this.documentTypeService.listTypes(query) };
  }

  @Post()
  @HttpCode(CREATED_STATUS)
  @Auth([{ action: 'write', subject: 'DocumentType' }])
  @ApiEndpoint({
    summary: 'Create a clinic document type',
    responseDescription:
      'The new type, with `behavior = GENERIC` set by the server and `code` generated from the name (a collision gets a numeric suffix). A payload carrying `behavior`, `code` or `isSystem` is refused as a validation error, never silently stripped (FR-E5-32).',
    responseExample: {
      data: DOCUMENT_TYPE_EXAMPLES.clinicView,
      message: 'Document type created',
    },
    requestType: CreateDocumentTypeDto,
    requestExample: DOCUMENT_TYPE_EXAMPLES.createRequest,
    successStatus: CREATED_STATUS,
  })
  async createType(@Body() payload: CreateDocumentTypeDto, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentTypeService.createType(payload, actor);
    return { data, message: 'Document type created' };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'DocumentType' }])
  @ApiEndpoint({
    summary: 'Update a document type',
    responseDescription:
      'The updated type. Name, description, approval policy, party flags, content mode, ordering and the active flag are editable on every row; `code` only on a clinic type (403 `DOCUMENT_TYPE_SYSTEM_ROW` on a seeded one, FR-E5-33) and only to an unused value (409 `DOCUMENT_TYPE_CODE_TAKEN`). Any approval-policy change is audited; enabling self-approval writes `SELF_APPROVAL_ENABLED` (NFR-AUD-03).',
    responseExample: {
      data: DOCUMENT_TYPE_EXAMPLES.systemView,
      message: 'Document type updated',
    },
    requestType: UpdateDocumentTypeDto,
    requestExample: DOCUMENT_TYPE_EXAMPLES.updateRequest,
    notFoundDescription: 'Document type not found.',
  })
  async updateType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDocumentTypeDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentTypeService.updateType(id, payload, actor);
    return { data, message: 'Document type updated' };
  }

  @Put(':id/default-approvers')
  @Auth([{ action: 'write', subject: 'DocumentType' }])
  @ApiEndpoint({
    summary: 'Replace the default approvers of a document type',
    responseDescription:
      'The type with its new default set. A default pre-fills the drafter’s picker and never routes anything (FR-E5-38). Every id must be an active staff account — a patient can never be named — and 422 `DOCUMENT_TYPE_APPROVER_INVALID` lists the ids that failed.',
    responseExample: {
      data: DOCUMENT_TYPE_EXAMPLES.systemView,
      message: 'Default approvers updated',
    },
    requestType: SetDocumentTypeDefaultApproversDto,
    requestExample: DOCUMENT_TYPE_EXAMPLES.setDefaultApproversRequest,
    notFoundDescription: 'Document type not found.',
  })
  async setDefaultApprovers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: SetDocumentTypeDefaultApproversDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentTypeService.setDefaultApprovers(id, payload, actor);
    return { data, message: 'Default approvers updated' };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'DocumentType' }])
  @ApiEndpoint({
    summary: 'Delete a clinic document type',
    responseDescription:
      'Soft-deleted. Refused with 403 `DOCUMENT_TYPE_SYSTEM_ROW` on a seeded type and with 409 `DOCUMENT_TYPE_IN_USE` — naming the count in `error.details.documentCount` — while any document uses it; deactivate instead (FR-E5-36). Documents never lose their type.',
    responseExample: {
      data: DOCUMENT_TYPE_EXAMPLES.deletedView,
      message: 'Document type deleted',
    },
    notFoundDescription: 'Document type not found.',
  })
  async deleteType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentTypeService.deleteType(id, actor);
    return { data, message: 'Document type deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
