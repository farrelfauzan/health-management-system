import type { BedStatusValue } from '#room-management/schemas';

/**
 * A room class as the master-data screen edits it (IMP-13).
 *
 * `allocatedBeds` is the count of live beds currently sitting in rooms of this
 * class, returned alongside `quota` so the screen can show "9 of 12" without a
 * second request — and so a clinic lowering a quota can see what it is about
 * to sit below.
 */
export type RoomClassResponse = {
  id: string;
  code: string;
  name: string;
  description?: string;
  /** Planned bed count for the whole clinic. Absent means uncapped. */
  quota?: number;
  allocatedBeds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** The class as it is carried on a room, bed or admission row. */
export type RoomClassSummary = {
  id: string;
  code: string;
  name: string;
};

export type WardResponse = {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoomResponse = {
  id: string;
  wardId: string;
  ward: {
    id: string;
    code: string;
    name: string;
  };
  roomClassId: string;
  roomClass: RoomClassSummary;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BedResponse = {
  id: string;
  roomId: string;
  room: {
    id: string;
    code: string;
    name: string;
    roomClass: RoomClassSummary;
  };
  ward: {
    id: string;
    code: string;
    name: string;
  };
  code: string;
  status: BedStatusValue;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** How many beds a room holds in each state, and how many are free right now. */
export type RoomOccupancyResponse = {
  roomId: string;
  code: string;
  name: string;
  roomClass: RoomClassSummary;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  maintenanceBeds: number;
};

/**
 * The occupancy board: one entry per ward, its rooms nested underneath, with
 * the ward totals already summed. Nested rather than flat because the board
 * renders exactly this tree, and a client that had to re-group a flat list
 * would be re-deriving a total the database just computed.
 */
export type WardOccupancyResponse = {
  wardId: string;
  code: string;
  name: string;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  maintenanceBeds: number;
  rooms: RoomOccupancyResponse[];
};

export type RoomInventoryListMeta = {
  page: number;
  limit: number;
  total: number;
};
