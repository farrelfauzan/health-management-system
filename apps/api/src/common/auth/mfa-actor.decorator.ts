import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { MfaActor } from './mfa-actor.type';

export const MfaCaller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MfaActor | undefined => {
    const request = context.switchToHttp().getRequest<{ mfaActor?: MfaActor }>();
    return request.mfaActor;
  },
);
