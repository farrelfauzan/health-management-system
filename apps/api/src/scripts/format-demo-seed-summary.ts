import { DemoAccountFixture, DemoSeedLine, DemoSeedSection } from './seed-demo.types';

const SECTION_ORDER: readonly DemoSeedSection[] = [
  'Accounts',
  'Clinicians',
  'Clinic',
  'Tariffs',
  'Pharmacy',
  'Patients',
];

/** The click path that works end to end on a freshly seeded database (docs/ops/demo-seed.md). */
const DEMO_ORDER: readonly string[] = [
  'ADMIN: register the patient (walk-in, no appointment) and check in; a new patient needs the doctor picked on the form',
  'ADMIN: open the visit from the queue, choosing the doctor (or the bidan)',
  'DOCTOR: vitals, SOAP, ICD-10 diagnosis, ICD-9-CM procedure, lab order, prescription',
  'LAB_TECHNICIAN: collect, receive, enter results (the technician cannot release)',
  'DOCTOR (or ADMIN; never the bidan): release the lab results; the clinician reads them and closes the visit',
  'PHARMACIST: dispense the prescription BEFORE the invoice is generated',
  'ADMIN: generate the invoice, issue, record payment, open the PDF',
];

/**
 * The end-of-run report: what each section created or found, the logins to
 * hand the presenter, and the order to click through. Built from lines that
 * never carry a secret, so it is safe to print whole.
 */
export function formatDemoSeedSummary(input: {
  lines: readonly DemoSeedLine[];
  accounts: readonly DemoAccountFixture[];
  resetBootstrapEmails: readonly string[];
}): string[] {
  const output: string[] = ['Demo seed complete.', ''];
  SECTION_ORDER.forEach((section) => {
    output.push(...formatSection(section, input.lines));
  });
  output.push('Logins (password: the value of DEMO_SEED_PASSWORD):');
  input.accounts.forEach((account) => {
    output.push(`  ${account.email}  [${account.roleCode}]  ${account.purpose}`);
  });
  input.resetBootstrapEmails.forEach((email) => {
    output.push(`  ${email}  [bootstrap]  password reset from the public seed default`);
  });
  output.push('', 'Demo order:');
  DEMO_ORDER.forEach((step, index) => output.push(`  ${index + 1}. ${step}`));
  return output;
}

function formatSection(section: DemoSeedSection, lines: readonly DemoSeedLine[]): string[] {
  const sectionLines = lines.filter((line) => line.section === section);
  if (sectionLines.length === 0) {
    return [];
  }
  const countOf = (outcome: DemoSeedLine['outcome']): number =>
    sectionLines.filter((line) => line.outcome === outcome).length;
  const heading = `${section}: ${countOf('CREATED')} created, ${countOf('UPDATED')} updated, ${countOf('EXISTING')} already present`;
  const details = sectionLines
    .filter((line) => line.outcome !== 'EXISTING')
    .map((line) => `  - ${line.label}: ${line.outcome.toLowerCase()}`);
  return [heading, ...details, ''];
}
