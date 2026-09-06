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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { CreateLabPanelDto } from '../dto/create-lab-panel.dto';
import { ListLabPanelsQueryDto } from '../dto/list-lab-panels-query.dto';
import { UpdateLabPanelDto } from '../dto/update-lab-panel.dto';
import { LabCatalogService } from '../service/lab-catalog.service';

@ApiTags('Laboratory Catalog')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'lab-panels' })
export class LabPanelController {
  constructor(private readonly labCatalogService: LabCatalogService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'List laboratory panels',
    responseDescription: 'Panels with their members in report order.',
    responseExample: { data: [LABORATORY_EXAMPLES.labPanel.view] },
  })
  async listLabPanels(@Query() query: ListLabPanelsQueryDto) {
    return { data: await this.labCatalogService.listLabPanels(query) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'Create a laboratory panel',
    responseDescription: 'The panel was created with its members in the order given.',
    responseExample: { data: LABORATORY_EXAMPLES.labPanel.view, message: 'Lab panel created' },
    requestType: CreateLabPanelDto,
    requestExample: LABORATORY_EXAMPLES.labPanel.createRequest,
    successStatus: 201,
    notFoundDescription: 'One or more lab tests in this panel do not exist.',
  })
  async createLabPanel(@Body() payload: CreateLabPanelDto) {
    return {
      data: await this.labCatalogService.createLabPanel(payload),
      message: 'Lab panel created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'LabTest' }])
  @ApiEndpoint({
    summary: 'Update a laboratory panel',
    responseDescription:
      'The panel was updated. Naming members replaces the whole list — the list and its order are the panel.',
    responseExample: { data: LABORATORY_EXAMPLES.labPanel.view, message: 'Lab panel updated' },
    requestType: UpdateLabPanelDto,
    requestExample: LABORATORY_EXAMPLES.labPanel.updateRequest,
    notFoundDescription: 'Lab panel not found, or a named lab test does not exist.',
  })
  async updateLabPanel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateLabPanelDto,
  ) {
    return {
      data: await this.labCatalogService.updateLabPanel(id, payload),
      message: 'Lab panel updated',
    };
  }
}
