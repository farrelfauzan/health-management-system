import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { CurrentUser } from './current-user.type';

export const AuthUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    return request.user;
  },
);
