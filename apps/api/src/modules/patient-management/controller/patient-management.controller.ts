import {
  Body,
  Controller,
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
import { AuditAction } from '../../../generated/prisma/client';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ImportPatientDto } from '../dto/import-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientManagementService } from '../service/patient-management.service';

@ApiTags('Patient Management')
@Controller({
  version: '1',
  path: 'patients',
})
export class PatientManagementController {
  constructor(private readonly patientManagementService: PatientManagementService) {}

  @Get('privacy-notice/current')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Get the current patient privacy notice',
    responseDescription:
      'The immutable bilingual privacy notice version and content hashes. This is not treatment consent.',
    responseExample: {
      data: {
        id: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9',
        version: '1.0',
        effectiveAt: '2026-07-30T00:00:00.000Z',
        content: { id: 'Pemberitahuan privasi...', en: 'Privacy notice...' },
        contentHash: { id: '604bbd...', en: 'b5660f...' },
        counselApproved: false,
      },
    },
  })
  async getCurrentPrivacyNotice(@AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return { data: await this.patientManagementService.getCurrentPrivacyNotice(currentUser) };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
  @Audited({ resource: 'patient', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List patients',
    responseDescription: 'A permission-scoped, paginated list of patients.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.patient.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listPatients(@Query() query: ListPatientsQueryDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.patientManagementService.listPatients(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @Audited({ resource: 'patient', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Get a patient',
    responseDescription: 'The patient and active doctor relationships.',
    responseExample: { data: PHASE_THREE_EXAMPLES.patient.detail },
    notFoundDescription: 'Patient not found.',
  })
  async getPatientById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const patient = await this.patientManagementService.getPatientById(id, currentUser);

    return {
      data: patient,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Patient' }])
  @Audited({ resource: 'patient', action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Create a patient',
    responseDescription: 'The patient and optional initial doctor assignments were created.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.patient.item,
      meta: PHASE_THREE_EXAMPLES.patient.mutationMeta,
      message: 'Patient created',
    },
    requestType: CreatePatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.createRequest,
    successStatus: 201,
  })
  async createPatient(@Body() payload: CreatePatientDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.patientManagementService.createPatient(payload, currentUser);

    return {
      data: result.patient,
      meta: { identifierWarnings: result.identifierWarnings },
      message: 'Patient created',
    };
  }

  @Post('import')
  @HttpCode(201)
  @Auth([{ action: 'import-identifier', subject: 'Patient' }])
  @Audited({ resource: 'patient', action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Import a patient with an existing medical record number',
    responseDescription:
      'The patient was created with the supplied MRN and the allocation counter was lifted past it.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.patient.item,
      meta: PHASE_THREE_EXAMPLES.patient.mutationMeta,
      message: 'Patient imported',
    },
    requestType: ImportPatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.importRequest,
    successStatus: 201,
  })
  async importPatient(@Body() payload: ImportPatientDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.patientManagementService.importPatient(payload, currentUser);

    return {
      data: result.patient,
      meta: { identifierWarnings: result.identifierWarnings },
      message: 'Patient imported',
    };
  }

  @Get(':id/identifiers')
  @Auth([{ action: 'read-identifier', subject: 'Patient' }])
  @Audited({ resource: 'patient-identifier', action: AuditAction.READ, patientIdParam: 'id' })
  @ApiEndpoint({
    summary: 'Reveal a patient national and payer identifiers',
    responseDescription:
      'The decrypted identifiers. Every call is recorded as an audit event; ordinary patient responses carry masked values instead.',
    responseExample: { data: PHASE_THREE_EXAMPLES.patient.identifiers },
    notFoundDescription: 'Patient not found.',
  })
  async getPatientIdentifiers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const identifiers = await this.patientManagementService.getPatientIdentifiers(id, currentUser);

    return {
      data: identifiers,
    };
  }

  @Get(':id/privacy-notices')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @Audited({ resource: 'patient-privacy-notice', action: AuditAction.READ, patientIdParam: 'id' })
  @ApiEndpoint({
    summary: 'Get patient privacy notice evidence history',
    responseDescription: 'Append-only evidence history and current-version capture status.',
    responseExample: {
      data: {
        status: {
          currentNoticeVersionId: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9',
          currentVersion: '1.0',
          outcome: 'ACKNOWLEDGED',
          recordedAt: '2026-07-30T08:00:00.000Z',
          requiresCapture: false,
        },
        history: [],
      },
    },
    notFoundDescription: 'Patient or current privacy notice not found.',
  })
  async getPatientPrivacyNoticeHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return {
      data: await this.patientManagementService.getPatientPrivacyNoticeHistory(id, currentUser),
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Patient' }])
  @Audited({ resource: 'patient', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Update a patient',
    responseDescription: 'The patient was updated.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.patient.item,
      meta: PHASE_THREE_EXAMPLES.patient.mutationMeta,
      message: 'Patient updated',
    },
    requestType: UpdatePatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.updateRequest,
    notFoundDescription: 'Patient not found.',
  })
  async updatePatient(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdatePatientDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.patientManagementService.updatePatient(id, payload, currentUser);

    return {
      data: result.patient,
      meta: { identifierWarnings: result.identifierWarnings },
      message: 'Patient updated',
    };
  }
}
