import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The IMP-12 grants exist only as rows in `prisma/seed.sql`, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * them. This reads the seed file instead: it is the artifact that ships, and
 * an admission permission silently dropped from it is a ward nobody can run
 * on the next fresh database.
 *
 * The scope is narrow on purpose — the inpatient catalogue and its bindings,
 * not the whole matrix — so unrelated permission work never has to edit an
 * expectation here.
 */
describe('Room and inpatient RBAC seed', () => {
  const INVENTORY_PERMISSION_KEYS = [
    'roomclass.read:any',
    'roomclass.create:any',
    'roomclass.update:any',
    'roomclass.delete:any',
    'ward.read:any',
    'ward.create:any',
    'ward.update:any',
    'ward.delete:any',
    'room.read:any',
    'room.create:any',
    'room.update:any',
    'room.delete:any',
    'bed.read:any',
    'bed.create:any',
    'bed.update:any',
    'bed.delete:any',
  ] as const;

  const ADMISSION_PERMISSION_KEYS = [
    'admission.read:any',
    'admission.read:own',
    'admission.update:any',
    'admission.admit:any',
    'admission.transfer:any',
    'admission.discharge:any',
    'admission.cancel:any',
  ] as const;

  const RESOURCE_BY_PREFIX: Readonly<Record<string, string>> = {
    roomclass: 'RoomClass',
    ward: 'Ward',
    room: 'Room',
    bed: 'Bed',
    admission: 'Admission',
  };

  const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'ADMIN',
      [
        ...INVENTORY_PERMISSION_KEYS,
        'admission.read:any',
        'admission.update:any',
        'admission.admit:any',
        'admission.transfer:any',
        'admission.discharge:any',
        'admission.cancel:any',
      ],
    ],
    [
      'DOCTOR',
      [
        'roomclass.read:any',
        'ward.read:any',
        'room.read:any',
        'bed.read:any',
        'admission.read:own',
        'admission.admit:any',
        'admission.transfer:any',
        'admission.discharge:any',
      ],
    ],
    ['PHARMACIST', []],
    ['PATIENT', []],
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

  const allKeys = [...INVENTORY_PERMISSION_KEYS, ...ADMISSION_PERMISSION_KEYS];

  it.each(allKeys)('defines %s in the permission catalog', (permissionKey) => {
    const actualRow = findPermissionRow(permissionKey);

    expect(actualRow).toBeDefined();
    // Resource is what AbilityFactory turns into a CASL subject and scope is
    // what decides whether the guard demands ownership, so a typo in either
    // silently changes who the permission lets through.
    const [resourcePrefix] = permissionKey.split('.');
    const expectedResource = RESOURCE_BY_PREFIX[resourcePrefix ?? ''];
    expect(actualRow).toContain(`'${expectedResource}'`);
    expect(actualRow).toContain(permissionKey.endsWith(':any') ? `'ANY'` : `'OWN'`);
  });

  it.each(EXPECTED_BINDINGS)('grants %s exactly its inpatient permissions', (roleCode, granted) => {
    const actualGranted = allKeys.filter((permissionKey) => hasBinding(roleCode, permissionKey));

    expect(actualGranted.sort()).toEqual([...granted].sort());
  });

  it('never lets a doctor edit the floor plan', () => {
    // Choosing a bed on the admit form is not managing inventory. A write
    // grant here would let any clinician retire a ward that other clinicians'
    // patients are lying in, and nothing in the admissions flow needs it.
    const inventoryWriteKeys = INVENTORY_PERMISSION_KEYS.filter(
      (permissionKey) => !permissionKey.includes('.read:'),
    );

    for (const permissionKey of inventoryWriteKeys) {
      expect(hasBinding('DOCTOR', permissionKey)).toBe(false);
    }
  });

  it('never grants a doctor the ANY scope over admissions', () => {
    // `admission.read:own` resolves through the admitting doctor and care
    // team (IMP-14). An ANY grant would turn the ward census into a list of
    // every inpatient in the clinic for every clinician, which is the one
    // thing owner scoping exists to prevent — and silently, because the list
    // would simply start returning more.
    expect(hasBinding('DOCTOR', 'admission.read:any')).toBe(false);
  });

  it('never lets a class key collapse into the room subject', () => {
    // `permissionToRule` on the web splits an `a.b.c` key into resource `a.b`
    // and action `c`, so `room.class.read:any` would resolve to `Room` and
    // silently widen a class grant into a room grant. The undotted resource
    // name is what prevents it, and this is the assertion that keeps it.
    expect(findPermissionRow('room.class.read:any')).toBeUndefined();
    expect(findPermissionRow('roomclass.read:any')).toContain(`'RoomClass'`);
  });

  it('seeds the four baseline room classes without owning their names or quotas', () => {
    // The classes BPJS recognises ship so a fresh database can run a ward.
    // `DO NOTHING` is what keeps a clinic's rename or quota from being undone
    // by the next deploy — the seed owns the baseline set, not its contents.
    for (const code of ['VIP', 'KELAS_1', 'KELAS_2', 'KELAS_3']) {
      expect(seedSql).toContain(`('${code}', `);
    }
    const insertStatement = seedSql.slice(
      seedSql.indexOf('INSERT INTO "room_classes"'),
      seedSql.indexOf('-- Specialty catalog baseline'),
    );
    expect(insertStatement).toContain('DO NOTHING');
    expect(insertStatement).not.toContain('DO UPDATE');
  });

  it('defines no create or delete verb for admissions', () => {
    // Admitting *is* creating, and an admission opened in error is CANCELLED
    // rather than removed — which is why `AdmissionStatus` carries that value.
    // A key for either act would be a grant that contradicts the lifecycle.
    expect(findPermissionRow('admission.create:any')).toBeUndefined();
    expect(findPermissionRow('admission.delete:any')).toBeUndefined();
  });
});
