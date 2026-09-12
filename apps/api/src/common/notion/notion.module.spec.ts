import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { NOTION_CONFIG } from './notion-config.token';
import { NotionModule } from './notion.module';
import { NotionConfig } from './notion.types';

/**
 * The behavioural half of P23-T02's startup guarantee: the pairing check does
 * not merely exist in `notion.config.ts`, it runs while the injector is being
 * built. Compiling the module is the same work `NestFactory.create` does, so a
 * half-set credential kills the process at boot rather than surfacing as a 401
 * at the first bug report.
 */
describe('NotionModule', () => {
  async function compileWithEnvironment(
    values: Record<string, string>,
  ): Promise<NotionConfig> {
    const testingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [(): Record<string, string> => values],
        }),
        NotionModule,
      ],
    }).compile();
    return testingModule.get<NotionConfig>(NOTION_CONFIG);
  }

  it('starts normally and reports not configured when no Notion variable is set', async () => {
    const actualConfig = await compileWithEnvironment({});
    expect(actualConfig.isConfigured).toBe(false);
  });

  it('fails to start naming the missing variable when only the token is set', async () => {
    await expect(compileWithEnvironment({ NOTION_API_TOKEN: 'ntn_secret' })).rejects.toThrow(
      /NOTION_BUG_BOARD_DATA_SOURCE_ID/,
    );
  });
});
