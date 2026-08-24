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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ROOM_MANAGEMENT_EXAMPLES } from '../../../common/openapi/room-management-examples';
import { CreateBedDto } from '../dto/create-bed.dto';
import { ListBedsQueryDto } from '../dto/list-beds-query.dto';
import { UpdateBedDto } from '../dto/update-bed.dto';
import { BedService } from '../service/bed.service';

@ApiTags('Room Management')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'beds',
})
export class BedController {
  constructor(private readonly bedService: BedService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'List beds',
    responseDescription:
      'The filtered, paginated bed list. Each row carries its room and ward, so a bed picker renders a full address without a second request.',
    responseExample: {
      data: [ROOM_MANAGEMENT_EXAMPLES.bed.listItem],
      meta: ROOM_MANAGEMENT_EXAMPLES.paginationMeta,
    },
  })
  async listBeds(@Query() query: ListBedsQueryDto) {
    const result = await this.bedService.listBeds(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'Get a bed',
    responseDescription: 'One bed with its room and ward.',
    responseExample: { data: ROOM_MANAGEMENT_EXAMPLES.bed.listItem },
    notFoundDescription: 'Bed not found.',
  })
  async getBed(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.bedService.getBed(id) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'Create a bed',
    responseDescription: 'The bed was created.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.bed.listItem,
      message: 'Bed created',
    },
    requestType: CreateBedDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.bed.createRequest,
    successStatus: 201,
  })
  async createBed(@Body() payload: CreateBedDto) {
    const bed = await this.bedService.createBed(payload);

    return {
      data: bed,
      message: 'Bed created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'Update a bed',
    responseDescription:
      'The bed was updated. `status` accepts AVAILABLE and MAINTENANCE only — OCCUPIED is written by the admission flow, never by an inventory edit.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.bed.listItem,
      message: 'Bed updated',
    },
    requestType: UpdateBedDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.bed.updateRequest,
    notFoundDescription: 'Bed not found.',
  })
  async updateBed(@Param('id', new ParseUUIDPipe()) id: string, @Body() payload: UpdateBedDto) {
    const bed = await this.bedService.updateBed(id, payload);

    return {
      data: bed,
      message: 'Bed updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'delete', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'Retire a bed',
    responseDescription:
      'The bed was retired (soft-deleted). Refused with 409 while a patient is assigned to it.',
    responseExample: { message: 'Bed retired' },
    notFoundDescription: 'Bed not found.',
  })
  async retireBed(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.bedService.retireBed(id);

    return { message: 'Bed retired' };
  }
}
