import { createAdminUserSchema, updateAdminUserSchema } from '@hms/shared-types';

import { CurrentUser } from '../common/auth/current-user.type';
import { DEMO_ACCOUNT_FIXTURES } from './demo-account-fixtures';
import {
  DemoAccountFixture,
  DemoAccountStepInput,
  DemoAccountsResult,
  DemoSeedLine,
  DemoSeedServices,
  DemoStoredAccount,
} from './seed-demo.types';

/**
 * The two logins `seed.sql` creates with passwords printed in the file. A
 * bcrypt hash on either means nobody has signed in since the seed ran — the
 * login path re-hashes to Argon2id on first use — so it still opens with the
 * public default and is worth replacing. Any other hash is somebody's real
 * password and is left alone.
 */
const BOOTSTRAP_LOGIN_EMAILS: readonly string[] = [
  'admin@salingjaga.com',
  'pharmacy@salingjaga.com',
];

const BCRYPT_HASH_PATTERN = /^\$2[aby]?\$/;

/**
 * Creates the five demo logins, or brings an existing one back to the demo
 * state: the role it needs, active, and signing in with `DEMO_SEED_PASSWORD`.
 * Also replaces the public default password on the bootstrap logins while it
 * is still the default (see {@link BOOTSTRAP_LOGIN_EMAILS}).
 *
 * Written through `AdminManagementService` — the same path the administration
 * screen takes — so the Argon2id hash, the breached-password check and the
 * audit rows are the product's own. A re-run that finds everything in place
 * writes nothing.
 */
export async function seedDemoAccounts(input: DemoAccountStepInput): Promise<DemoAccountsResult> {
  const lines: DemoSeedLine[] = [];
  const actorsByEmail = new Map<string, CurrentUser>();
  for (const fixture of DEMO_ACCOUNT_FIXTURES) {
    const { line, actor } = await ensureDemoAccount({ ...input, fixture });
    lines.push(line);
    actorsByEmail.set(fixture.email, actor);
  }
  const bootstrap = await resetBootstrapLogins(input);
  return {
    lines: [...lines, ...bootstrap.lines],
    actorsByEmail,
    resetBootstrapEmails: bootstrap.resetEmails,
  };
}

async function resetBootstrapLogins(
  input: DemoAccountStepInput,
): Promise<{ lines: DemoSeedLine[]; resetEmails: string[] }> {
  const lines: DemoSeedLine[] = [];
  const resetEmails: string[] = [];
  for (const email of BOOTSTRAP_LOGIN_EMAILS) {
    const stored = await findStoredAccount(input.services, email);
    if (stored === null) {
      continue;
    }
    const isStillDefault = BCRYPT_HASH_PATTERN.test(stored.passwordHash);
    if (isStillDefault) {
      await updateAccount({ ...input, accountId: stored.id });
      resetEmails.push(email);
    }
    lines.push({
      section: 'Accounts',
      label: `Bootstrap login ${email}`,
      outcome: isStillDefault ? 'UPDATED' : 'EXISTING',
    });
  }
  return { lines, resetEmails };
}

async function ensureDemoAccount(
  input: DemoAccountStepInput & { fixture: DemoAccountFixture },
): Promise<{ line: DemoSeedLine; actor: CurrentUser }> {
  const { services, fixture } = input;
  const label = `${fixture.roleCode} ${fixture.email}`;
  const stored = await findStoredAccount(services, fixture.email);
  if (stored === null) {
    const created = await services.adminManagement.createAdminUser(
      createAdminUserSchema.parse({
        email: fixture.email,
        fullName: fixture.fullName,
        password: input.password,
        roleCodes: [fixture.roleCode],
      }),
      input.superAdmin.sub,
    );
    return {
      line: { section: 'Accounts', label, outcome: 'CREATED' },
      actor: { sub: created.id, email: created.email },
    };
  }
  const isUpdated = await reconcileStoredAccount({ ...input, stored });
  return {
    line: { section: 'Accounts', label, outcome: isUpdated ? 'UPDATED' : 'EXISTING' },
    actor: { sub: stored.id, email: stored.email },
  };
}

/** Grants the missing role and restores the password and active flag; true when anything changed. */
async function reconcileStoredAccount(
  input: DemoAccountStepInput & { fixture: DemoAccountFixture; stored: DemoStoredAccount },
): Promise<boolean> {
  const { services, stored, fixture } = input;
  const isMissingRole = !stored.roleCodes.includes(fixture.roleCode);
  if (isMissingRole) {
    await services.adminManagement.grantRoleCodes({
      userId: stored.id,
      roleCodes: [fixture.roleCode],
      assignedById: input.superAdmin.sub,
    });
  }
  const hasDemoPassword = await services.passwordHasher.verifyPassword(
    stored.passwordHash,
    input.password,
  );
  const isStale = !hasDemoPassword || !stored.isActive;
  if (isStale) {
    await updateAccount({ ...input, accountId: stored.id });
  }
  return isMissingRole || isStale;
}

async function updateAccount(input: DemoAccountStepInput & { accountId: string }): Promise<void> {
  await input.services.adminManagement.updateAdminUser(
    input.accountId,
    updateAdminUserSchema.parse({ password: input.password, isActive: true }),
    input.superAdmin.sub,
  );
}

async function findStoredAccount(
  services: DemoSeedServices,
  email: string,
): Promise<DemoStoredAccount | null> {
  const user = await services.prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
      roles: {
        where: { deletedAt: null, unassignedAt: null },
        select: { role: { select: { code: true } } },
      },
    },
  });
  if (user === null) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    roleCodes: user.roles.map((userRole) => userRole.role.code),
  };
}
