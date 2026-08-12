# AWS CDK — Saling Jaga

CDK v2 (TypeScript) stacks. Companion to `infra/terraform/gcp`; see
[docs/post-mvp/cloud-architecture.md](../../docs/post-mvp/cloud-architecture.md)
for why both clouds are modelled.

## Stacks

| Stack | Contents |
|---|---|
| `SalingJagaDevAssets` | `saling-jaga-dev-assets` S3 bucket, an assumable access role, and a static-key IAM user for the API's `s3-storage.service.ts` |

## Region

Defaults to **`ap-southeast-3` (Jakarta)** — data residency under UU PDP
27/2022, per cloud-architecture.md §2.1. Jakarta is an **opt-in region** —
enable it under IAM → Account settings → Regions before the first deploy.

Override for a throwaway environment:

```bash
CDK_DEPLOY_REGION=ap-southeast-1 pnpm --filter @hms/cdk run cdk:deploy
```

## Deploy

> Scripts are prefixed `cdk:` because `deploy` collides with pnpm's own
> `pnpm deploy` command. Always invoke them with `pnpm ... run <script>`.

Confirm which identity you are about to deploy as — it must not be `:root`:

```bash
aws sts get-caller-identity --query Arn --output text
```

One-time per account+region:

```bash
pnpm --filter @hms/cdk run cdk:bootstrap aws://<account-id>/ap-southeast-3
```

Then:

```bash
pnpm --filter @hms/cdk run cdk:synth   # render CloudFormation, no AWS calls
pnpm --filter @hms/cdk run cdk:diff    # what would change
pnpm --filter @hms/cdk run cdk:deploy
```

## Getting credentials for the bucket

### Preferred — assume the role (temporary, expires in ≤4h)

An IAM **role has no permanent access key/secret pair**. It vends short-lived
credentials through STS, and those come as a *triple* — the session token is not
optional, requests signed without it are rejected.

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::<account-id>:role/saling-jaga-dev-assets-access \
  --role-session-name local-dev \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
  --output text
```

Maps to `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`.

### Static key — for `apps/api/.env`

`s3-storage.service.ts` reads plain `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
with no session-token field, so it needs the IAM user's long-lived key. The
deploy writes it to Secrets Manager instead of a stack output, so it never
appears in `cdk deploy` output or the CloudFormation console.

```bash
aws secretsmanager get-secret-value \
  --secret-id saling-jaga/dev/s3-assets-credentials \
  --query SecretString --output text
```

Returns `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` as
JSON, ready to paste into `apps/api/.env`.

Rotate by incrementing `serial` in `lib/dev-assets-stack.ts` and redeploying —
this replaces the key and rewrites the secret.

## Notes

- The bucket is `RemovalPolicy.RETAIN`; `cdk destroy` leaves it behind. Empty and
  delete it by hand if that is really what you want.
- Never commit retrieved credentials. `apps/api/.env` is gitignored; keep it so.
