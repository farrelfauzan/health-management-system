import {
  createServiceTariffSchema,
  updateLabPanelSchema,
  updateLabTestSchema,
} from '@hms/shared-types';

import { Prisma } from '../generated/prisma/client';
import { DEMO_TARIFF_FIXTURES } from './demo-tariff-fixtures';
import { resolveDemoLabPrice } from './resolve-demo-lab-price';
import {
  DemoLabCatalogRow,
  DemoSeedLine,
  DemoSeedServices,
  DemoStepInput,
  DemoTariffFixture,
  DemoTariffOutcome,
} from './seed-demo.types';

const LAB_TARIFF_CODE_PREFIX = 'LAB-';

/**
 * Prices everything the demo invoice collects:
 *
 * - the midwife consultation, the maternal procedures and "Administrasi"
 *   ({@link DEMO_TARIFF_FIXTURES});
 * - one LAB tariff for every active lab test and panel that has none, linked
 *   from the catalog row, so a lab order never becomes a
 *   `NO_TARIFF_FOR_LAB_TEST` gap.
 *
 * Tariffs are created through `ServiceTariffService` and linked through
 * `LabCatalogService`, the paths the tariff and catalog screens use. A tariff
 * is found again by its code; a catalog row that already carries a price is
 * left with the one the clinic gave it.
 */
export async function seedDemoTariffs(input: DemoStepInput): Promise<DemoSeedLine[]> {
  const lines: DemoSeedLine[] = [];
  for (const fixture of DEMO_TARIFF_FIXTURES) {
    const { outcome } = await ensureTariff(input.services, fixture);
    lines.push({ section: 'Tariffs', label: `${fixture.code} ${fixture.name}`, outcome });
  }
  const tests = await input.services.labCatalog.listLabTests({ active: true });
  lines.push(await ensureLabRowsPriced({ ...input, rows: tests, kind: 'TEST' }));
  const panels = await input.services.labCatalog.listLabPanels({ active: true });
  lines.push(await ensureLabRowsPriced({ ...input, rows: panels, kind: 'PANEL' }));
  return lines;
}

/**
 * Finds a tariff that already prices what the fixture prices — the same
 * code, the same ICD-9-CM code (unique), or the same consultation audience
 * (one live tariff per audience) — before creating one, so a clinic's own
 * price is reused rather than refused as a duplicate.
 */
async function ensureTariff(
  services: DemoSeedServices,
  fixture: DemoTariffFixture,
): Promise<DemoTariffOutcome> {
  const existing = await services.prisma.serviceTariff.findFirst({
    where: { deletedAt: null, OR: buildEquivalenceFilters(fixture) },
    select: { id: true },
  });
  if (existing !== null) {
    return { tariffId: existing.id, outcome: 'EXISTING' };
  }
  const created = await services.serviceTariff.createServiceTariff(
    createServiceTariffSchema.parse({
      code: fixture.code,
      name: fixture.name,
      category: fixture.category,
      icd9cmCode: fixture.icd9cmCode,
      profession: fixture.profession,
      price: fixture.price,
    }),
  );
  return { tariffId: created.id, outcome: 'CREATED' };
}

function buildEquivalenceFilters(fixture: DemoTariffFixture): Prisma.ServiceTariffWhereInput[] {
  const filters: Prisma.ServiceTariffWhereInput[] = [{ code: fixture.code }];
  if (fixture.icd9cmCode !== undefined) {
    filters.push({ icd9cmCode: fixture.icd9cmCode });
  }
  if (fixture.category === 'CONSULTATION') {
    filters.push({
      category: 'CONSULTATION',
      isActive: true,
      specialtyId: null,
      profession: fixture.profession ?? null,
    });
  }
  return filters;
}

async function ensureLabRowsPriced(
  input: DemoStepInput & { rows: readonly DemoLabCatalogRow[]; kind: 'TEST' | 'PANEL' },
): Promise<DemoSeedLine> {
  const unpriced = input.rows.filter((row) => row.price === undefined);
  for (const row of unpriced) {
    await priceLabRow({ services: input.services, row, kind: input.kind });
  }
  const noun = input.kind === 'TEST' ? 'lab tests' : 'lab panels';
  return {
    section: 'Tariffs',
    label: `LAB tariffs for ${input.rows.length} active ${noun} (${unpriced.length} newly priced)`,
    outcome: unpriced.length === 0 ? 'EXISTING' : 'CREATED',
  };
}

async function priceLabRow(input: {
  services: DemoSeedServices;
  row: DemoLabCatalogRow;
  kind: 'TEST' | 'PANEL';
}): Promise<void> {
  const { services, row, kind } = input;
  const tariff = await ensureTariff(services, {
    code: `${LAB_TARIFF_CODE_PREFIX}${kind === 'PANEL' ? 'PANEL-' : ''}${row.code}`,
    name: `Laboratorium: ${row.name}`,
    category: 'LAB',
    price: resolveDemoLabPrice({ code: row.code, kind }),
  });
  if (kind === 'TEST') {
    await services.labCatalog.updateLabTest(
      row.id,
      updateLabTestSchema.parse({ serviceTariffId: tariff.tariffId }),
    );
    return;
  }
  await services.labCatalog.updateLabPanel(
    row.id,
    updateLabPanelSchema.parse({ serviceTariffId: tariff.tariffId }),
  );
}
