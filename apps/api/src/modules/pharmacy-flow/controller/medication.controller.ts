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

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ApplyMidwifeFormularyDto } from '../dto/apply-midwife-formulary.dto';
import { CreateMedicationDto } from '../dto/create-medication.dto';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { SearchKfaProductsQueryDto } from '../dto/search-kfa-products-query.dto';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { KfaLookupService } from '../service/kfa-lookup.service';
import { MidwifeFormularyService } from '../service/midwife-formulary.service';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';
import { readMidwifeFormularyAuditMetadata } from '../service/read-midwife-formulary-audit-metadata';

const OK_STATUS = 200;

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'medications',
})
export class MedicationController {
  constructor(
    private readonly pharmacyFlowService: PharmacyFlowService,
    private readonly kfaLookupService: KfaLookupService,
    private readonly midwifeFormularyService: MidwifeFormularyService,
  ) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'List medications',
    responseDescription: 'A searchable, paginated medication inventory list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.pharmacy.medication],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listMedications(
    @Query() query: ListMedicationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.pharmacyFlowService.listMedications(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  // Before `:id` routes would matter, and gated on `create` rather than
  // `read`: this is a live call to SATUSEHAT made from the catalog form, so
  // only the roles that maintain the catalog can spend it.
  @Get('kfa-products')
  @Auth([{ action: 'create', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Search the KFA product dictionary',
    responseDescription:
      'Active KFA products matching the term, for filling a medication catalog entry. Answered live by SATUSEHAT, which is also what validates the code on submission.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.pharmacy.kfaProduct] },
  })
  async searchKfaProducts(@Query() query: SearchKfaProductsQueryDto) {
    const products = await this.kfaLookupService.searchKfaProducts(query);

    return {
      data: products,
    };
  }

  // P25-T04 (FR-FORM-02). Both literal routes sit before `:id` so the
  // segment is never parsed as a medication id, and both are gated on
  // `update` — the same key as editing a catalog row, because that is what
  // applying the template does.
  @Get('midwife-formulary/preview')
  @Auth([{ action: 'update', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Preview the midwife formulary template against the catalog',
    responseDescription:
      'Per template item, the non-deleted catalog rows it matches and how: `KFA_CODE` (exact product code), `KFA_TEMPLATE` (same KFA template, another manufacturer — resolved live from KFA, `templateLookup` says whether that ran) or `KEYWORD` (a name-only suggestion the clinic must verify; `apply` never accepts it). Items no row matches are listed under `unmatchedItems`. Nothing is written.',
    responseExample: { data: PHASE_THREE_EXAMPLES.pharmacy.midwifeFormularyPreview },
  })
  async previewMidwifeFormulary() {
    return { data: await this.midwifeFormularyService.previewFormulary() };
  }

  @Post('midwife-formulary/apply')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'update', subject: 'Medication' }])
  @Audited({
    resource: 'medication-midwife-formulary',
    action: AuditAction.MEDICATION_MIDWIFE_FORMULARY_APPLIED,
    idParam: null,
    metadataFromResponse: readMidwifeFormularyAuditMetadata,
  })
  @ApiEndpoint({
    summary: 'Flag the chosen matched medications as midwife-prescribable',
    responseDescription:
      'The preview is recomputed on the server; any id it does not match by code or template refuses the whole call with 422 `MIDWIFE_FORMULARY_MEDICATION_NOT_MATCHED` and nothing is written. Otherwise the chosen rows are flagged in one statement and each id answers `FLAGGED` or `ALREADY_FLAGGED`. This never unflags a row.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.midwifeFormularyApply,
      message: '1 flagged, 0 already flagged',
    },
    requestType: ApplyMidwifeFormularyDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.midwifeFormularyApplyRequest,
  })
  async applyMidwifeFormulary(@Body() payload: ApplyMidwifeFormularyDto) {
    const data = await this.midwifeFormularyService.applyFormulary(payload);
    return {
      data,
      message: `${data.flaggedCount} flagged, ${data.alreadyFlaggedCount} already flagged`,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Create a medication',
    responseDescription: 'The medication was added to the catalog.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.medication,
      message: 'Medication created',
    },
    requestType: CreateMedicationDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.medicationCreateRequest,
    successStatus: 201,
  })
  async createMedication(
    @Body() payload: CreateMedicationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const medication = await this.pharmacyFlowService.createMedication(payload, currentUser);

    return {
      data: medication,
      message: 'Medication created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Update a medication',
    responseDescription: 'The medication catalog entry was updated.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.medication,
      message: 'Medication updated',
    },
    requestType: UpdateMedicationDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.medicationUpdateRequest,
    notFoundDescription: 'Medication not found.',
  })
  async updateMedication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateMedicationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const medication = await this.pharmacyFlowService.updateMedication(id, payload, currentUser);

    return {
      data: medication,
      message: 'Medication updated',
    };
  }
}
