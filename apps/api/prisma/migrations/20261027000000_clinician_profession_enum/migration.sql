-- What kind of clinician a profile belongs to (D-034, P24-T02), in its own
-- migration ahead of the column that uses it: Postgres will not let a type be
-- created and then used in the same transaction as some deployments run it.
CREATE TYPE "clinician_profession" AS ENUM ('DOCTOR', 'MIDWIFE');
