import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import {
  CountDelegate,
  DeleteDelegate,
  DeleteWhere,
  FindFirstDelegate,
  FindManyDelegate,
  FindUniqueDelegate,
  UpdateDelegate,
  UpdateWhere,
} from './prisma.types';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly disableConnectOnBoot: boolean;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      configService.get<string>('DATABASE_URL') ??
      'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';
    const disableConnectOnBoot = configService.get<string>('DISABLE_PRISMA_CONNECT') === 'true';
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });

    this.disableConnectOnBoot = disableConnectOnBoot;
  }

  async onModuleInit(): Promise<void> {
    if (this.disableConnectOnBoot) {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async softDelete<TDelegate extends UpdateDelegate>(
    model: TDelegate,
    where: UpdateWhere<TDelegate>,
  ): Promise<Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'update'>, 'update'>> {
    const args = {
      where,
      data: {
        deletedAt: new Date(),
      },
    } as Prisma.Args<TDelegate, 'update'>;

    return model.update(args) as Promise<
      Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'update'>, 'update'>
    >;
  }

  async findManyActive<
    TDelegate extends FindManyDelegate,
    const TArgs extends Prisma.Args<TDelegate, 'findMany'>,
  >(model: TDelegate, args?: TArgs): Promise<Prisma.Result<TDelegate, TArgs, 'findMany'>> {
    const typedArgs = (args ?? {}) as Record<string, unknown>;
    const where = (typedArgs.where as Record<string, unknown> | undefined) ?? {};

    const findManyArgs = {
      ...typedArgs,
      where: {
        ...where,
        deletedAt: null,
      },
    } as Prisma.Args<TDelegate, 'findMany'>;

    return model.findMany(findManyArgs) as Promise<Prisma.Result<TDelegate, TArgs, 'findMany'>>;
  }

  async findFirstActive<
    TDelegate extends FindFirstDelegate,
    const TArgs extends Prisma.Args<TDelegate, 'findFirst'>,
  >(model: TDelegate, args?: TArgs): Promise<Prisma.Result<TDelegate, TArgs, 'findFirst'>> {
    const typedArgs = (args ?? {}) as Record<string, unknown>;
    const where = (typedArgs.where as Record<string, unknown> | undefined) ?? {};

    const findFirstArgs = {
      ...typedArgs,
      where: {
        ...where,
        deletedAt: null,
      },
    } as Prisma.Args<TDelegate, 'findFirst'>;

    return model.findFirst(findFirstArgs) as Promise<Prisma.Result<TDelegate, TArgs, 'findFirst'>>;
  }

  async findUniqueActive<
    TDelegate extends FindFirstDelegate & FindUniqueDelegate,
    const TArgs extends Prisma.Args<TDelegate, 'findUnique'>,
  >(model: TDelegate, args: TArgs): Promise<Prisma.Result<TDelegate, TArgs, 'findUnique'>> {
    const typedArgs = args as Record<string, unknown>;
    const where = (typedArgs.where as Record<string, unknown> | undefined) ?? {};

    const findFirstArgs = {
      ...typedArgs,
      where: {
        ...where,
        deletedAt: null,
      },
    } as Prisma.Args<TDelegate, 'findFirst'>;

    return model.findFirst(findFirstArgs) as Promise<
      Prisma.Result<TDelegate, TArgs, 'findUnique'>
    >;
  }

  async countActive<TDelegate extends CountDelegate>(
    model: TDelegate,
    args?: Prisma.Args<TDelegate, 'count'>,
  ): Promise<number> {
    const typedArgs = (args ?? {}) as Record<string, unknown>;
    const where = (typedArgs.where as Record<string, unknown> | undefined) ?? {};

    const countArgs = {
      ...typedArgs,
      where: {
        ...where,
        deletedAt: null,
      },
    } as Prisma.Args<TDelegate, 'count'>;

    return model.count(countArgs);
  }

  async restore<TDelegate extends UpdateDelegate>(
    model: TDelegate,
    where: UpdateWhere<TDelegate>,
  ): Promise<Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'update'>, 'update'>> {
    const args = {
      where,
      data: { deletedAt: null },
    } as Prisma.Args<TDelegate, 'update'>;

    return model.update(args) as Promise<
      Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'update'>, 'update'>
    >;
  }

  async hardDelete<TDelegate extends DeleteDelegate>(
    model: TDelegate,
    where: DeleteWhere<TDelegate>,
  ): Promise<Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'delete'>, 'delete'>> {
    const args = { where } as Prisma.Args<TDelegate, 'delete'>;

    return model.delete(args) as Promise<
      Prisma.Result<TDelegate, Prisma.Args<TDelegate, 'delete'>, 'delete'>
    >;
  }

  async executeTransaction<T>(
    fn: (
      tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(fn);
  }
}
