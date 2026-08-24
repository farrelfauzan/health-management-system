import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ROOM_MANAGEMENT_EXAMPLES } from '../../../common/openapi/room-management-examples';
import { RoomOccupancyQueryDto } from '../dto/room-occupancy-query.dto';
import { RoomOccupancyService } from '../service/room-occupancy.service';

/**
 * Its own path rather than `GET /rooms/occupancy`, so the aggregate can never
 * be shadowed by `GET /rooms/:id` as the room routes grow.
 */
@ApiTags('Room Management')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'room-occupancy',
})
export class RoomOccupancyController {
  constructor(private readonly roomOccupancyService: RoomOccupancyService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Bed' }])
  @ApiEndpoint({
    summary: 'Get the occupancy board',
    responseDescription:
      'Bed counts per ward and room, with ward totals summed. Empty wards and empty rooms appear with zeroes rather than being dropped.',
    responseExample: { data: [ROOM_MANAGEMENT_EXAMPLES.occupancy.ward] },
  })
  async getOccupancy(@Query() query: RoomOccupancyQueryDto) {
    return { data: await this.roomOccupancyService.getOccupancy(query) };
  }
}
