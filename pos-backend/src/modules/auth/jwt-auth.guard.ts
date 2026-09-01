import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'OPTIONS') {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err) {
      throw err;
    }

    const req = context.switchToHttp().getRequest();
    const headerRestId = (req.headers['x-restaurant-id'] as string || '').trim();
    const isHeaderUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerRestId);

    if (user) {
      if (!user.restaurantId && isHeaderUuid) {
        user.restaurantId = headerRestId;
      }
      return user;
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Si el token es de tipo dev/client/staff específico
    if (token.startsWith('client-token-') || token.startsWith('staff-token-')) {
      const restId = token.replace(/^(client|staff)-token-/, '').trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restId);
      const effectiveRestId = isUuid ? restId : (isHeaderUuid ? headerRestId : null);
      return {
        userId: `user-${restId}`,
        email: 'staff@restaurante.com',
        role: token.startsWith('client-token-') ? 'ADMIN' : 'WAITER',
        restaurantId: effectiveRestId,
      };
    }

    // Token de SuperAdmin master
    if (token === 'superadmin-token-master') {
      return {
        userId: 'superadmin-master',
        email: 'superadmin@xpos.com',
        role: 'SUPER_ADMIN',
        restaurantId: isHeaderUuid ? headerRestId : null,
      };
    }

    throw new UnauthorizedException('Sesión no autorizada o expirada.');
  }
}