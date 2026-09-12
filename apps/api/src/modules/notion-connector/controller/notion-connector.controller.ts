import { Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { NOTION_CONNECTOR_EXAMPLES } from '../../../common/openapi/notion-connector-examples';
import { NotionConnectorService } from '../service/notion-connector.service';

@ApiTags('Notion Connector')
@Controller({
  version: '1',
  path: 'admin/integrations/notion',
})
export class NotionConnectorController {
  constructor(private readonly notionConnectorService: NotionConnectorService) {}

  @Get('status')
  @Auth([{ action: 'manage', subject: 'NotionConnector' }])
  @ApiEndpoint({
    summary: 'Read the Notion bug-report connector status',
    responseDescription:
      'Whether this deployment has Notion credentials, the API version pinned in code, the last four characters of the Bug Board data source id, and this replica’s circuit-breaker state. Calls nothing upstream. The token is never returned in any form.',
    responseExample: { data: NOTION_CONNECTOR_EXAMPLES.status },
  })
  getStatus(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);

    return { data: this.notionConnectorService.getStatus() };
  }

  @Post('test-connection')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'NotionConnector' }])
  @ApiEndpoint({
    summary: 'Test the Notion connection and check the Bug Board schema',
    responseDescription:
      'Reads the Bug Board’s schema and reports every reason a bug report would be rejected — a renamed or retyped property, a missing select option, or a board that was never shared with this integration (reported as the “connection” problem carrying Notion’s own error code). A failed check is a 200 with isSuccessful=false, so the settings card can name each problem. An unconfigured deployment answers isConfigured=false without calling Notion.',
    responseExample: { data: NOTION_CONNECTOR_EXAMPLES.failedConnectionTestResult },
  })
  async testConnection(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.notionConnectorService.testConnection(actor);

    return { data: result };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
