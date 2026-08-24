import type { BedStatusValue } from '#room-management/schemas';

/**
 * Room class (kelas perawatan) as the clinic keeps it. Master data rather than
 * an enum, so a clinic can sell a "Suite" without waiting for a release.
 */
export type RoomClassRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** Planned bed count for the whole clinic; null means uncapped. */
  quota: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** The class as it is carried on a room, bed or admission row. */
export type RoomClassSummaryRecord = {
  id: string;
  code: string;
  name: string;
};

/** Repository projection of one ward row. */
export type WardRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Repository projection of one room row, with its ward and class for display. */
export type RoomRecord = {
  id: string;
  wardId: string;
  wardCode: string;
  wardName: string;
  roomClass: RoomClassSummaryRecord;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository projection of one bed row, carrying its room, class and ward so
 * the inventory table and the bed picker can both render a full address
 * ("Melati / 201 / A", Kelas 1) without a second round trip.
 */
export type BedRecord = {
  id: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  roomClass: RoomClassSummaryRecord;
  wardId: string;
  wardCode: string;
  wardName: string;
  code: string;
  status: BedStatusValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ListRoomClassesParams = {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
};

export type ListWardsParams = {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
};

export type ListRoomsParams = {
  page: number;
  limit: number;
  wardId?: string;
  roomClassId?: string;
  search?: string;
  isActive?: boolean;
};

export type ListBedsParams = {
  page: number;
  limit: number;
  wardId?: string;
  roomId?: string;
  status?: BedStatusValue;
  search?: string;
};

export type CreateRoomClassRecordPayload = {
  code: string;
  name: string;
  description?: string;
  quota?: number;
  isActive?: boolean;
};

export type UpdateRoomClassRecordPayload = {
  id: string;
  name?: string;
  description?: string | null;
  quota?: number | null;
  isActive?: boolean;
};

export type CreateWardRecordPayload = {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
};

export type UpdateWardRecordPayload = {
  id: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

export type CreateRoomRecordPayload = {
  wardId: string;
  roomClassId: string;
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
};

export type UpdateRoomRecordPayload = {
  id: string;
  name?: string;
  roomClassId?: string;
  description?: string | null;
  isActive?: boolean;
};

export type CreateBedRecordPayload = {
  roomId: string;
  code: string;
  status?: BedStatusValue;
  notes?: string;
};

export type UpdateBedRecordPayload = {
  id: string;
  status?: BedStatusValue;
  notes?: string | null;
};

export type RoomOccupancyParams = {
  wardId?: string;
  roomClassId?: string;
};

/** One row of the `GROUP BY room, status` aggregate the occupancy view reads. */
export type BedStatusTallyRecord = {
  roomId: string;
  status: BedStatusValue;
  count: number;
};

/** How many live beds a class currently holds, for the quota check. */
export type RoomClassBedTallyRecord = {
  roomClassId: string;
  count: number;
};

/**
 * Paged repository result. Every list endpoint in this module returns the same
 * shape, so the services can share one mapping step.
 */
export type PagedRecords<TRecord> = {
  items: TRecord[];
  page: number;
  limit: number;
  total: number;
};
