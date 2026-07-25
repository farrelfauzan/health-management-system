# Database Migration Review Checklist

Applies to every PR that touches `apps/api/prisma/schema.prisma` or adds a folder under `apps/api/prisma/migrations/`. The reviewer walks this list before approving; the author links the filled-in [rollback notes](rollback-notes-template.md) in the PR description.

## How migrations flow through this repo

- Migrations are authored locally with `pnpm db:migrate:dev` (Prisma Migrate, dev database from `apps/api/.env`).
- CI validates the schema (`pnpm db:validate`) and applies the full migration history to a fresh PostgreSQL 16 container on every PR.
- Deployments apply pending migrations with `pnpm db:migrate:deploy` (or the `migrate` compose service: `pnpm docker:dev:migrate`) **before** the new API image starts serving traffic.
- Prisma Migrate is forward-only: there are no auto-generated down migrations. Rollback is always a new forward migration (or a restore from backup), which is why every migration PR carries rollback notes.

## 1. Schema conventions

- [ ] Primary keys are UUIDs (`String @id @default(uuid())` or DB-generated equivalent).
- [ ] Every model and column maps to snake_case via `@map` / `@@map`.
- [ ] Models carry `createdAt` / `updatedAt`, and `deletedAt` when the domain uses soft delete.
- [ ] Status-like fields use an explicit Prisma `enum`, not free-form strings.
- [ ] Foreign keys are indexed (`@@index`) and relation `onDelete` behavior is deliberate (no accidental `Cascade`).
- [ ] New request/response shapes that accompany the schema change live in `packages/shared-types`, not inline in the API.

## 2. Migration SQL review

- [ ] The generated SQL in `migrations/<timestamp>_<name>/migration.sql` was read line by line — not just the schema diff.
- [ ] The migration name describes the change (`<verb>_<subject>`, e.g. `add_patient_status_and_sex`).
- [ ] One logical change per migration; unrelated schema edits are split into separate migrations/PRs.
- [ ] No hand-edits to already-merged migration folders (history is append-only; a merged migration is immutable).
- [ ] `pnpm db:validate` passes and `prisma migrate status` reports no drift against a freshly migrated database.

## 3. Data safety (destructive-change gate)

Any box ticked in the left column requires the mitigation on the right and an explicit callout in the PR description.

| Change | Required mitigation |
| --- | --- |
| `DROP TABLE` / `DROP COLUMN` | Two-step release: stop reading/writing the column in release N, drop it in release N+1. Confirm no code on `main` still references it. |
| Column type change / narrowing | Backfill plan + verification query; confirm existing rows fit the new type before the migration runs. |
| Adding `NOT NULL` to an existing column | Provide a `DEFAULT` or a backfill `UPDATE` in the same migration; verify row counts. |
| New `UNIQUE` constraint | Query production-like data for duplicates first; include the dedupe/backfill strategy. |
| Enum value removal or rename | Treat as destructive: map existing rows to a surviving value in the migration itself. |
| Large-table index creation or rewrite | Note expected lock/duration; schedule outside peak hours if the table is hot. |

## 4. Compatibility with running code

- [ ] The migration is backward-compatible with the **previous** API release (deploys run migrations before the new code starts; old pods may briefly run against the new schema).
- [ ] Seed data (`apps/api/prisma/seed.sql`) still applies cleanly if the change touches roles/permissions or other seeded tables.
- [ ] `pnpm db:generate` was re-run so the generated client in `apps/api/src/generated/prisma` matches the schema.
- [ ] Repositories/services affected by the change have updated unit/integration tests.

## 5. PR hygiene

- [ ] PR description states migration impact (per repo git conventions) and links the filled-in rollback notes.
- [ ] Exactly one migration folder added per PR unless the PR description justifies more.
- [ ] Reviewer re-ran CI after any migration rename/rebase (Prisma orders migrations by folder timestamp).
