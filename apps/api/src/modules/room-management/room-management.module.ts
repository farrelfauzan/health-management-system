import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BedController } from './controller/bed.controller';
import { RoomClassController } from './controller/room-class.controller';
import { RoomController } from './controller/room.controller';
import { RoomOccupancyController } from './controller/room-occupancy.controller';
import { WardController } from './controller/ward.controller';
import { BedRepository } from './repository/bed.repository';
import { RoomOccupancyRepository } from './repository/room-occupancy.repository';
import { RoomClassRepository } from './repository/room-class.repository';
import { RoomRepository } from './repository/room.repository';
import { WardRepository } from './repository/ward.repository';
import { BedService } from './service/bed.service';
import { RoomInventoryMapper } from './service/room-inventory.mapper';
import { RoomClassService } from './service/room-class.service';
import { RoomOccupancyService } from './service/room-occupancy.service';
import { RoomService } from './service/room.service';
import { WardService } from './service/ward.service';

@Module({
  imports: [AuthModule],
  controllers: [
    RoomClassController,
    WardController,
    RoomController,
    BedController,
    RoomOccupancyController,
  ],
  providers: [
    RoomClassRepository,
    WardRepository,
    RoomRepository,
    BedRepository,
    RoomOccupancyRepository,
    RoomInventoryMapper,
    RoomClassService,
    WardService,
    RoomService,
    BedService,
    RoomOccupancyService,
  ],
  // Exported for IMP-14: `AdmissionFlowService` resolves and re-projects bed
  // state through the service that owns the inventory rules, never through
  // this module's repositories. `RoomClassService` goes with it for IMP-15,
  // which prices a night by the class it was spent in.
  exports: [BedService, RoomClassService],
})
export class RoomManagementModule {}
