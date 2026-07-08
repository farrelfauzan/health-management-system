// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: TS2742: Cannot find module 'prisma/config' or its corresponding type declarations.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'prisma db execute --file prisma/seed.sql',
  },
  datasource: {
    url: env('DATABASE_URL') ?? defaultDatabaseUrl,
  },
});
