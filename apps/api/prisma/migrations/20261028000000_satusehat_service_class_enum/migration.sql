-- The SATUSEHAT inpatient service class a room class reports under (P24-T05,
-- FR-LOC-05), in its own migration ahead of the column that uses it: Postgres
-- will not let a type be created and then used in the same transaction as some
-- deployments run it.
CREATE TYPE "satusehat_service_class" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3', 'VIP', 'VVIP');
