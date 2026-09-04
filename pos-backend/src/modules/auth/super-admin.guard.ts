import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acceso restringido: Se requieren privilegios de Super Administrador del Sistema.');
    }
    return true;
  }
}
