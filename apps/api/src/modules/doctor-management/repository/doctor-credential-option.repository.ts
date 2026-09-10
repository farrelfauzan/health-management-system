import {
  CreateDoctorCredentialOptionPayload,
  DoctorCredentialKindValue,
  ListDoctorCredentialOptionsParams,
  UpdateDoctorCredentialOptionPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class DoctorCredentialOptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listOptions(params: ListDoctorCredentialOptionsParams) {
    const { kind, includeInactive } = params;
    return this.prisma.findManyActive(this.prisma.doctorCredentialOption, {
      where: {
        ...(kind ? { kind } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ kind: 'asc' as const }, { sortOrder: 'asc' as const }, { label: 'asc' as const }],
    });
  }

  async findOptionById(id: string) {
    return this.prisma.findFirstActive(this.prisma.doctorCredentialOption, {
      where: { id },
    });
  }

  async findOptionByKindAndCode(kind: DoctorCredentialKindValue, code: string) {
    return this.prisma.findFirstActive(this.prisma.doctorCredentialOption, {
      where: { kind, code },
    });
  }

  async createOption(payload: CreateDoctorCredentialOptionPayload) {
    return this.prisma.doctorCredentialOption.create({
      data: {
        kind: payload.kind,
        code: payload.code,
        label: payload.label,
        sortOrder: payload.sortOrder,
      },
    });
  }

  async updateOption(id: string, payload: UpdateDoctorCredentialOptionPayload) {
    return this.prisma.doctorCredentialOption.update({
      where: { id },
      data: {
        ...(payload.label === undefined ? {} : { label: payload.label }),
        ...(payload.sortOrder === undefined ? {} : { sortOrder: payload.sortOrder }),
        ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
      },
    });
  }
}
