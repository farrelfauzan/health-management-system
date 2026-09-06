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
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_TEMPLATE_EXAMPLES } from '../../../common/openapi/document-template-examples';
import { CreateDocumentTemplateDto } from '../dto/create-document-template.dto';
import { CreateDocumentTemplateImportUploadUrlDto } from '../dto/create-document-template-import-upload-url.dto';
import { ImportDocumentTemplateDto } from '../dto/import-document-template.dto';
import { ListDocumentTemplatesQueryDto } from '../dto/list-document-templates-query.dto';
import { UpdateDocumentTemplateDto } from '../dto/update-document-template.dto';
import { DocumentTemplateApprovalService } from '../service/document-template-approval.service';
import { DocumentTemplateImportService } from '../service/document-template-import.service';
import { DocumentTemplatePreviewService } from '../service/document-template-preview.service';
import { DocumentTemplateService } from '../service/document-template.service';

@ApiTags('Document Templates')
@RequireFeature('invoice-documents')
@Controller({
  version: '1',
  path: 'document-templates',
})
export class DocumentTemplateController {
  constructor(
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly documentTemplatePreviewService: DocumentTemplatePreviewService,
    private readonly documentTemplateImportService: DocumentTemplateImportService,
    private readonly documentTemplateApprovalService: DocumentTemplateApprovalService,
  ) {}

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

  @Post('import-upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload of a Word file to import as a template',
    responseDescription:
      'A short-lived PUT URL for exactly one `.docx` of the declared size. Nothing is persisted: a URL nobody claims leaves a staged object that the import route never sees and a sweep can remove. Send `requiredHeaders` verbatim on the PUT.',
    responseExample: { data: DOCUMENT_TEMPLATE_EXAMPLES.importUploadUrlView },
    requestType: CreateDocumentTemplateImportUploadUrlDto,
    requestExample: DOCUMENT_TEMPLATE_EXAMPLES.importUploadUrlRequest,
  })
  async createImportUploadUrl(@Body() payload: CreateDocumentTemplateImportUploadUrlDto) {
    return { data: await this.documentTemplateImportService.createImportUploadUrl(payload) };
  }

  @Post(':id/import')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Convert a staged Word file into a layout the editor can load',
    responseDescription:
      'The Word file’s headings, paragraphs, emphasis, tables and embedded images as sanitised editor HTML, with `{{token}}` placeholders turned into variable chips. **Nothing is saved**: the client loads it into the editor as an unsaved draft and the working copy changes only on Save. `warnings` lists placeholders the registry does not know, images that could not be carried over, and anything else the converter dropped. The staged file is deleted whatever the outcome; a file that is not a Word document is refused on its bytes and audited.',
    responseExample: { data: DOCUMENT_TEMPLATE_EXAMPLES.importView },
    requestType: ImportDocumentTemplateDto,
    requestExample: DOCUMENT_TEMPLATE_EXAMPLES.importRequest,
    notFoundDescription: 'Document template not found.',
  })
  async importTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: ImportDocumentTemplateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.documentTemplateImportService.importTemplate(id, payload, actor) };
  }

  @Post(':id/preview')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Render the working copy against the built-in fixture invoice',
    responseDescription:
      'The draft was rendered against a hostile fixture (120-character name, 12 line items, a zero-price item, a total above the materai threshold). The URL is short-lived; no invoice document is created and no patient data is read.',
    responseExample: { data: DOCUMENT_TEMPLATE_EXAMPLES.previewView },
    notFoundDescription: 'Document template not found.',
  })
  async previewTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const preview = await this.documentTemplatePreviewService.previewTemplate(id, actor);

    return {
      data: preview,
    };
  }

  @Post(':id/approval-preview')
  @HttpCode(200)
  @Auth([{ action: 'decide', subject: 'DocumentApproval' }])
  @ApiEndpoint({
    summary: "Render a template's open submission and diff it against the published version",
    responseDescription:
      'The frozen submission — not the working copy — rendered against the hostile fixture, plus a block-level diff against the version invoices currently render from. An edit made after the submission changes neither. 404 when the template has no open approval request.',
    responseExample: { data: DOCUMENT_TEMPLATE_EXAMPLES.approvalPreviewView },
    notFoundDescription: 'Document template not found, or it has no open approval request.',
  })
  async previewTemplateSubmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);

    return {
      data: await this.documentTemplateApprovalService.previewOpenSubmission(id, actor),
    };
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'Publish an immutable version of a template',
    responseDescription:
      'A new immutable version was cut from the working copy. Rendered documents point at versions, so later edits never rewrite what this publish produced. A draft referencing a token outside the registry is refused with 422 and `error.details.unknownTokens`.',
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
