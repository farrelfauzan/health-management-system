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
import { CreateWardDto } from '../dto/create-ward.dto';
import { ListWardsQueryDto } from '../dto/list-wards-query.dto';
import { UpdateWardDto } from '../dto/update-ward.dto';
import { WardService } from '../service/ward.service';

@ApiTags('Room Management')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'wards',
})
export class WardController {
  constructor(private readonly wardService: WardService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Ward' }])
  @ApiEndpoint({
    summary: 'List wards',
    responseDescription: 'The filtered, paginated ward list, ordered by code.',
    responseExample: {
      data: [ROOM_MANAGEMENT_EXAMPLES.ward.listItem],
      meta: ROOM_MANAGEMENT_EXAMPLES.paginationMeta,
    },
  })
  async listWards(@Query() query: ListWardsQueryDto) {
    const result = await this.wardService.listWards(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Ward' }])
  @ApiEndpoint({
    summary: 'Get a ward',
    responseDescription: 'One ward.',
    responseExample: { data: ROOM_MANAGEMENT_EXAMPLES.ward.listItem },
    notFoundDescription: 'Ward not found.',
  })
  async getWard(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.wardService.getWard(id) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Ward' }])
  @ApiEndpoint({
    summary: 'Create a ward',
    responseDescription: 'The ward was created.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.ward.listItem,
      message: 'Ward created',
    },
    requestType: CreateWardDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.ward.createRequest,
    successStatus: 201,
  })
  async createWard(@Body() payload: CreateWardDto) {
    const ward = await this.wardService.createWard(payload);

    return {
      data: ward,
      message: 'Ward created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Ward' }])
  @ApiEndpoint({
    summary: 'Update a ward',
    responseDescription:
      'The ward was updated. `code` is immutable — retire the ward and create its replacement instead.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.ward.listItem,
      message: 'Ward updated',
    },
    requestType: UpdateWardDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.ward.updateRequest,
    notFoundDescription: 'Ward not found.',
  })
  async updateWard(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateWardDto,
  ) {
    const ward = await this.wardService.updateWard(id, payload);

    return {
      data: ward,
      message: 'Ward updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'delete', subject: 'Ward' }])
  @ApiEndpoint({
    summary: 'Retire a ward',
    responseDescription:
      'The ward was retired (soft-deleted). Refused with 409 while it still holds rooms, so a cascade can never take beds a patient is lying in.',
    responseExample: { message: 'Ward retired' },
    notFoundDescription: 'Ward not found.',
  })
  async retireWard(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.wardService.retireWard(id);

    return { message: 'Ward retired' };
  }
}
