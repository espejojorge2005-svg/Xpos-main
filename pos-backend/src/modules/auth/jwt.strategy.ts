import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private cls: ClsService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'clave-secreta-de-desarrollo',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const headerRestId = req.headers['x-restaurant-id'] as string;
    let tenantId = payload.restaurantId;
    
    if (headerRestId) {
      tenantId = headerRestId;
    }
    
    if (tenantId) {
      this.cls.set('restaurantId', tenantId);
    }

    // Si el usuario no es SUPER_ADMIN, validar que el restaurante siga activo y no suspendido
    if (payload.role !== 'SUPER_ADMIN' && tenantId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      if (isUuid) {
        const rest = await this.prisma.restaurant.findUnique({
          where: { id: tenantId },
          select: { isActive: true, subscriptionEndDate: true },
        });

        if (rest && !rest.isActive) {
          throw new UnauthorizedException('El restaurante se encuentra suspendido por el Administrador SaaS.');
        }

        if (rest && rest.subscriptionEndDate && new Date(rest.subscriptionEndDate) < new Date()) {
          throw new UnauthorizedException('La suscripción del restaurante ha expirado. Contacte a SuperAdmin.');
        }
      }
    }
    
    return { 
      userId: payload.sub, 
      email: payload.email, 
      role: payload.role, 
      restaurantId: tenantId || payload.restaurantId || null 
    };
  }
}