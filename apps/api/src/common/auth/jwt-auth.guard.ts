import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { CurrentUser } from './current-user.type';
import { JwtSecretsService } from '../config/jwt-secrets.service';
import { verifyWithAnySecret } from '../config/verify-with-any-secret';
import { PUBLIC_ROUTE_KEY } from '../authorization/public-route.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly jwtSecrets: JwtSecretsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: CurrentUser;
    }>();

    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      // Accepts a token signed with the previous key while a rotation is in
      // flight (SJ-5), so changing the signing secret does not log the clinic out.
      const payload = await verifyWithAnySecret<CurrentUser>(
        this.jwtService,
        token,
        this.jwtSecrets.getAccessVerificationSecrets(),
      );

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
