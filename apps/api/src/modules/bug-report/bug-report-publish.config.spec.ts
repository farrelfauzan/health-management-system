import { ConfigService } from '@nestjs/config';

import { resolveBugReportPublishConfig } from './bug-report-publish.config';

function buildConfigService(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

describe('resolveBugReportPublishConfig', () => {
  it('boots without a clinic label when there is no Notion board to publish to', () => {
    const actualConfig = resolveBugReportPublishConfig(buildConfigService({}));

    expect(actualConfig.clinicLabel).toBe('');
  });

  /**
   * The Bug Board is one board shared by every deployment, so a ticket that does
   * not say which clinic filed it is a ticket nobody can triage. Boot is the only
   * moment somebody is watching the logs; the alternative is discovering it weeks
   * later as a column of blanks.
   */
  it('refuses to boot with Notion credentials and no clinic label', () => {
    expect(() =>
      resolveBugReportPublishConfig(buildConfigService({ NOTION_API_TOKEN: 'secret_token' })),
    ).toThrow('BUG_REPORT_CLINIC_LABEL is required when NOTION_API_TOKEN is set');
  });

  it('resolves the clinic label when both are set', () => {
    const actualConfig = resolveBugReportPublishConfig(
      buildConfigService({
        NOTION_API_TOKEN: 'secret_token',
        BUG_REPORT_CLINIC_LABEL: 'Klinik Sehat Bandung',
      }),
    );

    expect(actualConfig.clinicLabel).toBe('Klinik Sehat Bandung');
  });

  /** An unconfigured GitHub secret expands to `""`, which must read as absent. */
  it('treats an empty Notion token as no token at all', () => {
    const actualConfig = resolveBugReportPublishConfig(
      buildConfigService({ NOTION_API_TOKEN: '' }),
    );

    expect(actualConfig.clinicLabel).toBe('');
  });

  it('rejects an over-long clinic label', () => {
    expect(() =>
      resolveBugReportPublishConfig(
        buildConfigService({
          NOTION_API_TOKEN: 'secret_token',
          BUG_REPORT_CLINIC_LABEL: 'K'.repeat(200),
        }),
      ),
    ).toThrow('BUG_REPORT_CLINIC_LABEL must be at most');
  });

  /**
   * The §5c proposal, as defaults: 30 days for published text, 7 for held. The
   * asymmetry is the point — held text is held precisely because it may name a
   * person.
   */
  it('defaults retention to the periods §5c proposes', () => {
    const actualConfig = resolveBugReportPublishConfig(buildConfigService({}));

    expect(actualConfig.publishedTextRetentionDays).toBe(30);
    expect(actualConfig.heldTextRetentionDays).toBe(7);
  });

  it('lets an owner set the retention periods without a code change', () => {
    const actualConfig = resolveBugReportPublishConfig(
      buildConfigService({
        BUG_REPORT_PUBLISHED_TEXT_RETENTION_DAYS: '14',
        BUG_REPORT_HELD_TEXT_RETENTION_DAYS: '3',
      }),
    );

    expect(actualConfig.publishedTextRetentionDays).toBe(14);
    expect(actualConfig.heldTextRetentionDays).toBe(3);
  });

  it('rejects a retention period that is not a whole number of days', () => {
    expect(() =>
      resolveBugReportPublishConfig(
        buildConfigService({ BUG_REPORT_HELD_TEXT_RETENTION_DAYS: '0' }),
      ),
    ).toThrow('BUG_REPORT_HELD_TEXT_RETENTION_DAYS must be a positive integer');
  });

  it('defaults the publish worker to on', () => {
    expect(resolveBugReportPublishConfig(buildConfigService({})).workerEnabled).toBe(true);
  });
});
