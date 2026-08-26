import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { NOTIFICATION_EXAMPLES } from '../../../common/openapi/notification-examples';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import { NotificationService } from '../service/notification.service';

/**
 * The signed-in user's bell feed (IMP-21). Every route answers for the caller
 * only: `notification.read`/`notification.manage` exist in OWN scope alone,
 * so there is no admin variant of any of these and no id can reach another
 * user's rows — the service treats a wrong-owner id as missing (404).
 */
@ApiTags('Notifications')
@Controller({
  version: '1',
  path: 'notifications',
})
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Notification' }])
  @ApiEndpoint({
    summary: "List the caller's notifications",
    responseDescription: 'Newest first, paged. Rendered copy stays client-side: rows carry i18n keys and params.',
    responseExample: {
      data: [NOTIFICATION_EXAMPLES.notification, NOTIFICATION_EXAMPLES.readNotification],
      meta: NOTIFICATION_EXAMPLES.paginationMeta,
    },
  })
  async listNotifications(
    @Query() query: ListNotificationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const userId = this.requireUserId(currentUser);
    const result = await this.notificationService.listForUser(userId, query);
    return { data: result.items, meta: result.meta };
  }

  @Get('unread-count')
  @Auth([{ action: 'read', subject: 'Notification' }])
  @ApiEndpoint({
    summary: 'Count the caller\'s unread notifications',
    responseDescription: 'A count only, for the bell badge. Deliberately not a list: this endpoint is polled by every open shell, and returning rows would fetch the whole feed on every interval to render one dot.',
    responseExample: { data: NOTIFICATION_EXAMPLES.unreadCount },
  })
  async getUnreadCount(@AuthUser() currentUser?: CurrentUser) {
    const userId = this.requireUserId(currentUser);
    const view = await this.notificationService.getUnreadCount(userId);
    return { data: view };
  }

  @Patch(':id/read')
  @Auth([{ action: 'manage', subject: 'Notification' }])
  @ApiEndpoint({
    summary: 'Mark one notification as read',
    responseDescription: 'The updated notification. Marking an already-read row again is a no-op, not an error.',
    responseExample: {
      data: NOTIFICATION_EXAMPLES.readNotification,
      message: 'Notification marked as read',
    },
  })
  async markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const userId = this.requireUserId(currentUser);
    const view = await this.notificationService.markAsRead(id, userId);
    return { data: view, message: 'Notification marked as read' };
  }

  @Post('read-all')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'Notification' }])
  @ApiEndpoint({
    summary: "Mark all of the caller's notifications as read",
    responseDescription: 'How many rows flipped from unread to read.',
    responseExample: {
      data: NOTIFICATION_EXAMPLES.readAll,
      message: 'All notifications marked as read',
    },
  })
  async markAllAsRead(@AuthUser() currentUser?: CurrentUser) {
    const userId = this.requireUserId(currentUser);
    const view = await this.notificationService.markAllAsRead(userId);
    return { data: view, message: 'All notifications marked as read' };
  }

  private requireUserId(currentUser?: CurrentUser): string {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser.sub;
  }
}
