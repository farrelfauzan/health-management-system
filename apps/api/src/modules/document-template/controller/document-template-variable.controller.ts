import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TEMPLATE_VARIABLES_BY_KIND } from '@hms/shared-types';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TEMPLATE_VARIABLE_EXAMPLES } from '../../../common/openapi/template-variable-examples';
import { ListTemplateVariablesQueryDto } from '../dto/list-template-variables-query.dto';

/**
 * The variable palette a document template is authored against (`P16-T04`).
 *
 * There is no service behind this deliberately: the registry is a typed const
 * in `@hms/shared-types` and the route is a projection of it, so a service
 * would be a pass-through with a constructor. `P16-T05` adds the template
 * models and their CRUD, and may lift this controller into a module of its
 * own at that point — it lives in `billing` today because the only registry
 * that exists is the invoice one.
 */
@ApiTags('Document Templates')
@RequireFeature('invoice-documents')
@Controller({
  version: '1',
  path: 'document-templates',
})
export class DocumentTemplateVariableController {
  @Get('variables')
  @Auth([{ action: 'read', subject: 'DocumentTemplate' }])
  @ApiEndpoint({
    summary: 'List the variables a template of this kind may reference',
    responseDescription:
      'Every token the editor may offer and publish-time validation will accept, with both labels, its type, and a realistic sample.',
    responseExample: { data: TEMPLATE_VARIABLE_EXAMPLES.invoiceVariables },
  })
  listTemplateVariables(@Query() query: ListTemplateVariablesQueryDto) {
    return { data: TEMPLATE_VARIABLES_BY_KIND[query.kind] };
  }
}
