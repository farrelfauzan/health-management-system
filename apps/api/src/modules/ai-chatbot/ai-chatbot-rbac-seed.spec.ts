import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The P13-T02 grants only exist as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead: it is the artifact that ships, and a
 * chat permission silently dropped from it is a route that 403s for every user
 * on the next fresh database.
 *
 * The scope is deliberately narrow. This asserts the chat and AI-provider
 * catalog and its role bindings, not the whole matrix, so unrelated permission
 * work does not have to come here and edit an expectation.
 */
describe('AI chatbot RBAC seed', () => {
  const CHAT_PERMISSION_KEYS = [
    'chat.session.create:own',
    'chat.session.read:any',
    'chat.session.read:own',
    'chat.session.delete:own',
    'chat.message.create:own',
    'chat.message.read:any',
    'chat.message.read:own',
    'ai-provider.read:any',
    'ai-provider.write:any',
  ] as const;

  const SUBJECT_BY_PERMISSION_KEY: Record<string, string> = {
    'chat.session.create:own': 'ChatSession',
    'chat.session.read:any': 'ChatSession',
    'chat.session.read:own': 'ChatSession',
    'chat.session.delete:own': 'ChatSession',
    'chat.message.create:own': 'ChatMessage',
    'chat.message.read:any': 'ChatMessage',
    'chat.message.read:own': 'ChatMessage',
    'ai-provider.read:any': 'AiProviderConfig',
    'ai-provider.write:any': 'AiProviderConfig',
  };

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      [
        'chat.session.create:own',
        'chat.session.read:any',
        'chat.session.delete:own',
        'chat.message.create:own',
        'chat.message.read:any',
        'ai-provider.read:any',
        'ai-provider.write:any',
      ],
    ],
    [
      'DOCTOR',
      [
        'chat.session.create:own',
        'chat.session.read:own',
        'chat.session.delete:own',
        'chat.message.create:own',
        'chat.message.read:own',
      ],
    ],
    [
      'PATIENT',
      [
        'chat.session.create:own',
        'chat.session.read:own',
        'chat.session.delete:own',
        'chat.message.create:own',
        'chat.message.read:own',
      ],
    ],
  ];

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function findPermissionRow(permissionKey: string): string | undefined {
    return seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${permissionKey}'`));
  }

  function hasBinding(roleCode: string, permissionKey: string): boolean {
    return seedSql.includes(`('${roleCode}', '${permissionKey}')`);
  }

  it.each(CHAT_PERMISSION_KEYS)('defines %s in the permission catalog', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject, and scope is
    // what decides whether the guard demands ownership, so a typo in either
    // silently changes who the permission lets through.
    expect(actualRow).toContain(`'${SUBJECT_BY_PERMISSION_KEY[permissionKey]}'`);
    expect(actualRow).toContain(permissionKey.endsWith(':any') ? `'ANY'` : `'OWN'`);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its chat permissions', (roleCode, granted) => {
    const actualGranted = CHAT_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding(roleCode, permissionKey),
    );

    expect(actualGranted.sort()).toEqual([...granted].sort());
  });

  it('grants PHARMACIST no chat or AI-provider permission', () => {
    // The chatbot has a PATIENT and a DOCTOR channel and nothing else; a
    // pharmacist that cannot open a session has no session to read or delete.
    const actualGranted = CHAT_PERMISSION_KEYS.filter((permissionKey) =>
      hasBinding('PHARMACIST', permissionKey),
    );

    expect(actualGranted).toEqual([]);
  });

  it('keeps provider credential custody off DOCTOR and PATIENT', () => {
    // An upstream key is spendable and decides which third party sees chat
    // context. SUPER_ADMIN reaches it through the catalog-wide union instead.
    expect(hasBinding('DOCTOR', 'ai-provider.read:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'ai-provider.write:any')).toBe(false);
    expect(hasBinding('PATIENT', 'ai-provider.read:any')).toBe(false);
    expect(hasBinding('PATIENT', 'ai-provider.write:any')).toBe(false);
  });

  it('withholds cross-user session and message reads from clinical roles', () => {
    expect(hasBinding('DOCTOR', 'chat.session.read:any')).toBe(false);
    expect(hasBinding('DOCTOR', 'chat.message.read:any')).toBe(false);
    expect(hasBinding('PATIENT', 'chat.session.read:any')).toBe(false);
    expect(hasBinding('PATIENT', 'chat.message.read:any')).toBe(false);
  });
});
