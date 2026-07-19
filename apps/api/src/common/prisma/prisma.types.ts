import { Prisma, PrismaClient } from '../../generated/prisma/client';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export type FindManyDelegate = {
  findMany(args?: unknown): Promise<unknown>;
};

export type FindFirstDelegate = {
  findFirst(args?: unknown): Promise<unknown>;
};

export type FindUniqueDelegate = {
  findUnique(args?: unknown): Promise<unknown>;
};

export type CountDelegate = {
  count(args?: unknown): Promise<number>;
};

export type UpdateDelegate = {
  update(args: unknown): Promise<unknown>;
};

export type DeleteDelegate = {
  delete(args: unknown): Promise<unknown>;
};

export type UpdateWhere<TDelegate extends UpdateDelegate> = Prisma.Args<TDelegate, 'update'> extends {
  where: infer TWhere;
}
  ? TWhere
  : never;

export type DeleteWhere<TDelegate extends DeleteDelegate> = Prisma.Args<TDelegate, 'delete'> extends {
  where: infer TWhere;
}
  ? TWhere
  : never;
