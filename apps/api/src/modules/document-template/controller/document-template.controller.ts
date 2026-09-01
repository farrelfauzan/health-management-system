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
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_TEMPLATE_EXAMPLES } from '../../../common/openapi/document-template-examples';
import { CreateDocumentTemplateDto } from '../dto/create-document-template.dto';
import { ListDocumentTemplatesQueryDto } from '../dto/list-document-templates-query.dto';
import { UpdateDocumentTemplateDto } from '../dto/update-document-template.dto';
import { DocumentTemplateService } from '../service/document-template.service';

@ApiTags('Document Templates')
@Controller({
  version: '1',
  path: 'document-templates',
})
export class DocumentTemplateController {
  constructor(private readonly documentTemplateService: DocumentTemplateService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'List document templates of one kind',
    responseDescription:
      'Every live template of the kind, default first, each with its latest published version if any.',
    responseExample: { data: [DOCUMENT_TEMPLATE_EXAMPLES.view] },
  })
  async listTemplates(@Query() query: ListDocumentTemplatesQueryDto) {
    const templates = await this.documentTemplateService.listTemplates(query);

    return {
      data: templates,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Create a document template',
    responseDescription:
      'The template was created as a DRAFT working copy. Its HTML was sanitised server-side before being stored.',
    responseExample: {
      data: DOCUMENT_TEMPLATE_EXAMPLES.draftView,
      message: 'Document template created',
    },
    requestType: CreateDocumentTemplateDto,
    requestExample: DOCUMENT_TEMPLATE_EXAMPLES.createRequest,
    successStatus: 201,
  })
  async createTemplate(
    @Body() payload: CreateDocumentTemplateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const template = await this.documentTemplateService.createTemplate(payload, actor);

    return {
      data: template,
      message: 'Document template created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Update a document template',
    responseDescription:
      'The working copy was updated; its HTML was sanitised server-side. Published versions are immutable and unaffected.',
    responseExample: {
      data: DOCUMENT_TEMPLATE_EXAMPLES.view,
      message: 'Document template updated',
    },
    requestType: UpdateDocumentTemplateDto,
    requestExample: DOCUMENT_TEMPLATE_EXAMPLES.updateRequest,
    notFoundDescription: 'Document template not found.',
  })
  async updateTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDocumentTemplateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const template = await this.documentTemplateService.updateTemplate(id, payload, actor);

    return {
      data: template,
      message: 'Document template updated',
    };
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Publish an immutable version of a template',
    responseDescription:
      'A new immutable version was cut from the working copy. Rendered documents point at versions, so later edits never rewrite what this publish produced.',
    responseExample: {
      data: DOCUMENT_TEMPLATE_EXAMPLES.view,
      message: 'Document template published',
    },
    notFoundDescription: 'Document template not found.',
  })
  async publishTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const template = await this.documentTemplateService.publishTemplate(id, actor);

    return {
      data: template,
      message: 'Document template published',
    };
  }

  @Post(':id/set-default')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Make a template the default for its kind',
    responseDescription:
      'The default flag moved to this template in one transaction — at most one default per kind exists at any instant.',
    responseExample: {
      data: DOCUMENT_TEMPLATE_EXAMPLES.view,
      message: 'Default template updated',
    },
    notFoundDescription: 'Document template not found.',
  })
  async setDefaultTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const template = await this.documentTemplateService.setDefaultTemplate(id, actor);

    return {
      data: template,
      message: 'Default template updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Archive a document template',
    responseDescription:
      'The working copy was soft-deleted. Published versions are retained — rendered documents keep pointing at them. The default template is refused.',
    responseExample: {
      data: DOCUMENT_TEMPLATE_EXAMPLES.archivedView,
      message: 'Document template archived',
    },
    notFoundDescription: 'Document template not found.',
  })
  async archiveTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const archived = await this.documentTemplateService.archiveTemplate(id, actor);

    return {
      data: archived,
      message: 'Document template archived',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
