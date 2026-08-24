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
import { CreateRoomClassDto } from '../dto/create-room-class.dto';
import { ListRoomClassesQueryDto } from '../dto/list-room-classes-query.dto';
import { UpdateRoomClassDto } from '../dto/update-room-class.dto';
import { RoomClassService } from '../service/room-class.service';

@ApiTags('Room Management')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'room-classes',
})
export class RoomClassController {
  constructor(private readonly roomClassService: RoomClassService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'RoomClass' }])
  @ApiEndpoint({
    summary: 'List room classes',
    responseDescription:
      'The clinic’s kelas perawatan catalog, ordered by code. `allocatedBeds` is the live bed count sitting in rooms of each class, so a quota reads as "9 of 12" without a second request.',
    responseExample: {
      data: [ROOM_MANAGEMENT_EXAMPLES.roomClass.listItem],
      meta: ROOM_MANAGEMENT_EXAMPLES.paginationMeta,
    },
  })
  async listRoomClasses(@Query() query: ListRoomClassesQueryDto) {
    const result = await this.roomClassService.listRoomClasses(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'RoomClass' }])
  @ApiEndpoint({
    summary: 'Get a room class',
    responseDescription: 'One room class with its current bed allocation.',
    responseExample: { data: ROOM_MANAGEMENT_EXAMPLES.roomClass.listItem },
    notFoundDescription: 'Room class not found.',
  })
  async getRoomClass(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.roomClassService.getRoomClass(id) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'RoomClass' }])
  @ApiEndpoint({
    summary: 'Create a room class',
    responseDescription:
      'The class was created. Omitting `quota` leaves it uncapped, which is what a clinic that has not set a ceiling means.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.roomClass.listItem,
      message: 'Room class created',
    },
    requestType: CreateRoomClassDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.roomClass.createRequest,
    successStatus: 201,
  })
  async createRoomClass(@Body() payload: CreateRoomClassDto) {
    const roomClass = await this.roomClassService.createRoomClass(payload);

    return {
      data: roomClass,
      message: 'Room class created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'RoomClass' }])
  @ApiEndpoint({
    summary: 'Update a room class',
    responseDescription:
      'The class was updated. `code` is immutable — the accommodation tariff points at it. Lowering `quota` below the beds already allocated is refused with 409; sending `null` clears it back to uncapped.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.roomClass.listItem,
      message: 'Room class updated',
    },
    requestType: UpdateRoomClassDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.roomClass.updateRequest,
    notFoundDescription: 'Room class not found.',
  })
  async updateRoomClass(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateRoomClassDto,
  ) {
    const roomClass = await this.roomClassService.updateRoomClass(id, payload);

    return {
      data: roomClass,
      message: 'Room class updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'delete', subject: 'RoomClass' }])
  @ApiEndpoint({
    summary: 'Retire a room class',
    responseDescription:
      'The class was retired (soft-deleted), freeing its code. Refused with 409 while rooms still carry it.',
    responseExample: { message: 'Room class retired' },
    notFoundDescription: 'Room class not found.',
  })
  async retireRoomClass(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.roomClassService.retireRoomClass(id);

    return { message: 'Room class retired' };
  }
}
