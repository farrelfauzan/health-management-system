import { Body, Controller, Get, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreateStockReceiptDto } from '../dto/create-stock-receipt.dto';
import { ExpiryReportQueryDto } from '../dto/expiry-report-query.dto';
import { ListStockReceiptsQueryDto } from '../dto/list-stock-receipts-query.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Inventory')
@Controller({ version: '1', path: 'inventory' })
export class InventoryController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Get('receipts')
  @Auth([{ action: 'read', subject: 'Inventory' }])
  @ApiEndpoint({
    summary: 'List stock receipts',
    responseDescription: 'Paginated receipt lots with allocated and remaining quantities.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.pharmacy.stockReceipt],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listReceipts(
    @Query() query: ListStockReceiptsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.withUser(currentUser, async (user) => {
      const result = await this.pharmacyFlowService.listStockReceipts(query, user);
      return { data: result.items, meta: result.meta };
    });
  }

  @Post('receipts')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Inventory' }])
  @ApiEndpoint({
    summary: 'Record a stock receipt',
    responseDescription: 'A batch with a required known expiry date was added to inventory.',
    requestType: CreateStockReceiptDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.stockReceiptRequest,
    responseExample: { data: PHASE_THREE_EXAMPLES.pharmacy.stockReceipt, message: 'Stock receipt created' },
    successStatus: 201,
  })
  async createReceipt(
    @Body() payload: CreateStockReceiptDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.withUser(currentUser, async (user) => ({
      data: await this.pharmacyFlowService.createStockReceipt(payload, user),
      message: 'Stock receipt created',
    }));
  }

  @Get('summary')
  @Auth([{ action: 'read', subject: 'Inventory' }])
  @ApiEndpoint({
    summary: 'Get inventory summary',
    responseDescription: 'Receipt-derived balances and reorder alerts as of the clinic-local date.',
    responseExample: { data: PHASE_THREE_EXAMPLES.pharmacy.inventorySummary },
  })
  async getSummary(@AuthUser() currentUser?: CurrentUser) {
    return this.withUser(currentUser, async (user) => ({
      data: await this.pharmacyFlowService.getInventorySummary(user),
    }));
  }

  @Get('expiry-report')
  @Auth([{ action: 'read', subject: 'Inventory' }])
  @ApiEndpoint({
    summary: 'Get medication expiry report',
    responseDescription: 'Expired, expiring, and legacy unknown-expiry receipt balances.',
    responseExample: { data: PHASE_THREE_EXAMPLES.pharmacy.expiryReport },
  })
  async getExpiryReport(
    @Query() query: ExpiryReportQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return this.withUser(currentUser, async (user) => ({
      data: await this.pharmacyFlowService.getExpiryReport(query, user),
    }));
  }

  private async withUser<T>(
    currentUser: CurrentUser | undefined,
    operation: (user: CurrentUser) => Promise<T>,
  ): Promise<T> {
    if (!currentUser?.sub) throw new UnauthorizedException('Missing authenticated user');
    return operation(currentUser);
  }
}
