import { createMedicationSchema, createStockReceiptSchema } from '@hms/shared-types';

import { CurrentUser } from '../common/auth/current-user.type';
import { buildDemoStockReceipt } from './build-demo-stock-receipt';
import { DEMO_MEDICATION_FIXTURES } from './demo-medication-fixtures';
import { DemoMedicationFixture, DemoSeedLine, DemoSeedServices } from './seed-demo.types';

/**
 * Makes the pharmacy able to dispense whatever the demo prescribes: adds the
 * two midwife-prescribable items, then tops every active medication up to the
 * demo stock level with a goods receipt.
 *
 * Both writes go through `PharmacyFlowService` as the demo pharmacist, the
 * way the catalog and goods-receipt screens record them, so each receipt is a
 * FEFO batch the dispense path allocates from.
 */
export async function seedDemoPharmacy(input: {
  services: DemoSeedServices;
  pharmacist: CurrentUser;
}): Promise<DemoSeedLine[]> {
  const lines: DemoSeedLine[] = [];
  for (const fixture of DEMO_MEDICATION_FIXTURES) {
    lines.push(await ensureMedication({ ...input, fixture }));
  }
  lines.push(await topUpStock(input));
  return lines;
}

async function ensureMedication(input: {
  services: DemoSeedServices;
  pharmacist: CurrentUser;
  fixture: DemoMedicationFixture;
}): Promise<DemoSeedLine> {
  const { services, fixture } = input;
  const label = `Midwife-prescribable ${fixture.name}`;
  const existing = await services.prisma.medication.findFirst({
    where: { OR: [{ code: fixture.code }, { kfaCode: fixture.kfaCode }] },
    select: { id: true },
  });
  if (existing !== null) {
    return { section: 'Pharmacy', label, outcome: 'EXISTING' };
  }
  await services.pharmacyFlow.createMedication(
    createMedicationSchema.parse({
      code: fixture.code,
      kfaCode: fixture.kfaCode,
      name: fixture.name,
      form: fixture.form,
      strength: fixture.strength,
      unit: fixture.unit,
      unitPrice: fixture.unitPrice,
      isMidwifePrescribable: true,
    }),
    input.pharmacist,
  );
  return { section: 'Pharmacy', label, outcome: 'CREATED' };
}

async function topUpStock(input: {
  services: DemoSeedServices;
  pharmacist: CurrentUser;
}): Promise<DemoSeedLine> {
  const summary = await input.services.pharmacyFlow.getInventorySummary(input.pharmacist);
  const receipts = summary.items
    .map((item) =>
      buildDemoStockReceipt({
        medicationId: item.medicationId,
        stockQty: item.stockQty,
        asOfDate: summary.asOfDate,
      }),
    )
    .filter((receipt) => receipt !== null);
  for (const receipt of receipts) {
    await input.services.pharmacyFlow.createStockReceipt(
      createStockReceiptSchema.parse(receipt),
      input.pharmacist,
    );
  }
  return {
    section: 'Pharmacy',
    label: `Stock for ${summary.items.length} medications (${receipts.length} topped up to 500)`,
    outcome: receipts.length === 0 ? 'EXISTING' : 'CREATED',
  };
}
