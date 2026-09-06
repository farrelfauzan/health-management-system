import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { CreateLabTestDto } from '../dto/create-lab-test.dto';
import { ListLabTestsQueryDto } from '../dto/list-lab-tests-query.dto';
import { ReplaceLabReferenceRangesDto } from '../dto/replace-lab-reference-ranges.dto';
import { UpdateLabTestDto } from '../dto/update-lab-test.dto';
import { LabCatalogService } from '../service/lab-catalog.service';

@ApiTags('Laboratory Catalog')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'lab-tests' })
export class LabTestController {
  constructor(private readonly labCatalogService: LabCatalogService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'List laboratory tests',
    responseDescription:
      'The catalog, code order, with each test’s reference ranges and current price.',
    responseExample: { data: [LABORATORY_EXAMPLES.labTest.view] },
  })
  async listLabTests(@Query() query: ListLabTestsQueryDto) {
    return { data: await this.labCatalogService.listLabTests(query) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'Create a laboratory test',
    responseDescription: 'The test was added to the catalog.',
    responseExample: { data: LABORATORY_EXAMPLES.labTest.view, message: 'Lab test created' },
    requestType: CreateLabTestDto,
    requestExample: LABORATORY_EXAMPLES.labTest.createRequest,
    successStatus: 201,
  })
  async createLabTest(@Body() payload: CreateLabTestDto) {
    return { data: await this.labCatalogService.createLabTest(payload), message: 'Lab test created' };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'Update a laboratory test',
    responseDescription: 'The catalog row was updated. Results already entered keep their snapshot.',
    responseExample: { data: LABORATORY_EXAMPLES.labTest.view, message: 'Lab test updated' },
    requestType: UpdateLabTestDto,
    requestExample: LABORATORY_EXAMPLES.labTest.updateRequest,
    notFoundDescription: 'Lab test not found.',
  })
  async updateLabTest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateLabTestDto,
  ) {
    return {
      data: await this.labCatalogService.updateLabTest(id, payload),
      message: 'Lab test updated',
    };
  }

  @Put(':id/reference-ranges')
  @Auth([{ action: 'write', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'Replace a test’s reference ranges',
    responseDescription:
      'The whole set was replaced. PUT rather than PATCH because the ranges together define “normal” — editing them one at a time leaves windows where two bands overlap or none applies.',
    responseExample: { data: LABORATORY_EXAMPLES.labTest.view, message: 'Reference ranges replaced' },
    requestType: ReplaceLabReferenceRangesDto,
    requestExample: LABORATORY_EXAMPLES.labTest.replaceRangesRequest,
    notFoundDescription: 'Lab test not found.',
  })
  async replaceReferenceRanges(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: ReplaceLabReferenceRangesDto,
  ) {
    return {
      data: await this.labCatalogService.replaceReferenceRanges(id, payload),
      message: 'Reference ranges replaced',
    };
  }
}
