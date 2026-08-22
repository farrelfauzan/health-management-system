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
import { CreateRoomDto } from '../dto/create-room.dto';
import { ListRoomsQueryDto } from '../dto/list-rooms-query.dto';
import { UpdateRoomDto } from '../dto/update-room.dto';
import { RoomService } from '../service/room.service';

@ApiTags('Room Management')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'rooms',
})
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Room' }])
  @ApiEndpoint({
    summary: 'List rooms',
    responseDescription: 'The filtered, paginated room list with its ward, ordered by ward then code.',
    responseExample: {
      data: [ROOM_MANAGEMENT_EXAMPLES.room.listItem],
      meta: ROOM_MANAGEMENT_EXAMPLES.paginationMeta,
    },
  })
  async listRooms(@Query() query: ListRoomsQueryDto) {
    const result = await this.roomService.listRooms(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Room' }])
  @ApiEndpoint({
    summary: 'Get a room',
    responseDescription: 'One room with its ward.',
    responseExample: { data: ROOM_MANAGEMENT_EXAMPLES.room.listItem },
    notFoundDescription: 'Room not found.',
  })
  async getRoom(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.roomService.getRoom(id) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Room' }])
  @ApiEndpoint({
    summary: 'Create a room',
    responseDescription: 'The room was created.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.room.listItem,
      message: 'Room created',
    },
    requestType: CreateRoomDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.room.createRequest,
    successStatus: 201,
  })
  async createRoom(@Body() payload: CreateRoomDto) {
    const room = await this.roomService.createRoom(payload);

    return {
      data: room,
      message: 'Room created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Room' }])
  @ApiEndpoint({
    summary: 'Update a room',
    responseDescription:
      'The room was updated. Re-classing changes what tonight costs and leaves nights already billed alone.',
    responseExample: {
      data: ROOM_MANAGEMENT_EXAMPLES.room.listItem,
      message: 'Room updated',
    },
    requestType: UpdateRoomDto,
    requestExample: ROOM_MANAGEMENT_EXAMPLES.room.updateRequest,
    notFoundDescription: 'Room not found.',
  })
  async updateRoom(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateRoomDto,
  ) {
    const room = await this.roomService.updateRoom(id, payload);

    return {
      data: room,
      message: 'Room updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'delete', subject: 'Room' }])
  @ApiEndpoint({
    summary: 'Retire a room',
    responseDescription:
      'The room was retired (soft-deleted). Refused with 409 while it still holds beds.',
    responseExample: { message: 'Room retired' },
    notFoundDescription: 'Room not found.',
  })
  async retireRoom(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.roomService.retireRoom(id);

    return { message: 'Room retired' };
  }
}
