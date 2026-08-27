# Cloud Architecture — AWS and GCP Reference Designs

Target: the **cloud deployment model** priced at Rp7jt/facility/month (the on-premise model at Rp5jt is out of scope here and is covered in [§8](#8-the-on-premise-model)). Companion to [multi-tenancy.md](./multi-tenancy.md), which decides the tenancy boundary this architecture has to host.

> **Status: design, not yet built.** Prices are list-price estimates for Jakarta regions gathered for shaping purposes; every figure in [§6](#6-cost-model) must be re-checked in the AWS/GCP pricing calculators before it drives a commitment. Items needing vendor confirmation are collected in [§9](#9-open-verification-items).

---

## 1. What Actually Has to Run

Taken from the repository as it stands, not from a generic SaaS template.

| Workload | Source | Shape | Notes that constrain hosting |
|---|---|---|---|
| **API** | `apps/api` (NestJS 11) | Stateless HTTP | Holds a **per-tenant `PrismaClient` LRU cache** ([multi-tenancy §4.3](./multi-tenancy.md)). Warm instances matter; cold starts rebuild pools. |
| **Web** | `apps/web` (Next.js 16) | SSR, stateless | Standard container. |
| **PostgreSQL + pgvector** | `apps/api/prisma` | Stateful, primary | One **control-plane DB** + **one DB per tenant** on a shared cluster. `vector(1024)` columns are declared `Unsupported` in Prisma, so the extension must exist server-side. |
| **PgBouncer** | not yet in repo | Stateless proxy | Mandatory, not optional — see [§3.2](#32-connection-math-is-the-real-scaling-limit). |
| **Object storage** | `apps/api/src/common/storage` | S3 API | Already abstracted behind `ObjectStorageService` with an `s3-storage.service.ts` implementation using `@aws-sdk/client-s3` + presigners. |
| **SATUSEHAT/BPJS outbox worker** | `satusehat-submission.worker.ts` | **Singleton poller** | An in-process `setInterval` gated by `SATUSEHAT_WORKER_ENABLED`. That flag is the architecture: run API replicas with it **off**, and exactly one worker task with it **on**. |
| **GOWA (WhatsApp gateway)** | `infra/docker`, `channel-gateway` | **Stateful, pinned** | Holds live WhatsApp Web sessions on a persistent volume (`hms-gowa-session`). Cannot be replicated, cannot be freely rescheduled, cannot scale to zero. |
| **Telegram gateway** | `channel-gateway` | Stateless webhook | No special handling. |
| **LLM / embeddings** | Together AI, per-clinic providers | External API | Egress only. Not hosted. |

---

## 2. Non-Negotiable Constraints

### 2.1 Indonesian data residency

Health records are *data pribadi bersifat spesifik* under **UU PDP No. 27/2022**, and PMK 24/2022 puts the facility's RME obligation on infrastructure the facility can account for. **Both clouds must be deployed in their Jakarta regions** — AWS `ap-southeast-3`, GCP `asia-southeast2`. Singapore is cheaper and is not an option worth arguing for; "data pasien disimpan di Indonesia" is also a sales asset in this segment, not just a compliance line.

Consequence: not every service is available in Jakarta, and Jakarta list prices run above Singapore. Both are priced that way in §6.

### 2.2 GOWA is the workload that breaks serverless

It is worth being explicit, because it is the single design constraint that rules options out on **both** clouds:

- A WhatsApp Web session is **stateful and pinned**. Two instances holding the same session get the number banned faster than the ToS risk already documented in [wa-telegram-customer-service-strategy.md](../customer-service/wa-telegram-customer-service-strategy.md) §2.1.
- Session state lives on disk (SQLite). Network filesystems (EFS, GCS FUSE) under SQLite are a corruption risk, not a workaround.
- It cannot scale to zero — a dropped session means re-scanning a QR code at the clinic.

**Therefore: GOWA runs on a plain VM with a persistent disk on both clouds.** Not Fargate, not Cloud Run. This is a small, boring, deliberately unfashionable piece of the design.

### 2.3 The outbox worker must be a singleton

`SATUSEHAT_WORKER_ENABLED` already anticipates this. Under multi-tenancy the worker additionally has to poll **every tenant database**, which turns a single `setInterval` into an N-database sweep. Two consequences for the design:

- Exactly **one** worker task, deployed separately from the API service, with its own scaling policy fixed at 1.
- Its poll cost grows with tenant count. At a few dozen tenants a sequential sweep is fine; past ~100 it needs batching or per-tenant scheduling. Flagged, not solved here.

---

## 3. Design Decisions Common to Both Clouds

### 3.1 One shared Postgres cluster, many databases

Per [multi-tenancy.md §4.3](./multi-tenancy.md), tenants are **databases inside a shared cluster**, not separate instances. This is what makes the unit economics work: a per-tenant RDS/Cloud SQL instance would cost more per clinic than the clinic pays.

Provisioning uses `CREATE DATABASE … TEMPLATE hms_tenant_template` for near-instant setup. **Both managed services need this verified** ([§9](#9-open-verification-items)) — it depends on the managed superuser role being permitted to create from a template.

### 3.2 Connection math is the real scaling limit

This is the constraint that decides instance sizing, and it is easy to get wrong:

```
connections = API instances × cached tenant pools × pool size
```

At 3 API instances × 40 cached tenants × 3 connections = **360 connections** — beyond what a 2-vCPU managed Postgres will comfortably serve. PgBouncer in **transaction pooling** mode collapses this to a few dozen server connections.

Requirements that follow:
- `min_pool_size=0` so a clinic closed at 17:00 holds nothing overnight.
- Prepared statements **disabled** on the Prisma driver adapter (transaction pooling breaks them).
- LRU eviction on a timer, as the multi-tenancy doc already specifies.

### 3.3 Secrets

Per-tenant database credentials are stored by reference in the control plane. Cost differs sharply by cloud and is a real line item at this ARPA — see [§6](#6-cost-model).

### 3.4 What is deliberately *not* in this design

- **No Kubernetes.** A solo founder-engineer maintaining a cluster is support hours spent on infrastructure instead of clinics, and support hours are the binding constraint in the financial model (§5 there). Revisit past ~150 tenants.
- **No message broker.** The outbox pattern is already in Postgres. Adding SQS/Pub-Sub buys nothing until the worker sweep becomes the bottleneck.
- **No Redis.** Nothing in the repo needs it today.

---

## 4. AWS Reference Architecture (`ap-southeast-3`)

```
                      Route 53  →  CloudFront (web assets, optional)
                                        │
                                   ┌────▼─────┐
   Internet ─────────────────────► │   ALB    │  (HTTPS, ACM cert)
                                   └──┬────┬──┘
                                      │    │
                    /api/*  ──────────┘    └────────  /*  (Next.js)
                        │                                  │
              ┌─────────▼──────────┐          ┌────────────▼─────────┐
              │ ECS Fargate: api   │          │ ECS Fargate: web     │
              │ 2 × 0.5vCPU/1GB    │          │ 2 × 0.25vCPU/0.5GB   │
              │ WORKER_ENABLED=0   │          └──────────────────────┘
              └─────────┬──────────┘
                        │            ┌──────────────────────────────┐
                        │            │ ECS Fargate: worker (1 task) │
                        │            │ WORKER_ENABLED=1             │
                        │            └───────────┬──────────────────┘
                        │                        │
                  ┌─────▼────────────────────────▼─────┐
                  │  PgBouncer (ECS Fargate, 1 task)   │
                  └─────────────────┬──────────────────┘
                                    │
                  ┌─────────────────▼──────────────────┐
                  │ RDS PostgreSQL 16 + pgvector       │
                  │ db.t4g.medium, Multi-AZ            │
                  │  ├── hms_control                   │
                  │  ├── hms_tenant_template           │
                  │  └── hms_t_<slug> × N              │
                  └────────────────────────────────────┘

   EC2 t4g.small + EBS (pinned, 1 AZ)      S3 (documents, KB)
   └── GOWA, session on persistent disk    SSM Parameter Store (tenant creds)
                                            Secrets Manager (platform keys only)
```

**Service mapping**

| Need | AWS service | Why this one |
|---|---|---|
| API / web / worker | **ECS Fargate** | No node management. Separate services let the worker sit at exactly 1 task while the API autoscales. |
| Postgres | **RDS PostgreSQL 16, Multi-AZ** | pgvector available as an extension; Multi-AZ because a clinic that cannot open its RME cannot legally operate. |
| Pooling | **PgBouncer on Fargate** | RDS Proxy is an alternative but is priced per vCPU-hour of the database and does not do transaction pooling the same way; PgBouncer is cheaper and better understood. |
| Object storage | **S3** | Drop-in — `s3-storage.service.ts` already targets it. |
| WhatsApp | **EC2 t4g.small + EBS** | §2.2. |
| Tenant credentials | **SSM Parameter Store (Standard)** | **Not Secrets Manager.** At $0.40/secret/month, 120 tenants is $48/month against a $16 COGS target. Standard parameters are free; use Secrets Manager only for the handful of platform keys. |
| Secrets at rest | **KMS** | For `PATIENT_PII_ENCRYPTION_KEY` and BPJS credential keys. |
| Logs / metrics | **CloudWatch** | Set retention explicitly; default-forever is a slow cost leak. |

**Known cost traps on AWS at this size:** NAT Gateway (~$38/month before data) — avoid by putting Fargate tasks in public subnets with tight security groups, or by using VPC endpoints for S3/ECR. And Secrets Manager per-tenant, as above.

---

## 5. GCP Reference Architecture (`asia-southeast2`)

```
                        Cloud DNS  →  HTTPS Load Balancer (managed cert)
                                        │
                    /api/*  ────────────┼────────────  /*
                        │                                  │
              ┌─────────▼──────────┐          ┌────────────▼─────────┐
              │ Cloud Run: api     │          │ Cloud Run: web       │
              │ min=1, 1vCPU/512MB │          │ min=1                │
              │ WORKER_ENABLED=0   │          └──────────────────────┘
              └─────────┬──────────┘
                        │            ┌──────────────────────────────┐
                        │            │ Cloud Run: worker            │
                        │            │ min=1, max=1, no ingress     │
                        │            │ WORKER_ENABLED=1             │
                        │            └───────────┬──────────────────┘
                        │   Serverless VPC Access │
                  ┌─────▼────────────────────────▼─────┐
                  │  PgBouncer (GCE e2-small, MIG=1)   │
                  └─────────────────┬──────────────────┘
                                    │  Private Service Access
                  ┌─────────────────▼──────────────────┐
                  │ Cloud SQL PostgreSQL 16 + pgvector │
                  │ db-custom-2-4096, regional HA      │
                  │  ├── hms_control                   │
                  │  ├── hms_tenant_template           │
                  │  └── hms_t_<slug> × N              │
                  └────────────────────────────────────┘

   GCE e2-small + PD (pinned, zonal)        Cloud Storage (documents, KB)
   └── GOWA, session on persistent disk     Secret Manager (tenant creds)
```

**Service mapping**

| Need | GCP service | Why this one |
|---|---|---|
| API / web / worker | **Cloud Run** | Smallest operational surface of any option here: no load-balancer target groups, no task definitions, no VPC subnet planning for the services themselves. `max-instances=1` on the worker enforces the singleton declaratively. |
| Postgres | **Cloud SQL PostgreSQL 16, regional HA** | pgvector supported via `cloudsql.enable_pgvector`-style flags/extension. AlloyDB is better at vector workloads but starts several hundred dollars above Cloud SQL — revisit only if retrieval becomes the bottleneck. |
| Pooling | **PgBouncer on GCE** | Cloud SQL's built-in connector does not do transaction pooling; PgBouncer stays. |
| Object storage | **Cloud Storage via S3-compatible XML API** | Lets `s3-storage.service.ts` stay unchanged using HMAC keys + a custom endpoint. **Presigned-URL compatibility must be verified** ([§9](#9-open-verification-items)); if it fails, add a `gcs-storage.service.ts` behind the existing `ObjectStorageService` port — the abstraction is already there. |
| WhatsApp | **GCE e2-small + persistent disk** | §2.2. |
| Tenant credentials | **Secret Manager** | $0.06/secret/month — cheap enough to use directly, unlike AWS. |
| Logs / metrics | **Cloud Logging / Monitoring** | Set a retention bucket; the default is generous and billable. |

---

## 6. Cost Model

Monthly, USD, Jakarta list prices, **estimates for shaping only**.

| | AWS | GCP |
|---|---:|---:|
| Managed Postgres (HA) + storage | 194 | 226 |
| PgBouncer | 10 | 13 |
| API + web + worker compute | 70 | 69 |
| GOWA VM + disk | 16 | 15 |
| Load balancer | 20 | 20 |
| NAT | 38 | 34 |
| Object storage | 3 | 3 |
| Logging / monitoring | 12 | 10 |
| **Fixed platform total** | **~$363** | **~$390** |
| Per-tenant secret storage | $0.40 (Secrets Mgr) → **$0.00 with SSM** | $0.06 |

**The two clouds are within ~7% of each other.** Cost is not the deciding factor; §7 is decided on something else.

### 6.1 Against the financial model's COGS assumption

The model assumes **$16/facility/month** ($8 platform + $8 LLM). Platform cost is *fixed*, so per-facility COGS is entirely a function of tenant count:

| Tenants | Infra/tenant (AWS) | + LLM = COGS | vs $16 assumed | Gross margin |
|---:|---:|---:|---:|---:|
| 9 | $40.7 | $48.7 | **+$32.7** | 85.9% |
| 20 | $18.5 | $26.5 | +$10.5 | 92.3% |
| 30 | $12.5 | $20.5 | +$4.5 | 94.0% |
| 60 | $6.5 | $14.4 | −$1.6 | 95.8% |
| 120 | $3.4 | $11.4 | −$4.6 | 96.7% |

**The model's $16 only holds above roughly 60 facilities.** Below that, cloud infrastructure is a fixed cost the COGS line understated.

**But the effect on the conclusions is small**, because contribution per facility is so large relative to infrastructure:

- Gross margin at break-even scale: **~86%**, not the 96.3% in the model.
- Break-even moves from **9 facilities to 10**. One facility.

That is the honest summary: the COGS assumption is wrong at low scale and it does not change the decision. It should still be corrected in the model, and the correction is a floor of ~$390/month of platform cost regardless of customer count.

### 6.2 The cost that is not on this table

At 9 tenants the platform costs ~Rp7jt/month — **almost exactly one customer's subscription.** Framed that way: the first paying clinic pays for the infrastructure that serves the next thirty. That is the argument for not over-provisioning early, and for the staged plan in §7.2.

---

## 7. Recommendation

### 7.1 GCP, on operational-surface grounds

The costs are equivalent, both have Jakarta regions, both host the workload adequately. **Choose on how many things there are to operate**, because operator hours are the scarce resource in this business — the financial model's §5 shows growth stopping at the founder's support capacity, not at cash.

Cloud Run against ECS Fargate, for the same three services:

| | ECS Fargate | Cloud Run |
|---|---|---|
| Objects to define per service | Task definition, service, target group, ALB listener rule, security group, autoscaling policy | One service |
| Networking to plan | VPC, public/private subnets, NAT or VPC endpoints, SGs | Serverless VPC connector (only for the DB path) |
| Enforcing the worker singleton | `desiredCount=1`, no autoscaling policy | `max-instances=1` |
| TLS | ACM + ALB listener | Managed certificate on the service |

Roughly a third of the moving parts, for the same result. Secondary reasons: Secret Manager is ~7× cheaper per tenant, and scale-to-zero suits clinic traffic (open 08:00–20:00 local, dead overnight) — though `min-instances=1` on the API is required anyway to keep tenant pools warm.

**The honest counter-argument:** the repo already speaks S3 fluently, and AWS is the lower-risk choice for object storage. If the GCS S3-compatibility check in §9 fails, GCP costs you a `gcs-storage.service.ts` — contained work behind an existing port, but real. And if you already have AWS credits or expertise, take AWS; the ~$27/month difference is noise against Rp6,2jt ARPA and the design is otherwise identical.

### 7.2 Staged build — do not build §5 on day one

The full diagram is what ~60 tenants needs. Pilot needs far less:

| Stage | Tenants | Shape | ~Cost/mo |
|---|---|---|---|
| **S0 — pilot** | 1–3 | Single GCE e2-medium running the whole compose stack; Cloud SQL zonal (no HA); daily backups | ~$90 |
| **S1 — first paying** | 3–20 | Cloud Run for api/web/worker; Cloud SQL **zonal** + PITR; GOWA on its own VM; PgBouncer alongside | ~$230 |
| **S2 — production** | 20+ | Add Cloud SQL **regional HA**, second GOWA VM for failover, log retention buckets, alerting | ~$390 |

The single decision that should not be deferred: **PgBouncer and the per-tenant connection routing belong in S1**, before the second tenant exists. Retrofitting connection management onto live clinical databases is exactly the kind of work the multi-tenancy doc warns closes off at tenant #2.

---

## 8. The On-Premise Model — Which Is Really a Migration Model

Priced at Rp5jt/month. The tier exists for **a clinic that already runs its own server and an incumbent system, and wants to move onto ours.** That is a different proposition from "a clinic that prefers self-hosting", and the distinction drives everything below.

### 8.1 Two products wearing one price tag

| | Hosting model | Data migration |
|---|---|---|
| Cost shape | **Recurring** | **One-off** |
| What it decides | Where Postgres runs, who patches the box, whether §3.1's shared-cluster economics apply | How many founder-hours the first month costs |
| Current pricing | Bundled into the Rp5jt/month | Bundled into the Rp5jt/month |

Charging for both through a *lower monthly subscription* discounts the customer who is most expensive to serve. The [financial model](../business/financial-model-id.html) §4 works the numbers; the architectural half is that these are genuinely independent choices. **A clinic owning a server is not a clinic committed to keeping it** — the hardware is sunk capex, and the migration is precisely the moment when moving them to the cloud costs least.

### 8.2 What self-hosting actually removes

- No shared Postgres cluster, so the per-tenant-DB economics in §3.1 disappear; the clinic runs one full stack for one tenant.
- No central provisioning template and no migration fan-out runner — each site upgrades on its own schedule, so **version skew becomes permanent** rather than transient. The expand/contract discipline in [multi-tenancy.md §5.2](./multi-tenancy.md) stops being a deploy-ordering rule and becomes a compatibility guarantee across arbitrary version gaps.
- No remote observability unless the clinic permits an outbound tunnel.
- GOWA runs on clinic hardware, so a lost WhatsApp session cannot be re-paired remotely.
- Their hardware becomes our operational liability: unknown specs, unknown OS, possibly shared with other applications, possibly no backup.

### 8.3 Migration is the real engineering problem

Onboarding a migrating clinic is dominated by data, not infrastructure — roughly **45 founder-hours** when the incumbent system can export, **90** when it cannot. Against 72 customer-facing hours per month, one migration can consume an entire month.

What already exists in the repo:

- `POST /api/v1/patients/import`, gated by `patient.import-identifier`, which accepts pre-existing medical record numbers and lifts the `MrnCounter` past every imported value ([implementation-plan.md](./implementation-plan.md) `P7-T06`).
- `import-terminology-codes.ts`, the generalised catalog importer behind `icd10:import` / `icd9cm:import`.

What does not exist, and is the highest-leverage work available: **importers for doctors, the medication catalog, and service tariffs.** Completing that set takes blended onboarding from ~38 hours to ~17 — more than doubling how many clinics one person can take on. No hire and no marketing spend buys comparable leverage.

Two invariants any importer must hold, both already established elsewhere in the codebase:

1. **Snapshot, don't reference.** Imported diagnoses and procedures carry the code and display text they were signed with, exactly as `P8-T03` requires — a legacy catalog that disagrees with ours must not silently rewrite history.
2. **Never invent identifiers.** An imported patient without a NIK stays without one; the encrypted-identifier scheme in `P7-T07` has no placeholder value, and a fabricated one becomes a SATUSEHAT match failure later.

### 8.4 If self-hosting is offered anyway

Ship the **same containers** as `infra/docker`, never a bespoke build. Require an outbound-only monitoring agent and a contractual maintenance window, and cap the share of self-hosted customers deliberately — each one is a permanent, unautomatable exception, and at this team size a handful is the difference between a supportable product and a consulting business.

---

## 9. Open Verification Items

Confirm before committing to either cloud. None are exotic; all are cheap to check and expensive to discover late.

1. **`CREATE DATABASE … TEMPLATE`** permitted for the managed superuser role on RDS and on Cloud SQL. Blocks the fast-provisioning path in [multi-tenancy §5.1](./multi-tenancy.md) if not.
2. **pgvector version** available on RDS PostgreSQL 16 and Cloud SQL PostgreSQL 16 in the Jakarta regions, and that it matches the `vector(1024)` dimensionality already in `schema.prisma`.
3. **GCS S3-compatible XML API** with `@aws-sdk/client-s3` — specifically **presigned PUT/GET URLs**, which `s3-request-presigner` generates today. Decides whether a `gcs-storage.service.ts` is needed.
4. **Service availability in Jakarta regions** — Cloud Run, Serverless VPC Access, Cloud SQL HA (GCP); Fargate, RDS Multi-AZ (AWS). Regional gaps are common outside the big regions.
5. **Actual prices** in each vendor's calculator. Every figure in §6 is an estimate.
6. **Egress cost to Together AI / SATUSEHAT / BPJS** — small, but unmodelled here.
7. **PgBouncer transaction pooling against Prisma 7 driver adapters** with prepared statements disabled — verify against the existing integration suite before it carries tenant traffic.

---

## 10. Sources

- Tenancy boundary and connection routing: [multi-tenancy.md](./multi-tenancy.md)
- WhatsApp gateway risk and session handling: [wa-telegram-customer-service-strategy.md](../customer-service/wa-telegram-customer-service-strategy.md)
- Deployment and key-rotation procedures this design must keep working: [deployment-runbook.md](../ops/deployment-runbook.md)
- Unit economics this architecture is priced against: [financial-model-id.html](../business/financial-model-id.html)
- Local topology being reproduced: `infra/docker/docker-compose.dev.yml`
